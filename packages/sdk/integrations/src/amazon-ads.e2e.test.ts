/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vite-plus/test';

import { npmAndRemote } from './__tests__/remote-path';
import {
	ALL_DENIED,
	grantedMarketingConsents,
	grantedMeasurementConsents,
	loadScripts,
	updateScripts,
	registerVendorContractCleanup,
	settleScripts,
} from './e2e-test-utils';
import { amazonAdsTag } from './vendors/ads-and-pixels/amazon-ads';

describe('Amazon Ads core loader consent contract', () => {
	registerVendorContractCleanup();
	afterEach(() => {
		for (const key of ['amzn', 'amznConsent']) {
			Reflect.deleteProperty(window, key);
		}
	});
	it('creates no vendor globals, requests or storage before mapped consent', () => {
		const scripts = [
			amazonAdsTag({ tagId: '00000000-0000-0000-0000-000000000000' }),
		];
		loadScripts(scripts, ALL_DENIED);
		updateScripts(scripts, grantedMeasurementConsents);
		expect(document.querySelector('script')).toBeNull();
		for (const key of ['amzn', 'amznConsent']) {
			expect(key in window).toBe(false);
		}
		expect(document.cookie).toBe('');
		updateScripts(scripts, grantedMarketingConsents);
		const element = document.querySelector('script');
		expect(element?.src).toBe('https://c.amazon-adsystem.com/aat/amzn.js');
		element?.dispatchEvent(new Event('load'));
		updateScripts(scripts, grantedMarketingConsents);
		expect(document.querySelectorAll('script')).toHaveLength(1);
	});
	it('retains one loader across in-flight revoke and regrant', () => {
		const scripts = [
			amazonAdsTag({ tagId: '00000000-0000-0000-0000-000000000000' }),
		];
		loadScripts(scripts, grantedMarketingConsents);
		const old = document.querySelector('script');
		updateScripts(scripts, ALL_DENIED);
		expect(old?.isConnected).toBe(true);
		old?.dispatchEvent(new Event('load'));
		expect(document.querySelector('script')).toBe(old);
		updateScripts(scripts, grantedMarketingConsents);
		const current = document.querySelector('script');
		expect(current).toBe(old);
		current?.dispatchEvent(new Event('load'));
		updateScripts(scripts, grantedMarketingConsents);
		expect(document.querySelectorAll('script')).toHaveLength(1);
	});
});

describe.each(npmAndRemote('amazonAdsTag', amazonAdsTag))(
	'Amazon Ads dashboard settings through the %s',
	(_label, build) => {
		registerVendorContractCleanup();
		afterEach(() => {
			Reflect.deleteProperty(window, 'amzn');
		});
		const queued = () =>
			(window.amzn?.q ?? []).map(([args]) => Array.from(args));

		it('queues the EU tag on marketing consent and drops it on a revoke before amzn.js runs', async () => {
			const scripts = [
				build({
					region: 'EU',
					tagId: '00000000-0000-0000-0000-000000000000',
					trackPageView: false,
				}),
			];
			loadScripts(scripts, ALL_DENIED);
			await settleScripts();
			expect(document.querySelector('script')).toBeNull();
			expect('amzn' in window).toBe(false);

			updateScripts(scripts, grantedMarketingConsents);
			expect(document.querySelector('script')?.src).toBe(
				'https://c.amazon-adsystem.com/aat/amzn.js'
			);
			const tag = [
				['setRegion', 'EU'],
				['addTag', '00000000-0000-0000-0000-000000000000'],
			];
			expect(queued()).toEqual(tag);

			// amzn.js has not run, so the commands never reach Amazon.
			updateScripts(scripts, ALL_DENIED);
			expect(queued()).toEqual([]);

			updateScripts(scripts, grantedMarketingConsents);
			expect(queued()).toEqual(tag);
		});
	}
);
