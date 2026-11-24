/**
 * Wrapping the app in `InthProvider`, the way a React provider wraps it,
 * keeps the app: the root renders its default slot next to the consent
 * surfaces, in the browser and in the server HTML, and hydrates it.
 */
import type { InitOutput } from '@inth/sdk/schema/types';
import {
	resolvePolicyRules,
	writePolicyResolutionWire,
} from '@inth/sdk/schema/types';
import { hosted } from '@inth/sdk/transports';
import { flushPromises, mount } from '@vue/test-utils';
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	test,
	vi,
} from 'vite-plus/test';
import type { App, Component } from 'vue';
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';

import { inth } from '../index';
import InthProvider from '../runtime/components/inth-provider.vue';
import NuxtInthProvider from '../runtime/components/nuxt-inth-provider.vue';
import { consentConfigKey } from '../runtime/composables/config';
import type {
	RuntimeConsentConfig,
	VueConsentKernelContext,
} from '../runtime/kernel';
import { createVueConsentKernelContext } from '../runtime/kernel';
import {
	symbolActiveUI,
	symbolConsent,
	symbolInit,
	symbolKernel,
	symbolKernelContext,
	symbolSnapshot,
} from '../runtime/utils/symbols';

const initFixture: InitOutput = {
	branding: 'inth',
	location: { countryCode: 'DE', regionCode: null },
	policyResolution: writePolicyResolutionWire(
		resolvePolicyRules({
			countryCode: null,
			regionCode: null,
			rules: [
				{
					categories: ['measurement'],
					id: 'policy_gdpr',
					match: { fallback: true },
					model: 'opt-in',
					prompt: 'choice',
					scopeMode: 'strict',
				},
			],
		})
	),
	policySnapshotToken: 'token_gdpr',
	translations: {
		language: 'en',
		translations: {
			cookieBanner: {
				description: 'Pick how Inth may use cookies.',
				title: 'Cookie choices',
			},
		},
	},
} as InitOutput;

const mode = hosted({ projectUrl: 'https://consent.example' });

const config: RuntimeConsentConfig = {
	consentCategories: ['necessary', 'measurement'],
	showTrigger: false,
};

const banner = () =>
	document.querySelector('[data-testid="consent-banner-root"]');

const waitFor = async function waitFor(check: () => unknown) {
	for (let attempt = 0; attempt < 50 && !check(); attempt += 1) {
		// The surfaces arrive through dynamic imports.
		// oxlint-disable-next-line no-await-in-loop -- Polling in order.
		await flushPromises();
		// oxlint-disable-next-line no-await-in-loop -- Polling in order.
		await new Promise((resolve) => {
			setTimeout(resolve, 10);
		});
	}
	return check();
};

const page = () => [
	h('header', { 'data-testid': 'site-header' }, 'Header'),
	h('main', { 'data-testid': 'page' }, 'Page body'),
];

const provideContext = function provideContext(
	app: App,
	context: VueConsentKernelContext,
	runtimeConfig: RuntimeConsentConfig
) {
	app.provide(consentConfigKey, runtimeConfig);
	app.provide(symbolKernelContext, context);
	app.provide(symbolKernel, context.kernel);
	app.provide(symbolSnapshot, context.snapshot);
	app.provide(symbolInit, context.init);
	app.provide(symbolActiveUI, context.activeUI);
	app.provide(symbolConsent, context.storedConsent);
};

beforeEach(() => {
	vi.stubGlobal(
		'fetch',
		vi.fn(
			() =>
				new Response(JSON.stringify(initFixture), {
					headers: { 'content-type': 'application/json' },
					status: 200,
				})
		)
	);
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	document.body.innerHTML = '';
	window.localStorage.clear();
});

describe.each([
	['Vue InthProvider', InthProvider],
	['Nuxt InthProvider', NuxtInthProvider],
] as [string, Component][])('%s', (_name, Root) => {
	test('renders wrapped children next to the banner', async () => {
		const wrapper = mount(Root, {
			attachTo: document.body,
			global: { plugins: [[inth, { ...config, mode }]] },
			slots: { default: page },
		});
		try {
			expect(wrapper.find('[data-testid="site-header"]').exists()).toBe(true);
			expect(wrapper.find('[data-testid="page"]').text()).toBe('Page body');
			expect(await waitFor(banner)).toBeTruthy();
		} finally {
			wrapper.unmount();
		}
	});
});

describe('Nuxt InthProvider wrapping the app', () => {
	test('server-renders the children and hydrates them without mismatches', async () => {
		const runtimeConfig: RuntimeConsentConfig = config;
		const App = () => h(NuxtInthProvider, null, { default: page });

		const serverContext = createVueConsentKernelContext({
			config: runtimeConfig,
			mode,
			prefetch: initFixture,
		});
		let html: string;
		try {
			const serverApp = createSSRApp(App);
			provideContext(serverApp, serverContext, runtimeConfig);
			html = await renderToString(serverApp, {});
		} finally {
			serverContext.dispose();
		}
		expect(html).toContain('data-testid="consent-banner-root"');
		expect(html).toContain('Page body');

		const clientContext = createVueConsentKernelContext({
			config: runtimeConfig,
			mode,
			prefetch: initFixture,
		});
		const warnings: string[] = [];
		const errors = vi.spyOn(console, 'error').mockImplementation(() => {
			// Collected below.
		});
		const container = document.createElement('div');
		container.innerHTML = html;
		document.body.append(container);
		const header = container.querySelector('[data-testid="site-header"]');
		const clientApp = createSSRApp(App);
		clientApp.config.warnHandler = (message) => warnings.push(message);
		provideContext(clientApp, clientContext, runtimeConfig);
		try {
			clientApp.mount(container);
			await waitFor(() => false);

			// Hydration adopts the server nodes instead of replacing them.
			expect(container.querySelector('[data-testid="site-header"]')).toBe(
				header
			);
			expect(banner()).toBeTruthy();
			expect(warnings).toEqual([]);
			expect(errors).not.toHaveBeenCalled();
		} finally {
			clientApp.unmount();
			clientContext.dispose();
		}
	});
});
