import type { OptOutLinkVariant } from '@inth/sdk/engine';
import { policyRulePresets } from '@inth/sdk/engine';
import {
	EARLY_TAP_STYLE_ID,
	EARLY_TAPS_WINDOW_KEY,
} from '@inth/sdk/runtime/page-globals';
import {
	EARLY_CONSENT_TAP_SCRIPT,
	closeOptOutConfirmation,
} from '@inth/sdk/surface-actions';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';

import OptOutConfirmationFixture from '../../__tests__/fixtures/opt-out-confirmation-fixture.svelte';
import { transportMode } from '../../__tests__/fixtures/transport-mode';
import { policyFixture } from '../../__tests__/policy-fixture';
import type { ConsentContextValue } from '../../lib/context.svelte';
import type { ConsentManagerOptions } from '../../lib/types';

const query = <Element extends HTMLElement>(testId: string) =>
	document.querySelector<Element>(`[data-testid="${testId}"]`);

let activeContext: ConsentContextValue | null = null;

const noticeRule = () => ({
	...policyRulePresets.usPrivacyStatesOptOut(),
	prompt: 'notice' as const,
});

const renderSuite = (
	options: Partial<ConsentManagerOptions> = {},
	props: {
		showBanner?: boolean;
		showDialog?: boolean;
		showLink?: boolean;
		showTrigger?: boolean;
		showStandaloneConfirmation?: boolean;
	} = {}
) => {
	const merged: ConsentManagerOptions = {
		consentCategories: ['functionality', 'marketing', 'measurement'],
		disableAnimation: true,
		mode: transportMode({}),
		overrides: { country: 'US', region: 'CA' },
		persistence: false,
		prefetch: policyFixture({}, noticeRule()),
		...options,
	};
	const view = render(OptOutConfirmationFixture, {
		capture: (context: ConsentContextValue) => {
			activeContext = context;
		},
		options: merged,
		...props,
	});
	return { view };
};

afterEach(() => {
	if (activeContext) {
		closeOptOutConfirmation(activeContext.kernel);
		activeContext = null;
	}
	document.getElementById(EARLY_TAP_STYLE_ID)?.remove();
	const host = window as unknown as Record<
		string,
		{ stop?: () => void } | undefined
	>;
	host[EARLY_TAPS_WINDOW_KEY]?.stop?.();
	Reflect.deleteProperty(window, EARLY_TAPS_WINDOW_KEY);
});

