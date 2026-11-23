/**
 * `ConsentDescription` picks its class by context. The manager's muted
 * colours live in the banner stylesheet (`.description[data-context='manager']`
 * in prompt.module.css), so only `context="dialog"` takes the dialog's class.
 */
import type { InitOutput, PolicyRule } from '@inth/sdk/schema/types';
import {
	resolvePolicyRules,
	writePolicyResolutionWire,
} from '@inth/sdk/schema/types';
import { translations } from '@inth/sdk/translations/en';
import dialogStyles from '@inth/sdk/ui/styles/components/legacy-panel';
import bannerStyles from '@inth/sdk/ui/styles/components/legacy-prompt';
import { mount } from '@vue/test-utils';
import { expect, test } from 'vitest';

import ConsentDescription from '../runtime/components/description.vue';
import { consentConfigKey } from '../runtime/composables/config';
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

const rule: PolicyRule = {
	categories: ['measurement'],
	id: 'vue_description_policy',
	match: { fallback: true },
	model: 'opt-in',
	prompt: 'choice',
	scopeMode: 'permissive',
};

const init = {
	branding: 'inth',
	location: { countryCode: 'US', regionCode: 'CA' },
	policyResolution: writePolicyResolutionWire(
		resolvePolicyRules({ countryCode: null, regionCode: null, rules: [rule] })
	),
	translations: { language: 'en', translations },
} as InitOutput;

const renderDescription = function renderDescription(
	context: 'banner' | 'dialog' | 'manager'
) {
	const config = {
		consentCategories: ['necessary', 'measurement'],
		domain: 'consent.example',
		projectUrl: 'https://consent.example',
	} as ConsentConfig;
	const kernelContext = createVueConsentKernelContext({
		config,
		prefetch: init,
	});
	return mount(ConsentDescription, {
		global: {
			provide: {
				[consentConfigKey as symbol]: config,
				[symbolKernelContext as symbol]: kernelContext,
				[symbolKernel as symbol]: kernelContext.kernel,
				[symbolSnapshot as symbol]: kernelContext.snapshot,
				[symbolInit as symbol]: kernelContext.init,
				[symbolActiveUI as symbol]: kernelContext.activeUI,
				[symbolConsent as symbol]: kernelContext.storedConsent,
			},
		},
		props: { context },
	});
};

test.each([
	['banner', bannerStyles.description],
	['dialog', dialogStyles.description],
	['manager', bannerStyles.description],
] as const)(
	'context="%s" takes the matching description class',
	(context, expected) => {
		const wrapper = renderDescription(context);
		const root = wrapper.get(`[data-context="${context}"]`);
		const other =
			expected === bannerStyles.description
				? dialogStyles.description
				: bannerStyles.description;

		expect(expected).toBeTruthy();
		expect(root.classes()).toContain(expected);
		expect(root.classes()).not.toContain(other);
		wrapper.unmount();
	}
);
