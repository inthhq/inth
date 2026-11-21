import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ConsentBanner, ConsentManager, provideInth } from '@inth/angular';
import type { InthProviderOptions } from '@inth/angular';
import { ConsentWidget } from '@inth/angular/consent-widget';
import type {
	LiftOptOutPayload,
	LiftOptOutTransportResult,
	ProviderTransportFactory,
} from '@inth/sdk/engine';
import { resolvePolicyRules } from '@inth/sdk/schema/types';
import type { PolicyRule } from '@inth/sdk/schema/types';
import {
	closeOptInConfirmation,
	closeOptOutConfirmation,
} from '@inth/sdk/surface-actions';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { offlineMode } from '../../src/__tests__/fixtures/transport-mode';
import { ConsentDialog } from './consent-dialog';

const CATEGORIES = ['functionality', 'marketing', 'measurement'] as const;

const CHOICE_OPT_OUT_RULE: PolicyRule = {
	categories: [...CATEGORIES],
	id: 'angular-us-opt-out-choice',
	match: { fallback: true, isDefault: true },
	model: 'opt-out',
	privacySignals: { gpc: { denyCategories: ['marketing', 'measurement'] } },
	prompt: 'choice',
	rights: ['disclosure', 'preferences', 'opt-out'],
	scopeMode: 'permissive',
};

const NOTICE_OPT_OUT_RULE: PolicyRule = {
	categories: [...CATEGORIES],
	id: 'angular-us-opt-out-notice',
	match: { fallback: true, isDefault: true },
	model: 'opt-out',
	privacySignals: { gpc: { denyCategories: ['marketing', 'measurement'] } },
	prompt: 'notice',
	rights: ['disclosure', 'preferences', 'opt-out'],
	scopeMode: 'permissive',
};

const OPT_IN_RULE: PolicyRule = {
	categories: [...CATEGORIES],
	id: 'angular-eu-opt-in',
	match: { fallback: true, isDefault: true },
	model: 'opt-in',
	prompt: 'choice',
	rights: ['disclosure', 'preferences'],
	scopeMode: 'permissive',
};

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [ConsentBanner, ConsentDialog],
	selector: 'test-opt-in-dialog-host',
	template: `<inth-consent-banner [disableAnimation]="true" />
		<inth-consent-dialog [disableAnimation]="true" />`,
})
class BannerDialogHost {}

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [ConsentBanner, ConsentWidget],
	selector: 'test-opt-in-widget-host',
	template: `<inth-consent-banner [disableAnimation]="true" />
		<inth-consent-widget />`,
})
class BannerWidgetHost {}

const query = <ElementType extends HTMLElement = HTMLElement>(testId: string) =>
	document.querySelector<ElementType>(`[data-testid="${testId}"]`);

let activeConsent: ConsentManager | null = null;

afterEach(() => {
	if (activeConsent) {
		closeOptInConfirmation(activeConsent.kernel());
		closeOptOutConfirmation(activeConsent.kernel());
		activeConsent = null;
	}
	TestBed.resetTestingModule();
	localStorage.clear();
	document.body.replaceChildren();
});

