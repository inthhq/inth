import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
	ConsentBanner,
	ConsentDialogLink,
	ConsentManager,
	provideInth,
} from '@inth/angular';
import type { InthProviderOptions } from '@inth/angular';
import { ConsentDialogTrigger } from '@inth/angular/consent-dialog-trigger';
import { testing } from '@inth/angular/testing';
import type {
	OptOutLinkVariant,
	OptOutPayload,
	OptOutTransportResult,
	ProviderTransportFactory,
} from '@inth/sdk/engine';
import {
	OPT_OUT_CONFIRMATION_STORAGE_KEY,
	policyRulePresets,
} from '@inth/sdk/engine';
import {
	EARLY_TAP_STYLE_ID,
	EARLY_TAPS_WINDOW_KEY,
} from '@inth/sdk/runtime/page-globals';
import type * as RuntimeProvider from '@inth/sdk/runtime/provider';
import { V1_UUID_PATTERN, resolvePolicyRules } from '@inth/sdk/schema/types';
import {
	EARLY_CONSENT_TAP_SCRIPT,
	closeOptOutConfirmation,
} from '@inth/sdk/surface-actions';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { ConsentDialog } from './consent-dialog';
import { OptOutConfirmation } from './opt-out-confirmation';

const reload = vi.hoisted(() => vi.fn());
// oxlint-disable-next-line anti-slop/no-module-mocking -- jsdom cannot perform navigation on `window.location.reload`. The factory returns the real module and records the reload instead.
vi.mock('@inth/sdk/runtime/provider', async (importOriginal) => {
	const actual = await importOriginal<typeof RuntimeProvider>();
	return {
		...actual,
		watchRevocationReload: (
			options: Parameters<typeof actual.watchRevocationReload>[0]
		) => actual.watchRevocationReload({ ...options, reload }),
	};
});

const query = <Element extends HTMLElement>(testId: string) =>
	document.querySelector<Element>(`[data-testid="${testId}"]`);

const noticeRule = () => ({
	...policyRulePresets.usPrivacyStatesOptOut(),
	prompt: 'notice' as const,
});

@Component({
	imports: [ConsentBanner, ConsentDialog],
	template: `<inth-consent-banner [disableAnimation]="true" />
		<inth-consent-dialog [disableAnimation]="true" />`,
})
class BannerDialogHost {}

@Component({
	imports: [ConsentDialog, ConsentDialogLink],
	template: `<button
			type="button"
			inthConsentDialogLink
			right="opt-out"
		></button>
		<inth-consent-dialog [disableAnimation]="true" />`,
})
class LinkDialogHost {}

@Component({
	imports: [ConsentBanner, OptOutConfirmation],
	template: `<inth-consent-banner [disableAnimation]="true" />
		<inth-opt-out-confirmation [disableAnimation]="true" />`,
})
class BannerStandaloneHost {}

@Component({
	imports: [ConsentBanner, ConsentDialogLink],
	template: `<inth-consent-banner [disableAnimation]="true" />
		<button
			type="button"
			inthConsentDialogLink
			right="opt-out"
		></button>`,
})
class BannerAndLinkHost {}

@Component({
	imports: [ConsentDialog, ConsentDialogTrigger],
	template: `<inth-consent-dialog-trigger showWhen="always" />
		<inth-consent-dialog [disableAnimation]="true" />`,
})
class TriggerDialogHost {}

@Component({
	imports: [ConsentDialog, OptOutConfirmation],
	template: `<inth-consent-dialog [disableAnimation]="true" />
		<inth-opt-out-confirmation [disableAnimation]="true" />`,
})
class BothHostsHost {}

@Component({
	imports: [
		ConsentBanner,
		ConsentDialog,
		ConsentDialogLink,
		ConsentDialogTrigger,
	],
	template: `<inth-consent-banner [disableAnimation]="true" />
		<button
			type="button"
			inthConsentDialogLink
			right="opt-out"
		></button>
		<inth-consent-dialog-trigger showWhen="always" />
		<inth-consent-dialog [disableAnimation]="true" />`,
})
class AllControlsHost {}

let activeConsent: ConsentManager | null = null;

