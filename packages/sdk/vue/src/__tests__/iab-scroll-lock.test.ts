/**
 * The IAB banner and dialog read `scrollLock` and `trapFocus` the way the
 * React, Svelte and Angular ones do: an explicit presentation option wins,
 * then the component's own props, then the config's, then the presentation's
 * default.
 *
 * @vitest-environment jsdom
 */
import type { ConsentPresentation } from '@inth/sdk/engine';
import {
	createPolicyRuleFingerprints,
	normalizePolicyRule,
	writePolicyResolutionWire,
} from '@inth/sdk/schema/types';
import type { InitOutput } from '@inth/sdk/schema/types';
import { afterEach, describe, expect, onTestFinished, test, vi } from 'vite-plus/test';
import { createApp, h } from 'vue';
import type { Component } from 'vue';

import { completeGVL } from '../../../iab/src/__tests__/fixtures/gvl-sample';
import { createIAB } from '../../../iab/src/index';
import IABConsentDialog from '../runtime/components/iab-panel.vue';
import IABConsentBanner from '../runtime/components/iab-prompt.vue';
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

const policy = normalizePolicyRule({
	id: 'iab-scroll-lock',
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

interface Case {
	config?: { scrollLock?: boolean; trapFocus?: boolean };
	props?: { scrollLock?: boolean; trapFocus?: boolean };
	presentation?: ConsentPresentation;
}

afterEach(() => {
	localStorage.clear();
});

const mountSurface = async (
	surface: 'banner' | 'dialog',
	{ config: options, presentation, props }: Case
) => {
	const config = {
		customFetch: (() =>
			Promise.resolve(Response.json({ ok: true }))) as unknown as typeof fetch,
		disableAnimation: true,
		hideBranding: true,
		// IAB is opt-in; these surfaces stand for an app that turned it on.
		iab: {},
		presentation,
		projectUrl: 'https://consent.test',
		...options,
	} as ConsentConfig;
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
	context.kernel.set.activeUI(surface);
	const container = document.createElement('div');
	document.body.append(container);
	onTestFinished(() => container.remove());
	const Surface = (
		surface === 'banner' ? IABConsentBanner : IABConsentDialog
	) as Component;
	const app = createApp({ render: () => h(Surface, props ?? {}) });
	app.provide(consentConfigKey, config);
	app.provide(symbolKernelContext, context);
	app.provide(symbolKernel, context.kernel);
	app.provide(symbolSnapshot, context.snapshot);
	app.provide(symbolInit, context.init);
	app.provide(symbolActiveUI, context.activeUI);
	app.provide(symbolConsent, context.storedConsent);
	app.mount(container);
	onTestFinished(() => app.unmount());
	const card = () =>
		document.querySelector<HTMLElement>(
			`[data-testid="iab-consent-${surface}-card"]`
		);
	await vi.waitFor(() => expect(card()).not.toBeNull());
	return {
		blocking: () => ({
			modal: card()?.getAttribute('aria-modal') === 'true',
			overlay: Boolean(
				document.querySelector(
					`[data-testid="iab-consent-${surface}-overlay"]`
				)
			),
			scrollLocked: document.body.style.overflow === 'hidden',
		}),
	};
};

const blocked = { modal: true, overlay: true, scrollLocked: true };
const notBlocked = { modal: false, overlay: false, scrollLocked: false };

describe('IABConsentBanner scroll lock', () => {
	test.each<[string, Case, typeof blocked]>([
		['the presentation default', {}, notBlocked],
		['config scrollLock: true', { config: { scrollLock: true } }, blocked],
		['prop scrollLock: true', { props: { scrollLock: true } }, blocked],
		[
			'prop scrollLock: false over config scrollLock: true',
			{ config: { scrollLock: true }, props: { scrollLock: false } },
			notBlocked,
		],
		[
			'config trapFocus: false over config scrollLock: true',
			{ config: { scrollLock: true, trapFocus: false } },
			notBlocked,
		],
		[
			'presentation blockUntilChoice: false over prop scrollLock: true',
			{
				presentation: { prompt: { blockUntilChoice: false } },
				props: { scrollLock: true, trapFocus: true },
			},
			notBlocked,
		],
		[
			'presentation blockUntilChoice: true over prop scrollLock: false',
			{
				presentation: { prompt: { blockUntilChoice: true } },
				props: { scrollLock: false, trapFocus: false },
			},
			blocked,
		],
	])('%s', async (_name, value, expected) => {
		const { blocking } = await mountSurface('banner', value);
		await vi.waitFor(() => expect(blocking()).toEqual(expected));
	});
});

describe('IABConsentDialog scroll lock', () => {
	test.each<[string, Case, typeof blocked]>([
		['the presentation default', {}, blocked],
		['config scrollLock: false', { config: { scrollLock: false } }, notBlocked],
		['prop scrollLock: false', { props: { scrollLock: false } }, notBlocked],
		[
			'prop scrollLock: true over config scrollLock: false',
			{ config: { scrollLock: false }, props: { scrollLock: true } },
			blocked,
		],
		[
			'presentation blocking: true over prop scrollLock: false',
			{
				presentation: { preferences: { blocking: true } },
				props: { scrollLock: false, trapFocus: false },
			},
			blocked,
		],
	])('%s', async (_name, value, expected) => {
		const { blocking } = await mountSurface('dialog', value);
		await vi.waitFor(() => expect(blocking()).toEqual(expected));
	});
});