const renderOptOut = async (
	params: {
		gpc?: boolean;
		heldBy?: 'device' | 'person';
		mode?: ProviderTransportFactory;
		rightsConfirmed?: boolean;
		rule?: PolicyRule;
		standaloneWidget?: boolean;
	} = {}
) => {
	const rule = params.rule ?? NOTICE_OPT_OUT_RULE;
	const gpc = params.gpc ?? false;
	const now = Date.now();
	const resolution = resolvePolicyRules({
		countryCode: rule.model === 'opt-in' ? 'DE' : 'US',
		regionCode: rule.model === 'opt-in' ? null : 'CA',
		rules: [rule],
	});
	TestBed.configureTestingModule({
		providers: [
			provideInth({
				consentCategories: [...CATEGORIES],
				disableAnimation: true,
				mode: params.mode ?? offlineMode([rule]),
				overrides: { country: 'US', gpc, region: 'CA' },
				persistence: false,
				prefetch: {
					initialOverrides: { gpc },
					initialPolicyResolution: resolution,
					initialPrivacySignals: { gpc },
					initialRecords: {
						optOut: {
							heldBy: params.heldBy ?? 'device',
							method: gpc ? 'gpc' : 'button',
							recordedAt: now - 1000,
							rights: ['sale', 'share'],
						},
						optOutRightsConfirmed: params.rightsConfirmed ?? false,
					},
					now,
				},
				reloadOnConsentRevoked: false,
			} as InthProviderOptions),
		],
	});
	const fixture = TestBed.createComponent(
		params.standaloneWidget ? BannerWidgetHost : BannerDialogHost
	);
	const consent = TestBed.inject(ConsentManager);
	activeConsent = consent;
	await fixture.whenStable();
	fixture.detectChanges();
	await vi.waitFor(() => {
		expect(consent.optOut()).not.toBeNull();
	});
	const settle = async () => {
		await fixture.whenStable();
		fixture.detectChanges();
	};
	return { consent, fixture, settle };
};

