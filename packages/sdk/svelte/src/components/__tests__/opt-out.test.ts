import type {
	OptOutPayload,
	OptOutTransportResult,
	ProviderTransportFactory,
} from '@inth/sdk/engine';
import {
	closeOptInConfirmation,
	closeOptOutConfirmation,
} from '@inth/sdk/surface-actions';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import OptOutConfirmationFixture from '../../__tests__/fixtures/opt-out-confirmation-fixture.svelte';
import WidgetFixture from '../../__tests__/fixtures/widget-fixture.svelte';
import { policyFixture } from '../../__tests__/policy-fixture';
import { testOffline } from '../../__tests__/test-offline';
import type { ConsentContextValue } from '../../lib/context.svelte';

const CATEGORIES = ['functionality', 'marketing', 'measurement'] as const;
const OPT_OUT_RULE = {
	categories: [...CATEGORIES],
	id: 'svelte-us-opt-out',
	model: 'opt-out' as const,
	privacySignals: { gpc: { denyCategories: ['marketing', 'measurement'] } },
	prompt: 'notice' as const,
	rights: ['disclosure', 'preferences', 'opt-out'] as const,
};

const OPT_IN_RULE = {
	categories: [...CATEGORIES],
	id: 'svelte-eu-opt-in',
	model: 'opt-in' as const,
	prompt: 'choice' as const,
	rights: ['disclosure', 'preferences'] as const,
};

const part = <ElementType extends HTMLElement = HTMLElement>(testId: string) =>
	document.querySelector<ElementType>(`[data-testid="${testId}"]`);

let activeContext: ConsentContextValue | null = null;

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

afterEach(() => {
	if (activeContext) {
		closeOptOutConfirmation(activeContext.kernel);
		closeOptInConfirmation(activeContext.kernel);
		activeContext = null;
	}
});

