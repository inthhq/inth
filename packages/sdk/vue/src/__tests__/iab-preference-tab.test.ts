/**
 * The IAB banner's "N partners" link opens the dialog on the vendor list,
 * and a reopened dialog lands on the tab the visitor left it on.
 *
 * @vitest-environment jsdom
 */
import {
	createPolicyRuleFingerprints,
	normalizePolicyRule,
	writePolicyResolutionWire,
} from '@inth/sdk/schema/types';
import type { InitOutput } from '@inth/sdk/schema/types';
import { afterEach, expect, onTestFinished, test, vi } from 'vitest';
import { createApp } from 'vue';
import type { Component } from 'vue';

import { completeGVL } from '../../../iab/src/__tests__/fixtures/gvl-sample';
import { createIAB } from '../../../iab/src/index';
import InthProvider from '../runtime/components/inth-provider.vue';
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

const policy = normalizePolicyRule({
	id: 'iab-tab',
	match: { isDefault: true },
	model: 'iab',
	prompt: 'choice',
});

const init = {
	branding: 'inth',
	cmpId: 28,
	customVendors: [],
	gvl: completeGVL,
	location: { countryCode: 'DE', regionCode: null },
	policyResolution: writePolicyResolutionWire({
		fingerprints: createPolicyRuleFingerprints(policy),
		matchedBy: 'default',
		policy,
		policyId: policy.id,
		status: 'matched',
	}),
	translations: { language: 'en', translations: {} },
} as unknown as InitOutput;

const config = {
	customFetch: (() =>
		Promise.resolve(Response.json({ ok: true }))) as unknown as typeof fetch,
	disableAnimation: true,
	hideBranding: true,
	// IAB is opt-in; these surfaces stand for an app that turned it on.
	iab: {},
	projectUrl: 'https://consent.test',
	trapFocus: false,
} as ConsentConfig;

afterEach(() => {
	localStorage.clear();
});

const mountSurfaces = async (activeUI: 'banner' | 'dialog') => {
	const context = createVueConsentKernelContext({ config, prefetch: init });
	onTestFinished(() => context.dispose());
	const handle = createIAB({
		cmpId: 28,
		gvl: completeGVL,
		kernel: context.kernel,
		persistence: false,
	});
	onTestFinished(() => handle.dispose());
	context.iab = handle;
	await handle.whenReady();
	context.kernel.set.activeUI(activeUI);
	const container = document.createElement('div');
	document.body.append(container);
	onTestFinished(() => container.remove());
	// `InthProvider` mounts one surface at a time, so the banner unmounts
	// before the dialog mounts.
	const app = createApp(InthProvider as Component);
	app.provide(consentConfigKey, config);
	app.provide(symbolKernelContext, context);
	app.provide(symbolKernel, context.kernel);
	app.provide(symbolSnapshot, context.snapshot);
	app.provide(symbolInit, context.init);
	app.provide(symbolActiveUI, context.activeUI);
	app.provide(symbolConsent, context.storedConsent);
	app.mount(container);
	onTestFinished(() => app.unmount());
	return { context };
};

const dialogTab = () =>
	document
		.querySelector('[data-testid="iab-consent-dialog-card"] [data-active-tab]')
		?.getAttribute('data-active-tab');

test('the banner partners link opens the dialog on the vendor list', async () => {
	await mountSurfaces('banner');
	const link = () =>
		document.querySelector<HTMLElement>(
			'[data-testid="iab-consent-banner-partners-link"]'
		);
	await vi.waitFor(() => expect(link()).not.toBeNull());

	link()?.click();

	await vi.waitFor(() => expect(dialogTab()).toBeDefined());
	expect(dialogTab()).toBe('vendors');
});

test('a reopened dialog lands on the tab the visitor left it on', async () => {
	const { context } = await mountSurfaces('dialog');
	const vendorsTab = () =>
		[
			...document.querySelectorAll<HTMLElement>(
				'[data-testid="iab-consent-dialog-card"] [role="tab"]'
			),
		].at(1);
	await vi.waitFor(() => expect(vendorsTab()).toBeDefined());
	expect(dialogTab()).toBe('purposes');

	vendorsTab()?.click();
	await vi.waitFor(() => expect(dialogTab()).toBe('vendors'));

	context.kernel.set.activeUI('none');
	await vi.waitFor(() => expect(dialogTab()).toBeUndefined());
	context.kernel.set.activeUI('dialog');

	await vi.waitFor(() => expect(dialogTab()).toBeDefined());
	expect(dialogTab()).toBe('vendors');
});
