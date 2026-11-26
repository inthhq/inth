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
	registerVendorContractCleanup,
	settleScripts,
	updateScripts,
} from './e2e-test-utils';
import { liveIntentTag } from './vendors/ads-and-pixels/liveintent';

describe('LiveIntent core loader consent contract', () => {
	registerVendorContractCleanup();
	afterEach(() => {
		for (const key of ['lc2', 'liQHub', 'liQ_instances']) {
			Reflect.deleteProperty(window, key);
		}
	});
	it.each(['{{coupon}}', '{{scriptUrl}}', 'offer {{coupon}} at {{scriptUrl}}'])(
		'preserves literal event payload strings such as %s',
		(name) => {
			const events = [
				{
					event: 'conversion',
					name,
					properties: { labels: [name, '{{scriptUrl}}'] },
				},
				{ event: 'view', name: 'second event' },
			];
			const scripts = [liveIntentTag({ events, tagId: 'a-00xx' })];
			loadScripts(scripts, ALL_DENIED);
			expect(window.liQ).toBeUndefined();
			updateScripts(scripts, grantedMarketingConsents);
			expect(window.liQ).toEqual(events);
			const loader = document.querySelector('script');
			expect(loader?.src).toBe('https://b-code.liadm.com/a-00xx.min.js');
			loader?.dispatchEvent(new Event('load'));
			updateScripts(scripts, ALL_DENIED);
			updateScripts(scripts, grantedMarketingConsents);
			expect(window.liQ).toEqual(events);
			expect(document.querySelectorAll('script')).toHaveLength(1);
		}
	);
});

describe.each(npmAndRemote('liveIntentTag', liveIntentTag))(
	'LiveIntent loader through the %s',
	(_label, build) => {
		registerVendorContractCleanup();
		afterEach(() => {
			for (const key of ['lc2', 'liQHub', 'liQ_instances']) {
				Reflect.deleteProperty(window, key);
			}
		});
		it('creates no vendor globals, requests or storage before mapped consent', async () => {
			const scripts = [build({ tagId: 'a-00xx' })];
			loadScripts(scripts, ALL_DENIED);
			await settleScripts();
			updateScripts(scripts, grantedMeasurementConsents);
			expect(document.querySelector('script')).toBeNull();
			for (const key of ['liQ', 'LI', 'lc2', 'liQHub', 'liQ_instances']) {
				expect(key in window).toBe(false);
			}
			expect(document.cookie).toBe('');
			updateScripts(scripts, grantedMarketingConsents);
			const element = document.querySelector('script');
			expect(element?.src).toBe('https://b-code.liadm.com/a-00xx.min.js');
			element?.dispatchEvent(new Event('load'));
			updateScripts(scripts, grantedMarketingConsents);
			expect(document.querySelectorAll('script')).toHaveLength(1);
		});
		it('retains one loader across in-flight revoke and regrant', async () => {
			const scripts = [build({ tagId: 'a-00xx' })];
			loadScripts(scripts, grantedMarketingConsents);
			await settleScripts();
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
	}
);
