/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vite-plus/test';

import { npmAndRemote } from './__tests__/remote-path';

import {
	ALL_DENIED,
	grantedMarketingConsents,
	grantedMeasurementConsents,
	installHeadProbe,
	isArgumentsPayload,
	loadScripts,
	registerVendorContractCleanup,
	settleScripts,
	toArgs,
	updateScripts,
} from './e2e-test-utils';
import { metaPixel } from './vendors/ads-and-pixels/meta-pixel';

describe('metaPixel contract', () => {
	registerVendorContractCleanup();

	it('boots with the vendor queue shape and startup calls intact', () => {
		let acknowledged = false;
		let queueSnapshot: unknown[] = [];

		installHeadProbe((node, win) => {
			if (!node.src.includes('connect.facebook.net/en_US/fbevents.js')) {
				return;
			}

			const fbq = win.fbq as
				| ((...args: unknown[]) => void)
				| (Record<string, unknown> & { queue?: unknown[]; push?: unknown });
			const queue = (fbq as { queue?: unknown[] }).queue ?? [];
			queueSnapshot = queue;
			acknowledged =
				win._fbq === win.fbq &&
				(fbq as { loaded?: boolean }).loaded === true &&
				(fbq as { version?: string }).version === '2.0' &&
				(fbq as { push?: unknown }).push === win.fbq &&
				queue.length === 3 &&
				queue.every(isArgumentsPayload) &&
				JSON.stringify(queue.map((entry) => toArgs(entry))) ===
					JSON.stringify([
						['consent', 'grant'],
						['init', 'META-CONTRACT'],
						['track', 'PageView'],
					]);

			node.dispatchEvent(new Event('load'));
		});

		loadScripts(
			[
				{
					...metaPixel({ pixelId: 'META-CONTRACT' }),
					id: 'meta-pixel-contract',
				},
			],
			grantedMarketingConsents
		);

		expect(acknowledged).toBe(true);
		expect(Array.isArray(queueSnapshot[0])).toBe(false);
	});
});

describe.each(npmAndRemote('metaPixel', metaPixel))(
	'Meta Pixel dashboard settings through the %s',
	(_label, build) => {
		registerVendorContractCleanup();

		it('waits for marketing, boots with consent granted, and revokes on withdrawal', async () => {
			const win = window as unknown as { fbq?: { queue?: unknown[] } };
			const queue = () => win.fbq?.queue?.map((entry) => toArgs(entry));
			const scripts = [build({ pixelId: '123456789012345' })];

			loadScripts(scripts, ALL_DENIED);
			await settleScripts();
			updateScripts(scripts, grantedMeasurementConsents);
			expect(document.querySelector('script[src*="fbevents.js"]')).toBeNull();
			expect(win.fbq).toBeUndefined();

			updateScripts(scripts, grantedMarketingConsents);
			await settleScripts();
			expect(
				document.querySelectorAll('script[src*="connect.facebook.net"]')
			).toHaveLength(1);
			expect(queue()).toEqual([
				['consent', 'grant'],
				['init', '123456789012345'],
				['track', 'PageView'],
			]);

			updateScripts(scripts, ALL_DENIED);
			expect(queue()?.at(-1)).toEqual(['consent', 'revoke']);
		});
	}
);
