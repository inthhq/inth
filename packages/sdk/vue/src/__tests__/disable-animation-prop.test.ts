import type { InitOutput, PolicyRule } from '@inth/sdk/schema/types';
import {
	resolvePolicyRules,
	writePolicyResolutionWire,
} from '@inth/sdk/schema/types';
import { translations as enTranslations } from '@inth/sdk/translations/en';
import { flushPromises, mount } from '@vue/test-utils';
import type { VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, test, vi } from 'vite-plus/test';
import type { Component, ComponentPublicInstance } from 'vue';

import ConsentManager from '../runtime/components/dialog/manager.vue';
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

const rule: PolicyRule = {
	categories: ['measurement', 'marketing'],
	id: 'vue_motion_policy',
	match: { fallback: true },
	model: 'opt-in',
	prompt: 'choice',
	scopeMode: 'permissive',
};

const init = {
	branding: 'inth',
	location: { countryCode: 'DE', regionCode: null },
	policyResolution: writePolicyResolutionWire(
		resolvePolicyRules({ countryCode: null, regionCode: null, rules: [rule] })
	),
	translations: { language: 'en', translations: enTranslations },
} as InitOutput;

let mounted: {
	context: VueConsentKernelContext;
	wrapper: VueWrapper<ComponentPublicInstance>;
} | null = null;

const query = (selector: string) =>
	document.querySelector<HTMLElement>(selector);

const render = async function render(
	component: Component,
	activeUI: 'banner' | 'manager' | null,
	configDisableAnimation: boolean,
	disableAnimation: boolean | undefined
) {
	const config = {
		consentCategories: ['necessary', 'measurement', 'marketing'],
		customFetch: vi.fn(() => new Response('{}')) as unknown as typeof fetch,
		disableAnimation: configDisableAnimation,
		hideBranding: true,
		projectUrl: 'https://consent.example',
	} as ConsentConfig;
	const context = createVueConsentKernelContext({ config, prefetch: init });
	context.activeUI.value = activeUI;
	const wrapper = mount(component, {
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
		props: disableAnimation === undefined ? {} : { disableAnimation },
	});
	mounted = { context, wrapper };
	await flushPromises();
};

afterEach(async () => {
	if (mounted) {
		const { element } = mounted.wrapper;
		mounted.wrapper.unmount();
		element.remove();
		mounted.context.dispose();
		mounted = null;
		await flushPromises();
	}
	document.body.innerHTML = '';
	vi.restoreAllMocks();
});

describe('the disableAnimation prop', () => {
	const bannerRoot = () => query('[data-testid="consent-banner-root"]');

	test.each([
		{ config: false, expected: false, prop: undefined },
		{ config: true, expected: true, prop: undefined },
		{ config: false, expected: true, prop: true },
		{ config: true, expected: false, prop: false },
	])(
		'on ConsentBanner: $prop over config $config stops the motion: $expected',
		async ({ config, expected, prop }) => {
			await render(ConsentBanner, 'banner', config, prop);
			await vi.waitFor(() => expect(bannerRoot()).not.toBeNull());
			expect(bannerRoot()?.getAttribute('data-animation') === 'off').toBe(
				expected
			);
		}
	);

	test.each([
		{ config: false, expected: true, prop: true },
		{ config: true, expected: false, prop: false },
	])(
		'on ConsentManager: $prop over config $config stops the motion: $expected',
		async ({ config, expected, prop }) => {
			await render(ConsentManager, 'manager', config, prop);
			const root = () => query('[data-testid="consent-dialog-root"]');
			await vi.waitFor(() => expect(root()).not.toBeNull());
			expect(root()?.getAttribute('data-animation') === 'off').toBe(expected);
		}
	);
});
