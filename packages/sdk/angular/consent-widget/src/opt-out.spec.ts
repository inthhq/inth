import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ConsentManager, provideInth } from '@inth/angular';
import type { InthProviderOptions } from '@inth/angular';
import { ConsentDialog } from '@inth/angular/consent-dialog';
import { ConsentWidget } from '@inth/angular/consent-widget';
import type {
	OptOutPayload,
	OptOutTransportResult,
	ProviderTransportFactory,
} from '@inth/sdk/engine';
import {
	createPolicyRuleFingerprints,
	normalizePolicyRule,
	resolvePolicyRules,
} from '@inth/sdk/schema/types';
import type { PolicyRule } from '@inth/sdk/schema/types';
import {
	closeOptInConfirmation,
	closeOptOutConfirmation,
} from '@inth/sdk/surface-actions';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { offlineMode } from '../../src/__tests__/fixtures/transport-mode';

const CATEGORIES = ['functionality', 'marketing', 'measurement'] as const;
const OPT_OUT_RULE: PolicyRule = {
	categories: [...CATEGORIES],
	id: 'angular-us-opt-out',
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
const RESOLUTION = resolvePolicyRules({
	countryCode: 'US',
	regionCode: 'CA',
	rules: [OPT_OUT_RULE],
});
const OPT_IN_RESOLUTION = resolvePolicyRules({
	countryCode: 'DE',
	regionCode: null,
	rules: [OPT_IN_RULE],
});

const choiceRecord = (values: Record<string, boolean>, confirmedAt: number) => {
	const basis = {
		fingerprint: createPolicyRuleFingerprints(normalizePolicyRule(OPT_OUT_RULE))
			.choice,
		kind: 'choice-v1' as const,
	};
	return {
		categories: Object.fromEntries(
			Object.entries(values).map(([category, value]) => [
				category,
				{ basis, confirmedAt, value },
			])
		),
		version: 3 as const,
	};
};

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [ConsentWidget],
	selector: 'test-opt-out-widget-host',
	template: '<inth-consent-widget />',
})
class WidgetHost {}

@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [ConsentDialog],
	selector: 'test-opt-out-dialog-host',
	template: '<inth-consent-dialog [disableAnimation]="true" [open]="open()" />',
})
class DialogHost {
	readonly open = input<boolean | undefined>(undefined);
}

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

const bootHost = async <Host>(
	host: new () => Host,
	options: Partial<InthProviderOptions>
) => {
	TestBed.configureTestingModule({
		providers: [
			provideInth({
				consentCategories: [...CATEGORIES],
				disableAnimation: true,
				mode: offlineMode([OPT_OUT_RULE]),
				persistence: false,
				reloadOnConsentRevoked: false,
				...options,
			} as InthProviderOptions),
		],
	});
	const fixture = TestBed.createComponent(host);
	const consent = TestBed.inject(ConsentManager);
	activeConsent = consent;
	await fixture.whenStable();
	fixture.detectChanges();
	return { consent, fixture };
};

const boot = (options: Partial<InthProviderOptions>) =>
	bootHost(WidgetHost, options);

const docPart = <ElementType extends HTMLElement = HTMLElement>(
	testId: string
) => document.querySelector<ElementType>(`[data-testid="${testId}"]`);

const createDeferredOptOutMode = function createDeferredOptOutMode() {
	let resolveAnswer: ((result: OptOutTransportResult) => void) | undefined;
	let sentPayload: OptOutPayload | undefined;
	const mode: ProviderTransportFactory = Object.assign(
		() => ({
			optOut: (payload: OptOutPayload) => {
				sentPayload = payload;
				return new Promise<OptOutTransportResult>((resolve) => {
					resolveAnswer = resolve;
				});
			},
		}),
		{ kind: 'offline' as const }
	);
	return {
		getSentPayload: () => sentPayload,
		mode,
		resolve: (result: OptOutTransportResult) => resolveAnswer?.(result),
	};
};

