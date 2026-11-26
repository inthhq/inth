/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vite-plus/test';

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
import { plausibleAnalytics } from './vendors/analytics/plausible-analytics';

type PlausibleStub = ((...args: unknown[]) => void) & {
	o?: Record<string, unknown>;
	q?: unknown[][];
};

describe('plausible analytics contract', () => {
	registerVendorContractCleanup();

	it('exposes init options and data attributes before the loader appends', () => {
		let attributes: Record<string, string | boolean | null> | undefined;
		let initOptions: Record<string, unknown> | undefined;
		let queueSnapshot: unknown[][] | undefined;

		installHeadProbe((node, win) => {
			if (!node.src.includes('plausible.io/js/script.js')) {
				return;
			}

			const plausible = win.plausible as PlausibleStub | undefined;
			plausible?.('Signup', { props: { plan: 'pro' } });

			attributes = {
				dataApi: node.getAttribute('data-api'),
				dataDomain: node.getAttribute('data-domain'),
				defer: node.defer,
			};
			initOptions = plausible?.o;
			queueSnapshot = plausible?.q?.map((entry) => [...entry]);

			node.dispatchEvent(new Event('load'));
		});

		loadScripts(
			[
				{
					...plausibleAnalytics({
						autoCapturePageviews: false,
						customProperties: { release: 'canary' },
						domain: 'example.com',
						endpoint: 'https://analytics.example.com/api/event',
					}),
					id: 'plausible-analytics-contract',
				},
			],
			grantedMeasurementConsents
		);

		expect(attributes).toEqual({
			dataApi: 'https://analytics.example.com/api/event',
			dataDomain: 'example.com',
			defer: true,
		});
		expect(initOptions).toEqual({
			autoCapturePageviews: false,
			customProperties: { release: 'canary' },
			endpoint: 'https://analytics.example.com/api/event',
		});
		expect(queueSnapshot).toEqual([['Signup', { props: { plan: 'pro' } }]]);
	});
});

describe.each(npmAndRemote('plausibleAnalytics', plausibleAnalytics))(
	'plausible analytics dashboard settings through the %s',
	(_label, build) => {
		registerVendorContractCleanup();

		it('waits for measurement consent, then exposes init options before the site script appends', async () => {
			let initOptions: Record<string, unknown> | undefined;
			let scriptSrc: string | undefined;
			installHeadProbe((node, win) => {
				if (!node.src.includes('plausible.io/js/')) {
					return;
				}
				initOptions = (win.plausible as PlausibleStub | undefined)?.o;
				scriptSrc = node.src;
				node.dispatchEvent(new Event('load'));
			});
			const scripts = [
				build({
					autoCapturePageviews: false,
					hashBasedRouting: true,
					scriptId: 'AbC123xYz',
				}),
			];

			loadScripts(scripts, ALL_DENIED);
			await settleScripts();
			expect(scriptSrc).toBeUndefined();

			updateScripts(scripts, grantedMeasurementConsents);
			expect(scriptSrc).toBe('https://plausible.io/js/pa-AbC123xYz.js');
			expect(initOptions).toEqual({
				autoCapturePageviews: false,
				hashBasedRouting: true,
			});
		});
	}
);
