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
import { pinterestTag } from './vendors/ads-and-pixels/pinterest-tag';
import { redditPixel } from './vendors/ads-and-pixels/reddit-pixel';
import { snapchatPixel } from './vendors/ads-and-pixels/snapchat-pixel';

describe('ads pixel queue contracts', () => {
	registerVendorContractCleanup();

	it('boots Reddit Pixel queue before append', () => {
		let queueSnapshot: unknown[][] | undefined;
		let scriptSrc: string | undefined;

		installHeadProbe((node, win) => {
			if (!node.src.includes('redditstatic.com/ads/pixel.js')) {
				return;
			}

			win.rdt?.('track', 'Purchase', { currency: 'USD', valueDecimal: 49 });
			queueSnapshot = win.rdt?.callQueue?.map((entry) => [...entry]);
			scriptSrc = node.src;
			node.dispatchEvent(new Event('load'));
		});

		loadScripts(
			[
				{
					...redditPixel({
						disableFirstPartyCookies: true,
						initOptions: { email: 'hash@example.com' },
						pixelId: 'REDDIT-CONTRACT',
					}),
					id: 'reddit-pixel-contract',
				},
			],
			grantedMarketingConsents
		);

		expect(scriptSrc).toContain('/ads/pixel.js');
		expect(queueSnapshot).toEqual([
			[
				'init',
				'REDDIT-CONTRACT',
				{
					disableFirstPartyCookies: true,
					email: 'hash@example.com',
				},
			],
			['track', 'PageVisit'],
			['track', 'Purchase', { currency: 'USD', valueDecimal: 49 }],
		]);
	});

	it('boots Snapchat Pixel metadata, alias, and queue before append', () => {
		let aliasMatches: boolean | undefined;
		let pushMatches: boolean | undefined;
		let queueSnapshot: unknown[][] | undefined;
		let scriptSrc: string | undefined;
		let stubMetadata: Record<string, unknown> | undefined;

		installHeadProbe((node, win) => {
			if (!node.src.includes('sc-static.net/scevent.min.js')) {
				return;
			}

			win.snaptr?.('track', 'SIGN_UP', { sign_up_method: 'email' });
			aliasMatches = win._snaptr === win.snaptr;
			pushMatches = win.snaptr?.push === win.snaptr;
			queueSnapshot = win.snaptr?.queue?.map((entry) => [...entry]);
			scriptSrc = node.src;
			stubMetadata = {
				loaded: win.snaptr?.loaded,
				version: win.snaptr?.version,
			};
			node.dispatchEvent(new Event('load'));
		});

		loadScripts(
			[
				{
					...snapchatPixel({
						initOptions: { user_email: 'hash@example.com' },
						pixelId: 'SNAPCHAT-CONTRACT',
					}),
					id: 'snapchat-pixel-contract',
				},
			],
			grantedMarketingConsents
		);

		expect(scriptSrc).toContain('/scevent.min.js');
		expect(aliasMatches).toBe(true);
		expect(pushMatches).toBe(true);
		expect(stubMetadata).toEqual({
			loaded: true,
			version: '1.0',
		});
		expect(queueSnapshot).toEqual([
			[
				'init',
				'SNAPCHAT-CONTRACT',
				{
					user_email: 'hash@example.com',
				},
			],
			['track', 'PAGE_VIEW'],
			['track', 'SIGN_UP', { sign_up_method: 'email' }],
		]);
	});

	it('boots Pinterest Tag version and queue before append', () => {
		let queueSnapshot: unknown[][] | undefined;
		let scriptSrc: string | undefined;
		let stubVersion: string | undefined;

		installHeadProbe((node, win) => {
			if (!node.src.includes('s.pinimg.com/ct/core.js')) {
				return;
			}

			win.pintrk?.('track', 'lead', { lead_type: 'newsletter' });
			queueSnapshot = win.pintrk?.queue?.map((entry) => [...entry]);
			stubVersion = win.pintrk?.version;
			scriptSrc = node.src;
			node.dispatchEvent(new Event('load'));
		});

		loadScripts(
			[
				{
					...pinterestTag({
						loadOptions: { em: 'hash@example.com' },
						tagId: 'PINTEREST-CONTRACT',
					}),
					id: 'pinterest-tag-contract',
				},
			],
			grantedMarketingConsents
		);

		expect(scriptSrc).toContain('/ct/core.js');
		expect(stubVersion).toBe('3.0');
		expect(queueSnapshot).toEqual([
			['load', 'PINTEREST-CONTRACT', { em: 'hash@example.com' }],
			['setconsent', true],
			['page'],
			['track', 'lead', { lead_type: 'newsletter' }],
		]);
	});
});

