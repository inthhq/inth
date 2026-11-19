/**
 * The Nuxt plugin adds an inline script to the end of `<body>` that starts
 * the vendor tags a visitor's consent already allows, before the page
 * hydrates. Nothing starts while the policy asks the visitor to choose, or
 * from HTML shared by every visitor.
 */
import { C15T_POLICY_CONTRACT_HEADER } from '@inth/sdk/engine';
import type { Script } from '@inth/sdk/engine';
import type { InitOutput, PolicyRule } from '@inth/sdk/schema/types';
import {
	resolvePolicyRules,
	writePolicyResolutionWire,
} from '@inth/sdk/schema/types';
import { translations } from '@inth/sdk/translations/en';
import { afterEach, expect, test, vi } from 'vitest';
import { createSSRApp, defineComponent, h } from 'vue';
import type { App, ShallowRef } from 'vue';
import { renderToString } from 'vue/server-renderer';

import { useConsentKernelContext } from '../runtime/composables/kernel';
import type { VueConsentKernelContext } from '../runtime/kernel';

const pixel: Script = {
	category: 'marketing',
	id: 'pixel',
	serverStart: () => ({ code: '' }),
	src: 'https://cdn.example.com/pixel.js',
};

const nuxt = vi.hoisted(() => ({
	appConfig: {} as Record<string, unknown>,
	heads: [] as unknown[],
	// What the module puts in `runtimeConfig.public.c15t` besides `mode`.
	publicConfig: {} as Record<string, unknown>,
	response: undefined as unknown,
	state: new Map<string, ShallowRef<unknown>>(),
}));
// oxlint-disable-next-line anti-slop/no-module-mocking -- Nuxt supplies this virtual module; the test records what the plugin puts in the head.
vi.mock('#imports', async () => {
	const { shallowRef: makeRef } = await import('vue');
	return {
		defineNuxtPlugin: (plugin: unknown) => plugin,
		useAppConfig: () => ({
			c15t: {
				consentCategories: ['necessary', 'marketing'],
				iframeBlocker: false,
				nonce: 'request-nonce',
				projectUrl: 'https://consent.example',
				scripts: [pixel],
				...nuxt.appConfig,
			},
		}),
		// The plugin sets the subject cookie on the server render.
		useCookie: () => ({ value: undefined }),
		useHead: (input: unknown) => {
			nuxt.heads.push(input);
		},
		useRequestEvent: () => ({ context: {} }),
		useRequestHeaders: () => ({ 'x-vercel-ip-country': 'US' }),
		useRequestURL: () => new URL('https://app.example/'),
		useRuntimeConfig: () => ({
			public: { c15t: { mode: { type: 'hosted' }, ...nuxt.publicConfig } },
		}),
		useState: (key: string, init: () => unknown) => {
			if (!nuxt.state.has(key)) {
				nuxt.state.set(key, makeRef(init()));
			}
			return nuxt.state.get(key);
		},
	};
});

type NuxtPlugin = (app: {
	hook: (name: string, callback: () => void) => void;
	payload: { prerenderedAt?: number };
	runWithContext: <Result>(callback: () => Result) => Result;
	vueApp: App;
}) => Promise<void>;

const initFor = (
	rule: PolicyRule,
	extra: Partial<InitOutput> = {}
): InitOutput => ({
	branding: 'c15t',
	location: { countryCode: 'US', regionCode: null },
	policyResolution: writePolicyResolutionWire(
		resolvePolicyRules({ countryCode: 'US', regionCode: null, rules: [rule] })
	),
	translations: { language: 'en', translations },
	...extra,
});

/** A US-style policy: marketing runs until the visitor opts out. */
const optOut: PolicyRule = {
	id: 'policy_us',
	match: { isDefault: true },
	model: 'opt-out',
	prompt: 'none',
};

let context!: VueConsentKernelContext;
const Probe = defineComponent({
	setup() {
		context = useConsentKernelContext();
		return () => h('div');
	},
});

/** The bodyClose scripts the server render put in the head. */
const renderStartScripts = async function renderStartScripts(
	rule: PolicyRule,
	payload: { prerenderedAt?: number } = {},
	init: Partial<InitOutput> = {}
) {
	nuxt.response = initFor(rule, init);
	const { default: plugin } = await vi.importActual<{ default: NuxtPlugin }>(
		'../runtime/plugin.nuxt'
	);
	const app = createSSRApp(Probe);
	vi.stubGlobal('window', undefined);
	vi.stubGlobal('document', undefined);
	vi.stubGlobal(
		'fetch',
		vi.fn(() =>
			Promise.resolve(
				new Response(JSON.stringify(nuxt.response), {
					headers: { [C15T_POLICY_CONTRACT_HEADER]: '1' },
				})
			)
		)
	);
	try {
		await plugin({
			hook: () => {
				throw new Error('Server must not start browser lifecycle');
			},
			payload,
			runWithContext: (run) => run(),
			vueApp: app,
		});
		await renderToString(app);
		context.dispose();
	} finally {
		vi.unstubAllGlobals();
	}
	return nuxt.heads.flatMap((head) => {
		const scripts = (head as { script?: unknown }).script;
		return Array.isArray(scripts)
			? (scripts as Record<string, string>[]).filter(
					(script) => script.tagPosition === 'bodyClose'
				)
			: [];
	});
};

afterEach(() => {
	vi.unstubAllGlobals();
	nuxt.appConfig = {};
	nuxt.heads = [];
	nuxt.publicConfig = {};
	nuxt.state.clear();
});

test('starts an allowed vendor tag from the end of the body, with the nonce', async () => {
	const [start, ...rest] = await renderStartScripts(optOut);

	expect(rest).toEqual([]);
	expect(start?.innerHTML).toContain(JSON.stringify(pixel.src));
	expect(start?.key).toBe('c15t-server-start');
	expect(start?.nonce).toBe('request-nonce');
});

test('starts nothing while the policy asks the visitor to choose', async () => {
	expect(await renderStartScripts({ ...optOut, prompt: 'choice' })).toEqual([]);
});

test('starts nothing from prerendered HTML', async () => {
	expect(await renderStartScripts(optOut, { prerenderedAt: 1 })).toEqual([]);
});

test('starts nothing when the app turns the server start off', async () => {
	nuxt.appConfig = { scriptLoader: { serverStart: false } };

	expect(await renderStartScripts(optOut)).toEqual([]);
});

test('starts an integration from the registry source init lists with experimentalScriptRegistry', async () => {
	const registrySrc = 'https://acme.inth.app/scripts/pixel@0123456789abcdef.js';
	const listed = {
		scriptRegistry: {
			sources: { pixel: { integrity: 'sha384-registry', src: registrySrc } },
		},
	};
	nuxt.appConfig = { scripts: [{ ...pixel, integration: 'pixel' }] };
	// The URL and attributes the start inserts the pixel's tag with.
	const started = async () => {
		const [start] = await renderStartScripts(optOut, {}, listed);
		nuxt.heads = [];
		return {
			...(/i\("pixel",(?<src>"[^"]+")(?:,\{"attributes":(?<attributes>\{[^}]*\}))?/u.exec(
				start?.innerHTML ?? ''
			)?.groups ?? {}),
		};
	};

	nuxt.publicConfig = {
		experimentalScriptRegistry: { requireSignatures: false },
	};
	expect(await started()).toEqual({
		attributes: '{"integrity":"sha384-registry","crossorigin":"anonymous"}',
		src: JSON.stringify(registrySrc),
	});

	nuxt.publicConfig = {};
	expect((await started()).src).toBe(JSON.stringify(pixel.src));
});
