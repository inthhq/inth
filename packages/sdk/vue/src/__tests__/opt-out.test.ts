import type { InitOutput, PolicyRule } from '@inth/sdk/schema/types';
import {
	createPolicyRuleFingerprints,
	normalizePolicyRule,
	resolvePolicyRules,
	writePolicyResolutionWire,
} from '@inth/sdk/schema/types';
import { translations as enTranslations } from '@inth/sdk/translations/en';
import { flushPromises, mount } from '@vue/test-utils';
import type { VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { defineComponent, h } from 'vue';

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
const RESOLVED = resolvePolicyRules({
	countryCode: 'US',
	regionCode: 'CA',
	rules: [OPT_OUT_RULE],
});
const INIT_OUTPUT = {
	branding: 'inth',
	location: { countryCode: 'US', regionCode: 'CA' },
	policyResolution: writePolicyResolutionWire(RESOLVED),
	translations: { language: 'en', translations: enTranslations },
} as InitOutput;

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

let mounted: { context: VueConsentKernelContext; wrapper: VueWrapper } | null =
	null;

afterEach(async () => {
	mounted?.wrapper.unmount();
	mounted?.context.dispose();
	mounted = null;
	await flushPromises();
	document.body.innerHTML = '';
});

const mountWidget = async (options: {
	gpc?: boolean;
	initialRecords?: NonNullable<
		Parameters<typeof createVueConsentKernelContext>[0]['initialRecords']
	>;
	now: number;
	theme?: ConsentConfig['theme'];
}) => {
	const config = {
		consentCategories: [...CATEGORIES],
		customFetch: vi.fn(() => new Response('{}')) as unknown as typeof fetch,
		hideBranding: true,
		projectUrl: 'https://consent.example',
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
		now: options.now,
		prefetch: INIT_OUTPUT,
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
					h(ConsentWidget),
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
	test('shows request status, seeds stored grants off, keeps opt-out on untouched save and lifts on opt-in save', async () => {
		const now = Date.now();
		const { context } = await mountWidget({
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
		expect(status).not.toBeNull();
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
		expect(measurement?.disabled).toBe(false);
		measurement?.click();
		await flushPromises();
		expect(measurement?.getAttribute('aria-checked')).toBe('true');
		part('consent-widget-footer-save-button')?.click();
		await flushPromises();
		expect(context.snapshot.value.optOut).not.toBeNull();
		expect(context.snapshot.value.effectivePermissions.marketing).toBe(false);
		expect(context.snapshot.value.effectivePermissions.measurement).toBe(true);

		// Turning marketing back on and saving lifts the device opt-out.
		marketing.click();
		await flushPromises();
		expect(marketing.getAttribute('aria-checked')).toBe('true');
		required('consent-widget-footer-save-button').click();
		await flushPromises();
		expect(context.snapshot.value.optOut).toBeNull();
		expect(context.snapshot.value.effectivePermissions.marketing).toBe(true);
		expect(part('consent-widget-opt-out-status')).toBeNull();
	});

	test('locks opted-out categories under active GPC and blocks pointer, keyboard, save and accept-all', async () => {
		const now = Date.now();
		const { context } = await mountWidget({
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
		const { context } = await mountWidget({
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
		await flushPromises();
		expect(context.snapshot.value.optOut?.heldBy).toBe('person');
		expect(context.snapshot.value.effectivePermissions.marketing).toBe(false);
	});
});
