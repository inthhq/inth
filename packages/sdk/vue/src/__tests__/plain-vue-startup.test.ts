import { afterEach, expect, test, vi } from 'vite-plus/test';
import { createApp, defineComponent, h, inject, onMounted } from 'vue';

import { inth, manifest } from '../index';
import { symbolKernel } from '../runtime/utils/consent-symbols.model';
import type { RuntimeConsentConfig } from '../runtime/vue-consent-kernel-context.model';

const cleanups: (() => void)[] = [];

afterEach(() => {
	for (const cleanup of cleanups.splice(0)) {
		cleanup();
	}
	vi.unstubAllGlobals();
});

test.each([false, true])(
	'starts once and cleans up with an exposed root: %s',
	async (exposeRoot) => {
		const fetch = vi.fn(() =>
			Promise.resolve(new Response('{}', { status: 503 }))
		);
		vi.stubGlobal('fetch', fetch);
		const lifecycle = { dispose: vi.fn(), init: vi.fn() };
		const child = defineComponent({
			setup() {
				return () => h('p', 'Nested component');
			},
		});
		const root = defineComponent({
			setup(_props, { expose }) {
				// The compiler calls expose() for a closed <script setup> component.
				if (exposeRoot) {
					expose();
				}
				const kernel = inject(symbolKernel);
				if (!kernel) {
					throw new Error('Missing consent kernel');
				}
				const { init } = kernel.commands;
				vi.spyOn(kernel.commands, 'init').mockImplementation((...args) => {
					lifecycle.init();
					return init(...args);
				});
				const { dispose } = kernel;
				vi.spyOn(kernel, 'dispose').mockImplementation(() => {
					lifecycle.dispose();
					dispose();
				});
				return () => h('main', [h(child), h(child)]);
			},
		});
		const container = document.createElement('div');
		document.body.append(container);
		const app = createApp(root);
		app.use(inth, {
			projectUrl: 'https://consent.example.test',
		});
		let mounted = false;
		cleanups.push(() => {
			if (mounted) {
				app.unmount();
			}
			container.remove();
		});
		app.mount(container);
		mounted = true;
		expect(lifecycle.init).toHaveBeenCalledTimes(1);
		await expect.poll(() => fetch.mock.calls.length).toBe(1);
		expect(lifecycle.dispose).not.toHaveBeenCalled();
		app.unmount();
		mounted = false;
		expect(lifecycle.dispose).toHaveBeenCalledTimes(1);
	}
);

test("manifest() without a build snapshot reads the backend's /v1/consent/manifest", async () => {
	const fetch = vi.fn((_input: RequestInfo | URL) =>
		Promise.resolve(new Response('{}', { status: 503 }))
	);
	vi.stubGlobal('fetch', fetch);
	const container = document.createElement('div');
	document.body.append(container);
	const app = createApp(defineComponent({ setup: () => () => h('main') }));
	app.use(inth, {
		mode: manifest({ projectUrl: 'https://consent.example.test/api/' }),
	});
	app.mount(container);
	cleanups.push(() => {
		app.unmount();
		container.remove();
	});
	await expect.poll(() => fetch.mock.calls.length).toBeGreaterThan(0);
	expect(String(fetch.mock.calls[0]?.[0])).toBe(
		'https://consent.example.test/api/v1/consent/manifest'
	);
});

test('holds tracker requests from child mount hooks until the blocker decides them', async () => {
	vi.spyOn(console, 'warn').mockImplementation(() => {});
	const network = vi.fn((_input: RequestInfo | URL) =>
		Promise.resolve(new Response('{}', { status: 503 }))
	);
	vi.stubGlobal('fetch', network);
	const statuses: Promise<number>[] = [];
	// Children mount before the root, and the root's mount installs the blocker.
	const child = defineComponent({
		setup() {
			onMounted(() => {
				statuses.push(
					window
						.fetch('https://tracker.example/collect')
						.then(({ status }) => status)
				);
			});
			return () => h('p', 'Tracker');
		},
	});
	const container = document.createElement('div');
	document.body.append(container);
	const app = createApp(
		defineComponent({ setup: () => () => h('main', [h(child)]) })
	);
	const config: RuntimeConsentConfig = {
		networkBlocker: {
			logBlockedRequests: false,
			rules: [{ category: 'measurement', domain: 'tracker.example' }],
		},
	};
	app.use(inth, {
		...config,
		projectUrl: 'https://consent.example.test',
	});
	cleanups.push(() => {
		app.unmount();
		container.remove();
	});
	app.mount(container);

	expect(await Promise.all(statuses)).toEqual([451]);
	expect(
		network.mock.calls.some(([input]) =>
			String(input).includes('tracker.example')
		)
	).toBe(false);
});

test('manifest() with a manifestUrl asks the backend /init when the manifest is unavailable', async () => {
	const requests: string[] = [];
	const network = vi.fn((input: RequestInfo | URL) => {
		requests.push(String(input));
		return Promise.resolve(new Response('{}', { status: 503 }));
	});
	vi.stubGlobal('fetch', network);
	const container = document.createElement('div');
	document.body.append(container);
	const app = createApp(defineComponent({ setup: () => () => h('main') }));
	// Plain Vue has no Nuxt server, so there is no `/api/inth/init` to call.
	app.use(inth, {
		mode: manifest({
			manifestUrl: 'https://cdn.example.test/v1/consent/manifest',
		}),
	});
	cleanups.push(() => {
		app.unmount();
		container.remove();
	});
	app.mount(container);

	await expect
		.poll(() => requests)
		.toContain('https://cdn.example.test/v1/consent/manifest');
	// No Nuxt route: the fallback goes to the backend the manifest URL names.
	await expect
		.poll(() => requests.map((url) => url.split('?')[0]))
		.toContain('https://cdn.example.test/v1/consent/init');
	expect(requests.some((url) => url.includes('/api/inth'))).toBe(false);
});
