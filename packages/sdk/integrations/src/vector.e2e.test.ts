/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vite-plus/test';

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
import { vector } from './vendors/ads-and-pixels/vector';

describe.each(npmAndRemote('vector', vector))(
	'Vector core loader consent contract through the %s',
	(_label, build) => {
		registerVendorContractCleanup();
		it('creates no vendor globals, requests or storage before mapped consent', async () => {
			const scripts = [
				build({ pixelId: '00000000-0000-0000-0000-000000000000' }),
			];
			loadScripts(scripts, ALL_DENIED);
			await settleScripts();
			updateScripts(scripts, grantedMeasurementConsents);
			expect(document.querySelector('script')).toBeNull();
			for (const key of ['vector', '__vector_manager']) {
				expect(key in window).toBe(false);
			}
			expect(document.cookie).toBe('');
			updateScripts(scripts, grantedMarketingConsents);
			const element = document.querySelector('script');
			expect(element?.src).toBe('https://cdn.vector.co/pixel.js');
			element?.dispatchEvent(new Event('load'));
			updateScripts(scripts, grantedMarketingConsents);
			expect(document.querySelectorAll('script')).toHaveLength(1);
		});
		it('retains one loader across in-flight revoke and regrant', async () => {
			const scripts = [
				build({ pixelId: '00000000-0000-0000-0000-000000000000' }),
			];
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
