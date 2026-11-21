import type {
	ConsentKernel,
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
import { V1_UUID_PATTERN } from '@inth/sdk/schema/types';
import type { PolicyRule } from '@inth/sdk/schema/types';
import {
	EARLY_CONSENT_TAP_SCRIPT,
	closeOptOutConfirmation,
} from '@inth/sdk/surface-actions';
import { useEffect } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';

import { ComponentFixtureProvider as InthProvider } from '~/__tests__/component-fixture-provider';
import { policyFixture } from '~/__tests__/policy-fixture';
import { ConsentDialog, OptOutConfirmation } from '~/aggregate-components';
import { ConsentDialogLink } from '~/components/consent-preferences-link/consent-preferences-link';
import { ConsentDialogTrigger } from '~/components/panel-trigger';
import { ConsentBanner } from '~/components/prompt';
import { useOptOut } from '~/hooks';
import { useKernel } from '~/kernel-selector';
import { testing } from '~/testing';

const query = <Element extends HTMLElement>(testId: string) =>
	document.querySelector<Element>(`[data-testid="${testId}"]`);

let activeKernel: ConsentKernel | null = null;

const KernelCapture = () => {
	const kernel = useKernel();
	useEffect(() => {
		activeKernel = kernel;
	}, [kernel]);
	return null;
};

const OptOutButton = () => {
	const optOut = useOptOut();
	return (
		<button
			type="button"
			data-testid="custom-opt-out"
			onClick={() => {
				void optOut();
			}}
		>
			Opt out now
		</button>
	);
};

const noticeRule = (): PolicyRule => ({
	...policyRulePresets.usPrivacyStatesOptOut(),
	prompt: 'notice',
});

afterEach(() => {
	if (activeKernel) {
		closeOptOutConfirmation(activeKernel);
		activeKernel = null;
	}
	document.getElementById(EARLY_TAP_STYLE_ID)?.remove();
	const host = window as unknown as Record<
		string,
		{ stop?: () => void } | undefined
	>;
	host[EARLY_TAPS_WINDOW_KEY]?.stop?.();
	Reflect.deleteProperty(window, EARLY_TAPS_WINDOW_KEY);
	sessionStorage.clear();
});

describe('one-step opt-out and confirmation view in React', () => {
	test('opts out in one click from the banner link and opens confirmation with one button', async () => {
		const { unmount } = await render(
			<InthProvider
				options={{
					consentCategories: ['functionality', 'marketing', 'measurement'],
					mode: testing(),
					overrides: { country: 'US', region: 'CA' },
					persistence: false,
					prefetch: policyFixture(undefined, noticeRule()),
					reloadOnConsentRevoked: false,
				}}
			>
				<KernelCapture />
				<ConsentBanner disableAnimation />
				<ConsentDialog disableAnimation />
			</InthProvider>
		);

		await vi.waitFor(() =>
			expect(query('consent-banner-right-link-opt-out')).not.toBeNull()
		);
		const optOutLink = query<HTMLButtonElement>(
			'consent-banner-right-link-opt-out'
		) as HTMLButtonElement;
		expect(optOutLink.textContent).toBe(
			'Do Not Sell or Share My Personal Information'
		);
		expect(optOutLink.querySelector('svg')).toBeNull();

		optOutLink.click();

		const snapshot = activeKernel?.getSnapshot();
		expect(snapshot?.optOut?.method).toBe('button');
		expect(snapshot?.effectivePermissions.marketing).toBe(false);
		expect(snapshot?.effectivePermissions.measurement).toBe(false);
		expect(snapshot?.effectivePermissions.functionality).toBe(true);
		expect(query('consent-dialog-root')).toBeNull();

		await vi.waitFor(() =>
			expect(query('opt-out-confirmation-root')).not.toBeNull()
		);
		const root = query('opt-out-confirmation-root') as HTMLElement;
		expect(query('opt-out-confirmation-title')?.textContent).toBe(
			'Do Not Sell or Share My Personal Information'
		);
		const status = query('opt-out-confirmation-status');
		expect(status?.getAttribute('role')).toBe('status');
		expect(status?.textContent).toBe('Opt-out request honored');
		const recordedAt = query<HTMLTimeElement>(
			'opt-out-confirmation-recorded-at'
		);
		expect(recordedAt).not.toBeNull();
		expect(recordedAt?.getAttribute('datetime')).toBeTruthy();
		expect(recordedAt?.textContent?.trim()).not.toBe('');
		const reference = query('opt-out-confirmation-reference');
		expect(reference).not.toBeNull();
		expect(reference?.textContent).toMatch(V1_UUID_PATTERN);
		expect(root.querySelectorAll('input, textarea, select')).toHaveLength(0);
		const buttons = [...root.querySelectorAll('button')];
		expect(buttons).toHaveLength(1);
		expect(buttons[0]?.textContent).toBe('Done');
		expect(query('opt-out-confirmation-preferences-link')?.textContent).toBe(
			'Manage preferences'
		);

		unmount();
	});

	test('Done returns focus to opener, Escape closes, preferences link opens dialog, and re-opening records nothing new', async () => {
		const { unmount } = await render(
			<InthProvider
				options={{
					consentCategories: ['functionality', 'marketing', 'measurement'],
					mode: testing(),
					overrides: { country: 'US', region: 'CA' },
					persistence: false,
					prefetch: policyFixture(
						undefined,
						policyRulePresets.usPrivacyStatesOptOut()
					),
					reloadOnConsentRevoked: false,
				}}
			>
				<KernelCapture />
				<ConsentDialogLink right="opt-out" />
				<ConsentDialog disableAnimation />
			</InthProvider>
		);

		await vi.waitFor(() => expect(query('consent-dialog-link')).not.toBeNull());
		const link = query<HTMLButtonElement>(
			'consent-dialog-link'
		) as HTMLButtonElement;
		link.focus();
		expect(document.activeElement).toBe(link);
		link.click();

		await vi.waitFor(() =>
			expect(query('opt-out-confirmation-done-button')).not.toBeNull()
		);
		expect(activeKernel?.getSnapshot().optOut?.method).toBe('button');

		const done = query<HTMLButtonElement>(
			'opt-out-confirmation-done-button'
		) as HTMLButtonElement;
		await vi.waitFor(() => expect(document.activeElement).toBe(done));

		done.click();
		await vi.waitFor(() =>
			expect(query('opt-out-confirmation-root')).toBeNull()
		);
		await vi.waitFor(() => expect(document.activeElement).toBe(link));

		// Re-opening when already opted out shows status without recording again.
		const recordedAt = activeKernel?.getSnapshot().optOut?.recordedAt;
		const onRecorded = vi.fn();
		activeKernel?.events.on('opt-out:recorded', onRecorded);

		link.focus();
		link.click();
		await vi.waitFor(() =>
			expect(query('opt-out-confirmation-root')).not.toBeNull()
		);
		expect(onRecorded).not.toHaveBeenCalled();
		expect(activeKernel?.getSnapshot().optOut?.recordedAt).toBe(recordedAt);

		// Escape closes and returns focus.
		document.documentElement.dispatchEvent(
			new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' })
		);
		await vi.waitFor(() =>
			expect(query('opt-out-confirmation-root')).toBeNull()
		);
		await vi.waitFor(() => expect(document.activeElement).toBe(link));

		// Preferences link opens preference center.
		link.click();
		await vi.waitFor(() =>
			expect(query('opt-out-confirmation-preferences-link')).not.toBeNull()
		);
		query<HTMLAnchorElement>('opt-out-confirmation-preferences-link')?.click();
		await vi.waitFor(() =>
			expect(query('opt-out-confirmation-root')).toBeNull()
		);
		await vi.waitFor(() => expect(query('consent-dialog-root')).not.toBeNull());

		unmount();
	});

	test('shows GPC signal wording when opted out via Global Privacy Control', async () => {
		const { unmount } = await render(
			<InthProvider
				options={{
					consentCategories: ['functionality', 'marketing', 'measurement'],
					mode: testing(),
					overrides: { country: 'US', gpc: true, region: 'CA' },
					persistence: false,
					prefetch: policyFixture(undefined, noticeRule()),
					presentation: { optOutLink: 'privacy-choices' },
				}}
			>
				<KernelCapture />
				<ConsentBanner disableAnimation />
				<OptOutConfirmation disableAnimation />
			</InthProvider>
		);

		await vi.waitFor(() =>
			expect(query('consent-banner-right-link-opt-out')).not.toBeNull()
		);
		expect(activeKernel?.getSnapshot().optOut?.method).toBe('gpc');
		const onRecorded = vi.fn();
		activeKernel?.events.on('opt-out:recorded', onRecorded);

		const link = query<HTMLButtonElement>(
			'consent-banner-right-link-opt-out'
		) as HTMLButtonElement;
		expect(link.textContent).toBe('Your Privacy Choices');
		expect(link.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
		link.click();

		await vi.waitFor(() =>
			expect(query('opt-out-confirmation-root')).not.toBeNull()
		);
		expect(onRecorded).not.toHaveBeenCalled();
		expect(query('opt-out-confirmation-title')?.textContent).toBe(
			'Your Privacy Choices'
		);
		expect(query('opt-out-confirmation-status')?.textContent).toBe(
			'Opt-out preference signal honored'
		);

		unmount();
	});

	test('falls back to opening preferences under a non-opt-out rule', async () => {
		const { unmount } = await render(
			<InthProvider
				options={{
					consentCategories: ['functionality', 'marketing', 'measurement'],
					mode: testing(),
					persistence: false,
					prefetch: policyFixture(undefined, {
						model: 'opt-in',
						prompt: 'choice',
					}),
				}}
			>
				<KernelCapture />
				<ConsentDialogLink right="opt-out" />
				<ConsentDialog disableAnimation />
			</InthProvider>
		);

		await vi.waitFor(() => expect(query('consent-dialog-link')).not.toBeNull());
		query<HTMLButtonElement>('consent-dialog-link')?.click();

		await vi.waitFor(() => expect(query('consent-dialog-root')).not.toBeNull());
		expect(query('opt-out-confirmation-root')).toBeNull();
		expect(activeKernel?.getSnapshot().optOut).toBeNull();

		unmount();
	});

	test.each([
		['do-not-sell', 'Do Not Sell or Share My Personal Information', false],
		['privacy-choices', 'Your Privacy Choices', true],
		['california-privacy-choices', 'Your California Privacy Choices', true],
	] as [OptOutLinkVariant, string, boolean][])(
		'renders optOutLink=%s with the exact title and icon=%s',
		async (optOutLink, expectedTitle, expectIcon) => {
			const { unmount } = await render(
				<InthProvider
					options={{
						mode: testing(),
						overrides: { country: 'US', region: 'CA' },
						persistence: false,
						prefetch: policyFixture(undefined, noticeRule()),
						presentation: { optOutLink },
					}}
				>
					<ConsentBanner disableAnimation />
					<ConsentDialogLink right="opt-out" />
				</InthProvider>
			);

			await vi.waitFor(() =>
				expect(query('consent-banner-right-link-opt-out')).not.toBeNull()
			);
			const bannerLink = query('consent-banner-right-link-opt-out');
			const dialogLink = query('consent-dialog-link');

			expect(bannerLink?.textContent).toBe(expectedTitle);
			expect(dialogLink?.textContent).toBe(expectedTitle);
			expect(
				Boolean(bannerLink?.querySelector('svg[aria-hidden="true"]'))
			).toBe(expectIcon);
			expect(
				Boolean(dialogLink?.querySelector('svg[aria-hidden="true"]'))
			).toBe(expectIcon);
			expect(Boolean(bannerLink?.querySelector('svg'))).toBe(expectIcon);
			expect(Boolean(dialogLink?.querySelector('svg'))).toBe(expectIcon);

			unmount();
		}
	);

	test('wires the floating trigger to opt out and hides it while confirmation is open', async () => {
		const { unmount } = await render(
			<InthProvider
				options={{
					consentCategories: ['functionality', 'marketing', 'measurement'],
					mode: testing(),
					overrides: { country: 'US', region: 'CA' },
					persistence: false,
					prefetch: policyFixture(
						undefined,
						policyRulePresets.usPrivacyStatesOptOut()
					),
					reloadOnConsentRevoked: false,
				}}
			>
				<KernelCapture />
				<ConsentDialogTrigger showWhen="always" />
				<ConsentDialog disableAnimation />
			</InthProvider>
		);

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

		expect(activeKernel?.getSnapshot().optOut?.method).toBe('button');
		await vi.waitFor(() =>
			expect(query('opt-out-confirmation-root')).not.toBeNull()
		);
		expect(query('consent-dialog-trigger')).toBeNull();

		query<HTMLButtonElement>('opt-out-confirmation-done-button')?.click();
		await vi.waitFor(() =>
			expect(query('opt-out-confirmation-root')).toBeNull()
		);
		await vi.waitFor(() =>
			expect(query('consent-dialog-trigger')).not.toBeNull()
		);

		unmount();
	});

	test('useOptOut triggers one-step opt-out and renders confirmation with theme slots', async () => {
		const { unmount } = await render(
			<InthProvider
				options={{
					consentCategories: ['functionality', 'marketing', 'measurement'],
					mode: testing(),
					overrides: { country: 'US', region: 'CA' },
					persistence: false,
					prefetch: policyFixture(undefined, noticeRule()),
					reloadOnConsentRevoked: false,
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
				}}
			>
				<KernelCapture />
				<OptOutButton />
				<ConsentDialog disableAnimation />
				<OptOutConfirmation disableAnimation />
			</InthProvider>
		);

		query<HTMLButtonElement>('custom-opt-out')?.click();

		await vi.waitFor(() =>
			expect(query('opt-out-confirmation-root')).not.toBeNull()
		);
		// Mounting both ConsentDialog and OptOutConfirmation renders only one view.
		expect(
			document.querySelectorAll('[data-testid="opt-out-confirmation-root"]')
		).toHaveLength(1);
		expect(query('opt-out-confirmation-root')?.classList).toContain(
			'slot-root'
		);
		expect(query('opt-out-confirmation-card')?.classList).toContain(
			'slot-card'
		);
		expect(query('opt-out-confirmation-header')?.classList).toContain(
			'slot-header'
		);
		expect(query('opt-out-confirmation-title')?.classList).toContain(
			'slot-title'
		);
		expect(query('opt-out-confirmation-status')?.classList).toContain(
			'slot-status'
		);
		expect(query('opt-out-confirmation-description')?.classList).toContain(
			'slot-description'
		);
		expect(query('opt-out-confirmation-footer')?.classList).toContain(
			'slot-footer'
		);
		expect(query('opt-out-confirmation-done-button')?.classList).toContain(
			'slot-done'
		);
		expect(query('opt-out-confirmation-preferences-link')?.classList).toContain(
			'slot-prefs'
		);
		expect(query('opt-out-confirmation-overlay')?.classList).toContain(
			'slot-overlay'
		);

		unmount();
	});

	test('replays an early tap on the opt-out link as a durable opt-out', async () => {
		// Simulate server-rendered banner HTML + early-tap script before React mounts.
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

		const { unmount } = await render(
			<InthProvider
				options={{
					consentCategories: ['functionality', 'marketing', 'measurement'],
					mode: testing(),
					overrides: { country: 'US', region: 'CA' },
					persistence: false,
					prefetch: policyFixture(undefined, noticeRule()),
					reloadOnConsentRevoked: false,
				}}
			>
				<KernelCapture />
				<ConsentBanner disableAnimation />
				<ConsentDialog disableAnimation />
			</InthProvider>
		);

		await vi.waitFor(() =>
			expect(activeKernel?.getSnapshot().optOut?.method).toBe('button')
		);
		expect(activeKernel?.getSnapshot().effectivePermissions.marketing).toBe(
			false
		);
		expect(activeKernel?.getSnapshot().effectivePermissions.measurement).toBe(
			false
		);
		await vi.waitFor(() =>
			expect(query('opt-out-confirmation-root')).not.toBeNull()
		);

		unmount();
	});

	test('defers confirmation across a revocation reload, shows it once on the next load, and not on the load after that', async () => {
		const onBeforeReload = vi.fn();
		const first = await render(
			<InthProvider
				options={{
					callbacks: { onBeforeConsentRevocationReload: onBeforeReload },
					consentCategories: ['functionality', 'marketing', 'measurement'],
					mode: testing(),
					overrides: { country: 'US', region: 'CA' },
					prefetch: policyFixture(undefined, noticeRule()),
				}}
			>
				<KernelCapture />
				<ConsentBanner disableAnimation />
				<ConsentDialog disableAnimation />
			</InthProvider>
		);

		await vi.waitFor(() =>
			expect(query('consent-banner-right-link-opt-out')).not.toBeNull()
		);
		query<HTMLButtonElement>('consent-banner-right-link-opt-out')?.click();

		// Does not flash on the old document before reload.
		expect(query('opt-out-confirmation-root')).toBeNull();
		expect(sessionStorage.getItem(OPT_OUT_CONFIRMATION_STORAGE_KEY)).toBe('1');
		await vi.waitFor(() => expect(onBeforeReload).toHaveBeenCalledOnce());
		expect(query('opt-out-confirmation-root')).toBeNull();

		const recorded = activeKernel?.getSnapshot().optOut;
		expect(recorded).not.toBeNull();
		await first.unmount();

		// Next load after reload: opens once with the honored status, clears the
		// marker, records nothing again, and does not reload again.
		const onSecondBeforeReload = vi.fn();
		const second = await render(
			<InthProvider
				options={{
					callbacks: { onBeforeConsentRevocationReload: onSecondBeforeReload },
					consentCategories: ['functionality', 'marketing', 'measurement'],
					mode: testing(),
					overrides: { country: 'US', region: 'CA' },
					prefetch: {
						...policyFixture(undefined, noticeRule()),
						initialRecords: { optOut: recorded ?? undefined },
					},
				}}
			>
				<KernelCapture />
				<ConsentDialog disableAnimation />
			</InthProvider>
		);

		await vi.waitFor(() =>
			expect(query('opt-out-confirmation-root')).not.toBeNull()
		);
		expect(query('opt-out-confirmation-status')?.textContent).toBe(
			'Opt-out request honored'
		);
		expect(sessionStorage.getItem(OPT_OUT_CONFIRMATION_STORAGE_KEY)).toBeNull();
		await new Promise((resolve) => {
			setTimeout(resolve, 20);
		});
		expect(onSecondBeforeReload).not.toHaveBeenCalled();
		await second.unmount();

		// Load after that: marker is cleared, so confirmation does not reopen.
		const third = await render(
			<InthProvider
				options={{
					consentCategories: ['functionality', 'marketing', 'measurement'],
					mode: testing(),
					overrides: { country: 'US', region: 'CA' },
					prefetch: {
						...policyFixture(undefined, noticeRule()),
						initialRecords: { optOut: recorded ?? undefined },
					},
				}}
			>
				<KernelCapture />
				<ConsentDialog disableAnimation />
			</InthProvider>
		);

		await new Promise((resolve) => {
			setTimeout(resolve, 20);
		});
		expect(query('opt-out-confirmation-root')).toBeNull();
		await third.unmount();
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

		const { unmount } = await render(
			<InthProvider
				options={{
					consentCategories: ['functionality', 'marketing', 'measurement'],
					mode: deferredOptOutMode,
					overrides: { country: 'US', region: 'CA' },
					persistence: false,
					prefetch: policyFixture(undefined, noticeRule()),
					reloadOnConsentRevoked: false,
				}}
			>
				<KernelCapture />
				<ConsentBanner disableAnimation />
				<ConsentDialog disableAnimation />
			</InthProvider>
		);

		await vi.waitFor(() =>
			expect(query('consent-banner-right-link-opt-out')).not.toBeNull()
		);
		query<HTMLButtonElement>('consent-banner-right-link-opt-out')?.click();

		await vi.waitFor(() =>
			expect(query('opt-out-confirmation-root')).not.toBeNull()
		);
		const beforeDescription = query(
			'opt-out-confirmation-description'
		)?.textContent;
		const beforeReference = query(
			'opt-out-confirmation-reference'
		)?.textContent;
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

		await vi.waitFor(() =>
			expect(
				query('opt-out-confirmation-description')?.textContent?.toLowerCase()
			).toContain('account')
		);
		expect(query('opt-out-confirmation-reference')?.textContent).toBe(
			beforeReference
		);
		expect(sentPayload?.idempotencyKey).toBe(beforeReference);

		await unmount();
	});

	test('renders no reference for an account-held record this browser did not create', async () => {
		const { unmount } = await render(
			<InthProvider
				options={{
					consentCategories: ['functionality', 'marketing', 'measurement'],
					mode: testing(),
					overrides: { country: 'US', region: 'CA' },
					persistence: false,
					prefetch: {
						...policyFixture(undefined, noticeRule()),
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
					reloadOnConsentRevoked: false,
				}}
			>
				<KernelCapture />
				<ConsentDialogLink right="opt-out" />
				<ConsentDialog disableAnimation />
			</InthProvider>
		);

		await vi.waitFor(() => expect(query('consent-dialog-link')).not.toBeNull());
		query<HTMLButtonElement>('consent-dialog-link')?.click();

		await vi.waitFor(() =>
			expect(query('opt-out-confirmation-root')).not.toBeNull()
		);
		expect(
			query('opt-out-confirmation-description')?.textContent?.toLowerCase()
		).toContain('account');
		expect(query('opt-out-confirmation-recorded-at')).not.toBeNull();
		expect(query('opt-out-confirmation-reference')).toBeNull();

		await unmount();
	});
});
