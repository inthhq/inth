/** @vitest-environment jsdom */
import { createConsentKernel } from '@inth/sdk/engine';
import { createScriptLoader } from '@inth/sdk/modules/script-loader';
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from 'vite-plus/test';

import { npmAndRemote } from './__tests__/remote-path';
import {
	ALL_DENIED,
	loadScripts,
	registerVendorContractCleanup,
	settleScripts,
	updateScripts,
} from './e2e-test-utils';
import { pendo } from './vendors/analytics/pendo';

const GLOBALS = ['pendo'];
const granted = { ...ALL_DENIED, measurement: true };
const unrelated = { ...ALL_DENIED, marketing: true };
const getLoader = (): HTMLScriptElement => {
	const loader = document.querySelector<HTMLScriptElement>('script[src]');
	if (!loader) {
		throw new Error('Expected Pendo loader');
	}
	return loader;
};

describe('Pendo consent loader', () => {
	registerVendorContractCleanup();
	beforeEach(() => {
		// Node 25+ replaces jsdom's storage globals with its own Web Storage.
		vi.stubGlobal('localStorage', jsdom.window.localStorage);
		vi.stubGlobal('sessionStorage', jsdom.window.sessionStorage);
	});
	afterEach(() => {
		for (const name of GLOBALS) {
			Reflect.deleteProperty(window, name);
		}
		localStorage.clear();
		sessionStorage.clear();
		vi.unstubAllGlobals();
	});
	it('creates no vendor requests, globals or storage before mapped consent', () => {
		const scripts = [pendo({ apiKey: 'YOUR_API_KEY' })];
		const cookies = document.cookie;
		const local = { ...localStorage };
		const session = { ...sessionStorage };
		loadScripts(scripts, ALL_DENIED);
		updateScripts(scripts, unrelated);
		expect(document.querySelector('script[src]')).toBeNull();
		for (const name of GLOBALS) {
			expect(
				(window as unknown as Record<string, unknown>)[name]
			).toBeUndefined();
		}
		expect(document.cookie).toBe(cookies);
		expect({ ...localStorage }).toEqual(local);
		expect({ ...sessionStorage }).toEqual(session);
		updateScripts(scripts, granted);
		const first = getLoader();
		expect(first.src).toBe(
			'https://cdn.pendo.io/agent/static/YOUR_API_KEY/pendo.js'
		);
		updateScripts(scripts, granted);
		expect(getLoader()).toBe(first);
		updateScripts(scripts, ALL_DENIED);
		expect(first.isConnected).toBe(true);
		updateScripts(scripts, granted);
		expect(getLoader()).toBe(first);
		expect(document.querySelectorAll('script[src]')).toHaveLength(1);
	});
	it('honors an overridden category', () => {
		const scripts = [pendo({ apiKey: 'YOUR_API_KEY', category: 'experience' })];
		loadScripts(scripts, granted);
		expect(document.querySelector('script[src]')).toBeNull();
		updateScripts(scripts, { ...ALL_DENIED, experience: true });
		expect(getLoader()).toBeDefined();
	});
});

