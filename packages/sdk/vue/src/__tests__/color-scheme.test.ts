import { createConsentRuntime } from '@inth/sdk/runtime';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import {
	createApp,
	createSSRApp,
	defineComponent,
	h,
	reactive,
	toValue,
} from 'vue';
import type { App } from 'vue';

import { inthVue, generateTokensCSS } from './test-plugin';
import type { InthVuePluginOptions } from './test-plugin';

const nuxt = vi.hoisted(() => ({
	appConfig: {} as Record<string, unknown>,
	head: [] as unknown[],
	/** A reactive app config, as Nuxt's is; read instead of `appConfig`. */
	liveAppConfig: undefined as { inth: Record<string, unknown> } | undefined,
	runtimeConfig: {} as Record<string, unknown>,
	state: new Map<string, unknown>(),
}));
// oxlint-disable-next-line anti-slop/no-module-mocking -- Nuxt supplies this virtual module; the test records what the plugin hands to useHead.
vi.mock('#imports', async () => {
	const { shallowRef: makeRef } = await import('vue');
	return {
		defineNuxtPlugin: (plugin: unknown) => plugin,
		useAppConfig: () => nuxt.liveAppConfig ?? { inth: nuxt.appConfig },
		useHead: (input: unknown) => {
			nuxt.head.push(input);
		},
		useRequestEvent: () => undefined,
		useRequestHeaders: () => ({}),
		useRequestURL: () => new URL('https://app.example/'),
		useRuntimeConfig: () => ({
			public: {
				inth: {
					backendURL: 'https://consent.example.test',
					...nuxt.runtimeConfig,
				},
			},
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
	payload: { prerenderedAt?: number; serverRendered?: boolean };
	vueApp: App;
}) => Promise<void>;

let plugin: NuxtPlugin;
beforeAll(async () => {
	({ default: plugin } = await vi.importActual<{ default: NuxtPlugin }>(
		'../runtime/plugin.nuxt'
	));
}, 30_000);

const root = () => document.documentElement;
const isDark = () => root().classList.contains('inth-dark');

/** A `prefers-color-scheme: dark` query the test can flip. */
const stubSystemScheme = (dark: boolean) => {
	const listeners = new Set<(event: { matches: boolean }) => void>();
	const query = {
		addEventListener: (_type: string, listener: never) => {
			listeners.add(listener);
		},
		matches: dark,
		removeEventListener: (_type: string, listener: never) => {
			listeners.delete(listener);
		},
	};
	vi.stubGlobal(
		'matchMedia',
		vi.fn(() => query)
	);
	return {
		listeners,
		set(next: boolean) {
			query.matches = next;
			for (const listener of listeners) {
				listener({ matches: next });
			}
		},
	};
};

const failingFetch = () =>
	vi.stubGlobal(
		'fetch',
		vi.fn(() => Promise.resolve(new Response('{}', { status: 503 })))
	);

const apps = new Set<App>();
const mounted = new Set<App>();

const mount = (app: App) => {
	const container = document.createElement('div');
	document.body.append(container);
	app.mount(container);
	mounted.add(app);
};

/** Install the plugin. The app is unmounted after the test. */
const installVue = (options: InthVuePluginOptions) => {
	failingFetch();
	const app = createApp(defineComponent({ setup: () => () => h('main') }));
	app.use(inthVue, options);
	apps.add(app);
	return app;
};

afterEach(() => {
	// Unmounting releases the listeners and observers the plugin started,
	// which would otherwise keep changing the class in later tests.
	for (const app of apps) {
		if (!mounted.has(app)) {
			mount(app);
		}
		app.unmount();
	}
	apps.clear();
	mounted.clear();
	vi.unstubAllGlobals();
	nuxt.appConfig = {};
	nuxt.liveAppConfig = undefined;
	nuxt.runtimeConfig = {};
	nuxt.head.length = 0;
	nuxt.state.clear();
	root().className = '';
	document.head.replaceChildren();
	document.body.replaceChildren();
});

describe('generateTokensCSS with dark tokens', () => {
	test('writes theme.dark colors under the dark selectors', () => {
		const css = generateTokensCSS(undefined, {
			theme: { dark: { primary: '#40e0d0' } },
		});
		expect(css).toMatch(/\.inth-dark[^{]*\{[^}]*--inth-primary: #40e0d0;/u);
	});

	test('switches to the dark tokens by media query for system', () => {
		const css = generateTokensCSS(undefined, { colorScheme: 'system' });
		expect(css).toMatch(
			/@media\(prefers-color-scheme:dark\)\{[^{]*\{[^}]*--inth-surface: hsl\(0, 0%, 7%\);/u
		);
	});

	test('puts the dark tokens on the root for dark', () => {
		const css = generateTokensCSS(undefined, {
			colorScheme: 'dark',
			theme: { dark: { primary: '#40e0d0' } },
		});
		expect(css).toMatch(/:root:root[^{]*\{[^}]*--inth-primary: #40e0d0;/u);
		expect(css).not.toContain('@media');
	});

	test.each([undefined, null] as const)(
		'ships the stock dark palette under the dark selectors when colorScheme is %s',
		(colorScheme) => {
			const css = generateTokensCSS(undefined, { colorScheme });
			// The selectors React and Svelte get from the package stylesheet.
			expect(css).toMatch(
				/:root\.inth-dark[^{]*\{[^}]*--inth-surface: hsl\(0, 0%, 7%\);/u
			);
			expect(css).toMatch(
				/:root\.dark[^{]*\{[^}]*--inth-text: hsl\(0, 0%, 93%\);/u
			);
			expect(css).not.toContain('@media');
		}
	);

	test('lets theme colors beat the stock dark palette', () => {
		const css = generateTokensCSS(undefined, {
			theme: { dark: { surface: '#101512' } },
		});
		expect(css.indexOf('--inth-surface: hsl(0, 0%, 7%);')).toBeLessThan(
			css.indexOf('--inth-surface: #101512;')
		);
		expect(css).toMatch(
			/:root:root\.inth-dark[^{]*\{[^}]*--inth-surface: #101512;/u
		);
	});
});

describe('the Vue plugin applies colorScheme', () => {
	test('dark adds inth-dark before the app mounts', () => {
		stubSystemScheme(false);
		installVue({ colorScheme: 'dark' });
		expect(isDark()).toBe(true);
	});

	test('light removes a inth-dark class', () => {
		stubSystemScheme(true);
		root().classList.add('inth-dark');
		installVue({ colorScheme: 'light' });
		expect(isDark()).toBe(false);
	});

	test('system follows prefers-color-scheme as it changes', () => {
		const system = stubSystemScheme(true);
		const app = installVue({ colorScheme: 'system' });
		expect(isDark()).toBe(true);

		system.set(false);
		expect(isDark()).toBe(false);

		mount(app);
		app.unmount();
		apps.delete(app);
		expect(system.listeners.size).toBe(0);
	});

	test('unset mirrors a .dark class on <html>', async () => {
		stubSystemScheme(false);
		root().classList.add('dark');
		installVue({});
		expect(isDark()).toBe(true);

		root().classList.remove('dark');
		// MutationObserver callbacks run as a microtask.
		await Promise.resolve();
		expect(isDark()).toBe(false);
	});

	test('null leaves the class to the site', () => {
		stubSystemScheme(true);
		root().classList.add('dark');
		installVue({ colorScheme: null });
		expect(isDark()).toBe(false);
	});

	test('sets the class without matchMedia', () => {
		vi.stubGlobal('matchMedia', undefined);
		installVue({ colorScheme: 'dark' });
		expect(isDark()).toBe(true);
	});

	test('adds dark tokens to the token style element', () => {
		stubSystemScheme(false);
		installVue({ theme: { dark: { primary: '#40e0d0' } } });
		expect(document.getElementById('inth-css-vars')?.textContent).toContain(
			'--inth-primary: #40e0d0;'
		);
	});

	test('leaves the class to the host that owns a borrowed runtime', () => {
		stubSystemScheme(true);
		const runtime = createConsentRuntime({
			pkg: '@c15t/vue-test',
			projectUrl: 'https://consent.example.test',
		});
		const app = createApp(defineComponent({ setup: () => () => h('main') }));
		app.use(inthVue, { colorScheme: 'dark', runtime });
		apps.add(app);
		expect(isDark()).toBe(false);
		runtime.dispose();
	});
});

interface NuxtHead {
	script?: { innerHTML: string; key: string; nonce?: string }[];
	style?: { id: string; innerHTML: string; nonce?: string }[];
}

const renderNuxtHead = async (): Promise<NuxtHead> => {
	const app = createSSRApp(defineComponent({ setup: () => () => h('main') }));
	vi.stubGlobal('window', undefined);
	await plugin({ hook: () => undefined, payload: {}, vueApp: app });
	vi.unstubAllGlobals();
	return toValue(nuxt.head[0]) as NuxtHead;
};

describe('the Nuxt plugin applies colorScheme', () => {
	test.each([
		{ colorScheme: 'dark', script: "classList.add('inth-dark')" },
		{ colorScheme: 'system', script: 'prefers-color-scheme:dark' },
	] as const)(
		'$colorScheme sets the class from a head script in the server HTML',
		async ({ colorScheme, script }) => {
			nuxt.appConfig = { colorScheme, nonce: 'head-nonce' };
			const head = await renderNuxtHead();
			expect(head.script).toEqual([
				expect.objectContaining({
					innerHTML: expect.stringContaining(script),
					nonce: 'head-nonce',
				}),
			]);
		}
	);

	test.each(['light', null, undefined] as const)(
		'%s adds no head script',
		async (colorScheme) => {
			nuxt.appConfig = { colorScheme };
			const head = await renderNuxtHead();
			expect(head.script ?? []).toEqual([]);
		}
	);

	test('renders theme.dark tokens in the server HTML', async () => {
		nuxt.appConfig = {
			colorScheme: 'system',
			theme: { dark: { primary: '#40e0d0' } },
		};
		const head = await renderNuxtHead();
		expect(head.style?.[0]?.innerHTML).toContain('--inth-primary: #40e0d0;');
	});

	test('null in app config leaves a .dark class alone', async () => {
		stubSystemScheme(false);
		root().classList.add('dark');
		nuxt.appConfig = { colorScheme: null };
		failingFetch();
		const app = createSSRApp(defineComponent({ setup: () => () => h('main') }));
		apps.add(app);
		await plugin({ hook: () => undefined, payload: {}, vueApp: app });
		expect(isDark()).toBe(false);
	});

	// A build delivers the module option `colorScheme: null` as `''`: Nitro
	// replaces every `null` in runtime config.
	test.each([
		{ colorScheme: null, label: 'null' },
		{ colorScheme: '', label: 'an empty string from a build' },
	])(
		'$label in the module options leaves the class to the site',
		async ({ colorScheme }) => {
			stubSystemScheme(false);
			root().classList.add('inth-dark');
			nuxt.runtimeConfig = { colorScheme };
			failingFetch();
			const app = createSSRApp(
				defineComponent({ setup: () => () => h('main') })
			);
			apps.add(app);
			await plugin({ hook: () => undefined, payload: {}, vueApp: app });
			expect(isDark()).toBe(true);
		}
	);

	test('an empty string from a build renders the head of null', async () => {
		nuxt.runtimeConfig = { colorScheme: null };
		const expected = await renderNuxtHead();
		nuxt.head.length = 0;
		nuxt.runtimeConfig = { colorScheme: '' };
		expect(await renderNuxtHead()).toEqual(expected);
	});

	test('applies the class in the browser', async () => {
		stubSystemScheme(false);
		nuxt.appConfig = { colorScheme: 'dark' };
		failingFetch();
		const app = createSSRApp(defineComponent({ setup: () => () => h('main') }));
		await plugin({ hook: () => undefined, payload: {}, vueApp: app });
		expect(isDark()).toBe(true);
	});
});

describe('the Nuxt plugin token styles in the browser', () => {
	const startClient = async (serverRendered: boolean) => {
		stubSystemScheme(false);
		failingFetch();
		const app = createSSRApp(defineComponent({ setup: () => () => h('main') }));
		apps.add(app);
		await plugin({
			hook: () => undefined,
			payload: { serverRendered },
			vueApp: app,
		});
		return () => toValue(nuxt.head[0]) as NuxtHead;
	};

	test('a page hydrating server HTML leaves the server element as it is', async () => {
		const head = await startClient(true);
		// The head leaves an element no entry names alone.
		expect(head().style).toEqual([]);
	});

	test('a page without server HTML has the tokens before it mounts', async () => {
		const head = await startClient(false);
		expect(head().style?.[0]).toEqual(
			expect.objectContaining({
				id: 'inth-css-vars',
				innerHTML: expect.stringContaining('--inth-primary:'),
			})
		);
	});

	test('a config change on a hydrated page writes the new tokens', async () => {
		nuxt.liveAppConfig = reactive({ inth: {} });
		const head = await startClient(true);
		nuxt.liveAppConfig.inth = { tokens: { 'inth-primary': '#2f6f4e' } };
		await vi.waitFor(() => {
			expect(head().style?.[0]?.innerHTML).toContain('--inth-primary:#2f6f4e;');
		});
	});
});