describe('one-step opt-out and confirmation view in Svelte', () => {
	test('opts out in one click from the banner link and opens confirmation with one button', async () => {
		const { view } = renderSuite();

		await waitFor(() =>
			expect(query('consent-banner-right-link-opt-out')).not.toBeNull()
		);
		const optOutLink = query<HTMLButtonElement>(
			'consent-banner-right-link-opt-out'
		) as HTMLButtonElement;
		expect(optOutLink.textContent?.trim()).toBe(
			'Do Not Sell or Share My Personal Information'
		);
		expect(optOutLink.querySelector('svg')).toBeNull();

		await fireEvent.click(optOutLink);

		const snapshot = activeContext?.kernel.getSnapshot();
		expect(snapshot?.optOut?.method).toBe('button');
		expect(snapshot?.effectivePermissions.marketing).toBe(false);
		expect(snapshot?.effectivePermissions.measurement).toBe(false);
		expect(snapshot?.effectivePermissions.functionality).toBe(true);
		expect(query('consent-dialog-root')).toBeNull();

		await waitFor(() =>
			expect(query('opt-out-confirmation-root')).not.toBeNull()
		);
		const root = query('opt-out-confirmation-root') as HTMLElement;
		expect(query('opt-out-confirmation-title')?.textContent?.trim()).toBe(
			'Do Not Sell or Share My Personal Information'
		);
		const status = query('opt-out-confirmation-status');
		expect(status?.getAttribute('role')).toBe('status');
		expect(status?.textContent?.trim()).toBe('Opt-out request honored');
		expect(query('opt-out-confirmation-description')?.textContent).toContain(
			'not sell or share'
		);
		const buttons = [...root.querySelectorAll('button')];
		expect(buttons).toHaveLength(1);
		expect(buttons[0]?.textContent?.trim()).toBe('Done');
		expect(
			query('opt-out-confirmation-preferences-link')?.textContent?.trim()
		).toBe('Manage preferences');

		view.unmount();
	});

	test('Done closes and restores focus, Escape closes, preferences link opens dialog, and re-opening records nothing new', async () => {
		const { view } = renderSuite(
			{
				prefetch: policyFixture({}, policyRulePresets.usPrivacyStatesOptOut()),
			},
			{ showBanner: false, showDialog: true, showLink: true }
		);

		await waitFor(() => expect(query('consent-dialog-link')).not.toBeNull());
		const link = query<HTMLButtonElement>(
			'consent-dialog-link'
		) as HTMLButtonElement;
		link.focus();
		expect(document.activeElement).toBe(link);
		await fireEvent.click(link);

		await waitFor(() =>
			expect(query('opt-out-confirmation-done-button')).not.toBeNull()
		);
		expect(activeContext?.kernel.getSnapshot().optOut?.method).toBe('button');

		await fireEvent.click(
			query<HTMLButtonElement>(
				'opt-out-confirmation-done-button'
			) as HTMLButtonElement
		);
		await waitFor(() => expect(query('opt-out-confirmation-root')).toBeNull());
		await waitFor(() => expect(document.activeElement).toBe(link));

		// Re-opening when already opted out records nothing new.
		const recordedAt = activeContext?.kernel.getSnapshot().optOut?.recordedAt;
		const onRecorded = vi.fn();
		activeContext?.kernel.events.on('opt-out:recorded', onRecorded);

		link.focus();
		await fireEvent.click(link);
		await waitFor(() =>
			expect(query('opt-out-confirmation-root')).not.toBeNull()
		);
		expect(onRecorded).not.toHaveBeenCalled();
		expect(activeContext?.kernel.getSnapshot().optOut?.recordedAt).toBe(
			recordedAt
		);

		// Escape closes and returns focus.
		await fireEvent.keyDown(document.documentElement, { key: 'Escape' });
		await waitFor(() => expect(query('opt-out-confirmation-root')).toBeNull());
		await waitFor(() => expect(document.activeElement).toBe(link));

		// Manage preferences opens full preference center.
		await fireEvent.click(link);
		await waitFor(() =>
			expect(query('opt-out-confirmation-preferences-link')).not.toBeNull()
		);
		await fireEvent.click(
			query<HTMLAnchorElement>(
				'opt-out-confirmation-preferences-link'
			) as HTMLAnchorElement
		);
		await waitFor(() => expect(query('opt-out-confirmation-root')).toBeNull());
		await waitFor(() => expect(query('consent-dialog-root')).not.toBeNull());

		view.unmount();
	});

	test('shows GPC signal wording when opted out via Global Privacy Control', async () => {
		const { view } = renderSuite(
			{
				overrides: { country: 'US', gpc: true, region: 'CA' },
				presentation: { optOutLink: 'privacy-choices' },
			},
			{ showBanner: true, showDialog: false, showStandaloneConfirmation: true }
		);

		await waitFor(() =>
			expect(query('consent-banner-right-link-opt-out')).not.toBeNull()
		);
		expect(activeContext?.kernel.getSnapshot().optOut?.method).toBe('gpc');
		const onRecorded = vi.fn();
		activeContext?.kernel.events.on('opt-out:recorded', onRecorded);

		const link = query<HTMLButtonElement>(
			'consent-banner-right-link-opt-out'
		) as HTMLButtonElement;
		expect(link.textContent?.trim()).toBe('Your Privacy Choices');
		expect(link.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
		await fireEvent.click(link);

		await waitFor(() =>
			expect(query('opt-out-confirmation-root')).not.toBeNull()
		);
		expect(onRecorded).not.toHaveBeenCalled();
		expect(query('opt-out-confirmation-title')?.textContent?.trim()).toBe(
			'Your Privacy Choices'
		);
		expect(query('opt-out-confirmation-status')?.textContent?.trim()).toBe(
			'Opt-out preference signal honored'
		);

		view.unmount();
	});

	test('falls back to opening preferences under a non-opt-out rule', async () => {
		const { view } = renderSuite(
			{
				overrides: { country: 'DE' },
				prefetch: policyFixture({}, { model: 'opt-in', prompt: 'choice' }),
			},
			{ showBanner: false, showDialog: true, showLink: true }
		);

		await waitFor(() => expect(query('consent-dialog-link')).not.toBeNull());
		await fireEvent.click(
			query<HTMLButtonElement>('consent-dialog-link') as HTMLButtonElement
		);
		await waitFor(() => expect(query('consent-dialog-root')).not.toBeNull());
		expect(query('opt-out-confirmation-root')).toBeNull();
		expect(activeContext?.kernel.getSnapshot().optOut).toBeNull();

		view.unmount();
	});

	test.each([
		['do-not-sell', 'Do Not Sell or Share My Personal Information', false],
		['privacy-choices', 'Your Privacy Choices', true],
		['california-privacy-choices', 'Your California Privacy Choices', true],
	] as [OptOutLinkVariant, string, boolean][])(
		'renders optOutLink=%s with exact title and icon=%s',
		async (optOutLink, expectedTitle, expectIcon) => {
			const { view } = renderSuite(
				{ presentation: { optOutLink } },
				{ showBanner: true, showDialog: false, showLink: true }
			);

			await waitFor(() =>
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

			view.unmount();
		}
	);

	test('wires the floating trigger to opt out and hides it while confirmation is open', async () => {
		const { view } = renderSuite(
			{
				prefetch: policyFixture({}, policyRulePresets.usPrivacyStatesOptOut()),
			},
			{ showBanner: false, showDialog: true, showTrigger: true }
		);

		await waitFor(() => expect(query('consent-dialog-trigger')).not.toBeNull());
		const trigger = query<HTMLButtonElement>(
			'consent-dialog-trigger'
		) as HTMLButtonElement;
		expect(trigger.getAttribute('aria-label')).toBe(
			'Do Not Sell or Share My Personal Information'
		);

		await fireEvent.click(trigger);
		expect(activeContext?.kernel.getSnapshot().optOut?.method).toBe('button');
		await waitFor(() =>
			expect(query('opt-out-confirmation-root')).not.toBeNull()
		);
		expect(query('consent-dialog-trigger')).toBeNull();

		await fireEvent.click(
			query<HTMLButtonElement>(
				'opt-out-confirmation-done-button'
			) as HTMLButtonElement
		);
		await waitFor(() => expect(query('opt-out-confirmation-root')).toBeNull());
		await waitFor(() => expect(query('consent-dialog-trigger')).not.toBeNull());

		view.unmount();
	});

	test('requestOptOut opens confirmation with all theme slots and avoids duplicate hosts', async () => {
		const { view } = renderSuite(
			{
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
			},
			{ showBanner: false, showDialog: true, showStandaloneConfirmation: true }
		);

		await waitFor(() => expect(activeContext).not.toBeNull());
		void activeContext?.state.requestOptOut();

		await waitFor(() =>
			expect(query('opt-out-confirmation-root')).not.toBeNull()
		);
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

		view.unmount();
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

		const { view } = renderSuite();

		await waitFor(() =>
			expect(activeContext?.kernel.getSnapshot().optOut?.method).toBe('button')
		);
		expect(
			activeContext?.kernel.getSnapshot().effectivePermissions.marketing
		).toBe(false);
		expect(
			activeContext?.kernel.getSnapshot().effectivePermissions.measurement
		).toBe(false);
		await waitFor(() =>
			expect(query('opt-out-confirmation-root')).not.toBeNull()
		);

		view.unmount();
	});
});