describe('Svelte consent widget opt-out parity', () => {
	beforeEach(() => {
		window.localStorage.clear();
	});

	test('shows request status, seeds stored grants off, keeps opt-out on untouched save and lifts on confirmed opt-in save', async () => {
		const fixture = policyFixture(
			{ functionality: true, marketing: true, measurement: true },
			OPT_OUT_RULE
		);
		const now = fixture.now ?? Date.now();
		let context!: ConsentContextValue;
		const view = render(WidgetFixture, {
			capture: (value) => {
				context = value;
				activeContext = value;
			},
			options: {
				consentCategories: [...CATEGORIES],
				mode: testOffline([OPT_OUT_RULE]),
				persistence: false,
				prefetch: {
					...fixture,
					initialRecords: {
						...fixture.initialRecords,
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
						consentWidgetOptOut: 'brand-opt-out-block',
						consentWidgetOptOutStatus: 'brand-opt-out-status',
					},
				},
			},
		});

		const status = await waitFor(() => {
			const element = part('consent-widget-opt-out-status');
			expect(element).not.toBeNull();
			return element as HTMLElement;
		});
		expect(part('consent-widget-opt-out')?.classList).toContain(
			'brand-opt-out-block'
		);
		expect(status.getAttribute('role')).toBe('status');
		expect(status.textContent?.trim()).toBe('Opt-out request honored');
		expect(status.classList).toContain('brand-opt-out-status');
		expect(context.state.optOutState).toMatchObject({
			honored: true,
			lock: null,
			via: 'request',
		});

		const marketing = part<HTMLButtonElement>(
			'consent-widget-switch-marketing'
		);
		const measurement = part<HTMLButtonElement>(
			'consent-widget-switch-measurement'
		);
		const functionality = part<HTMLButtonElement>(
			'consent-widget-switch-functionality'
		);
		expect(marketing?.getAttribute('aria-checked')).toBe('false');
		expect(marketing?.disabled).toBe(false);
		expect(measurement?.getAttribute('aria-checked')).toBe('false');
		expect(functionality?.getAttribute('aria-checked')).toBe('true');
		expect(part('consent-widget-restriction-marketing')).toBeNull();

		// An untouched save does not re-confirm the stored grant or lift the opt-out.
		await fireEvent.click(part('consent-widget-footer-save-button') as Element);
		await waitFor(() => {
			expect(context.snapshot.explicitChoice?.categories.marketing?.value).toBe(
				false
			);
		});
		expect(context.snapshot.optOut).not.toBeNull();
		expect(context.snapshot.effectivePermissions.marketing).toBe(false);

		// Turning measurement on while marketing stays off keeps the opt-out and lets measurement stand.
		expect(measurement?.disabled).toBe(false);
		await fireEvent.click(measurement as Element);
		await waitFor(() => {
			expect(measurement?.getAttribute('aria-checked')).toBe('true');
		});
		await fireEvent.click(part('consent-widget-footer-save-button') as Element);
		await waitFor(() => {
			expect(context.snapshot.effectivePermissions.measurement).toBe(true);
		});
		expect(context.snapshot.optOut).not.toBeNull();
		expect(context.snapshot.effectivePermissions.marketing).toBe(false);

		// Turning marketing on and saving opens the two-step confirmation; confirming lifts the device opt-out.
		await fireEvent.click(marketing as Element);
		await waitFor(() => {
			expect(marketing?.getAttribute('aria-checked')).toBe('true');
		});
		await fireEvent.click(part('consent-widget-footer-save-button') as Element);
		await waitFor(() => {
			expect(part('opt-in-confirmation-root')).not.toBeNull();
		});
		expect(context.snapshot.optOut).not.toBeNull();
		await fireEvent.click(
			part('opt-in-confirmation-confirm-button') as Element
		);
		await waitFor(() => {
			expect(context.snapshot.optOut).toBeNull();
		});
		expect(context.snapshot.effectivePermissions.marketing).toBe(true);
		expect(part('consent-widget-opt-out-status')).toBeNull();
		view.unmount();
	});

	test('locks opted-out categories under active GPC and blocks pointer, keyboard, save and accept-all', async () => {
		const fixture = policyFixture(
			{ functionality: false, marketing: true, measurement: true },
			OPT_OUT_RULE
		);
		const now = fixture.now ?? Date.now();
		let context!: ConsentContextValue;
		const view = render(WidgetFixture, {
			capture: (value) => {
				context = value;
				activeContext = value;
			},
			options: {
				consentCategories: [...CATEGORIES],
				mode: testOffline([OPT_OUT_RULE]),
				overrides: { gpc: true },
				persistence: false,
				prefetch: {
					...fixture,
					initialOverrides: { gpc: true },
					initialPrivacySignals: { gpc: true },
					initialRecords: {
						...fixture.initialRecords,
						optOut: {
							heldBy: 'device',
							method: 'gpc',
							recordedAt: now - 1000,
							rights: ['sale', 'share'],
						},
					},
					now,
				},
			},
		});

		const status = await waitFor(() => {
			const element = part('consent-widget-opt-out-status');
			expect(element).not.toBeNull();
			return element as HTMLElement;
		});
		expect(status.getAttribute('role')).toBe('status');
		expect(status.textContent?.trim()).toBe(
			'Opt-out preference signal honored'
		);
		expect(context.state.optOutState.lock).toBe('gpc-active');

		await Promise.all(
			(['marketing', 'measurement'] as const).map(async (category) => {
				const sw = part<HTMLButtonElement>(`consent-widget-switch-${category}`);
				const notice = part(`consent-widget-restriction-${category}`);
				expect(sw?.disabled).toBe(true);
				expect(sw?.getAttribute('aria-checked')).toBe('false');
				expect(sw?.getAttribute('aria-describedby')).toBe(notice?.id);
				expect(notice?.textContent).toContain('Global Privacy Control');

				await fireEvent.click(sw as Element);
				await fireEvent.keyDown(sw as Element, { key: ' ' });
				await fireEvent.keyDown(sw as Element, { key: 'Enter' });
				expect(sw?.getAttribute('aria-checked')).toBe('false');
			})
		);

		expect(part('consent-widget-restriction-functionality')).toBeNull();

		// Untouched save does not grant locked categories.
		await fireEvent.click(part('consent-widget-footer-save-button') as Element);
		await waitFor(() => {
			expect(context.snapshot.explicitChoice?.categories.marketing?.value).toBe(
				false
			);
		});
		expect(context.snapshot.effectivePermissions.marketing).toBe(false);
		expect(context.snapshot.effectivePermissions.measurement).toBe(false);

		// Accept all grants unlocked categories without granting locked ones.
		await fireEvent.click(
			part('consent-widget-footer-accept-all-button') as Element
		);
		await waitFor(() => {
			expect(context.snapshot.effectivePermissions.functionality).toBe(true);
		});
		expect(context.snapshot.effectivePermissions.marketing).toBe(false);
		expect(context.snapshot.effectivePermissions.measurement).toBe(false);
		expect(
			context.snapshot.explicitChoice?.categories.marketing?.value
		).not.toBe(true);
		expect(
			context.snapshot.explicitChoice?.categories.measurement?.value
		).not.toBe(true);
		view.unmount();
	});

	test('shows account lock reason while keeping switches usable under an account-held opt-out', async () => {
		const fixture = policyFixture(undefined, OPT_OUT_RULE);
		const now = fixture.now ?? Date.now();
		let context!: ConsentContextValue;
		const view = render(WidgetFixture, {
			capture: (value) => {
				context = value;
				activeContext = value;
			},
			options: {
				consentCategories: [...CATEGORIES],
				mode: testOffline([OPT_OUT_RULE]),
				persistence: false,
				prefetch: {
					...fixture,
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
			},
		});

		const status = await waitFor(() => {
			const element = part('consent-widget-opt-out-status');
			expect(element).not.toBeNull();
			return element as HTMLElement;
		});
		expect(status.textContent?.trim()).toBe('Opt-out request honored');
		expect(context.state.optOutState.lock).toBe('held-by-account');

		const marketing = part<HTMLButtonElement>(
			'consent-widget-switch-marketing'
		);
		const notice = part('consent-widget-restriction-marketing');
		expect(marketing?.disabled).toBe(false);
		expect(marketing?.getAttribute('aria-checked')).toBe('false');
		expect(marketing?.getAttribute('aria-describedby')).toBe(notice?.id);
		expect(notice?.textContent).toContain('account');
		expect(part('consent-widget-restriction-measurement')).toBeNull();

		await fireEvent.click(marketing as Element);
		await waitFor(() => {
			expect(marketing?.getAttribute('aria-checked')).toBe('true');
		});
		await fireEvent.click(part('consent-widget-footer-save-button') as Element);
		await waitFor(() => {
			expect(part('opt-in-confirmation-root')).not.toBeNull();
		});
		await fireEvent.click(
			part('opt-in-confirmation-confirm-button') as Element
		);
		await waitFor(() => {
			expect(part('opt-in-confirmation-root')).toBeNull();
		});
		expect(context.snapshot.optOut?.heldBy).toBe('person');
		expect(context.snapshot.effectivePermissions.marketing).toBe(false);
		view.unmount();
	});
});

describe('sale-and-sharing block in Svelte dialog and widget', () => {
	beforeEach(() => {
		window.localStorage.clear();
	});

	test('renders before the category list outside accordion items, opts out in one click, and shows the receipt on reopen', async () => {
		const fixture = policyFixture(undefined, OPT_OUT_RULE);
		let context!: ConsentContextValue;
		const view = render(OptOutConfirmationFixture, {
			capture: (value) => {
				context = value;
				activeContext = value;
			},
			options: {
				consentCategories: [...CATEGORIES],
				disableAnimation: true,
				mode: testOffline([OPT_OUT_RULE]),
				overrides: { country: 'US', gpc: false, region: 'CA' },
				persistence: false,
				prefetch: fixture,
				presentation: { optOutLink: 'privacy-choices' },
				reloadOnConsentRevoked: false,
			},
			showBanner: false,
			showDialog: true,
		});

		context.kernel.set.activeUI('dialog');
		await waitFor(() => {
			expect(part('consent-widget-opt-out')).not.toBeNull();
		});

		const block = part('consent-widget-opt-out') as HTMLElement;
		const accordion = part('consent-widget-accordion') as HTMLElement;
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

		await fireEvent.click(part('consent-widget-opt-out-button') as Element);
		await waitFor(() => {
			expect(context.kernel.getSnapshot().optOut).not.toBeNull();
		});
		expect(context.kernel.getSnapshot().effectivePermissions.marketing).toBe(
			false
		);
		expect(context.kernel.getSnapshot().activeUI).not.toBe('dialog');

		// Reopen the dialog and confirm the block now shows the status, time and reference without an opt-out button.
		closeOptOutConfirmation(context.kernel);
		context.kernel.set.activeUI('dialog');
		await waitFor(() => {
			expect(part('consent-widget-opt-out-status')).not.toBeNull();
		});

		const reopenedBlock = part('consent-widget-opt-out') as HTMLElement;
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

		view.unmount();
	});

	test('keeps the heading neutral before backend confirmation and names confirmed rights once answered', async () => {
		const deferred = createDeferredOptOutMode();
		const fixture = policyFixture(undefined, OPT_OUT_RULE);
		let context!: ConsentContextValue;
		const view = render(WidgetFixture, {
			capture: (value) => {
				context = value;
				activeContext = value;
			},
			options: {
				consentCategories: [...CATEGORIES],
				mode: deferred.mode,
				overrides: { country: 'US', gpc: false, region: 'CA' },
				persistence: false,
				prefetch: fixture,
				presentation: { optOutLink: 'privacy-choices' },
				reloadOnConsentRevoked: false,
			},
		});

		await waitFor(() => {
			expect(part('consent-widget-opt-out-button')).not.toBeNull();
		});
		await fireEvent.click(part('consent-widget-opt-out-button') as Element);
		await waitFor(() => {
			expect(context.kernel.getSnapshot().optOut).not.toBeNull();
		});
		await waitFor(() => {
			expect(part('consent-widget-opt-out-status')).not.toBeNull();
		});

		// Local fallback holds all three rights, unconfirmed: heading stays neutral.
		expect(
			part('consent-widget-opt-out-heading')?.textContent?.toLowerCase()
		).not.toMatch(/sale|sharing|targeted/u);

		await waitFor(() => {
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

		await waitFor(() => {
			const text =
				part('consent-widget-opt-out-heading')?.textContent?.toLowerCase() ??
				'';
			expect(text).toContain('sale');
			expect(text).toContain('sharing');
		});
		expect(
			part('consent-widget-opt-out-heading')?.textContent?.toLowerCase()
		).not.toContain('targeted');

		view.unmount();
	});

	test('shows the signal status inside the block when GPC is active under a policy that maps it', async () => {
		const fixture = policyFixture(undefined, OPT_OUT_RULE);
		const now = fixture.now ?? Date.now();
		const view = render(OptOutConfirmationFixture, {
			capture: (value) => {
				activeContext = value;
			},
			dialogOpen: true,
			options: {
				consentCategories: [...CATEGORIES],
				disableAnimation: true,
				mode: testOffline([OPT_OUT_RULE]),
				overrides: { country: 'US', gpc: true, region: 'CA' },
				persistence: false,
				prefetch: {
					...fixture,
					initialOverrides: { gpc: true },
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
			},
			showBanner: false,
			showDialog: true,
		});

		await waitFor(() => {
			expect(part('consent-widget-opt-out')).not.toBeNull();
		});
		const block = part('consent-widget-opt-out') as HTMLElement;
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

		view.unmount();
	});

	test('omits the block under an opt-in policy and keeps the existing dialog structure', async () => {
		const fixture = policyFixture(undefined, OPT_IN_RULE);
		const view = render(OptOutConfirmationFixture, {
			capture: (value) => {
				activeContext = value;
			},
			dialogOpen: true,
			options: {
				consentCategories: [...CATEGORIES],
				disableAnimation: true,
				mode: testOffline([OPT_IN_RULE]),
				persistence: false,
				prefetch: fixture,
			},
			showBanner: false,
			showDialog: true,
		});

		await waitFor(() => {
			expect(part('consent-widget-accordion')).not.toBeNull();
		});
		expect(part('consent-widget-opt-out')).toBeNull();
		expect(part('consent-widget-opt-out-status')).toBeNull();
		expect(part('consent-dialog-title')).not.toBeNull();
		expect(part('consent-dialog-description')).not.toBeNull();
		expect(part('consent-widget-accordion-item-necessary')).not.toBeNull();
		expect(part('consent-widget-footer')).not.toBeNull();

		view.unmount();
	});
});