describe('two-step opt-in confirmation (Angular)', () => {
	test('opt back in link requires separate confirmation, focuses cancel first, stays outside dialog content, and lifts on confirm', async () => {
		const { consent, settle } = await renderOptOut();
		consent.setActiveUI('dialog');
		await vi.waitFor(async () => {
			await settle();
			expect(query('consent-widget-opt-in-link')).not.toBeNull();
		});

		query<HTMLButtonElement>('consent-widget-opt-in-link')?.click();
		await vi.waitFor(async () => {
			await settle();
			expect(query('opt-in-confirmation-root')).not.toBeNull();
		});
		expect(consent.optOut()).not.toBeNull();
		expect(consent.effectivePermissions().marketing).toBe(false);

		const confirmationRoot = query('opt-in-confirmation-root') as HTMLElement;
		const dialogContent = query('consent-dialog-content') as HTMLElement;
		expect(dialogContent.contains(confirmationRoot)).toBe(false);
		expect(confirmationRoot.getAttribute('role')).toBe('dialog');
		expect(confirmationRoot.getAttribute('aria-modal')).toBe('true');

		const description = query('opt-in-confirmation-description');
		expect(description?.textContent?.toLowerCase()).not.toMatch(
			/sale|sharing|targeted/u
		);

		const cancelButton = query<HTMLButtonElement>(
			'opt-in-confirmation-cancel-button'
		) as HTMLButtonElement;
		await vi.waitFor(() => {
			expect(document.activeElement).toBe(cancelButton);
		});

		query<HTMLButtonElement>('opt-in-confirmation-confirm-button')?.click();
		await vi.waitFor(async () => {
			await settle();
			expect(consent.optOut()).toBeNull();
		});
		expect(consent.effectivePermissions().marketing).toBe(true);
		expect(query('opt-in-confirmation-root')).toBeNull();
	});

	test('opt-in confirmation description names confirmed rights once answered by the backend', async () => {
		const { consent, settle } = await renderOptOut({ rightsConfirmed: true });
		consent.setActiveUI('dialog');
		await vi.waitFor(async () => {
			await settle();
			expect(query('consent-widget-opt-in-link')).not.toBeNull();
		});

		query<HTMLButtonElement>('consent-widget-opt-in-link')?.click();
		await vi.waitFor(async () => {
			await settle();
			expect(query('opt-in-confirmation-root')).not.toBeNull();
		});

		const text =
			query('opt-in-confirmation-description')?.textContent?.toLowerCase() ??
			'';
		expect(text).toContain('sale');
		expect(text).toContain('sharing');
		expect(text).not.toContain('targeted');

		query<HTMLButtonElement>('opt-in-confirmation-cancel-button')?.click();
		await settle();
	});

	test('opt back in link then cancel (button and Escape) leaves opt-out held, saves nothing, and keeps dialog open', async () => {
		const { consent, settle } = await renderOptOut();
		consent.setActiveUI('dialog');
		await vi.waitFor(async () => {
			await settle();
			expect(query('consent-widget-opt-in-link')).not.toBeNull();
		});

		query<HTMLButtonElement>('consent-widget-opt-in-link')?.click();
		await vi.waitFor(async () => {
			await settle();
			expect(query('opt-in-confirmation-root')).not.toBeNull();
		});

		query<HTMLButtonElement>('opt-in-confirmation-cancel-button')?.click();
		await vi.waitFor(async () => {
			await settle();
			expect(query('opt-in-confirmation-root')).toBeNull();
		});
		expect(consent.optOut()).not.toBeNull();
		expect(consent.explicitChoice()).toBeNull();
		expect(consent.activeUI()).toBe('dialog');

		query<HTMLButtonElement>('consent-widget-opt-in-link')?.click();
		await vi.waitFor(async () => {
			await settle();
			expect(query('opt-in-confirmation-root')).not.toBeNull();
		});
		document.dispatchEvent(
			new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' })
		);
		await vi.waitFor(async () => {
			await settle();
			expect(query('opt-in-confirmation-root')).toBeNull();
		});
		expect(consent.optOut()).not.toBeNull();
		expect(consent.explicitChoice()).toBeNull();
		expect(consent.activeUI()).toBe('dialog');
	});

	test('Accept All in the dialog defers save until confirmed, then lifts opt-out and grants categories', async () => {
		const { consent, settle } = await renderOptOut();
		consent.setActiveUI('dialog');
		await vi.waitFor(async () => {
			await settle();
			expect(query('consent-widget-footer-accept-all-button')).not.toBeNull();
		});

		query<HTMLButtonElement>(
			'consent-widget-footer-accept-all-button'
		)?.click();
		await vi.waitFor(async () => {
			await settle();
			expect(query('opt-in-confirmation-root')).not.toBeNull();
		});
		expect(consent.optOut()).not.toBeNull();
		expect(consent.explicitChoice()).toBeNull();
		expect(consent.activeUI()).toBe('dialog');

		query<HTMLButtonElement>('opt-in-confirmation-confirm-button')?.click();
		await vi.waitFor(async () => {
			await settle();
			expect(consent.optOut()).toBeNull();
		});
		expect(consent.effectivePermissions().marketing).toBe(true);
		expect(consent.effectivePermissions().measurement).toBe(true);
		expect(consent.explicitChoice()?.categories.marketing?.value).toBe(true);
		expect(consent.activeUI()).not.toBe('dialog');
	});

	test('Accept All in a banner defers save until confirmed, then lifts opt-out and grants categories', async () => {
		const { consent, settle } = await renderOptOut({
			rule: CHOICE_OPT_OUT_RULE,
		});
		consent.setActiveUI('banner');
		await vi.waitFor(async () => {
			await settle();
			expect(query('consent-banner-accept-button')).not.toBeNull();
		});

		query<HTMLButtonElement>('consent-banner-accept-button')?.click();
		await vi.waitFor(async () => {
			await settle();
			expect(query('opt-in-confirmation-root')).not.toBeNull();
		});
		expect(consent.optOut()).not.toBeNull();
		expect(consent.explicitChoice()).toBeNull();

		query<HTMLButtonElement>('opt-in-confirmation-confirm-button')?.click();
		await vi.waitFor(async () => {
			await settle();
			expect(consent.optOut()).toBeNull();
		});
		expect(consent.effectivePermissions().marketing).toBe(true);
	});

	test('turning Marketing on then Save opens confirmation and cancelling leaves opt-out held', async () => {
		const { consent, settle } = await renderOptOut({ standaloneWidget: true });
		const marketing = query<HTMLButtonElement>(
			'consent-widget-switch-marketing'
		) as HTMLButtonElement;
		expect(marketing.getAttribute('aria-checked')).toBe('false');

		marketing.click();
		await settle();
		expect(marketing.getAttribute('aria-checked')).toBe('true');

		query<HTMLButtonElement>('consent-widget-footer-save-button')?.click();
		await vi.waitFor(async () => {
			await settle();
			expect(query('opt-in-confirmation-root')).not.toBeNull();
		});
		expect(consent.optOut()).not.toBeNull();
		expect(consent.explicitChoice()).toBeNull();

		query<HTMLButtonElement>('opt-in-confirmation-cancel-button')?.click();
		await vi.waitFor(async () => {
			await settle();
			expect(query('opt-in-confirmation-root')).toBeNull();
		});
		expect(consent.optOut()).not.toBeNull();
		expect(consent.explicitChoice()).toBeNull();
		expect(consent.effectivePermissions().marketing).toBe(false);
	});

	test('saving without granting the deciding category completes with no confirmation', async () => {
		const { consent, settle } = await renderOptOut({ standaloneWidget: true });
		query<HTMLButtonElement>('consent-widget-switch-measurement')?.click();
		await settle();

		query<HTMLButtonElement>('consent-widget-footer-save-button')?.click();
		await vi.waitFor(async () => {
			await settle();
			expect(consent.effectivePermissions().measurement).toBe(true);
		});
		expect(query('opt-in-confirmation-root')).toBeNull();
		expect(consent.optOut()).not.toBeNull();
		expect(consent.effectivePermissions().marketing).toBe(false);
	});

	test('with active GPC signal there is no opt back in link', async () => {
		const { consent, settle } = await renderOptOut({ gpc: true });
		consent.setActiveUI('dialog');
		await vi.waitFor(async () => {
			await settle();
			expect(query('consent-widget-opt-out-status')).not.toBeNull();
		});
		expect(query('consent-widget-opt-in-link')).toBeNull();
	});

	test('with held-by-account opt-out shows link and leaves opt-out held when backend refuses lift', async () => {
		const liftCalls: LiftOptOutPayload[] = [];
		const refusingMode: ProviderTransportFactory = Object.assign(
			() => ({
				liftOptOut: (
					payload: LiftOptOutPayload
				): Promise<LiftOptOutTransportResult> => {
					liftCalls.push(payload);
					return Promise.resolve({
						ok: true,
						optOut: {
							heldBy: 'person',
							method: 'button',
							recordedAt: payload.givenAt - 1000,
							rights: ['sale', 'share'],
						},
					});
				},
			}),
			{ kind: 'offline' as const }
		);
		const { consent, settle } = await renderOptOut({
			heldBy: 'person',
			mode: refusingMode,
		});
		consent.setActiveUI('dialog');
		await vi.waitFor(async () => {
			await settle();
			expect(query('consent-widget-opt-in-link')).not.toBeNull();
		});

		query<HTMLButtonElement>('consent-widget-opt-in-link')?.click();
		await vi.waitFor(async () => {
			await settle();
			expect(query('opt-in-confirmation-root')).not.toBeNull();
		});
		expect(liftCalls).toHaveLength(0);

		query<HTMLButtonElement>('opt-in-confirmation-confirm-button')?.click();
		await vi.waitFor(async () => {
			await settle();
			expect(liftCalls).toHaveLength(1);
		});
		expect(consent.optOut()?.heldBy).toBe('person');
		expect(consent.effectivePermissions().marketing).toBe(false);
	});

	test('under an opt-in policy with an opt-out held, Accept lifts in one step without confirmation', async () => {
		const { consent, settle } = await renderOptOut({ rule: OPT_IN_RULE });
		consent.setActiveUI('dialog');
		await vi.waitFor(async () => {
			await settle();
			expect(query('consent-widget-footer-accept-all-button')).not.toBeNull();
		});

		query<HTMLButtonElement>(
			'consent-widget-footer-accept-all-button'
		)?.click();
		await vi.waitFor(async () => {
			await settle();
			expect(consent.optOut()).toBeNull();
		});
		expect(query('opt-in-confirmation-root')).toBeNull();
		expect(consent.effectivePermissions().marketing).toBe(true);
	});
});
