import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import type { MockInstance } from 'vite-plus/test';

import type { ConsentClientOptions } from '../consent-client.model';
import { autoInit, createGlobal, installGlobal } from '../global';
import type { GlobalApi } from '../global';

type TestWindow = Window & {
	inth?: unknown;
};

const testWindow = window as TestWindow;

const scriptWith = function scriptWith(
	attributes: Record<string, string>
): HTMLScriptElement {
	const script = document.createElement('script');
	for (const [name, value] of Object.entries(attributes)) {
		script.setAttribute(name, value);
	}
	return script;
};

const installManual = function installManual(): {
	api: GlobalApi;
	currentScript: MockInstance<() => Document['currentScript']>;
	script: HTMLScriptElement;
} {
	const script = scriptWith({
		'data-categories': 'measurement',
		'data-color-scheme': 'dark',
		'data-country': 'DE',
		'data-manual': '',
		'data-project-url': 'https://original.c15t.dev',
	});
	document.body.append(script);
	const currentScript = vi
		.spyOn(document, 'currentScript', 'get')
		.mockReturnValue(script);
	const api = installGlobal(createGlobal({ pkg: '@inth/sdk' }));
	// Disabled clients still resolve their transport and options, without
	// issuing backend requests or mounting UI in these lifecycle tests.
	api.config({ enabled: false });
	expect(autoInit(api)).toBeNull();
	return { api, currentScript, script };
};

afterEach(() => {
	(testWindow.inth as GlobalApi | undefined)?.dispose?.();
	testWindow.inth = undefined;
	vi.restoreAllMocks();
	localStorage.clear();
	document.body.replaceChildren();
});

describe('manual initialization', () => {
	it.each(['inline script', 'event callback'])(
		'keeps the bundle tag configuration when init runs in a later %s',
		(context) => {
			const { api, currentScript } = installManual();
			currentScript.mockReturnValue(
				context === 'inline script'
					? scriptWith({
							'data-categories': 'marketing',
							'data-mode': 'offline',
							'data-project-url': 'https://unrelated.c15t.dev',
						})
					: null
			);

			const client = api.init();

			expect(client.mode).toBe('hosted');
			expect(client.options).toMatchObject({
				consentCategories: ['measurement'],
				overrides: { country: 'DE' },
				projectUrl: 'https://original.c15t.dev',
				ui: { colorScheme: 'dark' },
			});
		}
	);

	it('captures attributes before the bundle tag is changed and removed', () => {
		const { api, currentScript, script } = installManual();
		script.setAttribute('data-project-url', 'https://changed.c15t.dev');
		script.remove();
		currentScript.mockReturnValue(null);

		expect(api.init().options.projectUrl).toBe('https://original.c15t.dev');
	});

	it('layers queued config and explicit init options over the captured tag', () => {
		const queuedOptions: ConsentClientOptions = {
			consentCategories: ['marketing'],
			projectUrl: 'https://queued.c15t.dev',
			ui: { trigger: true },
		};
		testWindow.inth = [['config', queuedOptions]];
		const { api, currentScript } = installManual();
		api.config({ consentCategories: ['functionality'] });
		currentScript.mockReturnValue(null);

		const client = api.init({
			consentCategories: ['measurement', 'marketing'],
			projectUrl: 'https://explicit.c15t.dev',
		});

		expect(client.mode).toBe('hosted');
		expect(client.options).toMatchObject({
			consentCategories: ['measurement', 'marketing'],
			overrides: { country: 'DE' },
			projectUrl: 'https://explicit.c15t.dev',
			ui: { colorScheme: 'dark', trigger: true },
		});
	});

	it('keeps the first bundle tag configuration when a second bundle loads', () => {
		const { api, currentScript } = installManual();
		currentScript.mockReturnValue(
			scriptWith({
				'data-manual': '',
				'data-project-url': 'https://duplicate.c15t.dev',
			})
		);
		const duplicate = installGlobal(
			createGlobal({ pkg: '@inth/sdk/headless' })
		);
		expect(autoInit(duplicate)).toBeNull();
		currentScript.mockReturnValue(null);

		expect(duplicate).toBe(api);
		expect(duplicate.init().options.projectUrl).toBe(
			'https://original.c15t.dev'
		);
		expect(duplicate.init()).toBe(api.client);
	});

	it('retains queued defaults after dispose while init overrides stay per-client', () => {
		testWindow.inth = [
			[
				'config',
				{
					mode: 'hosted',
					projectUrl: 'https://queued.c15t.dev',
					ui: false,
				},
			],
		];
		const { api, currentScript } = installManual();
		currentScript.mockReturnValue(null);
		api.init({ projectUrl: 'https://first.c15t.dev' });
		api.dispose();

		const restored = api.init();
		expect(restored.options).toMatchObject({
			mode: 'hosted',
			projectUrl: 'https://queued.c15t.dev',
			ui: false,
		});
		api.dispose();

		const overridden = api.init({ projectUrl: 'https://explicit.c15t.dev' });
		expect(overridden.options).toMatchObject({
			mode: 'hosted',
			projectUrl: 'https://explicit.c15t.dev',
			ui: false,
		});
	});

	it('keeps the next initialization pending when a ready listener disposes', async () => {
		const { api, currentScript } = installManual();
		currentScript.mockReturnValue(null);
		document.addEventListener('inth:ready', () => api.dispose(), {
			once: true,
		});

		const first = api.init();
		expect(api.client).toBeNull();
		expect(first.started).toBe(false);
		const onNextInit = vi.fn();
		api.onInit(onNextInit);
		const onNextReady = vi.fn();
		const nextReady = api.ready().then(onNextReady);
		await Promise.resolve();

		expect(onNextInit).not.toHaveBeenCalled();
		expect(onNextReady).not.toHaveBeenCalled();
		const second = api.init();
		await nextReady;
		expect(second).not.toBe(first);
		expect(api.client).toBe(second);
		expect(onNextInit).toHaveBeenCalledExactlyOnceWith(second);
		expect(onNextReady).toHaveBeenCalledExactlyOnceWith(second.getSnapshot());
	});
});
