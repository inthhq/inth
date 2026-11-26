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
} from './e2e-test-utils';
import {
	RUDDERSTACK_QUEUE_METHODS,
	rudderstack,
} from './vendors/analytics/rudderstack';
import type { RudderStackOptions } from './vendors/analytics/rudderstack';

type RudderStackQueue = unknown[] & {
	snippetExecuted?: boolean;
	[key: string]: unknown;
};

describe.each(npmAndRemote<RudderStackOptions>('rudderstack', rudderstack))(
	'rudderstack contract through the %s',
	(_label, build) => {
		registerVendorContractCleanup();

		it('boots the rudderanalytics queue and methods before the loader appends', () => {
			let methodTypes: Record<string, string> | undefined;
			let queueSnapshot: unknown[] | undefined;
			let scriptSrc: string | undefined;
			let snippetExecuted: boolean | undefined;

			installHeadProbe((node, win) => {
				if (!node.src.includes('cdn.rudderlabs.com/v3/modern/rsa.min.js')) {
					return;
				}

				const rudderanalytics = win.rudderanalytics as
					| RudderStackQueue
					| undefined;
				scriptSrc = node.src;
				snippetExecuted = rudderanalytics?.snippetExecuted;
				methodTypes = Object.fromEntries(
					RUDDERSTACK_QUEUE_METHODS.map((method) => [
						method,
						typeof rudderanalytics?.[method],
					])
				);

				rudderanalytics?.track?.('Signup', { plan: 'pro' });
				queueSnapshot = Array.from(rudderanalytics ?? []);

				node.dispatchEvent(new Event('load'));
			});

			loadScripts(
				[
					{
						...build({
							dataPlaneHost: 'inth-live-probe.invalid',
							writeKey: 'RudderStackContract',
						}),
						id: 'rudderstack-contract',
					},
				],
				grantedMeasurementConsents
			);

			expect(scriptSrc).toContain('/v3/modern/rsa.min.js');
			expect(snippetExecuted).toBe(true);
			expect(methodTypes).toEqual(
				Object.fromEntries(
					RUDDERSTACK_QUEUE_METHODS.map((method) => [method, 'function'])
				)
			);
			expect(queueSnapshot).toEqual([
				['load', 'RudderStackContract', 'https://inth-live-probe.invalid', {}],
				['page'],
				['track', 'Signup', { plan: 'pro' }],
			]);
		});

		it('omits page when trackPageView is false', () => {
			let queueSnapshot: unknown[] | undefined;

			installHeadProbe((node, win) => {
				if (!node.src.includes('cdn.rudderlabs.com/v3/modern/rsa.min.js')) {
					return;
				}

				queueSnapshot = Array.from(
					(win.rudderanalytics as RudderStackQueue) ?? []
				);
				node.dispatchEvent(new Event('load'));
			});

			loadScripts(
				[
					{
						...build({
							dataPlaneHost: 'inth-live-probe.invalid',
							trackPageView: false,
							writeKey: 'RudderStackContract',
						}),
						id: 'rudderstack-contract',
					},
				],
				grantedMeasurementConsents
			);

			expect(queueSnapshot).toEqual([
				['load', 'RudderStackContract', 'https://inth-live-probe.invalid', {}],
			]);
		});

		it('waits for measurement consent before appending the loader', () => {
			let appended = false;

			installHeadProbe((node) => {
				if (node.src.includes('cdn.rudderlabs.com/v3/modern/rsa.min.js')) {
					appended = true;
				}
			});

			loadScripts(
				[
					{
						...build({
							dataPlaneHost: 'inth-live-probe.invalid',
							writeKey: 'RudderStackContract',
						}),
						id: 'rudderstack-contract',
					},
				],
				ALL_DENIED
			);

			expect(appended).toBe(false);
			expect(window.rudderanalytics).toBeUndefined();
		});
	}
);

describe('rudderstack contract with npm-only options', () => {
	registerVendorContractCleanup();

	it('passes a data plane URL and loadOptions to load', () => {
		let methodTypes: Record<string, string> | undefined;
		let queueSnapshot: unknown[] | undefined;
		let scriptSrc: string | undefined;
		let snippetExecuted: boolean | undefined;

		installHeadProbe((node, win) => {
			if (!node.src.includes('cdn.rudderlabs.com/v3/modern/rsa.min.js')) {
				return;
			}

			const rudderanalytics = win.rudderanalytics as
				| RudderStackQueue
				| undefined;
			scriptSrc = node.src;
			snippetExecuted = rudderanalytics?.snippetExecuted;
			methodTypes = Object.fromEntries(
				RUDDERSTACK_QUEUE_METHODS.map((method) => [
					method,
					typeof rudderanalytics?.[method],
				])
			);

			rudderanalytics?.track?.('Signup', { plan: 'pro' });
			queueSnapshot = Array.from(rudderanalytics ?? []);

			node.dispatchEvent(new Event('load'));
		});

		loadScripts(
			[
				{
					...rudderstack({
						dataPlaneUrl: 'https://inth-live-probe.invalid',
						loadOptions: {
							useBeacon: true,
						},
						writeKey: 'RUDDERSTACK-CONTRACT',
					}),
					id: 'rudderstack-contract',
				},
			],
			grantedMeasurementConsents
		);

		expect(scriptSrc).toContain('/v3/modern/rsa.min.js');
		expect(snippetExecuted).toBe(true);
		expect(methodTypes).toEqual(
			Object.fromEntries(
				RUDDERSTACK_QUEUE_METHODS.map((method) => [method, 'function'])
			)
		);
		expect(queueSnapshot).toEqual([
			[
				'load',
				'RUDDERSTACK-CONTRACT',
				'https://inth-live-probe.invalid',
				{ useBeacon: true },
			],
			['page'],
			['track', 'Signup', { plan: 'pro' }],
		]);
	});
});