const part = <ElementType extends HTMLElement = HTMLElement>(
	root: HTMLElement,
	testId: string
) => root.querySelector<ElementType>(`[data-testid="${testId}"]`);

/** The element with `testId`, which the test expects to be rendered. */
const required = <ElementType extends HTMLElement = HTMLElement>(
	root: HTMLElement,
	testId: string
): ElementType => {
	const element = part<ElementType>(root, testId);
	expect.assert(element, `${testId} is not rendered`);
	return element;
};

describe('Angular consent widget opt-out parity', () => {
	test('shows request status, seeds stored grants off, keeps opt-out on untouched save and lifts on opt-in save', async () => {
		const now = Date.now();
		const { consent, fixture } = await boot({
			prefetch: {
				initialPolicyResolution: RESOLUTION,
				initialRecords: {
					choice: choiceRecord(
						{ functionality: true, marketing: true, measurement: true },
						now - 2000
					),
					optOut: {
						heldBy: 'device',
						method: 'button',
						recordedAt: now - 1000,
						rights: ['sale', 'share'],
					},
				},
				now,
			},
			theme: {
				slots: {
					consentWidgetOptOutStatus: 'brand-opt-out-status',
				},
			},
		});
		const root = fixture.nativeElement as HTMLElement;

		const status = required(root, 'consent-widget-opt-out-status');
		expect(status).not.toBeNull();
		expect(status.getAttribute('role')).toBe('status');
		expect(status.textContent?.trim()).toBe('Opt-out request honored');
		expect(status.classList).toContain('brand-opt-out-status');
		expect(consent.optOutState()).toMatchObject({
			honored: true,
			lock: null,
			via: 'request',
		});

		const marketing = required<HTMLButtonElement>(
			root,
			'consent-widget-switch-marketing'
		);
		const measurement = required<HTMLButtonElement>(
			root,
			'consent-widget-switch-measurement'
		);
		const functionality = required<HTMLButtonElement>(
			root,
			'consent-widget-switch-functionality'
		);
		expect(marketing.getAttribute('aria-checked')).toBe('false');
		expect(marketing.disabled).toBe(false);
		expect(measurement.getAttribute('aria-checked')).toBe('false');
		expect(functionality.getAttribute('aria-checked')).toBe('true');
		expect(part(root, 'consent-widget-restriction-marketing')).toBeNull();

		// An untouched save does not re-confirm the stored grant or lift the opt-out.
		required(root, 'consent-widget-footer-save-button').click();
		await fixture.whenStable();
		fixture.detectChanges();
		expect(consent.optOut()).not.toBeNull();
		expect(consent.effectivePermissions().marketing).toBe(false);
		expect(consent.explicitChoice()?.categories.marketing?.value).toBe(false);

		// Turning measurement on while marketing stays off keeps the opt-out and lets measurement stand.
		expect(measurement?.disabled).toBe(false);
		measurement?.click();
		fixture.detectChanges();
		expect(measurement?.getAttribute('aria-checked')).toBe('true');
		part(root, 'consent-widget-footer-save-button')?.click();
		await fixture.whenStable();
		fixture.detectChanges();
		expect(consent.optOut()).not.toBeNull();
		expect(consent.effectivePermissions().marketing).toBe(false);
		expect(consent.effectivePermissions().measurement).toBe(true);

		// Turning marketing on and saving opens the two-step confirmation; confirming lifts the device opt-out.
		marketing.click();
		fixture.detectChanges();
		expect(marketing.getAttribute('aria-checked')).toBe('true');
		required(root, 'consent-widget-footer-save-button').click();
		await vi.waitFor(async () => {
			await fixture.whenStable();
			fixture.detectChanges();
			expect(docPart('opt-in-confirmation-root')).not.toBeNull();
		});
		expect(consent.optOut()).not.toBeNull();
		docPart<HTMLButtonElement>('opt-in-confirmation-confirm-button')?.click();
		await vi.waitFor(async () => {
			await fixture.whenStable();
			fixture.detectChanges();
			expect(consent.optOut()).toBeNull();
		});
		expect(consent.effectivePermissions().marketing).toBe(true);
		expect(part(root, 'consent-widget-opt-out-status')).toBeNull();
	});

	test('locks opted-out categories under active GPC and blocks pointer, keyboard, save and accept-all', async () => {
		const now = Date.now();
		const { consent, fixture } = await boot({
			overrides: { gpc: true },
			prefetch: {
				initialOverrides: { gpc: true },
				initialPolicyResolution: RESOLUTION,
				initialPrivacySignals: { gpc: true },
				initialRecords: {
					choice: choiceRecord(
						{ functionality: false, marketing: true, measurement: true },
						now - 2000
					),
					optOut: {
						heldBy: 'device',
						method: 'gpc',
						recordedAt: now - 1000,
						rights: ['sale', 'share'],
					},
				},
				now,
			},
		});
		const root = fixture.nativeElement as HTMLElement;

		const status = required(root, 'consent-widget-opt-out-status');
		expect(status.getAttribute('role')).toBe('status');
		expect(status.textContent?.trim()).toBe(
			'Opt-out preference signal honored'
		);
		expect(consent.optOutState().lock).toBe('gpc-active');

		for (const category of ['marketing', 'measurement'] as const) {
			const sw = required<HTMLButtonElement>(
				root,
				`consent-widget-switch-${category}`
			);
			const notice = required(root, `consent-widget-restriction-${category}`);
			expect(sw.disabled).toBe(true);
			expect(sw.getAttribute('aria-checked')).toBe('false');
			expect(sw.getAttribute('aria-describedby')).toBe(notice.id);
			expect(notice.textContent).toContain('Global Privacy Control');

			sw.click();
			sw.dispatchEvent(
				new KeyboardEvent('keydown', { bubbles: true, key: ' ' })
			);
			sw.dispatchEvent(
				new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' })
			);
			fixture.detectChanges();
			expect(sw.getAttribute('aria-checked')).toBe('false');
		}

		expect(part(root, 'consent-widget-restriction-functionality')).toBeNull();

		// Untouched save does not grant locked categories.
		required(root, 'consent-widget-footer-save-button').click();
		await fixture.whenStable();
		fixture.detectChanges();
		expect(consent.effectivePermissions().marketing).toBe(false);
		expect(consent.effectivePermissions().measurement).toBe(false);
		expect(consent.explicitChoice()?.categories.marketing?.value).not.toBe(
			true
		);

		// Accept all grants unlocked categories without granting locked ones.
		required(root, 'consent-widget-footer-accept-all-button').click();
		await fixture.whenStable();
		fixture.detectChanges();
		expect(consent.effectivePermissions().functionality).toBe(true);
		expect(consent.effectivePermissions().marketing).toBe(false);
		expect(consent.effectivePermissions().measurement).toBe(false);
		expect(consent.explicitChoice()?.categories.marketing?.value).not.toBe(
			true
		);
		expect(consent.explicitChoice()?.categories.measurement?.value).not.toBe(
			true
		);
	});

	test('shows account lock reason while keeping switches usable under an account-held opt-out', async () => {
		const now = Date.now();
		const { consent, fixture } = await boot({
			prefetch: {
				initialPolicyResolution: RESOLUTION,
				initialRecords: {
					optOut: {
						heldBy: 'person',
						method: 'button',
						recordedAt: now - 1000,
						rights: ['sale', 'share'],
					},
				},
				now,
			},
		});
		const root = fixture.nativeElement as HTMLElement;

		expect(
			required(root, 'consent-widget-opt-out-status').textContent?.trim()
		).toBe('Opt-out request honored');
		expect(consent.optOutState().lock).toBe('held-by-account');

		const marketing = required<HTMLButtonElement>(
			root,
			'consent-widget-switch-marketing'
		);
		const notice = required(root, 'consent-widget-restriction-marketing');
		expect(marketing.disabled).toBe(false);
		expect(marketing.getAttribute('aria-checked')).toBe('false');
		expect(marketing.getAttribute('aria-describedby')).toBe(notice.id);
		expect(notice.textContent).toContain('account');
		expect(part(root, 'consent-widget-restriction-measurement')).toBeNull();

		marketing.click();
		fixture.detectChanges();
		expect(marketing.getAttribute('aria-checked')).toBe('true');
		required(root, 'consent-widget-footer-save-button').click();
		await vi.waitFor(async () => {
			await fixture.whenStable();
			fixture.detectChanges();
			expect(docPart('opt-in-confirmation-root')).not.toBeNull();
		});
		docPart<HTMLButtonElement>('opt-in-confirmation-confirm-button')?.click();
		await vi.waitFor(async () => {
			await fixture.whenStable();
			fixture.detectChanges();
			expect(docPart('opt-in-confirmation-root')).toBeNull();
		});
		expect(consent.optOut()?.heldBy).toBe('person');
		expect(consent.effectivePermissions().marketing).toBe(false);
	});
});