describe.each(npmAndRemote('redditPixel', redditPixel))(
	'Reddit Pixel dashboard settings through the %s',
	(_label, build) => {
		registerVendorContractCleanup();

		it('waits for marketing consent, then boots the queue before append', async () => {
			let queueSnapshot: unknown[][] | undefined;
			installHeadProbe((node, win) => {
				if (!node.src.includes('redditstatic.com/ads/pixel.js')) {
					return;
				}
				queueSnapshot = win.rdt?.callQueue?.map((entry) => [...entry]);
				node.dispatchEvent(new Event('load'));
			});
			const scripts = [
				build({ disableFirstPartyCookies: true, pixelId: 'a2_abcdef123456' }),
			];

			loadScripts(scripts, ALL_DENIED);
			await settleScripts();
			expect(document.querySelector('script')).toBeNull();
			expect(window.rdt).toBeUndefined();

			updateScripts(scripts, grantedMarketingConsents);
			expect(queueSnapshot).toEqual([
				['init', 'a2_abcdef123456', { disableFirstPartyCookies: true }],
				['track', 'PageVisit'],
			]);
		});
	}
);

describe.each(npmAndRemote('snapchatPixel', snapchatPixel))(
	'Snap Pixel dashboard settings through the %s',
	(_label, build) => {
		registerVendorContractCleanup();

		it('waits for marketing consent, then boots the queue before append', async () => {
			let queueSnapshot: unknown[][] | undefined;
			installHeadProbe((node, win) => {
				if (!node.src.includes('sc-static.net/scevent.min.js')) {
					return;
				}
				queueSnapshot = win.snaptr?.queue?.map((entry) => [...entry]);
				node.dispatchEvent(new Event('load'));
			});
			const pixelId = '0b5d6a3e-2f1c-4e8a-9d7b-1a2b3c4d5e6f';
			const scripts = [build({ pixelId, trackPageView: false })];

			loadScripts(scripts, ALL_DENIED);
			await settleScripts();
			expect(document.querySelector('script')).toBeNull();
			expect(window.snaptr).toBeUndefined();

			updateScripts(scripts, grantedMarketingConsents);
			expect(queueSnapshot).toEqual([['init', pixelId]]);
		});
	}
);

describe.each(npmAndRemote('pinterestTag', pinterestTag))(
	'Pinterest Tag dashboard settings through the %s',
	(_label, build) => {
		registerVendorContractCleanup();

		it('waits for marketing consent, then boots the queue before append', async () => {
			let queueSnapshot: unknown[][] | undefined;
			installHeadProbe((node, win) => {
				if (!node.src.includes('s.pinimg.com/ct/core.js')) {
					return;
				}
				queueSnapshot = win.pintrk?.queue?.map((entry) => [...entry]);
				node.dispatchEvent(new Event('load'));
			});
			const scripts = [build({ tagId: '2613654212508' })];

			loadScripts(scripts, ALL_DENIED);
			await settleScripts();
			expect(document.querySelector('script')).toBeNull();
			expect(window.pintrk).toBeUndefined();

			updateScripts(scripts, grantedMarketingConsents);
			expect(queueSnapshot).toEqual([
				['load', '2613654212508'],
				['setconsent', true],
				['page'],
			]);
		});
	}
);
