/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vite-plus/test';

import { npmAndRemote } from './__tests__/remote-path';
import {
	ALL_DENIED,
	grantedMarketingConsents,
	installHeadProbe,
	loadScripts,
	registerVendorContractCleanup,
	settleScripts,
	updateScripts,
} from './e2e-test-utils';
import type { TestWindow } from './e2e-test-utils';
import { microsoftUet } from './vendors/ads-and-pixels/microsoft-uet';

describe.each(npmAndRemote('microsoftUet', microsoftUet))(
	'microsoftUet contract through the %s',
	(_label, build) => {
		registerVendorContractCleanup();

		it('boots with constructor handoff and a consent-default push', async () => {
			const constructorArgs: Record<string, unknown>[] = [];
			const pushCalls: unknown[][] = [];

			installHeadProbe((node, win) => {
				if (!node.src.includes('bat.js')) {
					return;
				}

				win.UET = function UET(
					this: { push: (...args: unknown[]) => void },
					options
				) {
					constructorArgs.push(options);
					this.push = (...args: unknown[]) => {
						pushCalls.push(args);
					};
					return this;
				} as TestWindow['UET'];

				node.dispatchEvent(new Event('load'));
			});

			loadScripts(
				[
					{
						...build({ id: '343003931' }),
						id: 'microsoft-uet-contract',
					},
				],
				grantedMarketingConsents
			);
			await settleScripts();

			expect(constructorArgs).toHaveLength(1);
			expect(constructorArgs[0]).toMatchObject({
				enableAutoSpaTracking: true,
				q: ['consent', 'default', { ad_storage: 'granted' }],
				ti: '343003931',
			});
			expect(pushCalls).toEqual([['pageLoad']]);
		});

		it('starts denied before a choice, then sends each grant and withdrawal to the one running tag', async () => {
			const constructorArgs: Record<string, unknown>[] = [];
			const pushCalls: unknown[][] = [];
			installHeadProbe((node, win) => {
				if (!node.src.includes('bat.js')) {
					return;
				}
				win.UET = function UET(
					this: { push: (...args: unknown[]) => void },
					options
				) {
					constructorArgs.push(options);
					this.push = (...args: unknown[]) => {
						pushCalls.push(args);
					};
					return this;
				} as TestWindow['UET'];
				node.dispatchEvent(new Event('load'));
			});
			const scripts = [build({ id: '343003931' })];

			loadScripts(scripts, ALL_DENIED);
			await settleScripts();
			expect(constructorArgs).toHaveLength(1);
			expect(constructorArgs[0]).toMatchObject({
				q: ['consent', 'default', { ad_storage: 'denied' }],
			});

			updateScripts(scripts, grantedMarketingConsents);
			updateScripts(scripts, ALL_DENIED);
			updateScripts(scripts, grantedMarketingConsents);

			expect(constructorArgs).toHaveLength(1);
			expect(document.querySelectorAll('script[src*="bat.js"]')).toHaveLength(
				1
			);
			expect(pushCalls).toEqual([
				['pageLoad'],
				['consent', 'update', { ad_storage: 'granted' }],
				['consent', 'update', { ad_storage: 'denied' }],
				['consent', 'update', { ad_storage: 'granted' }],
			]);
		});
	}
);