describe('Pendo event lifecycle', () => {
	registerVendorContractCleanup();
	afterEach(() => {
		delete window.pendo;
	});
	it('logs instead of throwing when the loader installs no Pendo API', async () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const scripts = [pendo({ apiKey: 'broken-key' })];
		loadScripts(scripts, granted);
		getLoader().dispatchEvent(new Event('load'));
		await Promise.resolve();
		updateScripts(scripts, ALL_DENIED);
		expect(error).toHaveBeenCalledTimes(2);
		expect(error).toHaveBeenCalledWith(
			'pendo: loader did not install the Pendo API'
		);
	});
	it('initializes once, preserves metadata and resumes the same identity', async () => {
		const create = () =>
			pendo({
				account: { id: 'account' },
				apiKey: 'lifecycle-key',
				initializeOptions: {
					disableCookies: true,
					visitor: { id: 'overridden' },
				},
				visitor: { id: 'visitor' },
			});
		loadScripts([create()], granted);
		const loader = getLoader();
		const runtime = {
			clearSession: vi.fn(),
			initialize: vi.fn(),
			startSendingEvents: vi.fn(),
			stopSendingEvents: vi.fn(),
		};
		window.pendo = runtime;
		loader.dispatchEvent(new Event('load'));
		await Promise.resolve();
		expect(runtime.initialize).toHaveBeenCalledWith({
			account: { id: 'account' },
			disableCookies: true,
			visitor: { id: 'visitor' },
		});
		updateScripts([create()], ALL_DENIED);
		expect(runtime.stopSendingEvents).toHaveBeenCalledTimes(1);
		updateScripts([create()], granted);
		await Promise.resolve();
		updateScripts([create()], granted);
		await Promise.resolve();
		expect(runtime.initialize).toHaveBeenCalledTimes(1);
		expect(runtime.startSendingEvents).toHaveBeenCalledTimes(1);
		expect(runtime.clearSession).not.toHaveBeenCalled();
		expect(getLoader()).toBe(loader);
	});
	it('stops sending events when the script is removed after it initialized', async () => {
		const scripts = [pendo({ apiKey: 'removed-key' })];
		loadScripts(scripts, granted);
		const runtime = {
			initialize: vi.fn(),
			startSendingEvents: vi.fn(),
			stopSendingEvents: vi.fn(),
		};
		window.pendo = runtime;
		getLoader().dispatchEvent(new Event('load'));
		await Promise.resolve();
		expect(runtime.initialize).toHaveBeenCalledOnce();

		updateScripts([], granted);

		expect(runtime.stopSendingEvents).toHaveBeenCalledOnce();
	});
	it('stops sending events when the visitor turns off only the vendor of a negated category', async () => {
		const kernel = createConsentKernel();
		await kernel.commands.save(ALL_DENIED, { vendors: { pendo: true } });
		const loader = createScriptLoader({
			kernel,
			scripts: [
				pendo({ apiKey: 'negated-key', category: { not: 'measurement' } }),
			],
		});
		try {
			const runtime = {
				initialize: vi.fn(),
				startSendingEvents: vi.fn(),
				stopSendingEvents: vi.fn(),
			};
			window.pendo = runtime;
			getLoader().dispatchEvent(new Event('load'));
			await Promise.resolve();
			expect(runtime.initialize).toHaveBeenCalledOnce();

			await kernel.commands.save(ALL_DENIED, { vendors: { pendo: false } });

			expect(runtime.stopSendingEvents).toHaveBeenCalledOnce();
		} finally {
			loader.dispose();
			kernel.dispose();
		}
	});
	it('keeps events stopped while another loader sharing the script denies measurement', async () => {
		// Sharing one script between loaders is npm-only; the remote form has
		// one registration per vendor.
		const firstKernel = createConsentKernel();
		const secondKernel = createConsentKernel();
		void firstKernel.commands.save(granted);
		void secondKernel.commands.save(granted);
		const first = createScriptLoader({
			kernel: firstKernel,
			scripts: [pendo({ apiKey: 'shared-key' })],
		});
		const second = createScriptLoader({
			kernel: secondKernel,
			scripts: [pendo({ apiKey: 'shared-key' })],
		});
		try {
			const runtime = {
				initialize: vi.fn(),
				startSendingEvents: vi.fn(),
				stopSendingEvents: vi.fn(),
			};
			window.pendo = runtime;
			getLoader().dispatchEvent(new Event('load'));
			await Promise.resolve();
			expect(runtime.initialize).toHaveBeenCalledOnce();

			void firstKernel.commands.save({ ...granted, measurement: false });
			expect(runtime.stopSendingEvents).toHaveBeenCalledOnce();
			void secondKernel.commands.save({ ...granted, marketing: true });
			await Promise.resolve();
			await Promise.resolve();

			expect(runtime.startSendingEvents).not.toHaveBeenCalled();
		} finally {
			first.dispose();
			second.dispose();
			firstKernel.dispose();
			secondKernel.dispose();
		}
	});
	it('keeps events stopped while another loader sharing the script denies a negated category', async () => {
		const category = { not: 'measurement' } as const;
		const firstKernel = createConsentKernel();
		const secondKernel = createConsentKernel();
		await firstKernel.commands.save(ALL_DENIED);
		await secondKernel.commands.save(ALL_DENIED);
		const first = createScriptLoader({
			kernel: firstKernel,
			scripts: [pendo({ apiKey: 'shared-negated-key', category })],
		});
		const second = createScriptLoader({
			kernel: secondKernel,
			scripts: [pendo({ apiKey: 'shared-negated-key', category })],
		});
		try {
			const runtime = {
				initialize: vi.fn(),
				startSendingEvents: vi.fn(),
				stopSendingEvents: vi.fn(),
			};
			window.pendo = runtime;
			getLoader().dispatchEvent(new Event('load'));
			await Promise.resolve();
			expect(runtime.initialize).toHaveBeenCalledOnce();

			await firstKernel.commands.save(granted);
			expect(runtime.stopSendingEvents).toHaveBeenCalledOnce();
			await secondKernel.commands.save(unrelated);
			await Promise.resolve();
			await Promise.resolve();

			expect(runtime.startSendingEvents).not.toHaveBeenCalled();
		} finally {
			first.dispose();
			second.dispose();
			firstKernel.dispose();
			secondKernel.dispose();
		}
	});
	it('does not initialize after in-flight withdrawal; first regrant initializes without changing identity', async () => {
		const scripts = [pendo({ apiKey: 'late-key' })];
		loadScripts(scripts, granted);
		const loader = getLoader();
		updateScripts(scripts, ALL_DENIED);
		const runtime = {
			initialize: vi.fn(),
			startSendingEvents: vi.fn(),
			stopSendingEvents: vi.fn(),
		};
		window.pendo = runtime;
		loader.dispatchEvent(new Event('load'));
		await Promise.resolve();
		expect(runtime.initialize).not.toHaveBeenCalled();
		expect(runtime.stopSendingEvents).toHaveBeenCalledTimes(1);
		updateScripts(scripts, granted);
		await Promise.resolve();
		expect(runtime.initialize).toHaveBeenCalledTimes(1);
		expect(runtime.startSendingEvents).toHaveBeenCalledTimes(1);
	});
	it('rechecks consent before queued activation and after initialization', async () => {
		const scripts = [pendo({ apiKey: 'race-key' })];
		loadScripts(scripts, granted);
		const loader = getLoader();
		const runtime = {
			initialize: vi.fn(() => {
				updateScripts(scripts, ALL_DENIED);
			}),
			startSendingEvents: vi.fn(),
			stopSendingEvents: vi.fn(),
		};
		window.pendo = runtime;
		loader.dispatchEvent(new Event('load'));
		updateScripts(scripts, ALL_DENIED);
		await Promise.resolve();
		expect(runtime.initialize).not.toHaveBeenCalled();
		updateScripts(scripts, granted);
		await Promise.resolve();
		await Promise.resolve();
		expect(runtime.initialize).toHaveBeenCalledTimes(1);
		expect(runtime.startSendingEvents).not.toHaveBeenCalled();
		expect(runtime.stopSendingEvents).toHaveBeenCalledTimes(2);
	});
});

