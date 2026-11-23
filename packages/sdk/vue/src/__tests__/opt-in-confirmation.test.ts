import type {
	HydrationRecords,
	LiftOptOutPayload,
	LiftOptOutTransportResult,
	ProviderTransportFactory,
} from '@inth/sdk/engine';
import { OPT_OUT_REPROMPT_WAIT_MS } from '@inth/sdk/engine';
import type { InitOutput, PolicyRule } from '@inth/sdk/schema/types';
import {
	resolvePolicyRules,
	writePolicyResolutionWire,
} from '@inth/sdk/schema/types';
import {
	closeOptInConfirmation,
	closeOptOutConfirmation,
} from '@inth/sdk/surface-actions';
import { translations as enTranslations } from '@inth/sdk/translations/en';
import { flushPromises, mount } from '@vue/test-utils';
import type { VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { defineComponent, h } from 'vue';

import ConsentWidget from '../runtime/components/preferences.vue';
import ConsentBanner from '../runtime/components/prompt/prompt.vue';
import { consentConfigKey } from '../runtime/composables/config';
import type { ConsentConfig } from '../runtime/config';
import {
	symbolActiveUI,
	symbolConsent,
	symbolInit,
	symbolKernel,
	symbolKernelContext,
	symbolSnapshot,
} from '../runtime/utils/consent-symbols.model';
import { createVueConsentKernelContext } from './test-kernel';
import type { VueConsentKernelContext } from './test-kernel';

const CATEGORIES = ['functionality', 'marketing', 'measurement'] as const;

const CHOICE_OPT_OUT_RULE: PolicyRule = {
	categories: [...CATEGORIES],
	id: 'vue-us-opt-out-choice',
	match: { fallback: true, isDefault: true },
	model: 'opt-out',
	privacySignals: { gpc: { denyCategories: ['marketing', 'measurement'] } },
	prompt: 'choice',
	rights: ['disclosure', 'preferences', 'opt-out'],
	scopeMode: 'permissive',
};

const NOTICE_OPT_OUT_RULE: PolicyRule = {
	categories: [...CATEGORIES],
	id: 'vue-us-opt-out-notice',
	match: { fallback: true, isDefault: true },
	model: 'opt-out',
	privacySignals: { gpc: { denyCategories: ['marketing', 'measurement'] } },
	prompt: 'notice',
	rights: ['disclosure', 'preferences', 'opt-out'],
	scopeMode: 'permissive',
	validity: { noticeDays: 1 },
};

const OPT_IN_RULE: PolicyRule = {
	categories: [...CATEGORIES],
	id: 'vue-eu-opt-in',
	match: { fallback: true, isDefault: true },
	model: 'opt-in',
	prompt: 'choice',
	rights: ['disclosure', 'preferences'],
	scopeMode: 'permissive',
};

const buildInit = (rule: PolicyRule): InitOutput =>
	({
		branding: 'inth',
		location: { countryCode: 'US', regionCode: 'CA' },
		policyResolution: writePolicyResolutionWire(
			resolvePolicyRules({
				countryCode: 'US',
				regionCode: 'CA',
				rules: [rule],
			})
		),
		translations: { language: 'en', translations: enTranslations },
	}) as InitOutput;

const part = <ElementType extends HTMLElement = HTMLElement>(testId: string) =>
	document.querySelector<ElementType>(`[data-testid="${testId}"]`);

const required = <ElementType extends HTMLElement = HTMLElement>(
	testId: string
): ElementType => {
	const element = part<ElementType>(testId);
	expect.assert(element, `${testId} is not rendered`);
	return element;
};

let mounted: { context: VueConsentKernelContext; wrapper: VueWrapper } | null =
	null;

afterEach(async () => {
	if (mounted) {
		closeOptInConfirmation(mounted.context.kernel);
		closeOptOutConfirmation(mounted.context.kernel);
	}
	mounted?.wrapper.unmount();
	mounted?.context.dispose();
	mounted = null;
	await flushPromises();
	document.body.innerHTML = '';
});

const mountOptOutSurface = async function mountOptOutSurface(
	params: {
		gpc?: boolean;
		heldBy?: 'device' | 'person';
		initialRecords?: HydrationRecords;
		mode?: ProviderTransportFactory;
		now?: number;
		rightsConfirmed?: boolean;
		rule?: PolicyRule;
	} = {}
) {
	const rule = params.rule ?? NOTICE_OPT_OUT_RULE;
	const now = params.now ?? Date.now();
	const gpc = params.gpc ?? false;
	const config = {
		consentCategories: [...CATEGORIES],
		customFetch: vi.fn(() => new Response('{}')) as unknown as typeof fetch,
		disableAnimation: true,
		hideBranding: true,
		projectUrl: 'https://consent.example',
		reloadOnConsentRevoked: false,
	} as ConsentConfig & { overrides?: { gpc: boolean } };
	if (gpc) {
		config.overrides = { gpc: true };
	}
	const initialRecords: HydrationRecords = params.initialRecords ?? {
		now,
		optOut: {
			heldBy: params.heldBy ?? 'device',
			method: gpc ? 'gpc' : 'button',
			recordedAt: now - 1000,
			rights: ['sale', 'share'],
		},
		optOutRightsConfirmed: params.rightsConfirmed ?? false,
	};
	const context = createVueConsentKernelContext({
		config,
		initialRecords,
		kernelConfig: {
			initialPrivacySignals: { gpc },
			now,
		},
		mode: params.mode,
		now,
		prefetch: buildInit(rule),
	});
	const Host = defineComponent({
		render: () => [
			h(ConsentBanner, { disableAnimation: true }),
			h(ConsentWidget),
		],
	});
	const wrapper = mount(Host, {
		attachTo: document.body,
		global: {
			provide: {
				[consentConfigKey as symbol]: config,
				[symbolKernelContext as symbol]: context,
				[symbolKernel as symbol]: context.kernel,
				[symbolSnapshot as symbol]: context.snapshot,
				[symbolInit as symbol]: context.init,
				[symbolActiveUI as symbol]: context.activeUI,
				[symbolConsent as symbol]: context.storedConsent,
			},
		},
	});
	mounted = { context, wrapper };
	await flushPromises();
	await vi.waitFor(() => {
		expect(context.kernel.getSnapshot().optOut).not.toBeNull();
	});
	return { context, wrapper };
};

describe('never ask an opted-out visitor to opt back in automatically (Vue)', () => {
	test('3a: opt-out policy with choice prompt does not reopen the banner on the next load after a one-click opt-out', async () => {
		const { context } = await mountOptOutSurface({
			rule: CHOICE_OPT_OUT_RULE,
		});

		expect(context.kernel.getSnapshot().explicitChoice).toBeNull();
		expect(context.kernel.getSnapshot().promptRequirement).toEqual({
			kind: 'none',
		});
		expect(context.kernel.getSnapshot().activeUI).toBe('none');
		expect(part('consent-banner-root')).toBeNull();
	});

	test('3b: opt-out notice returning after expiry or fingerprint change offers no granting action before optInPromptAllowedAt', async () => {
		const now = Date.now();
		const recordedAt = now - Math.floor(OPT_OUT_REPROMPT_WAIT_MS / 2);
		const { context } = await mountOptOutSurface({
			initialRecords: {
				noticeDismissal: {
					dismissedAt: now - 120_000,
					fingerprint: 'stale-notice-fingerprint',
					version: 1,
				},
				now,
				optOut: {
					heldBy: 'device',
					method: 'button',
					recordedAt,
					rights: ['sale', 'share'],
				},
			},
			now,
			rule: NOTICE_OPT_OUT_RULE,
		});

		await vi.waitFor(() => expect(part('consent-banner-root')).not.toBeNull());
		expect(context.kernel.getSnapshot().promptRequirement.kind).toBe('notice');
		expect(part('consent-banner-accept-button')).toBeNull();
		expect(part('consent-banner-dismiss-button')).not.toBeNull();
	});

	test('3c: GPC opt-out persists after GPC turns off, keeps marketing off, shows opted-out block, and opens no prompt', async () => {
		const now = Date.now();
		const { context } = await mountOptOutSurface({
			gpc: false,
			initialRecords: {
				now,
				optOut: {
					heldBy: 'device',
					method: 'gpc',
					recordedAt: now - 5000,
					rights: ['sale', 'share'],
				},
			},
			now,
			rule: CHOICE_OPT_OUT_RULE,
		});

		expect(context.kernel.getSnapshot().optOut?.method).toBe('gpc');
		expect(context.kernel.getSnapshot().privacySignals.gpc.active).toBe(false);
		expect(context.kernel.getSnapshot().effectivePermissions.marketing).toBe(
			false
		);
		expect(context.kernel.getSnapshot().activeUI).toBe('none');
		expect(part('consent-banner-root')).toBeNull();

		await vi.waitFor(() =>
			expect(part('consent-widget-opt-out-status')).not.toBeNull()
		);
		expect(part('consent-widget-opt-out-button')).toBeNull();
	});
});

describe('two-step opt-in confirmation (Vue)', () => {
	test('opt back in link requires separate confirmation, focuses cancel first, stays outside the widget, and lifts on confirm', async () => {
		const { context } = await mountOptOutSurface();
		await vi.waitFor(() =>
			expect(part('consent-widget-opt-in-link')).not.toBeNull()
		);

		required('consent-widget-opt-in-link').click();

		// Step 1 alone keeps the opt-out held and opens a separate modal dialog.
		await vi.waitFor(() =>
			expect(part('opt-in-confirmation-root')).not.toBeNull()
		);
		expect(context.kernel.getSnapshot().optOut).not.toBeNull();
		expect(context.kernel.getSnapshot().effectivePermissions.marketing).toBe(
			false
		);

		const confirmationRoot = required('opt-in-confirmation-root');
		const widget = required('consent-widget-root');
		expect(widget.contains(confirmationRoot)).toBe(false);
		expect(confirmationRoot.getAttribute('role')).toBe('dialog');
		expect(confirmationRoot.getAttribute('aria-modal')).toBe('true');

		// Unconfirmed rights stay neutral in the confirmation description.
		const description = required('opt-in-confirmation-description');
		expect(description.textContent?.toLowerCase()).not.toMatch(
			/sale|sharing|targeted/u
		);

		// Focus starts on the cancel button.
		const cancelButton = required<HTMLButtonElement>(
			'opt-in-confirmation-cancel-button'
		);
		await vi.waitFor(() => {
			expect(document.activeElement).toBe(cancelButton);
		});

		// Step 2 confirms and lifts the opt-out.
		required('opt-in-confirmation-confirm-button').click();
		await vi.waitFor(() => {
			expect(context.kernel.getSnapshot().optOut).toBeNull();
		});
		expect(context.kernel.getSnapshot().effectivePermissions.marketing).toBe(
			true
		);
		await vi.waitFor(() => expect(part('opt-in-confirmation-root')).toBeNull());
	});

	test('opt-in confirmation description names confirmed rights once answered by the backend', async () => {
		await mountOptOutSurface({ rightsConfirmed: true });
		await vi.waitFor(() =>
			expect(part('consent-widget-opt-in-link')).not.toBeNull()
		);

		required('consent-widget-opt-in-link').click();
		await vi.waitFor(() =>
			expect(part('opt-in-confirmation-root')).not.toBeNull()
		);

		const text =
			required('opt-in-confirmation-description').textContent?.toLowerCase() ??
			'';
		expect(text).toContain('sale');
		expect(text).toContain('sharing');
		expect(text).not.toContain('targeted');

		required('opt-in-confirmation-cancel-button').click();
		await vi.waitFor(() => expect(part('opt-in-confirmation-root')).toBeNull());
	});

	test('opt back in link then cancel (button and Escape) leaves opt-out held and saves nothing', async () => {
		const { context } = await mountOptOutSurface();
		await vi.waitFor(() =>
			expect(part('consent-widget-opt-in-link')).not.toBeNull()
		);

		required('consent-widget-opt-in-link').click();
		await vi.waitFor(() =>
			expect(part('opt-in-confirmation-root')).not.toBeNull()
		);

		required('opt-in-confirmation-cancel-button').click();
		await vi.waitFor(() => expect(part('opt-in-confirmation-root')).toBeNull());
		expect(context.kernel.getSnapshot().optOut).not.toBeNull();
		expect(context.kernel.getSnapshot().explicitChoice).toBeNull();

		// Open again and cancel with Escape.
		required('consent-widget-opt-in-link').click();
		await vi.waitFor(() =>
			expect(part('opt-in-confirmation-root')).not.toBeNull()
		);
		document.dispatchEvent(
			new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' })
		);
		await vi.waitFor(() => expect(part('opt-in-confirmation-root')).toBeNull());
		expect(context.kernel.getSnapshot().optOut).not.toBeNull();
		expect(context.kernel.getSnapshot().explicitChoice).toBeNull();
	});

	test('Accept All in the widget defers save until confirmed, then lifts opt-out and grants categories', async () => {
		const { context } = await mountOptOutSurface();
		await vi.waitFor(() =>
			expect(part('consent-widget-footer-accept-all-button')).not.toBeNull()
		);

		required('consent-widget-footer-accept-all-button').click();
		await vi.waitFor(() =>
			expect(part('opt-in-confirmation-root')).not.toBeNull()
		);
		expect(context.kernel.getSnapshot().optOut).not.toBeNull();
		expect(context.kernel.getSnapshot().explicitChoice).toBeNull();

		required('opt-in-confirmation-confirm-button').click();
		await vi.waitFor(() => {
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
	});

	test('Accept All in a banner never lifts a held opt-out and asks nothing', async () => {
		const { context } = await mountOptOutSurface({
			rule: CHOICE_OPT_OUT_RULE,
		});
		context.kernel.set.activeUI('banner');
		await vi.waitFor(() =>
			expect(part('consent-banner-accept-button')).not.toBeNull()
		);

		required('consent-banner-accept-button').click();
		// A banner commit keeps sale and sharing off (PERM-02); lifting the
		// opt-out takes the dialog's or the widget's own confirmation.
		await vi.waitFor(() => {
			expect(context.kernel.getSnapshot().activeUI).toBe('none');
		});
		expect(part('opt-in-confirmation-root')).toBeNull();
		expect(context.kernel.getSnapshot().optOut).not.toBeNull();
		expect(context.kernel.getSnapshot().effectivePermissions.marketing).toBe(
			false
		);
	});

	test('turning Marketing on then Save opens confirmation and cancelling leaves opt-out held', async () => {
		const { context } = await mountOptOutSurface();
		const marketing = required<HTMLButtonElement>(
			'consent-widget-switch-marketing'
		);
		expect(marketing.getAttribute('aria-checked')).toBe('false');

		marketing.click();
		await flushPromises();
		expect(marketing.getAttribute('aria-checked')).toBe('true');
		required('consent-widget-footer-save-button').click();

		await vi.waitFor(() =>
			expect(part('opt-in-confirmation-root')).not.toBeNull()
		);
		expect(context.kernel.getSnapshot().optOut).not.toBeNull();
		expect(context.kernel.getSnapshot().explicitChoice).toBeNull();

		required('opt-in-confirmation-cancel-button').click();
		await vi.waitFor(() => expect(part('opt-in-confirmation-root')).toBeNull());
		expect(context.kernel.getSnapshot().optOut).not.toBeNull();
		expect(context.kernel.getSnapshot().explicitChoice).toBeNull();
		expect(context.kernel.getSnapshot().effectivePermissions.marketing).toBe(
			false
		);
	});

	test('saving without granting the deciding category completes with no confirmation', async () => {
		const { context } = await mountOptOutSurface();
		const measurement = required<HTMLButtonElement>(
			'consent-widget-switch-measurement'
		);

		measurement.click();
		await flushPromises();
		required('consent-widget-footer-save-button').click();

		await vi.waitFor(() => {
			expect(
				context.kernel.getSnapshot().effectivePermissions.measurement
			).toBe(true);
		});
		expect(part('opt-in-confirmation-root')).toBeNull();
		expect(context.kernel.getSnapshot().optOut).not.toBeNull();
		expect(context.kernel.getSnapshot().effectivePermissions.marketing).toBe(
			false
		);
	});

	test('with active GPC signal there is no opt back in link', async () => {
		await mountOptOutSurface({ gpc: true });
		await vi.waitFor(() =>
			expect(part('consent-widget-opt-out-status')).not.toBeNull()
		);
		expect(part('consent-widget-opt-in-link')).toBeNull();
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
		const { context } = await mountOptOutSurface({
			heldBy: 'person',
			mode: refusingMode,
		});

		await vi.waitFor(() =>
			expect(part('consent-widget-opt-in-link')).not.toBeNull()
		);
		required('consent-widget-opt-in-link').click();
		await vi.waitFor(() =>
			expect(part('opt-in-confirmation-root')).not.toBeNull()
		);
		expect(liftCalls).toHaveLength(0);

		required('opt-in-confirmation-confirm-button').click();
		await vi.waitFor(() => {
			expect(liftCalls).toHaveLength(1);
		});
		expect(context.kernel.getSnapshot().optOut?.heldBy).toBe('person');
		expect(context.kernel.getSnapshot().effectivePermissions.marketing).toBe(
			false
		);
	});

	test('under an opt-in policy with an opt-out held, Accept lifts in one step without confirmation', async () => {
		const { context } = await mountOptOutSurface({ rule: OPT_IN_RULE });
		await vi.waitFor(() =>
			expect(part('consent-widget-footer-accept-all-button')).not.toBeNull()
		);

		required('consent-widget-footer-accept-all-button').click();
		await vi.waitFor(() => {
			expect(context.kernel.getSnapshot().optOut).toBeNull();
		});
		expect(part('opt-in-confirmation-root')).toBeNull();
		expect(context.kernel.getSnapshot().effectivePermissions.marketing).toBe(
			true
		);
	});
});
