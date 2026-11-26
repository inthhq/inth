/**
 * @vitest-environment jsdom
 */

import { describe, expect, it, vi } from 'vite-plus/test';

import { npmAndRemote } from './__tests__/remote-path';
import {
	ALL_DENIED,
	grantedMeasurementConsents,
	installHeadProbe,
	loadScripts,
	registerVendorContractCleanup,
	settleScripts,
	updateScripts,
} from './e2e-test-utils';
import { adobeAnalytics } from './vendors/analytics/adobe-analytics';

describe('adobeAnalytics contract', () => {
	registerVendorContractCleanup();

	it('gates loading on measurement consent and seeds adobeDataLayer before append', () => {
		let appendCount = 0;
		let asyncAttribute: boolean | undefined;
		let seededBeforeAppend = false;

		installHeadProbe((node) => {
			if (
				!node.src.startsWith('https://assets.adobedtm.com/inthfake/inthfake')
			) {
				return;
			}

			appendCount += 1;
			asyncAttribute = node.async;
			seededBeforeAppend = Array.isArray(window.adobeDataLayer);
			node.dispatchEvent(new Event('load'));
		});

		const script = {
			...adobeAnalytics({
				scriptUrl:
					'https://assets.adobedtm.com/inthfake/inthfake/launch-inthfake.min.js',
			}),
			id: 'adobe-analytics-contract',
		};

		loadScripts([script], ALL_DENIED);
		expect(appendCount).toBe(0);
		expect(window.adobeDataLayer).toBeUndefined();

		loadScripts([script], grantedMeasurementConsents);

		expect(appendCount).toBe(1);
		expect(asyncAttribute).toBe(true);
		expect(seededBeforeAppend).toBe(true);
		expect(window.adobeDataLayer).toEqual([]);
	});

	it('forwards async: false to the script element for legacy sync embeds', () => {
		let asyncAttribute: boolean | undefined;

		installHeadProbe((node) => {
			if (!node.src.startsWith('https://assets.adobedtm.com/')) {
				return;
			}

			asyncAttribute = node.async;
			node.dispatchEvent(new Event('load'));
		});

		loadScripts(
			[
				{
					...adobeAnalytics({
						async: false,
						scriptUrl:
							'https://assets.adobedtm.com/inthfake/inthfake/launch-sync.min.js',
					}),
					id: 'adobe-analytics-sync-contract',
				},
			],
			grantedMeasurementConsents
		);

		expect(asyncAttribute).toBe(false);
	});

	it('logs and appends nothing for a non-https scriptUrl', () => {
		const error = vi
			.spyOn(console, 'error')
			.mockImplementation(() => undefined);
		let appendCount = 0;
		installHeadProbe(() => {
			appendCount += 1;
		});

		loadScripts(
			[
				adobeAnalytics({
					scriptUrl: 'http://assets.adobedtm.com/inthfake/launch.min.js',
				}),
			],
			grantedMeasurementConsents
		);

		expect(error).toHaveBeenCalledWith(
			'adobeAnalytics: invalid scriptUrl - must use https: from your Adobe Data Collection embed code. The script will not load.'
		);
		expect(appendCount).toBe(0);
		expect(window.adobeDataLayer).toBeUndefined();
	});
});

describe.each(npmAndRemote('adobeAnalytics', adobeAnalytics))(
	'adobeAnalytics dashboard settings through the %s',
	(_label, build) => {
		registerVendorContractCleanup();

		it('waits for measurement consent, then seeds adobeDataLayer and loads the property from Adobe', async () => {
			let scriptSrc: string | undefined;
			let seededBeforeAppend = false;
			installHeadProbe((node) => {
				if (!node.src.startsWith('https://assets.adobedtm.com/')) {
					return;
				}
				scriptSrc = node.src;
				seededBeforeAppend = Array.isArray(window.adobeDataLayer);
				node.dispatchEvent(new Event('load'));
			});
			const scripts = [
				build({
					companyId: 'a7d65461e54e',
					environmentId: 'f3a2b1c0d9e8',
					propertyId: '01d650ac6ffb',
				}),
			];

			loadScripts(scripts, ALL_DENIED);
			await settleScripts();
			expect(scriptSrc).toBeUndefined();
			expect(window.adobeDataLayer).toBeUndefined();

			updateScripts(scripts, grantedMeasurementConsents);
			expect(scriptSrc).toBe(
				'https://assets.adobedtm.com/a7d65461e54e/01d650ac6ffb/launch-f3a2b1c0d9e8.min.js'
			);
			expect(seededBeforeAppend).toBe(true);
		});
	}
);
