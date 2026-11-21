import type {
	LiftOptOutPayload,
	LiftOptOutTransportResult,
	ProviderTransportFactory,
} from '@inth/sdk/engine';
import { OPT_OUT_REPROMPT_WAIT_MS } from '@inth/sdk/engine';
import {
	closeOptInConfirmation,
	closeOptOutConfirmation,
} from '@inth/sdk/surface-actions';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, test } from 'vitest';

import OptOutConfirmationFixture from '../../__tests__/fixtures/opt-out-confirmation-fixture.svelte';
import { policyFixture } from '../../__tests__/policy-fixture';
import { testOffline } from '../../__tests__/test-offline';
import type { ConsentContextValue } from '../../lib/context.svelte';

const CATEGORIES = ['functionality', 'marketing', 'measurement'] as const;

const CHOICE_OPT_OUT_RULE = {
	categories: [...CATEGORIES],
	id: 'svelte-us-opt-out-choice',
	model: 'opt-out' as const,
	privacySignals: { gpc: { denyCategories: ['marketing', 'measurement'] } },
	prompt: 'choice' as const,
	rights: ['disclosure', 'preferences', 'opt-out'] as const,
};

const NOTICE_OPT_OUT_RULE = {
	categories: [...CATEGORIES],
	id: 'svelte-us-opt-out-notice',
	model: 'opt-out' as const,
	privacySignals: { gpc: { denyCategories: ['marketing', 'measurement'] } },
	prompt: 'notice' as const,
	rights: ['disclosure', 'preferences', 'opt-out'] as const,
	validity: { noticeDays: 1 },
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

afterEach(() => {
	if (activeContext) {
		closeOptInConfirmation(activeContext.kernel);
		closeOptOutConfirmation(activeContext.kernel);
		activeContext = null;
	}
	window.localStorage.clear();
});

const renderOptOutDialog = async function renderOptOutDialog(
	params: {
		gpc?: boolean;
		heldBy?: 'device' | 'person';
		mode?: ProviderTransportFactory;
		rightsConfirmed?: boolean;
		rule?:
			| typeof CHOICE_OPT_OUT_RULE
			| typeof NOTICE_OPT_OUT_RULE
			| typeof OPT_IN_RULE;
		standaloneWidget?: boolean;
	} = {}
) {
	const rule = params.rule ?? NOTICE_OPT_OUT_RULE;
	const fixture = policyFixture(undefined, rule);
	const now = fixture.now ?? Date.now();
	const gpc = params.gpc ?? false;
	const standalone = params.standaloneWidget ?? false;
	let context!: ConsentContextValue;
	const view = render(OptOutConfirmationFixture, {
		capture: (value) => {
			context = value;
			activeContext = value;
		},
		options: {
			consentCategories: [...CATEGORIES],
			disableAnimation: true,
			mode: params.mode ?? testOffline([rule]),
			overrides: { country: 'US', gpc, region: 'CA' },
			persistence: false,
			prefetch: {
				...fixture,
				initialOverrides: { gpc },
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
		},
		showBanner: true,
		showDialog: !standalone,
		showWidget: standalone,
	});
	await waitFor(() => {
		expect(context.kernel.getSnapshot().optOut).not.toBeNull();
	});
	return { context, view };
};

describe('never ask an opted-out visitor to opt back in automatically (Svelte)', () => {
	test('3a: opt-out policy with choice prompt does not reopen the banner on the next load after a one-click opt-out', async () => {
		const { context, view } = await renderOptOutDialog({
			rule: CHOICE_OPT_OUT_RULE,
		});

		expect(context.kernel.getSnapshot().explicitChoice).toBeNull();
		expect(context.kernel.getSnapshot().promptRequirement).toEqual({
			kind: 'none',
		});
		expect(context.kernel.getSnapshot().activeUI).toBe('none');
		expect(part('consent-banner-root')).toBeNull();

		view.unmount();
	});

	test('3b: opt-out notice returning after expiry or fingerprint change offers no granting action before optInPromptAllowedAt', async () => {
		const fixture = policyFixture(undefined, NOTICE_OPT_OUT_RULE);
		const now = fixture.now ?? Date.now();
		const recordedAt = now - Math.floor(OPT_OUT_REPROMPT_WAIT_MS / 2);
		let context!: ConsentContextValue;
		const view = render(OptOutConfirmationFixture, {
			capture: (value) => {
				context = value;
				activeContext = value;
			},
			options: {
				consentCategories: [...CATEGORIES],
				disableAnimation: true,
				mode: testOffline([NOTICE_OPT_OUT_RULE]),
				overrides: { country: 'US', gpc: false, region: 'CA' },
				persistence: false,
				prefetch: {
					...fixture,
					initialRecords: {
						noticeDismissal: {
							dismissedAt: now - 120_000,
							fingerprint: 'stale-notice-fingerprint',
							version: 1,
						},
						optOut: {
							heldBy: 'device',
							method: 'button',
							recordedAt,
							rights: ['sale', 'share'],
						},
					},
					now,
				},
			},
			showBanner: true,
			showDialog: true,
		});

		await waitFor(() => {
			expect(part('consent-banner-root')).not.toBeNull();
		});
		expect(context.kernel.getSnapshot().promptRequirement.kind).toBe('notice');
		expect(part('consent-banner-accept-button')).toBeNull();
		expect(part('consent-banner-dismiss-button')).not.toBeNull();

		view.unmount();
	});

	test('3c: GPC opt-out persists after GPC turns off, keeps marketing off, shows opted-out block, and opens no prompt', async () => {
		const fixture = policyFixture(undefined, CHOICE_OPT_OUT_RULE);
		const now = fixture.now ?? Date.now();
		let context!: ConsentContextValue;
		const view = render(OptOutConfirmationFixture, {
			capture: (value) => {
				context = value;
				activeContext = value;
			},
			options: {
				consentCategories: [...CATEGORIES],
				disableAnimation: true,
				mode: testOffline([CHOICE_OPT_OUT_RULE]),
				overrides: { country: 'US', gpc: false, region: 'CA' },
				persistence: false,
				prefetch: {
					...fixture,
					initialPrivacySignals: { gpc: false },
					initialRecords: {
						optOut: {
							heldBy: 'device',
							method: 'gpc',
							recordedAt: now - 5000,
							rights: ['sale', 'share'],
						},
					},
					now,
				},
			},
			showBanner: true,
			showDialog: true,
		});

		await waitFor(() => {
			expect(context.kernel.getSnapshot().optOut?.method).toBe('gpc');
		});
		expect(context.kernel.getSnapshot().privacySignals.gpc.active).toBe(false);
		expect(context.kernel.getSnapshot().effectivePermissions.marketing).toBe(
			false
		);
		expect(context.kernel.getSnapshot().activeUI).toBe('none');
		expect(part('consent-banner-root')).toBeNull();

		context.kernel.set.activeUI('dialog');
		await waitFor(() => {
			expect(part('consent-widget-opt-out-status')).not.toBeNull();
		});
		expect(part('consent-widget-opt-out-button')).toBeNull();

		view.unmount();
	});
});

describe('two-step opt-in confirmation (Svelte)', () => {
	test('opt back in link requires separate confirmation, focuses cancel first, stays outside dialog content, and lifts on confirm', async () => {
		const { context, view } = await renderOptOutDialog();
		context.kernel.set.activeUI('dialog');
		await waitFor(() => {
			expect(part('consent-widget-opt-in-link')).not.toBeNull();
		});

		await fireEvent.click(part('consent-widget-opt-in-link') as Element);

		// Step 1 alone keeps the opt-out held and opens a separate modal dialog.
		await waitFor(() => {
			expect(part('opt-in-confirmation-root')).not.toBeNull();
		});
		expect(context.kernel.getSnapshot().optOut).not.toBeNull();
		expect(context.kernel.getSnapshot().effectivePermissions.marketing).toBe(
			false
		);

		const confirmationRoot = part('opt-in-confirmation-root') as HTMLElement;
		const dialogContent = part('consent-dialog-content') as HTMLElement;
		expect(dialogContent.contains(confirmationRoot)).toBe(false);
		expect(confirmationRoot.getAttribute('role')).toBe('dialog');
		expect(confirmationRoot.getAttribute('aria-modal')).toBe('true');

		// Unconfirmed rights stay neutral in the confirmation description.
		const description = part('opt-in-confirmation-description');
		expect(description?.textContent?.toLowerCase()).not.toMatch(
			/sale|sharing|targeted/u
		);

		// Focus starts on the cancel button.
		const cancelButton = part<HTMLButtonElement>(
			'opt-in-confirmation-cancel-button'
		) as HTMLButtonElement;
		await waitFor(() => {
			expect(document.activeElement).toBe(cancelButton);
		});

		// Step 2 confirms and lifts the opt-out.
		await fireEvent.click(
			part('opt-in-confirmation-confirm-button') as Element
		);
		await waitFor(() => {
			expect(context.kernel.getSnapshot().optOut).toBeNull();
		});
		expect(context.kernel.getSnapshot().effectivePermissions.marketing).toBe(
			true
		);
		expect(part('opt-in-confirmation-root')).toBeNull();

		view.unmount();
	});

	test('opt-in confirmation description names confirmed rights once answered by the backend', async () => {
		const { context, view } = await renderOptOutDialog({
			rightsConfirmed: true,
		});
		context.kernel.set.activeUI('dialog');
		await waitFor(() => {
			expect(part('consent-widget-opt-in-link')).not.toBeNull();
		});
		await fireEvent.click(part('consent-widget-opt-in-link') as Element);
		await waitFor(() => {
			expect(part('opt-in-confirmation-root')).not.toBeNull();
		});

		const text =
			part('opt-in-confirmation-description')?.textContent?.toLowerCase() ?? '';
		expect(text).toContain('sale');
		expect(text).toContain('sharing');
		expect(text).not.toContain('targeted');

		await fireEvent.click(part('opt-in-confirmation-cancel-button') as Element);
		view.unmount();
	});

	test('opt back in link then cancel (button and Escape) leaves opt-out held, saves nothing, and keeps dialog open', async () => {
		const { context, view } = await renderOptOutDialog();
		context.kernel.set.activeUI('dialog');
		await waitFor(() => {
			expect(part('consent-widget-opt-in-link')).not.toBeNull();
		});

		await fireEvent.click(part('consent-widget-opt-in-link') as Element);
		await waitFor(() => {
			expect(part('opt-in-confirmation-root')).not.toBeNull();
		});

		await fireEvent.click(part('opt-in-confirmation-cancel-button') as Element);
		await waitFor(() => {
			expect(part('opt-in-confirmation-root')).toBeNull();
		});
		expect(context.kernel.getSnapshot().optOut).not.toBeNull();
		expect(context.kernel.getSnapshot().explicitChoice).toBeNull();
		expect(context.kernel.getSnapshot().activeUI).toBe('dialog');

		// Open again and cancel with Escape.
		await fireEvent.click(part('consent-widget-opt-in-link') as Element);
		await waitFor(() => {
			expect(part('opt-in-confirmation-root')).not.toBeNull();
		});
		await fireEvent.keyDown(document, { key: 'Escape' });
		await waitFor(() => {
			expect(part('opt-in-confirmation-root')).toBeNull();
		});
		expect(context.kernel.getSnapshot().optOut).not.toBeNull();
		expect(context.kernel.getSnapshot().explicitChoice).toBeNull();
		expect(context.kernel.getSnapshot().activeUI).toBe('dialog');

		view.unmount();
	});

	test('Accept All in the dialog defers save until confirmed, then lifts opt-out and grants categories', async () => {
		const { context, view } = await renderOptOutDialog();
		context.kernel.set.activeUI('dialog');
		await waitFor(() => {
			expect(part('consent-widget-footer-accept-all-button')).not.toBeNull();
		});

		await fireEvent.click(
			part('consent-widget-footer-accept-all-button') as Element
		);
		await waitFor(() => {
			expect(part('opt-in-confirmation-root')).not.toBeNull();
		});
		expect(context.kernel.getSnapshot().optOut).not.toBeNull();
		expect(context.kernel.getSnapshot().explicitChoice).toBeNull();
		expect(context.kernel.getSnapshot().activeUI).toBe('dialog');

		await fireEvent.click(
			part('opt-in-confirmation-confirm-button') as Element
		);
		await waitFor(() => {
			expect(context.kernel.getSnapshot().optOut).toBeNull();
		});
		expect(context.kernel.getSnapshot().effectivePermissions.marketing).toBe(
			true
		);
		expect(context.kernel.getSnapshot().effectivePermissions.measurement).toBe(
			true
		);
		expect(
			context.kernel.getSnapshot().explicitChoice?.categories.marketing?.value
		).toBe(true);
		expect(context.kernel.getSnapshot().activeUI).not.toBe('dialog');

		view.unmount();
	});

	test('Accept All in a banner defers save until confirmed, then lifts opt-out and grants categories', async () => {
		const { context, view } = await renderOptOutDialog({
			rule: CHOICE_OPT_OUT_RULE,
		});
		context.kernel.set.activeUI('banner');
		await waitFor(() => {
			expect(part('consent-banner-accept-button')).not.toBeNull();
		});

		await fireEvent.click(part('consent-banner-accept-button') as Element);
		await waitFor(() => {
			expect(part('opt-in-confirmation-root')).not.toBeNull();
		});
		expect(context.kernel.getSnapshot().optOut).not.toBeNull();
		expect(context.kernel.getSnapshot().explicitChoice).toBeNull();

		await fireEvent.click(
			part('opt-in-confirmation-confirm-button') as Element
		);
		await waitFor(() => {
			expect(context.kernel.getSnapshot().optOut).toBeNull();
		});
		expect(context.kernel.getSnapshot().effectivePermissions.marketing).toBe(
			true
		);

		view.unmount();
	});

	test('turning Marketing on then Save opens confirmation and cancelling leaves opt-out held', async () => {
		const { context, view } = await renderOptOutDialog({
			standaloneWidget: true,
		});
		const marketing = await waitFor(() => {
			const el = part<HTMLButtonElement>('consent-widget-switch-marketing');
			expect(el).not.toBeNull();
			return el as HTMLButtonElement;
		});
		expect(marketing.getAttribute('aria-checked')).toBe('false');

		await fireEvent.click(marketing);
		await waitFor(() => {
			expect(marketing.getAttribute('aria-checked')).toBe('true');
		});
		await fireEvent.click(part('consent-widget-footer-save-button') as Element);

		await waitFor(() => {
			expect(part('opt-in-confirmation-root')).not.toBeNull();
		});
		expect(context.kernel.getSnapshot().optOut).not.toBeNull();
		expect(context.kernel.getSnapshot().explicitChoice).toBeNull();

		await fireEvent.click(part('opt-in-confirmation-cancel-button') as Element);
		await waitFor(() => {
			expect(part('opt-in-confirmation-root')).toBeNull();
		});
		expect(context.kernel.getSnapshot().optOut).not.toBeNull();
		expect(context.kernel.getSnapshot().explicitChoice).toBeNull();
		expect(context.kernel.getSnapshot().effectivePermissions.marketing).toBe(
			false
		);

		view.unmount();
	});

	test('saving without granting the deciding category completes with no confirmation', async () => {
		const { context, view } = await renderOptOutDialog({
			standaloneWidget: true,
		});
		const measurement = await waitFor(() => {
			const el = part<HTMLButtonElement>('consent-widget-switch-measurement');
			expect(el).not.toBeNull();
			return el as HTMLButtonElement;
		});

		await fireEvent.click(measurement);
		await fireEvent.click(part('consent-widget-footer-save-button') as Element);

		await waitFor(() => {
			expect(
				context.kernel.getSnapshot().effectivePermissions.measurement
			).toBe(true);
		});
		expect(part('opt-in-confirmation-root')).toBeNull();
		expect(context.kernel.getSnapshot().optOut).not.toBeNull();
		expect(context.kernel.getSnapshot().effectivePermissions.marketing).toBe(
			false
		);

		view.unmount();
	});

	test('with active GPC signal there is no opt back in link', async () => {
		const { context, view } = await renderOptOutDialog({ gpc: true });
		context.kernel.set.activeUI('dialog');
		await waitFor(() => {
			expect(part('consent-widget-opt-out-status')).not.toBeNull();
		});
		expect(part('consent-widget-opt-in-link')).toBeNull();

		view.unmount();
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
		const { context, view } = await renderOptOutDialog({
			heldBy: 'person',
			mode: refusingMode,
		});
		context.kernel.set.activeUI('dialog');

		await waitFor(() => {
			expect(part('consent-widget-opt-in-link')).not.toBeNull();
		});
		await fireEvent.click(part('consent-widget-opt-in-link') as Element);
		await waitFor(() => {
			expect(part('opt-in-confirmation-root')).not.toBeNull();
		});
		expect(liftCalls).toHaveLength(0);

		await fireEvent.click(
			part('opt-in-confirmation-confirm-button') as Element
		);
		await waitFor(() => {
			expect(liftCalls).toHaveLength(1);
		});
		expect(context.kernel.getSnapshot().optOut?.heldBy).toBe('person');
		expect(context.kernel.getSnapshot().effectivePermissions.marketing).toBe(
			false
		);

		view.unmount();
	});

	test('under an opt-in policy with an opt-out held, Accept lifts in one step without confirmation', async () => {
		const { context, view } = await renderOptOutDialog({ rule: OPT_IN_RULE });
		context.kernel.set.activeUI('dialog');
		await waitFor(() => {
			expect(part('consent-widget-footer-accept-all-button')).not.toBeNull();
		});

		await fireEvent.click(
			part('consent-widget-footer-accept-all-button') as Element
		);
		await waitFor(() => {
			expect(context.kernel.getSnapshot().optOut).toBeNull();
		});
		expect(part('opt-in-confirmation-root')).toBeNull();
		expect(context.kernel.getSnapshot().effectivePermissions.marketing).toBe(
			true
		);

		view.unmount();
	});
});