const boot = async <Host>(
	host: new () => Host,
	options: Partial<InthProviderOptions> = {}
) => {
	TestBed.resetTestingModule();
	TestBed.configureTestingModule({
		providers: [
			provideInth({
				consentCategories: ['functionality', 'marketing', 'measurement'],
				disableAnimation: true,
				mode: testing({
					policy: [noticeRule()],
				}),
				overrides: { country: 'US', region: 'CA' },
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
	return { consent, fixture };
};

afterEach(() => {
	if (activeConsent) {
		closeOptOutConfirmation(activeConsent.kernel());
		activeConsent = null;
	}
	TestBed.resetTestingModule();
	document.getElementById(EARLY_TAP_STYLE_ID)?.remove();
	const host = window as unknown as Record<
		string,
		{ stop?: () => void } | undefined
	>;
	host[EARLY_TAPS_WINDOW_KEY]?.stop?.();
	Reflect.deleteProperty(window, EARLY_TAPS_WINDOW_KEY);
	reload.mockClear();
	localStorage.clear();
	for (const entry of document.cookie.split(';')) {
		const name = entry.split('=')[0]?.trim();
		if (name) {
			document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
		}
	}
	sessionStorage.clear();
});

describe('one-step opt-out and confirmation view in Angular', () => {
	test('opts out in one click from the banner link and opens confirmation with one button', async () => {
		const { consent, fixture } = await boot(BannerDialogHost);

		await vi.waitFor(() =>
			expect(query('consent-banner-right-link-opt-out')).not.toBeNull()
		);
		const optOutLink = query<HTMLButtonElement>(
			'consent-banner-right-link-opt-out'
		) as HTMLButtonElement;
		expect(optOutLink.textContent?.trim()).toBe(
			'Do Not Sell or Share My Personal Information'
		);
		expect(optOutLink.querySelector('svg')).toBeNull();

		optOutLink.click();
		await fixture.whenStable();

		const snapshot = consent.snapshot();
		expect(snapshot.optOut?.method).toBe('button');
		expect(snapshot.effectivePermissions.marketing).toBe(false);
		expect(snapshot.effectivePermissions.measurement).toBe(false);
		expect(snapshot.effectivePermissions.functionality).toBe(true);
		expect(query('consent-dialog-root')).toBeNull();

		await vi.waitFor(async () => {
			await fixture.whenStable();
			expect(query('opt-out-confirmation-root')).not.toBeNull();
		});
		const root = query('opt-out-confirmation-root') as HTMLElement;
		expect(query('opt-out-confirmation-title')?.textContent?.trim()).toBe(
			'Do Not Sell or Share My Personal Information'
		);
		const status = query('opt-out-confirmation-status');
		expect(status?.getAttribute('role')).toBe('status');
		expect(status?.textContent?.trim()).toBe('Opt-out request honored');
		const recordedAt = query<HTMLTimeElement>(
			'opt-out-confirmation-recorded-at'
		);
		expect(recordedAt).not.toBeNull();
		expect(recordedAt?.getAttribute('datetime')).toBeTruthy();
		expect(recordedAt?.textContent?.trim()).not.toBe('');
		const reference = query('opt-out-confirmation-reference');
		expect(reference).not.toBeNull();
		expect(reference?.textContent?.trim()).toMatch(V1_UUID_PATTERN);
		expect(root.querySelectorAll('input, textarea, select')).toHaveLength(0);
		const buttons = [...root.querySelectorAll('button')];
		expect(buttons).toHaveLength(1);
		expect(buttons[0]?.textContent?.trim()).toBe('Done');
		expect(
			query('opt-out-confirmation-preferences-link')?.textContent?.trim()
		).toBe('Manage preferences');
	});

	test('Done closes and restores focus, Escape closes, preferences link opens dialog, and re-opening records nothing new', async () => {
		const { consent, fixture } = await boot(LinkDialogHost, {
			mode: testing({ policy: [policyRulePresets.usPrivacyStatesOptOut()] }),
		});

		await vi.waitFor(() => expect(query('consent-dialog-link')).not.toBeNull());
		const link = query<HTMLButtonElement>(
			'consent-dialog-link'
		) as HTMLButtonElement;
		link.focus();
		expect(document.activeElement).toBe(link);
		link.click();

		await vi.waitFor(async () => {
			await fixture.whenStable();
			expect(query('opt-out-confirmation-done-button')).not.toBeNull();
		});
		expect(consent.snapshot().optOut?.method).toBe('button');

		query<HTMLButtonElement>('opt-out-confirmation-done-button')?.click();
		await vi.waitFor(async () => {
			await fixture.whenStable();
			expect(query('opt-out-confirmation-root')).toBeNull();
		});
		await vi.waitFor(() => expect(document.activeElement).toBe(link));

		// Re-opening when already opted out records nothing new.
		const recordedAt = consent.snapshot().optOut?.recordedAt;
		const onRecorded = vi.fn();
		consent.kernel().events.on('opt-out:recorded', onRecorded);

		link.focus();
		link.click();
		await vi.waitFor(async () => {
			await fixture.whenStable();
			expect(query('opt-out-confirmation-root')).not.toBeNull();
		});
		expect(onRecorded).not.toHaveBeenCalled();
		expect(consent.snapshot().optOut?.recordedAt).toBe(recordedAt);

		// Escape closes and returns focus.
		document.documentElement.dispatchEvent(
			new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' })
		);
		await vi.waitFor(async () => {
			await fixture.whenStable();
			expect(query('opt-out-confirmation-root')).toBeNull();
		});
		await vi.waitFor(() => expect(document.activeElement).toBe(link));

		// Manage preferences opens full preference center.
		link.click();
		await vi.waitFor(async () => {
			await fixture.whenStable();
			expect(query('opt-out-confirmation-preferences-link')).not.toBeNull();
		});
		query<HTMLAnchorElement>('opt-out-confirmation-preferences-link')?.click();
		await vi.waitFor(async () => {
			await fixture.whenStable();
			expect(query('opt-out-confirmation-root')).toBeNull();
			expect(query('consent-dialog-root')).not.toBeNull();
		});
	});

	test('shows GPC signal wording when opted out via Global Privacy Control', async () => {
		const { consent, fixture } = await boot(BannerStandaloneHost, {
			overrides: { country: 'US', gpc: true, region: 'CA' },
			presentation: { optOutLink: 'privacy-choices' },
		});

		expect(consent.snapshot().optOut?.method).toBe('gpc');
		const onRecorded = vi.fn();
		consent.kernel().events.on('opt-out:recorded', onRecorded);

		void consent.requestOptOut();

		await vi.waitFor(async () => {
			await fixture.whenStable();
			expect(query('opt-out-confirmation-root')).not.toBeNull();
		});
		expect(onRecorded).not.toHaveBeenCalled();
		expect(query('opt-out-confirmation-title')?.textContent?.trim()).toBe(
			'Your Privacy Choices'
		);
		expect(query('opt-out-confirmation-status')?.textContent?.trim()).toBe(
			'Opt-out preference signal honored'
		);
	});

	test('falls back to opening preferences under a non-opt-out rule', async () => {
		const { consent, fixture } = await boot(LinkDialogHost, {
			mode: testing({ policy: [policyRulePresets.europeOptIn()] }),
			overrides: { country: 'DE' },
		});

		await vi.waitFor(() => expect(query('consent-dialog-link')).not.toBeNull());
		query<HTMLButtonElement>('consent-dialog-link')?.click();
		await vi.waitFor(async () => {
			await fixture.whenStable();
			expect(query('consent-dialog-root')).not.toBeNull();
		});
		expect(query('opt-out-confirmation-root')).toBeNull();
		expect(consent.snapshot().optOut).toBeNull();
	});

	test.each([
		['do-not-sell', 'Do Not Sell or Share My Personal Information', false],
		['privacy-choices', 'Your Privacy Choices', true],
		['california-privacy-choices', 'Your California Privacy Choices', true],
	] as [OptOutLinkVariant, string, boolean][])(
		'renders optOutLink=%s with exact title and icon=%s',
		async (optOutLink, expectedTitle, expectIcon) => {
			await boot(BannerAndLinkHost, {
				presentation: { optOutLink },
			});

			await vi.waitFor(() =>
				expect(query('consent-banner-right-link-opt-out')).not.toBeNull()
			);
			const bannerLink = query('consent-banner-right-link-opt-out');
			const dialogLink = query('consent-dialog-link');

			expect(bannerLink?.textContent?.trim()).toBe(expectedTitle);
			expect(dialogLink?.textContent?.trim()).toBe(expectedTitle);
			expect(
				Boolean(bannerLink?.querySelector('svg[aria-hidden="true"]'))
			).toBe(expectIcon);
			expect(
				Boolean(dialogLink?.querySelector('svg[aria-hidden="true"]'))
			).toBe(expectIcon);
			expect(Boolean(bannerLink?.querySelector('svg'))).toBe(expectIcon);
			expect(Boolean(dialogLink?.querySelector('svg'))).toBe(expectIcon);
		}
	);

	test('wires the floating trigger to opt out and hides it while confirmation is open', async () => {
		const { consent, fixture } = await boot(TriggerDialogHost, {
			mode: testing({ policy: [policyRulePresets.usPrivacyStatesOptOut()] }),
		});

		await vi.waitFor(() =>
			expect(query('consent-dialog-trigger')).not.toBeNull()
		);
		const trigger = query<HTMLButtonElement>(
			'consent-dialog-trigger'
		) as HTMLButtonElement;
		expect(trigger.getAttribute('aria-label')).toBe(
			'Do Not Sell or Share My Personal Information'
		);

		trigger.click();
		await vi.waitFor(async () => {
			await fixture.whenStable();
			expect(query('opt-out-confirmation-root')).not.toBeNull();
		});
		expect(consent.snapshot().optOut?.method).toBe('button');
		expect(query('consent-dialog-trigger')).toBeNull();

		query<HTMLButtonElement>('opt-out-confirmation-done-button')?.click();
		await vi.waitFor(async () => {
			await fixture.whenStable();
			expect(query('opt-out-confirmation-root')).toBeNull();
			expect(query('consent-dialog-trigger')).not.toBeNull();
		});
	});

	test('requestOptOut opens confirmation with all theme slots and avoids duplicate hosts', async () => {
		const { consent, fixture } = await boot(BothHostsHost, {
			theme: {
				slots: {
					optOutConfirmation: 'slot-root',
					optOutConfirmationCard: 'slot-card',
					optOutConfirmationDescription: 'slot-description',
					optOutConfirmationDoneButton: 'slot-done',
					optOutConfirmationFooter: 'slot-footer',
					optOutConfirmationHeader: 'slot-header',
					optOutConfirmationOverlay: 'slot-overlay',
					optOutConfirmationPreferencesLink: 'slot-prefs',
					optOutConfirmationStatus: 'slot-status',
					optOutConfirmationTitle: 'slot-title',
				},
			},
		});

		void consent.requestOptOut();
		await vi.waitFor(async () => {
			await fixture.whenStable();
			expect(query('opt-out-confirmation-root')).not.toBeNull();
		});
		expect(
			document.querySelectorAll('[data-testid="opt-out-confirmation-root"]')
		).toHaveLength(1);
		expect(
			query('opt-out-confirmation-root')?.classList.contains('slot-root')
		).toBe(true);
		expect(
			query('opt-out-confirmation-card')?.classList.contains('slot-card')
		).toBe(true);
		expect(
			query('opt-out-confirmation-header')?.classList.contains('slot-header')
		).toBe(true);
		expect(
			query('opt-out-confirmation-title')?.classList.contains('slot-title')
		).toBe(true);
		expect(
			query('opt-out-confirmation-status')?.classList.contains('slot-status')
		).toBe(true);
		expect(
			query('opt-out-confirmation-description')?.classList.contains(
				'slot-description'
			)
		).toBe(true);
		expect(
			query('opt-out-confirmation-footer')?.classList.contains('slot-footer')
		).toBe(true);
		expect(
			query('opt-out-confirmation-done-button')?.classList.contains('slot-done')
		).toBe(true);
		expect(
			query('opt-out-confirmation-preferences-link')?.classList.contains(
				'slot-prefs'
			)
		).toBe(true);
		expect(
			query('opt-out-confirmation-overlay')?.classList.contains('slot-overlay')
		).toBe(true);
	});

	test('replays an early tap on the opt-out link as a durable opt-out', async () => {
		const container = document.createElement('div');
		container.innerHTML =
			'<div data-testid="consent-banner-root" data-model="opt-out" data-prompt="notice"><button type="button" data-action="right" data-right="opt-out">Do Not Sell or Share My Personal Information</button></div>';
		document.body.append(container);
		// oxlint-disable-next-line no-new-func -- Runs the inline script as server HTML would.
		new Function(EARLY_CONSENT_TAP_SCRIPT)();
		container
			.querySelector<HTMLButtonElement>('[data-right="opt-out"]')
			?.click();
		container.remove();

		const { consent, fixture } = await boot(BannerDialogHost);

		await vi.waitFor(async () => {
			await fixture.whenStable();
			expect(consent.snapshot().optOut?.method).toBe('button');
		});
		expect(consent.snapshot().effectivePermissions.marketing).toBe(false);
		expect(consent.snapshot().effectivePermissions.measurement).toBe(false);
		await vi.waitFor(async () => {
			await fixture.whenStable();
			expect(query('opt-out-confirmation-root')).not.toBeNull();
		});
	});

	test('defers confirmation across a revocation reload, shows it once on the next load, and not on the load after that', async () => {
		const onBeforeReload = vi.fn();
		const first = await boot(BannerDialogHost, {
			callbacks: { onBeforeConsentRevocationReload: onBeforeReload },
			persistence: true,
			reloadOnConsentRevoked: true,
		});

		await vi.waitFor(() =>
			expect(query('consent-banner-right-link-opt-out')).not.toBeNull()
		);
		query<HTMLButtonElement>('consent-banner-right-link-opt-out')?.click();
		await first.fixture.whenStable();

		// Does not flash on the old document before reload.
		expect(query('opt-out-confirmation-root')).toBeNull();
		expect(sessionStorage.getItem(OPT_OUT_CONFIRMATION_STORAGE_KEY)).toBe('1');
		await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce());
		expect(onBeforeReload).toHaveBeenCalledOnce();
		expect(query('opt-out-confirmation-root')).toBeNull();

		const recorded = first.consent.snapshot().optOut;
		expect(recorded).not.toBeNull();
		activeConsent = null;
		reload.mockClear();

		// Next load after reload: opens once with the honored status, clears the
		// marker, records nothing again, and does not reload again.
		const second = await boot(BannerDialogHost, {
			persistence: true,
			prefetch: {
				initialRecords: { optOut: recorded ?? undefined },
			},
			reloadOnConsentRevoked: true,
		});
		const onRecorded = vi.fn();
		second.consent.kernel().events.on('opt-out:recorded', onRecorded);

		await vi.waitFor(async () => {
			await second.fixture.whenStable();
			expect(query('opt-out-confirmation-root')).not.toBeNull();
		});
		expect(query('opt-out-confirmation-status')?.textContent?.trim()).toBe(
			'Opt-out request honored'
		);
		expect(sessionStorage.getItem(OPT_OUT_CONFIRMATION_STORAGE_KEY)).toBeNull();
		expect(onRecorded).not.toHaveBeenCalled();
		await new Promise((resolve) => {
			setTimeout(resolve, 20);
		});
		expect(reload).not.toHaveBeenCalled();
		closeOptOutConfirmation(second.consent.kernel());
		activeConsent = null;

		// Load after that: marker is cleared, so confirmation does not reopen.
		const third = await boot(BannerDialogHost, {
			persistence: true,
			prefetch: {
				initialRecords: { optOut: recorded ?? undefined },
			},
			reloadOnConsentRevoked: true,
		});
		await new Promise((resolve) => {
			setTimeout(resolve, 20);
		});
		await third.fixture.whenStable();
		expect(query('opt-out-confirmation-root')).toBeNull();
	});

	test.each(['privacy-choices', 'california-privacy-choices'] as const)(
		'opens the dialog and records nothing from banner link, footer link and trigger when optOutLink=%s',
		async (optOutLink) => {
			const { consent, fixture } = await boot(AllControlsHost, {
				presentation: { optOutLink },
			});

			await vi.waitFor(() =>
				expect(query('consent-banner-right-link-opt-out')).not.toBeNull()
			);
			query<HTMLButtonElement>('consent-banner-right-link-opt-out')?.click();
			await vi.waitFor(async () => {
				await fixture.whenStable();
				expect(query('consent-dialog-root')).not.toBeNull();
			});
			expect(consent.snapshot().optOut).toBeNull();
			expect(query('opt-out-confirmation-root')).toBeNull();

			consent.setActiveUI('none');
			await vi.waitFor(async () => {
				await fixture.whenStable();
				expect(query('consent-dialog-root')).toBeNull();
			});

			query<HTMLButtonElement>('consent-dialog-link')?.click();
			await vi.waitFor(async () => {
				await fixture.whenStable();
				expect(query('consent-dialog-root')).not.toBeNull();
			});
			expect(consent.snapshot().optOut).toBeNull();
			expect(query('opt-out-confirmation-root')).toBeNull();

			consent.setActiveUI('none');
			await vi.waitFor(async () => {
				await fixture.whenStable();
				expect(query('consent-dialog-trigger')).not.toBeNull();
			});

			query<HTMLButtonElement>('consent-dialog-trigger')?.click();
			await vi.waitFor(async () => {
				await fixture.whenStable();
				expect(query('consent-dialog-root')).not.toBeNull();
			});
			expect(consent.snapshot().optOut).toBeNull();
			expect(query('opt-out-confirmation-root')).toBeNull();
		}
	);

	test('keeps requestOptOut opting out in one step even when optOutLink is privacy-choices', async () => {
		const { consent, fixture } = await boot(BothHostsHost, {
			presentation: { optOutLink: 'privacy-choices' },
		});

		void consent.requestOptOut();
		await vi.waitFor(async () => {
			await fixture.whenStable();
			expect(query('opt-out-confirmation-root')).not.toBeNull();
		});
		expect(consent.snapshot().optOut?.method).toBe('button');
		expect(query('consent-dialog-root')).toBeNull();
	});

	test('updates receipt from browser to account coverage when backend answers with heldBy both while keeping reference unchanged', async () => {
		let resolveAnswer: ((result: OptOutTransportResult) => void) | undefined;
		let sentPayload: OptOutPayload | undefined;
		const deferredOptOutMode: ProviderTransportFactory = Object.assign(
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

		const { fixture } = await boot(BannerDialogHost, {
			mode: deferredOptOutMode,
			prefetch: {
				initialPolicyResolution: resolvePolicyRules({
					countryCode: 'US',
					regionCode: 'CA',
					rules: [noticeRule()],
				}),
			},
		});

		await vi.waitFor(() =>
			expect(query('consent-banner-right-link-opt-out')).not.toBeNull()
		);
		query<HTMLButtonElement>('consent-banner-right-link-opt-out')?.click();

		await vi.waitFor(async () => {
			await fixture.whenStable();
			expect(query('opt-out-confirmation-root')).not.toBeNull();
		});
		const beforeDescription = query(
			'opt-out-confirmation-description'
		)?.textContent?.trim();
		const beforeReference = query(
			'opt-out-confirmation-reference'
		)?.textContent?.trim();
		expect(beforeDescription).toBeTruthy();
		expect(beforeDescription?.toLowerCase()).not.toContain('account');
		expect(beforeReference).toMatch(V1_UUID_PATTERN);
		expect(query('opt-out-confirmation-recorded-at')).not.toBeNull();

		await vi.waitFor(() => expect(resolveAnswer).toBeDefined());
		resolveAnswer?.({
			ok: true,
			optOut: {
				heldBy: 'both',
				method: 'button',
				recordedAt: sentPayload?.givenAt ?? Date.now(),
				rights: ['sale', 'share'],
			},
			subjectId: sentPayload?.subjectId,
		});

		await vi.waitFor(async () => {
			await fixture.whenStable();
			expect(
				query('opt-out-confirmation-description')?.textContent?.toLowerCase()
			).toContain('account');
		});
		expect(query('opt-out-confirmation-reference')?.textContent?.trim()).toBe(
			beforeReference
		);
		expect(sentPayload?.idempotencyKey).toBe(beforeReference);
	});

	test('renders no reference for an account-held record this browser did not create', async () => {
		const { fixture } = await boot(LinkDialogHost, {
			prefetch: {
				initialRecords: {
					optOut: {
						heldBy: 'person',
						method: 'propagated',
						recordedAt: Date.now() - 60_000,
						rights: ['sale', 'share'],
					},
					optOutRightsConfirmed: true,
				},
			},
		});

		await vi.waitFor(() => expect(query('consent-dialog-link')).not.toBeNull());
		query<HTMLButtonElement>('consent-dialog-link')?.click();

		await vi.waitFor(async () => {
			await fixture.whenStable();
			expect(query('opt-out-confirmation-root')).not.toBeNull();
		});
		expect(
			query('opt-out-confirmation-description')?.textContent?.toLowerCase()
		).toContain('account');
		expect(query('opt-out-confirmation-recorded-at')).not.toBeNull();
		expect(query('opt-out-confirmation-reference')).toBeNull();
	});
});
