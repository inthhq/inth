import type * as Engine from '@inth/sdk/engine';
import {
	OPT_OUT_CONFIRMATION_STORAGE_KEY,
	policyRulePresets,
} from '@inth/sdk/engine';
import { V1_UUID_PATTERN } from '@inth/sdk/schema/types';
import { closeOptOutConfirmation } from '@inth/sdk/surface-actions';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, test, vi } from 'vitest';

import OptOutConfirmationFixture from '../../__tests__/fixtures/opt-out-confirmation-fixture.svelte';
import { transportMode } from '../../__tests__/fixtures/transport-mode';
import { policyFixture } from '../../__tests__/policy-fixture';
import type { ConsentContextValue } from '../../lib/context.svelte';
import type { ConsentManagerOptions } from '../../lib/types';

const reload = vi.hoisted(() => vi.fn());
// oxlint-disable-next-line anti-slop/no-module-mocking -- jsdom cannot perform navigation on `window.location.reload`. The factory returns the real module and records the reload instead.
vi.mock('@inth/sdk/engine', async (importOriginal) => {
	const actual = await importOriginal<typeof Engine>();
	return {
		...actual,
		watchRevocationReload: (options: Engine.RevocationReloadOptions) =>
			actual.watchRevocationReload({ ...options, reload }),
	};
});

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
		reloadOnConsentRevoked: false,
		...options,
	};
	const view = render(OptOutConfirmationFixture, {
		capture: (context: ConsentContextValue) => {
			activeContext = context;
		},
		options: merged,
		// The dialog confirms an opt-out on its own receipt; these tests read
		// the standalone confirmation, as the host mounts it.
		showBanner: false,
		showStandaloneConfirmation: true,
		...props,
	});
	return { view };
};

