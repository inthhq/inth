/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vite-plus/test';

import { npmAndRemote } from './__tests__/remote-path';
import {
	ALL_DENIED,
	installHeadProbe,
	loadScripts,
	registerVendorContractCleanup,
	settleScripts,
} from './e2e-test-utils';
import type { TestWindow } from './e2e-test-utils';
import { crisp } from './vendors/functional/crisp';
import { INTERCOM_API_BASES, intercom } from './vendors/functional/intercom';

const grantedFunctionalityConsents = {
	...ALL_DENIED,
	functionality: true,
};

const deepFreeze = function deepFreeze<ValueType>(value: ValueType): ValueType {
	if (value === null || typeof value !== 'object') {
		return value;
	}

	for (const nestedValue of Object.values(value as Record<string, unknown>)) {
		deepFreeze(nestedValue);
	}

	return Object.freeze(value);
};

const cloneFrozen = function cloneFrozen<ValueType>(
	value: ValueType
): ValueType {
	return deepFreeze(structuredClone(value));
};

describe('functional vendor contracts', () => {
	registerVendorContractCleanup();

	it('boots Crisp globals and safe-mode queue before append', () => {
		let crispQueue: unknown[][] | undefined;
		let globals:
			| Pick<
					TestWindow,
					| 'CRISP_COOKIE_DOMAIN'
					| 'CRISP_COOKIE_EXPIRE'
					| 'CRISP_RUNTIME_CONFIG'
					| 'CRISP_TOKEN_ID'
					| 'CRISP_WEBSITE_ID'
			  >
			| undefined;
		let scriptSrc: string | undefined;

		installHeadProbe((node, win) => {
			if (!node.src.includes('client.crisp.chat/l.js')) {
				return;
			}

			scriptSrc = node.src;
			crispQueue = win.$crisp?.map((entry) => [...entry]);
			globals = {
				CRISP_COOKIE_DOMAIN: win.CRISP_COOKIE_DOMAIN,
				CRISP_COOKIE_EXPIRE: win.CRISP_COOKIE_EXPIRE,
				CRISP_RUNTIME_CONFIG: win.CRISP_RUNTIME_CONFIG,
				CRISP_TOKEN_ID: win.CRISP_TOKEN_ID,
				CRISP_WEBSITE_ID: win.CRISP_WEBSITE_ID,
			};
			node.dispatchEvent(new Event('load'));
		});

		loadScripts(
			[
				{
					...crisp({
						cookieDomain: 'example.com',
						cookieExpiry: 3600,
						locale: 'en',
						safeMode: true,
						sessionMerge: true,
						tokenId: 'CRISP-TOKEN',
						websiteId: 'CRISP-CONTRACT',
					}),
					id: 'crisp-contract',
				},
			],
			grantedFunctionalityConsents
		);

		expect(scriptSrc).toContain('/l.js');
		expect(globals).toEqual({
			CRISP_COOKIE_DOMAIN: 'example.com',
			CRISP_COOKIE_EXPIRE: 3600,
			CRISP_RUNTIME_CONFIG: {
				locale: 'en',
				session_merge: true,
			},
			CRISP_TOKEN_ID: 'CRISP-TOKEN',
			CRISP_WEBSITE_ID: 'CRISP-CONTRACT',
		});
		expect(crispQueue).toEqual([['safe', true]]);
	});

	it('boots Intercom settings and queue before append', () => {
		let queueSnapshot: unknown[][] | undefined;
		let settingsSnapshot: Record<string, unknown> | undefined;
		let scriptSrc: string | undefined;

		installHeadProbe((node, win) => {
			if (!node.src.includes('widget.intercom.io/widget/INTERCOM-CONTRACT')) {
				return;
			}

			win.Intercom?.('boot', { app_id: 'INTERCOM-CONTRACT' });
			if (win.Intercom?.q) {
				queueSnapshot = cloneFrozen(win.Intercom.q);
			} else {
				queueSnapshot = undefined;
			}
			if (win.intercomSettings) {
				settingsSnapshot = cloneFrozen(win.intercomSettings);
			} else {
				settingsSnapshot = undefined;
			}
			scriptSrc = node.src;
			node.dispatchEvent(new Event('load'));
		});

		loadScripts(
			[
				{
					...intercom({
						apiBase: INTERCOM_API_BASES.eu,
						appId: 'INTERCOM-CONTRACT',
						settings: {
							hide_default_launcher: true,
							user_id: 'user-123',
						},
					}),
					id: 'intercom-contract',
				},
			],
			grantedFunctionalityConsents
		);

		expect(scriptSrc).toContain('/widget/INTERCOM-CONTRACT');
		expect(settingsSnapshot).toEqual({
			api_base: INTERCOM_API_BASES.eu,
			app_id: 'INTERCOM-CONTRACT',
			hide_default_launcher: true,
			user_id: 'user-123',
		});
		expect(queueSnapshot).toEqual([['boot', { app_id: 'INTERCOM-CONTRACT' }]]);
	});
});