describe.each(npmAndRemote('pendo', pendo))(
	'Pendo consent loader through the %s',
	(_label, build) => {
		registerVendorContractCleanup();
		afterEach(() => {
			delete window.pendo;
		});

		it('initializes once after consent, then stops and resumes events', async () => {
			const scripts = [build({ apiKey: 'dashboard-key' })];
			loadScripts(scripts, granted);
			await settleScripts();
			const loader = getLoader();
			expect(loader.src).toBe(
				'https://cdn.pendo.io/agent/static/dashboard-key/pendo.js'
			);
			const runtime = {
				initialize: vi.fn(),
				startSendingEvents: vi.fn(),
				stopSendingEvents: vi.fn(),
			};
			window.pendo = runtime;
			loader.dispatchEvent(new Event('load'));
			await Promise.resolve();
			expect(runtime.initialize).toHaveBeenCalledExactlyOnceWith({});

			updateScripts(scripts, ALL_DENIED);
			expect(runtime.stopSendingEvents).toHaveBeenCalledTimes(1);
			updateScripts(scripts, granted);
			updateScripts(scripts, ALL_DENIED);
			await Promise.resolve();
			expect(runtime.startSendingEvents).not.toHaveBeenCalled();
			updateScripts(scripts, granted);
			await Promise.resolve();
			expect(runtime.startSendingEvents).toHaveBeenCalledTimes(1);
			expect(runtime.initialize).toHaveBeenCalledTimes(1);
			expect(getLoader()).toBe(loader);
		});
	}
);
