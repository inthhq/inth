import type {
	OptOutPayload,
	OptOutTransportResult,
	ProviderTransportFactory,
} from '@inth/sdk/engine';
import type { InitOutput, PolicyRule } from '@inth/sdk/schema/types';
import {
	createPolicyRuleFingerprints,
	normalizePolicyRule,
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

import ConsentManager from '../runtime/components/manager.vue';
import ConsentWidget from '../runtime/components/preferences.vue';
import { consentConfigKey } from '../runtime/composables/config';
import { useOptOutState } from '../runtime/composables/kernel';
import type { ConsentConfig } from '../runtime/config';
import {
	symbolActiveUI,
	symbolConsent,
	symbolInit,
	symbolKernel,
	symbolKernelContext,
	symbolSnapshot,
} from '../runtime/utils/symbols';
import { createVueConsentKernelContext } from './test-kernel';
import type { VueConsentKernelContext } from './test-kernel';

const CATEGORIES = ['functionality', 'marketing', 'measurement'] as const;
const OPT_OUT_RULE: PolicyRule = {
	categories: [...CATEGORIES],
	id: 'vue-us-opt-out',
	match: { fallback: true, isDefault: true },
	model: 'opt-out',
	privacySignals: { gpc: { denyCategories: ['marketing', 'measurement'] } },
	prompt: 'notice',
	rights: ['disclosure', 'preferences', 'opt-out'],
	scopeMode: 'permissive',
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

const mountSurface = async (options: {
	dialog?: boolean;
	gpc?: boolean;
	initialRecords?: NonNullable<
		Parameters<typeof createVueConsentKernelContext>[0]['initialRecords']
	>;
	mode?: ProviderTransportFactory;
	now: number;
	presentation?: ConsentConfig['presentation'];
	rule?: PolicyRule;
	theme?: ConsentConfig['theme'];
}) => {
	const rule = options.rule ?? OPT_OUT_RULE;
	const config = {
		consentCategories: [...CATEGORIES],
		customFetch: vi.fn(() => new Response('{}')) as unknown as typeof fetch,
		disableAnimation: true,
		hideBranding: true,
		presentation: options.presentation,
		projectUrl: 'https://consent.example',
		reloadOnConsentRevoked: false,
	} as ConsentConfig & { overrides?: { gpc: boolean } };
	if (options.gpc) {
		config.overrides = { gpc: true };
	}
	if (options.theme) {
		config.theme = options.theme;
	}
	const context = createVueConsentKernelContext({
		config,
		initialRecords: options.initialRecords,
		kernelConfig: {
			initialPrivacySignals: options.gpc ? { gpc: true } : undefined,
			now: options.now,
		},
		mode: options.mode,
		now: options.now,
		prefetch: buildInit(rule),
	});
	const Host = defineComponent({
		setup() {
			const optOutState = useOptOutState();
			return () =>
				h('div', [
					h(
						'output',
						{ 'data-testid': 'opt-out-composable' },
						JSON.stringify(optOutState.value)
					),
					options.dialog
						? h(ConsentManager, { disableAnimation: true })
						: h(ConsentWidget),
				]);
		},
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
	return { context, wrapper };
};

const part = <ElementType extends HTMLElement = HTMLElement>(testId: string) =>
	document.querySelector<ElementType>(`[data-testid="${testId}"]`);

/** The element with `testId`, which the test expects to be rendered. */
const required = <ElementType extends HTMLElement = HTMLElement>(
	testId: string
): ElementType => {
	const element = part<ElementType>(testId);
	expect.assert(element, `${testId} is not rendered`);
	return element;
};

/** A switch GPC locks stays off through a click and both activation keys. */
const expectGpcLockedSwitch = async (category: 'marketing' | 'measurement') => {
	const sw = required<HTMLButtonElement>(`consent-widget-switch-${category}`);
	const notice = required(`consent-widget-restriction-${category}`);
	expect(sw.disabled).toBe(true);
	expect(sw.getAttribute('aria-checked')).toBe('false');
	expect(sw.getAttribute('aria-describedby')).toBe(notice.id);
	expect(notice.textContent).toContain('Global Privacy Control');

	sw.click();
	sw.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: ' ' }));
	sw.dispatchEvent(
		new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' })
	);
	await flushPromises();
	expect(sw.getAttribute('aria-checked')).toBe('false');
};

describe('Vue consent widget opt-out parity', () => {
	test('shows request status, seeds stored grants off, keeps opt-out on untouched save and lifts after two-step confirmation', async () => {
		const now = Date.now();
		const { context } = await mountSurface({
			initialRecords: {
				choice: choiceRecord(
					{ functionality: true, marketing: true, measurement: true },
					now - 2000
				),
				now,
				optOut: {
					heldBy: 'device',
					method: 'button',
					recordedAt: now - 1000,
					rights: ['sale', 'share'],
				},
			},
			now,
			theme: {
				slots: {
					consentWidgetOptOutStatus: 'brand-opt-out-status',
				},
			},
		});

		const status = required('consent-widget-opt-out-status');
		expect(status.getAttribute('role')).toBe('status');
		expect(status.textContent?.trim()).toBe('Opt-out request honored');
		expect(status.classList).toContain('brand-opt-out-status');

		expect(required('opt-out-composable').textContent).toContain(
			'"honored":true'
		);
		expect(required('opt-out-composable').textContent).toContain(
			'"via":"request"'
		);

		const marketing = required<HTMLButtonElement>(
			'consent-widget-switch-marketing'
		);
		const measurement = required<HTMLButtonElement>(
			'consent-widget-switch-measurement'
		);
		const functionality = required<HTMLButtonElement>(
			'consent-widget-switch-functionality'
		);
		expect(marketing.getAttribute('aria-checked')).toBe('false');
		expect(marketing.disabled).toBe(false);
		expect(measurement.getAttribute('aria-checked')).toBe('false');
		expect(functionality.getAttribute('aria-checked')).toBe('true');
		expect(part('consent-widget-restriction-marketing')).toBeNull();

		// An untouched save does not re-confirm the stored grant or lift the opt-out.
		required('consent-widget-footer-save-button').click();
		await flushPromises();
		expect(context.snapshot.value.optOut).not.toBeNull();
		expect(context.snapshot.value.effectivePermissions.marketing).toBe(false);
		expect(
			context.snapshot.value.explicitChoice?.categories.marketing?.value
		).toBe(false);

		// Turning measurement on while marketing stays off keeps the opt-out and lets measurement stand.
		expect(measurement.disabled).toBe(false);
		measurement.click();
		await flushPromises();
		expect(measurement.getAttribute('aria-checked')).toBe('true');
		required('consent-widget-footer-save-button').click();
		await flushPromises();
		expect(context.snapshot.value.optOut).not.toBeNull();
		expect(context.snapshot.value.effectivePermissions.marketing).toBe(false);
		expect(context.snapshot.value.effectivePermissions.measurement).toBe(true);

		// Turning marketing back on and saving opens two-step confirmation; confirming lifts the device opt-out.
		marketing.click();
		await flushPromises();
		expect(marketing.getAttribute('aria-checked')).toBe('true');
		required('consent-widget-footer-save-button').click();
		await vi.waitFor(() =>
			expect(part('opt-in-confirmation-root')).not.toBeNull()
		);
		expect(context.snapshot.value.optOut).not.toBeNull();
		required('opt-in-confirmation-confirm-button').click();
		await vi.waitFor(() => expect(context.snapshot.value.optOut).toBeNull());
		expect(context.snapshot.value.effectivePermissions.marketing).toBe(true);
		expect(part('consent-widget-opt-out-status')).toBeNull();
	});

	test('locks opted-out categories under active GPC and blocks pointer, keyboard, save and accept-all', async () => {
		const now = Date.now();
		const { context } = await mountSurface({
			gpc: true,
			initialRecords: {
				choice: choiceRecord(
					{ functionality: false, marketing: true, measurement: true },
					now - 2000
				),
				now,
				optOut: {
					heldBy: 'device',
					method: 'gpc',
					recordedAt: now - 1000,
					rights: ['sale', 'share'],
				},
			},
			now,
		});

		const status = required('consent-widget-opt-out-status');
		expect(status.getAttribute('role')).toBe('status');
		expect(status.textContent?.trim()).toBe(
			'Opt-out preference signal honored'
		);
		expect(required('opt-out-composable').textContent).toContain(
			'"lock":"gpc-active"'
		);

		await expectGpcLockedSwitch('marketing');
		await expectGpcLockedSwitch('measurement');

		expect(part('consent-widget-restriction-functionality')).toBeNull();

		// Untouched save does not grant locked categories.
		required('consent-widget-footer-save-button').click();
		await flushPromises();
		expect(context.snapshot.value.effectivePermissions.marketing).toBe(false);
		expect(context.snapshot.value.effectivePermissions.measurement).toBe(false);
		expect(
			context.snapshot.value.explicitChoice?.categories.marketing?.value
		).not.toBe(true);

		// Accept all grants unlocked categories without granting locked ones.
		required('consent-widget-footer-accept-all-button').click();
		await flushPromises();
		expect(context.snapshot.value.effectivePermissions.functionality).toBe(
			true
		);
		expect(context.snapshot.value.effectivePermissions.marketing).toBe(false);
		expect(context.snapshot.value.effectivePermissions.measurement).toBe(false);
		expect(
			context.snapshot.value.explicitChoice?.categories.marketing?.value
		).not.toBe(true);
		expect(
			context.snapshot.value.explicitChoice?.categories.measurement?.value
		).not.toBe(true);
	});

	test('shows account lock reason while keeping switches usable under an account-held opt-out', async () => {
		const now = Date.now();
		const { context } = await mountSurface({
			initialRecords: {
				now,
				optOut: {
					heldBy: 'person',
					method: 'button',
					recordedAt: now - 1000,
					rights: ['sale', 'share'],
				},
			},
			now,
		});

		expect(required('consent-widget-opt-out-status').textContent?.trim()).toBe(
			'Opt-out request honored'
		);
		expect(required('opt-out-composable').textContent).toContain(
			'"lock":"held-by-account"'
		);

		const marketing = required<HTMLButtonElement>(
			'consent-widget-switch-marketing'
		);
		const notice = required('consent-widget-restriction-marketing');
		expect(marketing.disabled).toBe(false);
		expect(marketing.getAttribute('aria-checked')).toBe('false');
		expect(marketing.getAttribute('aria-describedby')).toBe(notice.id);
		expect(notice.textContent).toContain('account');
		expect(part('consent-widget-restriction-measurement')).toBeNull();

		marketing.click();
		await flushPromises();
		expect(marketing.getAttribute('aria-checked')).toBe('true');
		required('consent-widget-footer-save-button').click();
		await vi.waitFor(() =>
			expect(part('opt-in-confirmation-root')).not.toBeNull()
		);
		required('opt-in-confirmation-confirm-button').click();
		await vi.waitFor(() => expect(part('opt-in-confirmation-root')).toBeNull());
		expect(context.snapshot.value.optOut?.heldBy).toBe('person');
		expect(context.snapshot.value.effectivePermissions.marketing).toBe(false);
	});
});

describe('sale-and-sharing block in dialog and widget', () => {
	test('renders before the category list outside accordion items, opts out in one click, and shows the receipt on reopen', async () => {
		const { context } = await mountSurface({
			dialog: true,
			now: Date.now(),
			presentation: { optOutLink: 'privacy-choices' },
			theme: {
				slots: {
					consentWidgetOptOut: 'brand-opt-out-block',
				},
			},
		});

		context.kernel.set.activeUI('dialog');
		await vi.waitFor(() =>
			expect(part('consent-widget-opt-out')).not.toBeNull()
		);

		const block = required('consent-widget-opt-out');
		const accordion = required('consent-widget-accordion');
		expect(block.classList).toContain('brand-opt-out-block');
		expect([
			...document.querySelectorAll(
				'[data-testid="consent-widget-opt-out"], [data-testid="consent-widget-accordion"]'
			),
		]).toEqual([block, accordion]);
		expect(
			block.closest('[data-testid^="consent-widget-accordion-item-"]')
		).toBeNull();

		const headingBefore = required('consent-widget-opt-out-heading');
		expect(headingBefore.textContent?.toLowerCase()).not.toMatch(
			/sale|sharing|targeted/u
		);

		required('consent-widget-opt-out-button').click();
		await vi.waitFor(() => expect(context.snapshot.value.optOut).not.toBeNull());
		expect(context.snapshot.value.effectivePermissions.marketing).toBe(false);
		expect(context.snapshot.value.activeUI).not.toBe('dialog');

		// Reopen the dialog and confirm the block shows status, time, and reference without a button.
		closeOptOutConfirmation(context.kernel);
		context.kernel.set.activeUI('dialog');
		await vi.waitFor(() =>
			expect(part('consent-widget-opt-out-status')).not.toBeNull()
		);

		const reopenedBlock = required('consent-widget-opt-out');
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
		const { context } = await mountSurface({
			mode: deferred.mode,
			now: Date.now(),
			presentation: { optOutLink: 'privacy-choices' },
		});

		required('consent-widget-opt-out-button').click();
		await vi.waitFor(() => expect(context.snapshot.value.optOut).not.toBeNull());
		await vi.waitFor(() =>
			expect(part('consent-widget-opt-out-status')).not.toBeNull()
		);

		expect(
			required('consent-widget-opt-out-heading').textContent?.toLowerCase()
		).not.toMatch(/sale|sharing|targeted/u);

		await vi.waitFor(() => expect(deferred.getSentPayload()).toBeDefined());
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

		await vi.waitFor(() => {
			const text =
				part('consent-widget-opt-out-heading')?.textContent?.toLowerCase() ??
				'';
			expect(text).toContain('sale');
			expect(text).toContain('sharing');
		});
		expect(
			part('consent-widget-opt-out-heading')?.textContent?.toLowerCase()
		).not.toContain('targeted');
	});

	test('shows the signal status inside the block when GPC is active under a policy that maps it', async () => {
		const now = Date.now();
		const { context } = await mountSurface({
			dialog: true,
			gpc: true,
			initialRecords: {
				now,
				optOut: {
					heldBy: 'device',
					method: 'gpc',
					recordedAt: now - 1000,
					rights: ['sale', 'share'],
				},
			},
			now,
			presentation: { optOutLink: 'privacy-choices' },
		});

		context.kernel.set.activeUI('dialog');
		await vi.waitFor(() =>
			expect(part('consent-widget-opt-out')).not.toBeNull()
		);

		const block = required('consent-widget-opt-out');
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
		const { context } = await mountSurface({
			dialog: true,
			now: Date.now(),
			rule: OPT_IN_RULE,
		});

		context.kernel.set.activeUI('dialog');
		await vi.waitFor(() =>
			expect(part('consent-widget-accordion')).not.toBeNull()
		);

		expect(part('consent-widget-opt-out')).toBeNull();
		expect(part('consent-widget-opt-out-status')).toBeNull();
		expect(part('consent-dialog-title')).not.toBeNull();
		expect(part('consent-dialog-description')).not.toBeNull();
		expect(part('consent-widget-accordion-item-necessary')).not.toBeNull();
		expect(part('consent-widget-footer')).not.toBeNull();
	});
});