const CRISP_WEBSITE_ID = '6a3c2f1e-8b4d-4c7a-9e5f-0d1b2c3a4e5f';

describe.each(npmAndRemote('crisp', crisp))(
	'Crisp contract through the %s',
	(_label, build) => {
		registerVendorContractCleanup();

		it('boots the site settings and safe-mode queue before append', async () => {
			let crispQueue: unknown[][] | undefined;
			let globals: Partial<TestWindow> | undefined;

			installHeadProbe((node, win) => {
				if (node.src !== 'https://client.crisp.chat/l.js') {
					return;
				}

				crispQueue = win.$crisp?.map((entry) => [...entry]);
				globals = {
					CRISP_COOKIE_DOMAIN: win.CRISP_COOKIE_DOMAIN,
					CRISP_COOKIE_EXPIRE: win.CRISP_COOKIE_EXPIRE,
					CRISP_RUNTIME_CONFIG: win.CRISP_RUNTIME_CONFIG,
					CRISP_TOKEN_ID: win.CRISP_TOKEN_ID,
					CRISP_WEBSITE_ID: win.CRISP_WEBSITE_ID,
				};
				node.dispatchEvent(new Event('load'));
			});

			loadScripts(
				[
					build({
						cookieDomain: 'example.com',
						cookieExpiry: 3600,
						locale: 'en',
						safeMode: true,
						websiteId: CRISP_WEBSITE_ID,
					}),
				],
				grantedFunctionalityConsents
			);
			await settleScripts();

			expect(globals).toEqual({
				CRISP_COOKIE_DOMAIN: 'example.com',
				CRISP_COOKIE_EXPIRE: 3600,
				CRISP_RUNTIME_CONFIG: { locale: 'en' },
				CRISP_TOKEN_ID: undefined,
				CRISP_WEBSITE_ID,
			});
			expect(crispQueue).toEqual([['safe', true]]);
		});

		it('sets no optional globals or queue entries for a bare website ID', async () => {
			let crispQueue: unknown[][] | undefined;
			let runtimeConfig: unknown = 'not read';

			installHeadProbe((node, win) => {
				if (node.src === 'https://client.crisp.chat/l.js') {
					crispQueue = win.$crisp?.map((entry) => [...entry]);
					runtimeConfig = win.CRISP_RUNTIME_CONFIG;
				}
			});

			loadScripts(
				[build({ websiteId: CRISP_WEBSITE_ID })],
				grantedFunctionalityConsents
			);
			await settleScripts();

			expect(crispQueue).toEqual([]);
			expect(runtimeConfig).toBeUndefined();
		});

		it('waits for functionality consent before append', async () => {
			let appended = false;
			installHeadProbe((node) => {
				if (node.src === 'https://client.crisp.chat/l.js') {
					appended = true;
				}
			});

			loadScripts([build({ websiteId: CRISP_WEBSITE_ID })], ALL_DENIED);
			await settleScripts();

			expect(appended).toBe(false);
		});
	}
);

describe.each(npmAndRemote('intercom', intercom))(
	'Intercom contract through the %s',
	(_label, build) => {
		registerVendorContractCleanup();

		it('boots the regional settings and queue before append', async () => {
			let queueSnapshot: unknown[][] | undefined;
			let settingsSnapshot: Record<string, unknown> | undefined;

			installHeadProbe((node, win) => {
				if (node.src !== 'https://widget.intercom.io/widget/abc12345') {
					return;
				}

				win.Intercom?.('boot', { app_id: 'abc12345' });
				queueSnapshot = cloneFrozen(win.Intercom?.q);
				settingsSnapshot = cloneFrozen(win.intercomSettings);
				node.dispatchEvent(new Event('load'));
			});

			loadScripts(
				[build({ appId: 'abc12345', region: 'eu' })],
				grantedFunctionalityConsents
			);
			await settleScripts();

			expect(settingsSnapshot).toEqual({
				api_base: INTERCOM_API_BASES.eu,
				app_id: 'abc12345',
			});
			expect(queueSnapshot).toEqual([['boot', { app_id: 'abc12345' }]]);
		});

		it('waits for functionality consent before append', async () => {
			let appended = false;
			installHeadProbe((node) => {
				if (node.src.startsWith('https://widget.intercom.io/')) {
					appended = true;
				}
			});

			loadScripts([build({ appId: 'abc12345' })], ALL_DENIED);
			await settleScripts();

			expect(appended).toBe(false);
			expect(window.intercomSettings).toBeUndefined();
		});
	}
);