describe('sale-and-sharing block in dialog and widget', () => {
	test('renders before the category list outside accordion items, opts out in one click, and shows the receipt on reopen', async () => {
		const { consent, fixture } = await bootHost(DialogHost, {
			overrides: { country: 'US', gpc: false, region: 'CA' },
			prefetch: { initialPolicyResolution: RESOLUTION },
			presentation: { optOutLink: 'privacy-choices' },
		});

		consent.setActiveUI('dialog');
		await vi.waitFor(async () => {
			await fixture.whenStable();
			fixture.detectChanges();
			expect(docPart('consent-widget-opt-out')).not.toBeNull();
		});

		const block = docPart('consent-widget-opt-out') as HTMLElement;
		const accordion = docPart('consent-widget-accordion') as HTMLElement;
		expect([
			...document.querySelectorAll(
				'[data-testid="consent-widget-opt-out"], [data-testid="consent-widget-accordion"]'
			),
		]).toEqual([block, accordion]);
		expect(
			block.closest('[data-testid^="consent-widget-accordion-item-"]')
		).toBeNull();

		const headingBefore = block.querySelector(
			'[data-testid="consent-widget-opt-out-heading"]'
		);
		expect(headingBefore?.textContent?.toLowerCase()).not.toMatch(
			/sale|sharing|targeted/u
		);

		docPart<HTMLButtonElement>('consent-widget-opt-out-button')?.click();
		await vi.waitFor(async () => {
			await fixture.whenStable();
			fixture.detectChanges();
			expect(consent.optOut()).not.toBeNull();
		});
		expect(consent.effectivePermissions().marketing).toBe(false);
		expect(consent.activeUI()).not.toBe('dialog');

		// Reopen the dialog and confirm the block now shows status, time and reference without a button.
		closeOptOutConfirmation(consent.kernel());
		consent.setActiveUI('dialog');
		await vi.waitFor(async () => {
			await fixture.whenStable();
			fixture.detectChanges();
			expect(docPart('consent-widget-opt-out-status')).not.toBeNull();
		});

		const reopenedBlock = docPart('consent-widget-opt-out') as HTMLElement;
		const status = reopenedBlock.querySelector(
			'[data-testid="consent-widget-opt-out-status"]'
		);
		expect(status?.getAttribute('role')).toBe('status');
		const timeEl = reopenedBlock.querySelector('time');
		expect(timeEl?.getAttribute('datetime')).toBeTruthy();
		expect(timeEl?.textContent?.trim()).not.toBe('');
		const refEl = reopenedBlock.querySelector('code');
		expect(refEl?.textContent?.trim()).not.toBe('');
		expect(
			reopenedBlock.querySelector(
				'[data-testid="consent-widget-opt-out-button"]'
			)
		).toBeNull();
	});

	test('keeps the heading neutral before backend confirmation and names confirmed rights once answered', async () => {
		const deferred = createDeferredOptOutMode();
		const { consent, fixture } = await boot({
			mode: deferred.mode,
			overrides: { country: 'US', gpc: false, region: 'CA' },
			prefetch: { initialPolicyResolution: RESOLUTION },
			presentation: { optOutLink: 'privacy-choices' },
		});
		const root = fixture.nativeElement as HTMLElement;

		required<HTMLButtonElement>(root, 'consent-widget-opt-out-button').click();
		await vi.waitFor(async () => {
			await fixture.whenStable();
			fixture.detectChanges();
			expect(consent.optOut()).not.toBeNull();
			expect(part(root, 'consent-widget-opt-out-status')).not.toBeNull();
		});

		const heading = required(root, 'consent-widget-opt-out-heading');
		expect(heading.textContent?.toLowerCase()).not.toMatch(
			/sale|sharing|targeted/u
		);

		await vi.waitFor(() => {
			expect(deferred.getSentPayload()).toBeDefined();
		});
		const sent = deferred.getSentPayload() as OptOutPayload;
		deferred.resolve({
			ok: true,
			optOut: {
				heldBy: 'device',
				method: 'button',
				recordedAt: sent.givenAt,
				rights: ['sale', 'share'],
			},
			subjectId: sent.subjectId,
		});

		await vi.waitFor(async () => {
			await fixture.whenStable();
			fixture.detectChanges();
			const text =
				part(root, 'consent-widget-opt-out-heading')?.textContent ?? '';
			expect(text.toLowerCase()).toContain('sale');
			expect(text.toLowerCase()).toContain('sharing');
		});
		expect(
			part(root, 'consent-widget-opt-out-heading')?.textContent?.toLowerCase()
		).not.toContain('targeted');
	});

	test('shows the signal status inside the block when GPC is active under a policy that maps it', async () => {
		const now = Date.now();
		const { fixture } = await bootHost(DialogHost, {
			overrides: { country: 'US', gpc: true, region: 'CA' },
			prefetch: {
				initialOverrides: { gpc: true },
				initialPolicyResolution: RESOLUTION,
				initialPrivacySignals: { gpc: true },
				initialRecords: {
					optOut: {
						heldBy: 'device',
						method: 'gpc',
						recordedAt: now - 1000,
						rights: ['sale', 'share'],
					},
				},
				now,
			},
			presentation: { optOutLink: 'privacy-choices' },
		});
		fixture.componentRef.setInput('open', true);
		await vi.waitFor(async () => {
			await fixture.whenStable();
			fixture.detectChanges();
			expect(docPart('consent-widget-opt-out')).not.toBeNull();
		});

		const block = docPart('consent-widget-opt-out') as HTMLElement;
		const status = block.querySelector(
			'[data-testid="consent-widget-opt-out-status"]'
		);
		expect(status?.getAttribute('role')).toBe('status');
		expect(status?.textContent?.trim()).toBe(
			'Opt-out preference signal honored'
		);
		expect(
			block.querySelector('[data-testid="consent-widget-opt-out-button"]')
		).toBeNull();
	});

	test('omits the block under an opt-in policy and keeps the existing dialog structure', async () => {
		const { fixture } = await bootHost(DialogHost, {
			mode: offlineMode([OPT_IN_RULE]),
			prefetch: { initialPolicyResolution: OPT_IN_RESOLUTION },
		});
		fixture.componentRef.setInput('open', true);
		await vi.waitFor(async () => {
			await fixture.whenStable();
			fixture.detectChanges();
			expect(docPart('consent-widget-accordion')).not.toBeNull();
		});

		expect(docPart('consent-widget-opt-out')).toBeNull();
		expect(docPart('consent-widget-opt-out-status')).toBeNull();
		expect(docPart('consent-dialog-title')).not.toBeNull();
		expect(docPart('consent-dialog-description')).not.toBeNull();
		expect(docPart('consent-widget-accordion-item-necessary')).not.toBeNull();
		expect(docPart('consent-widget-footer')).not.toBeNull();
	});
});
