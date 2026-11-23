import type {
	ConsentKernel,
	LiftOptOutPayload,
	LiftOptOutTransportResult,
	ProviderTransportFactory,
} from '@inth/sdk/engine';
import { OPT_OUT_REPROMPT_WAIT_MS } from '@inth/sdk/engine';
import { useContext, useEffect } from 'react';
import { describe, expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { page } from 'vitest/browser';

import { ComponentFixtureProvider as InthProvider } from '~/__tests__/component-fixture-provider';
import { policyFixture } from '~/__tests__/policy-fixture';
import { ConsentDialog } from '~/aggregate-components';
import { ConsentWidget } from '~/components/preferences';
import { ConsentBanner } from '~/components/prompt';
import { KernelContext } from '~/context';

import { testing } from '../../../testing';

const CATEGORIES = ['functionality', 'marketing', 'measurement'] as const;

const CHOICE_OPT_OUT_RULE = {
	categories: [...CATEGORIES],
	id: 'us-opt-out-choice',
	model: 'opt-out' as const,
	privacySignals: { gpc: { denyCategories: ['marketing', 'measurement'] } },
	prompt: 'choice' as const,
	rights: ['disclosure', 'preferences', 'opt-out'] as const,
};

const NOTICE_OPT_OUT_RULE = {
	categories: [...CATEGORIES],
	id: 'us-opt-out-notice',
	model: 'opt-out' as const,
	privacySignals: { gpc: { denyCategories: ['marketing', 'measurement'] } },
	prompt: 'notice' as const,
	rights: ['disclosure', 'preferences', 'opt-out'] as const,
	validity: { noticeDays: 1 },
};

const OPT_IN_RULE = {
	categories: [...CATEGORIES],
	id: 'eu-opt-in',
	model: 'opt-in' as const,
	prompt: 'choice' as const,
	rights: ['disclosure', 'preferences'] as const,
};

let kernel: ConsentKernel;
const Capture = () => {
	const value = useContext(KernelContext);
	useEffect(() => {
		if (value) {
			kernel = value;
		}
	}, [value]);
	return null;
};

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
	} = {}
) {
	const rule = params.rule ?? NOTICE_OPT_OUT_RULE;
	const fixture = policyFixture(undefined, rule);
	const now = fixture.now ?? Date.now();
	const gpc = params.gpc ?? false;
	const result = await render(
		<InthProvider
			options={{
				consentCategories: [...CATEGORIES],
				mode: params.mode ?? testing({ policy: [rule] }),
				overrides: { country: 'US', gpc, region: 'CA' },
				persistence: false,
				prefetch: {
					...fixture,
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
			}}
		>
			<Capture />
			<ConsentBanner disableAnimation />
			<ConsentWidget disableAnimation />
		</InthProvider>
	);
	await vi.waitFor(() => {
		expect(kernel.getSnapshot().optOut).not.toBeNull();
	});
	return result;
};

describe('never ask an opted-out visitor to opt back in automatically (React)', () => {
	test('3a: opt-out policy with choice prompt does not reopen the banner on the next load after a one-click opt-out', async () => {
		const { unmount } = await renderOptOutDialog({
			rule: CHOICE_OPT_OUT_RULE,
		});

		expect(kernel.getSnapshot().explicitChoice).toBeNull();
		expect(kernel.getSnapshot().promptRequirement).toEqual({ kind: 'none' });
		expect(kernel.getSnapshot().activeUI).toBe('none');
		expect(
			document.querySelector('[data-testid="consent-banner-root"]')
		).toBeNull();

		unmount();
	});

	test('3b: opt-out notice returning after expiry or fingerprint change offers no granting action before optInPromptAllowedAt', async () => {
		const fixture = policyFixture(undefined, NOTICE_OPT_OUT_RULE);
		const now = fixture.now ?? Date.now();
		const recordedAt = now - Math.floor(OPT_OUT_REPROMPT_WAIT_MS / 2);
		const { unmount } = await render(
			<InthProvider
				options={{
					consentCategories: [...CATEGORIES],
					mode: testing({ policy: [NOTICE_OPT_OUT_RULE] }),
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
				}}
			>
				<Capture />
				<ConsentBanner disableAnimation />
				<ConsentDialog disableAnimation />
			</InthProvider>
		);

		await expect.element(page.getByTestId('consent-banner-root')).toBeVisible();
		expect(kernel.getSnapshot().promptRequirement.kind).toBe('notice');
		expect(
			document.querySelector('[data-testid="consent-banner-accept-button"]')
		).toBeNull();
		expect(
			document.querySelector('[data-testid="consent-banner-dismiss-button"]')
		).not.toBeNull();

		unmount();
	});

	test('3c: GPC opt-out persists after GPC turns off, keeps marketing off, shows opted-out block, and opens no prompt', async () => {
		const fixture = policyFixture(undefined, CHOICE_OPT_OUT_RULE);
		const now = fixture.now ?? Date.now();
		const { unmount } = await render(
			<InthProvider
				options={{
					consentCategories: [...CATEGORIES],
					mode: testing({ policy: [CHOICE_OPT_OUT_RULE] }),
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
				}}
			>
				<Capture />
				<ConsentBanner disableAnimation />
				<ConsentWidget disableAnimation />
			</InthProvider>
		);

		await vi.waitFor(() => {
			expect(kernel.getSnapshot().optOut?.method).toBe('gpc');
		});
		expect(kernel.getSnapshot().privacySignals.gpc.active).toBe(false);
		expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(false);
		expect(kernel.getSnapshot().activeUI).toBe('none');
		expect(
			document.querySelector('[data-testid="consent-banner-root"]')
		).toBeNull();

		await expect
			.element(page.getByTestId('consent-widget-opt-out-status'))
			.toBeVisible();
		expect(
			document.querySelector('[data-testid="consent-widget-opt-out-button"]')
		).toBeNull();

		unmount();
	});
});

describe('two-step opt-in confirmation (React)', () => {
	test('opt back in link requires separate confirmation, focuses cancel first, stays outside the widget, and lifts on confirm', async () => {
		const { unmount } = await renderOptOutDialog();
		await expect
			.element(page.getByTestId('consent-widget-opt-in-link'))
			.toBeVisible();

		await page.getByTestId('consent-widget-opt-in-link').click();

		// Step 1 alone keeps the opt-out held and opens a separate modal dialog.
		await expect
			.element(page.getByTestId('opt-in-confirmation-root'))
			.toBeVisible();
		expect(kernel.getSnapshot().optOut).not.toBeNull();
		expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(false);

		const confirmationRoot = document.querySelector(
			'[data-testid="opt-in-confirmation-root"]'
		) as HTMLElement;
		const widget = document.querySelector(
			'[data-testid="consent-widget-root"]'
		) as HTMLElement;
		expect(widget.contains(confirmationRoot)).toBe(false);
		expect(confirmationRoot.getAttribute('role')).toBe('dialog');
		expect(confirmationRoot.getAttribute('aria-modal')).toBe('true');

		// Unconfirmed rights stay neutral in the confirmation description.
		const description = document.querySelector(
			'[data-testid="opt-in-confirmation-description"]'
		);
		expect(description?.textContent?.toLowerCase()).not.toMatch(
			/sale|sharing|targeted/u
		);

		// Focus starts on the cancel button.
		const cancelButton = document.querySelector(
			'[data-testid="opt-in-confirmation-cancel-button"]'
		) as HTMLButtonElement;
		await vi.waitFor(() => {
			expect(document.activeElement).toBe(cancelButton);
		});

		// Step 2 confirms and lifts the opt-out.
		await page.getByTestId('opt-in-confirmation-confirm-button').click();
		await vi.waitFor(() => {
			expect(kernel.getSnapshot().optOut).toBeNull();
		});
		expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(true);
		expect(
			document.querySelector('[data-testid="opt-in-confirmation-root"]')
		).toBeNull();

		unmount();
	});

	test('opt-in confirmation description names confirmed rights once answered by the backend', async () => {
		const { unmount } = await renderOptOutDialog({ rightsConfirmed: true });
		await page.getByTestId('consent-widget-opt-in-link').click();
		await expect
			.element(page.getByTestId('opt-in-confirmation-root'))
			.toBeVisible();

		const text =
			document
				.querySelector('[data-testid="opt-in-confirmation-description"]')
				?.textContent?.toLowerCase() ?? '';
		expect(text).toContain('sale');
		expect(text).toContain('sharing');
		expect(text).not.toContain('targeted');

		await page.getByTestId('opt-in-confirmation-cancel-button').click();
		unmount();
	});

	test('opt back in link then cancel (button and Escape) leaves opt-out held and saves nothing', async () => {
		const { unmount } = await renderOptOutDialog();

		await page.getByTestId('consent-widget-opt-in-link').click();
		await expect
			.element(page.getByTestId('opt-in-confirmation-root'))
			.toBeVisible();

		await page.getByTestId('opt-in-confirmation-cancel-button').click();
		await vi.waitFor(() => {
			expect(
				document.querySelector('[data-testid="opt-in-confirmation-root"]')
			).toBeNull();
		});
		expect(kernel.getSnapshot().optOut).not.toBeNull();
		expect(kernel.getSnapshot().explicitChoice).toBeNull();

		// Open again and cancel with Escape.
		await page.getByTestId('consent-widget-opt-in-link').click();
		await expect
			.element(page.getByTestId('opt-in-confirmation-root'))
			.toBeVisible();
		document.dispatchEvent(
			new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' })
		);
		await vi.waitFor(() => {
			expect(
				document.querySelector('[data-testid="opt-in-confirmation-root"]')
			).toBeNull();
		});
		expect(kernel.getSnapshot().optOut).not.toBeNull();
		expect(kernel.getSnapshot().explicitChoice).toBeNull();

		unmount();
	});

	test('Accept All in the widget defers save until confirmed, then lifts opt-out and grants categories', async () => {
		const { unmount } = await renderOptOutDialog();
		await expect
			.element(page.getByTestId('consent-widget-footer-accept-all-button'))
			.toBeVisible();

		await page.getByTestId('consent-widget-footer-accept-all-button').click();
		await expect
			.element(page.getByTestId('opt-in-confirmation-root'))
			.toBeVisible();
		expect(kernel.getSnapshot().optOut).not.toBeNull();
		expect(kernel.getSnapshot().explicitChoice).toBeNull();

		await page.getByTestId('opt-in-confirmation-confirm-button').click();
		await vi.waitFor(() => {
			expect(kernel.getSnapshot().optOut).toBeNull();
		});
		expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(true);
		expect(kernel.getSnapshot().effectivePermissions.measurement).toBe(true);
		expect(
			kernel.getSnapshot().explicitChoice?.categories.marketing?.value
		).toBe(true);

		unmount();
	});

	test('Accept All in a banner never lifts a held opt-out and asks nothing', async () => {
		const { unmount } = await renderOptOutDialog({
			rule: CHOICE_OPT_OUT_RULE,
		});
		kernel.set.activeUI('banner');
		await expect
			.element(page.getByTestId('consent-banner-accept-button'))
			.toBeVisible();

		await page.getByTestId('consent-banner-accept-button').click();
		// A banner commit keeps sale and sharing off (PERM-02); lifting the
		// opt-out takes the dialog's or the widget's own confirmation.
		await vi.waitFor(() => {
			expect(kernel.getSnapshot().activeUI).toBe('none');
		});
		expect(
			document.querySelector('[data-testid="opt-in-confirmation-root"]')
		).toBeNull();
		expect(kernel.getSnapshot().optOut).not.toBeNull();
		expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(false);

		unmount();
	});

	test('turning Marketing on then Save opens confirmation and cancelling leaves opt-out held', async () => {
		const { unmount } = await renderOptOutDialog();
		const marketing = page.getByTestId('consent-widget-switch-marketing');
		await expect.element(marketing).toHaveAttribute('aria-checked', 'false');

		await marketing.click();
		await expect.element(marketing).toHaveAttribute('aria-checked', 'true');
		await page.getByTestId('consent-widget-footer-save-button').click();

		await expect
			.element(page.getByTestId('opt-in-confirmation-root'))
			.toBeVisible();
		expect(kernel.getSnapshot().optOut).not.toBeNull();
		expect(kernel.getSnapshot().explicitChoice).toBeNull();

		await page.getByTestId('opt-in-confirmation-cancel-button').click();
		await vi.waitFor(() => {
			expect(
				document.querySelector('[data-testid="opt-in-confirmation-root"]')
			).toBeNull();
		});
		expect(kernel.getSnapshot().optOut).not.toBeNull();
		expect(kernel.getSnapshot().explicitChoice).toBeNull();
		expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(false);

		unmount();
	});

	test('saving without granting the deciding category completes with no confirmation', async () => {
		const { unmount } = await renderOptOutDialog();
		const measurement = page.getByTestId('consent-widget-switch-measurement');

		await measurement.click();
		await page.getByTestId('consent-widget-footer-save-button').click();

		await vi.waitFor(() => {
			expect(kernel.getSnapshot().effectivePermissions.measurement).toBe(true);
		});
		expect(
			document.querySelector('[data-testid="opt-in-confirmation-root"]')
		).toBeNull();
		expect(kernel.getSnapshot().optOut).not.toBeNull();
		expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(false);

		unmount();
	});

	test('with active GPC signal there is no opt back in link', async () => {
		const { unmount } = await renderOptOutDialog({ gpc: true });
		await expect
			.element(page.getByTestId('consent-widget-opt-out-status'))
			.toBeVisible();
		expect(
			document.querySelector('[data-testid="consent-widget-opt-in-link"]')
		).toBeNull();

		unmount();
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
		const { unmount } = await renderOptOutDialog({
			heldBy: 'person',
			mode: refusingMode,
		});

		await expect
			.element(page.getByTestId('consent-widget-opt-in-link'))
			.toBeVisible();
		await page.getByTestId('consent-widget-opt-in-link').click();
		await expect
			.element(page.getByTestId('opt-in-confirmation-root'))
			.toBeVisible();
		expect(liftCalls).toHaveLength(0);

		await page.getByTestId('opt-in-confirmation-confirm-button').click();
		await vi.waitFor(() => {
			expect(liftCalls).toHaveLength(1);
		});
		expect(kernel.getSnapshot().optOut?.heldBy).toBe('person');
		expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(false);

		unmount();
	});

	test('under an opt-in policy with an opt-out held, Accept lifts in one step without confirmation', async () => {
		const { unmount } = await renderOptOutDialog({ rule: OPT_IN_RULE });
		await expect
			.element(page.getByTestId('consent-widget-footer-accept-all-button'))
			.toBeVisible();

		await page.getByTestId('consent-widget-footer-accept-all-button').click();
		await vi.waitFor(() => {
			expect(kernel.getSnapshot().optOut).toBeNull();
		});
		expect(
			document.querySelector('[data-testid="opt-in-confirmation-root"]')
		).toBeNull();
		expect(kernel.getSnapshot().effectivePermissions.marketing).toBe(true);

		unmount();
	});
});
