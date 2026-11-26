/**
 * @vitest-environment jsdom
 */
import type { Script } from '@inth/sdk/engine';
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from 'vite-plus/test';

import { fromRemote } from './__tests__/remote-path';
import {
	ALL_DENIED,
	grantedMeasurementConsents,
	loadScripts,
	updateScripts,
	registerVendorContractCleanup,
	settleScripts,
} from './e2e-test-utils';
import { defaultComPixel } from './vendors/analytics/default-com';
import type * as DefaultCom from './vendors/analytics/default-com';

/** The helpers of a fresh page: each test starts without a page claim. */
let fresh: typeof DefaultCom;

describe('Default core loader consent contract', () => {
	registerVendorContractCleanup();
	afterEach(() => {
		for (const key of ['__defaultPixel__', 'DefaultPixelSDK']) {
			Reflect.deleteProperty(window, key);
		}
	});
	it('creates no vendor globals, requests or storage before mapped consent', () => {
		const scripts = [defaultComPixel({ publicKey: 'inthfake' })];
		loadScripts(scripts, ALL_DENIED);
		updateScripts(scripts, { ...ALL_DENIED, marketing: true });
		expect(document.querySelector('script')).toBeNull();
		for (const key of ['__defaultPixel__', 'DefaultPixelSDK']) {
			expect(key in window).toBe(false);
		}
		expect(document.cookie).toBe('');
		updateScripts(scripts, grantedMeasurementConsents);
		const element = document.querySelector('script');
		expect(element?.src).toBe('https://handshake.default.com/index.js');
		element?.dispatchEvent(new Event('load'));
		updateScripts(scripts, grantedMeasurementConsents);
		expect(document.querySelectorAll('script')).toHaveLength(1);
	});
	it('retains one loader across in-flight revoke and regrant', () => {
		const scripts = [defaultComPixel({ publicKey: 'inthfake' })];
		loadScripts(scripts, grantedMeasurementConsents);
		const old = document.querySelector('script');
		updateScripts(scripts, ALL_DENIED);
		expect(old?.isConnected).toBe(true);
		old?.dispatchEvent(new Event('load'));
		expect(document.querySelector('script')).toBe(old);
		updateScripts(scripts, grantedMeasurementConsents);
		const current = document.querySelector('script');
		expect(current).toBe(old);
		current?.dispatchEvent(new Event('load'));
		updateScripts(scripts, grantedMeasurementConsents);
		expect(document.querySelectorAll('script')).toHaveLength(1);
	});
});

describe.each([
	[
		'npm helper',
		{
			forms: () =>
				fresh.defaultComFormsSdk({
					autoDisplayScheduler: false,
					publicKey: 'inthfake',
				}),
			pixel: () =>
				fresh.defaultComPixel({
					loadMode: 'always',
					publicKey: 'inthfake',
					schedulerOrigins: ['https://meet.example.com'],
				}),
		},
	],
	[
		'remote manifest',
		{
			forms: () =>
				fromRemote('defaultComPixel', {
					autoDisplayScheduler: 'off',
					product: 'forms',
					publicKey: 'inthfake',
				}),
			pixel: () =>
				fromRemote('defaultComPixel', {
					loadMode: 'always',
					publicKey: 'inthfake',
					schedulerDomains: ['meet.example.com'],
				}),
		},
	],
] as const satisfies readonly (readonly [
	string,
	Record<'forms' | 'pixel', () => Script>,
])[])('Default dashboard settings through the %s', (_label, build) => {
	registerVendorContractCleanup();
	beforeEach(async () => {
		vi.resetModules();
		fresh = await import('./vendors/analytics/default-com');
	});
	afterEach(() => {
		for (const key of ['__defaultPixel__', 'DefaultPixelSDK']) {
			Reflect.deleteProperty(window, key);
		}
	});

	it('loads the Pixel before consent with loadMode always, and queues the mapped consent', async () => {
		const scripts = [build.pixel()];
		loadScripts(scripts, ALL_DENIED);
		await settleScripts();

		expect(document.querySelector('script')?.src).toBe(
			'https://handshake.default.com/index.js'
		);
		expect(window.__defaultPixel__).toMatchObject({
			key: 'inthfake',
			q: [['setConsent', { analytics: false, marketing: false }]],
			schedulerOrigins: ['https://meet.example.com'],
		});
		updateScripts(scripts, {
			...grantedMeasurementConsents,
			marketing: true,
		});
		expect(window.__defaultPixel__?.q?.at(-1)).toEqual([
			'setConsent',
			{ analytics: true, marketing: true },
		]);
	});

	it('starts the Forms SDK once functionality is allowed, consent first', async () => {
		const scripts = [build.forms()];
		loadScripts(scripts, ALL_DENIED);
		await settleScripts();
		expect(document.querySelector('script')).toBeNull();

		updateScripts(scripts, { ...ALL_DENIED, functionality: true });
		const element = document.querySelector('script');
		expect(element?.src).toBe('https://handshake.default.com/sdk.js');
		const calls: unknown[][] = [];
		Object.assign(window, {
			DefaultPixelSDK: {
				init: vi.fn((options: unknown) => calls.push(['init', options])),
				setConsent: vi.fn((consent: unknown) =>
					calls.push(['setConsent', consent])
				),
			},
		});
		element?.dispatchEvent(new Event('load'));

		expect(calls).toEqual([
			['setConsent', { analytics: false, marketing: false }],
			[
				'init',
				{
					autoDisplayScheduler: false,
					publicKey: 'inthfake',
					schedulerOrigins: undefined,
				},
			],
		]);
	});
});

describe('Default from npm and from the Inth server on one page', () => {
	registerVendorContractCleanup();
	beforeEach(async () => {
		vi.resetModules();
		fresh = await import('./vendors/analytics/default-com');
	});
	afterEach(() => {
		for (const key of ['__defaultPixel__', 'DefaultPixelSDK']) {
			Reflect.deleteProperty(window, key);
		}
	});

	it('blocks the Forms SDK the server lists once the npm Pixel claimed the page', async () => {
		const error = vi
			.spyOn(console, 'error')
			.mockImplementation(() => undefined);
		const scripts = [
			fresh.defaultComPixel({ publicKey: 'inthfake' }),
			fromRemote('defaultComPixel', {
				product: 'forms',
				publicKey: 'inthfake',
			}),
		];
		loadScripts(scripts, ALL_DENIED);
		await settleScripts();
		updateScripts(scripts, {
			...grantedMeasurementConsents,
			functionality: true,
		});

		const sources = [...document.querySelectorAll('script')].map((element) =>
			element.getAttribute('src')
		);
		expect(sources).toEqual(['https://handshake.default.com/index.js', null]);
		expect(error).toHaveBeenCalledWith(
			'defaultComFormsSdk: conflicting Default installation. Use one Default helper per page. The conflicting loader will not run.'
		);
	});
});