afterEach(() => {
	if (activeContext) {
		closeOptOutConfirmation(activeContext.kernel);
		activeContext = null;
	}
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

describe('one-step opt-out and confirmation view in Svelte', () => {
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
			{ showBanner: false, showDialog: false, showStandaloneConfirmation: true }
		);

		await waitFor(() =>
			expect(activeContext?.kernel.getSnapshot().optOut?.method).toBe('gpc')
		);
		const onRecorded = vi.fn();
		activeContext?.kernel.events.on('opt-out:recorded', onRecorded);

		void activeContext?.state.requestOptOut();

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

	test('defers confirmation across a revocation reload, shows it once on the next load, and not on the load after that', async () => {
		const onBeforeReload = vi.fn();
		const first = renderSuite({
			callbacks: { onBeforeConsentRevocationReload: onBeforeReload },
			persistence: true,
			reloadOnConsentRevoked: true,
		});

		await waitFor(() => expect(activeContext).not.toBeNull());
		void activeContext?.state.requestOptOut();

		// Does not flash on the old document before reload.
		expect(query('opt-out-confirmation-root')).toBeNull();
		expect(sessionStorage.getItem(OPT_OUT_CONFIRMATION_STORAGE_KEY)).toBe('1');
		await waitFor(() => expect(reload).toHaveBeenCalledOnce());
		expect(onBeforeReload).toHaveBeenCalledOnce();
		expect(query('opt-out-confirmation-root')).toBeNull();

		const recorded = activeContext?.kernel.getSnapshot().optOut;
		expect(recorded).not.toBeNull();
		first.view.unmount();
		activeContext = null;
		reload.mockClear();

		// Next load after reload: opens once with the honored status, clears the
		// marker, records nothing again, and does not reload again.
		const second = renderSuite(
			{
				persistence: true,
				prefetch: {
					...policyFixture({}, noticeRule()),
					initialRecords: { optOut: recorded ?? undefined },
				},
				reloadOnConsentRevoked: true,
			},
			{ showBanner: false, showDialog: true }
		);

		await waitFor(() =>
			expect(query('opt-out-confirmation-root')).not.toBeNull()
		);
		expect(query('opt-out-confirmation-status')?.textContent?.trim()).toBe(
			'Opt-out request honored'
		);
		expect(sessionStorage.getItem(OPT_OUT_CONFIRMATION_STORAGE_KEY)).toBeNull();
		await new Promise((resolve) => {
			setTimeout(resolve, 20);
		});
		expect(reload).not.toHaveBeenCalled();
		second.view.unmount();
		activeContext = null;

		// Load after that: marker is cleared, so confirmation does not reopen.
		const third = renderSuite(
			{
				persistence: true,
				prefetch: {
					...policyFixture({}, noticeRule()),
					initialRecords: { optOut: recorded ?? undefined },
				},
				reloadOnConsentRevoked: true,
			},
			{ showBanner: false, showDialog: true }
		);
		await new Promise((resolve) => {
			setTimeout(resolve, 20);
		});
		expect(query('opt-out-confirmation-root')).toBeNull();
		third.view.unmount();
	});

	test.each(['privacy-choices', 'california-privacy-choices'] as const)(
		'opens the dialog and records nothing from the footer link and trigger when optOutLink=%s',
		async (optOutLink) => {
			const { view } = renderSuite(
				{ presentation: { optOutLink } },
				{
					showDialog: true,
					showLink: true,
					showTrigger: true,
				}
			);

			await waitFor(() => expect(query('consent-dialog-link')).not.toBeNull());
			await fireEvent.click(
				query<HTMLButtonElement>('consent-dialog-link') as HTMLButtonElement
			);
			await waitFor(() => expect(query('consent-dialog-root')).not.toBeNull());
			expect(activeContext?.kernel.getSnapshot().optOut).toBeNull();
			expect(query('opt-out-confirmation-root')).toBeNull();

			activeContext?.kernel.set.activeUI('none');
			await waitFor(() =>
				expect(query('consent-dialog-trigger')).not.toBeNull()
			);

			await fireEvent.click(
				query<HTMLButtonElement>('consent-dialog-trigger') as HTMLButtonElement
			);
			await waitFor(() => expect(query('consent-dialog-root')).not.toBeNull());
			expect(activeContext?.kernel.getSnapshot().optOut).toBeNull();
			expect(query('opt-out-confirmation-root')).toBeNull();

			view.unmount();
		}
	);

	test('keeps requestOptOut opting out in one step even when optOutLink is privacy-choices', async () => {
		const { view } = renderSuite(
			{ presentation: { optOutLink: 'privacy-choices' } },
			{ showBanner: false, showDialog: true }
		);

		await waitFor(() => expect(activeContext).not.toBeNull());
		void activeContext?.state.requestOptOut();

		await waitFor(() =>
			expect(query('opt-out-confirmation-root')).not.toBeNull()
		);
		expect(activeContext?.kernel.getSnapshot().optOut?.method).toBe('button');
		expect(query('consent-dialog-root')).toBeNull();

		view.unmount();
	});

	test('updates receipt from browser to account coverage when backend answers with heldBy both while keeping reference unchanged', async () => {
		let resolveAnswer:
			| ((result: Engine.OptOutTransportResult) => void)
			| undefined;
		let sentPayload: Engine.OptOutPayload | undefined;
		const deferredOptOutMode: Engine.ProviderTransportFactory = Object.assign(
			() => ({
				optOut: (payload: Engine.OptOutPayload) => {
					sentPayload = payload;
					return new Promise<Engine.OptOutTransportResult>((resolve) => {
						resolveAnswer = resolve;
					});
				},
			}),
			{ kind: 'offline' as const }
		);

		const { view } = renderSuite({ mode: deferredOptOutMode });

		await waitFor(() => expect(activeContext).not.toBeNull());
		void activeContext?.state.requestOptOut();

		await waitFor(() =>
			expect(query('opt-out-confirmation-root')).not.toBeNull()
		);
		const beforeDescription = query(
			'opt-out-confirmation-description'
		)?.textContent;
		const beforeReference = query(
			'opt-out-confirmation-reference'
		)?.textContent?.trim();
		expect(beforeDescription).toBeTruthy();
		expect(beforeDescription?.toLowerCase()).not.toContain('account');
		expect(beforeReference).toMatch(V1_UUID_PATTERN);
		expect(query('opt-out-confirmation-recorded-at')).not.toBeNull();
		expect(activeContext?.state.optOutState.scope).toBe('browser');
		expect(activeContext?.state.optOutState.reference).toBe(beforeReference);

		await waitFor(() => expect(resolveAnswer).toBeDefined());
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

		await waitFor(() =>
			expect(
				query('opt-out-confirmation-description')?.textContent?.toLowerCase()
			).toContain('account')
		);
		expect(query('opt-out-confirmation-reference')?.textContent?.trim()).toBe(
			beforeReference
		);
		expect(sentPayload?.idempotencyKey).toBe(beforeReference);
		expect(activeContext?.state.optOutState.scope).toBe('account');

		view.unmount();
	});

	test('renders no reference for an account-held record this browser did not create', async () => {
		const { view } = renderSuite(
			{
				prefetch: {
					...policyFixture({}, noticeRule()),
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
			},
			{ showBanner: false, showDialog: true, showLink: true }
		);

		await waitFor(() => expect(query('consent-dialog-link')).not.toBeNull());
		await fireEvent.click(
			query<HTMLButtonElement>('consent-dialog-link') as HTMLButtonElement
		);

		await waitFor(() =>
			expect(query('opt-out-confirmation-root')).not.toBeNull()
		);
		expect(
			query('opt-out-confirmation-description')?.textContent?.toLowerCase()
		).toContain('account');
		expect(query('opt-out-confirmation-recorded-at')).not.toBeNull();
		expect(query('opt-out-confirmation-reference')).toBeNull();

		view.unmount();
	});

	test('optOutState exposes merged display state and receipt across click and backend answer', async () => {
		let resolveAnswer:
			| ((result: Engine.OptOutTransportResult) => void)
			| undefined;
		let sentPayload: Engine.OptOutPayload | undefined;
		const deferredOptOutMode: Engine.ProviderTransportFactory = Object.assign(
			() => ({
				optOut: (payload: Engine.OptOutPayload) => {
					sentPayload = payload;
					return new Promise<Engine.OptOutTransportResult>((resolve) => {
						resolveAnswer = resolve;
					});
				},
			}),
			{ kind: 'offline' as const }
		);

		const { view } = renderSuite({ mode: deferredOptOutMode });

		await waitFor(() => expect(activeContext).not.toBeNull());
		expect(activeContext?.state.optOutState).toMatchObject({
			at: null,
			available: true,
			honored: false,
			lock: null,
			optedOut: false,
			reference: null,
			rights: [],
			scope: null,
			source: null,
			via: null,
		});
		expect('optOutReceipt' in (activeContext?.state ?? {})).toBe(false);

		void activeContext?.state.requestOptOut();

		await waitFor(() =>
			expect(activeContext?.state.optOutState.optedOut).toBe(true)
		);
		const afterClick = activeContext?.state.optOutState;
		expect(afterClick).toMatchObject({
			available: true,
			honored: true,
			lock: null,
			optedOut: true,
			rights: [],
			scope: 'browser',
			source: 'click',
			via: 'request',
		});
		expect(typeof afterClick?.at).toBe('number');
		expect(typeof afterClick?.reference).toBe('string');
		expect(afterClick?.reference).toMatch(V1_UUID_PATTERN);
		const clickReference = afterClick?.reference;

		await waitFor(() => expect(resolveAnswer).toBeDefined());
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

		await waitFor(() =>
			expect(activeContext?.state.optOutState.scope).toBe('account')
		);
		expect(activeContext?.state.optOutState).toMatchObject({
			honored: true,
			lock: 'held-by-account',
			optedOut: true,
			reference: clickReference,
			rights: ['sale', 'share'],
			scope: 'account',
			source: 'click',
			via: 'request',
		});

		view.unmount();
	});
});
