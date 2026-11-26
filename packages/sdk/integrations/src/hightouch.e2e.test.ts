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
} from './e2e-test-utils';
import {
	HIGHTOUCH_QUEUE_METHODS,
	hightouch,
} from './vendors/analytics/hightouch';

type HightouchQueue = unknown[] & {
	_loadOptions?: Record<string, unknown>;
	_writeKey?: string;
	[key: string]: unknown;
};

describe.each(npmAndRemote('hightouch', hightouch))(
	'hightouch contract through the %s',
	(_label, build) => {
		registerVendorContractCleanup();

		it('omits page when trackPageView is false', async () => {
			let queueSnapshot: unknown[] | undefined;

			installHeadProbe((node, win) => {
				if (!node.src.includes('cdn.hightouch-events.com/browser')) {
					return;
				}

				queueSnapshot = Array.from((win.htevents as HightouchQueue) ?? []);
				node.dispatchEvent(new Event('load'));
			});

			loadScripts(
				[
					{
						...build({
							trackPageView: false,
							writeKey: 'HIGHTOUCHCONTRACT',
						}),
						id: 'hightouch-contract',
					},
				],
				grantedMeasurementConsents
			);
			await settleScripts();

			expect(queueSnapshot).toEqual([['load', 'HIGHTOUCHCONTRACT', {}]]);
		});

		it('waits for measurement consent before appending the loader', async () => {
			let appended = false;

			installHeadProbe((node) => {
				if (node.src.includes('cdn.hightouch-events.com/browser')) {
					appended = true;
				}
			});

			loadScripts(
				[
					{
						...build({ writeKey: 'HIGHTOUCHCONTRACT' }),
						id: 'hightouch-contract',
					},
				],
				ALL_DENIED
			);
			await settleScripts();

			expect(appended).toBe(false);
			expect(window.htevents).toBeUndefined();
		});
	}
);

describe('hightouch npm helper options', () => {
	registerVendorContractCleanup();

	it('boots the htevents queue and methods before the loader appends', () => {
		let methodTypes: Record<string, string> | undefined;
		let queueSnapshot: unknown[] | undefined;
		let scriptSrc: string | undefined;
		let writeKey: string | undefined;
		let loadOptions: Record<string, unknown> | undefined;

		installHeadProbe((node, win) => {
			if (!node.src.includes('cdn.hightouch-events.com/browser')) {
				return;
			}

			const htevents = win.htevents as HightouchQueue | undefined;
			scriptSrc = node.src;
			writeKey = htevents?._writeKey;
			loadOptions = htevents?._loadOptions;
			methodTypes = Object.fromEntries(
				HIGHTOUCH_QUEUE_METHODS.map((method) => [
					method,
					typeof htevents?.[method],
				])
			);

			htevents?.track?.('Signup', { plan: 'pro' });
			queueSnapshot = Array.from(htevents ?? []);

			node.dispatchEvent(new Event('load'));
		});

		loadScripts(
			[
				{
					...hightouch({
						apiHost: 'us-east-1.hightouch-events.com',
						writeKey: 'HIGHTOUCH-CONTRACT',
					}),
					id: 'hightouch-contract',
				},
			],
			grantedMeasurementConsents
		);

		expect(scriptSrc).toContain('/browser/release/v1-latest/events.min.js');
		expect(writeKey).toBe('HIGHTOUCH-CONTRACT');
		expect(loadOptions).toEqual({
			apiHost: 'us-east-1.hightouch-events.com',
		});
		expect(methodTypes).toEqual(
			Object.fromEntries(
				HIGHTOUCH_QUEUE_METHODS.map((method) => [method, 'function'])
			)
		);
		expect(queueSnapshot).toEqual([
			[
				'load',
				'HIGHTOUCH-CONTRACT',
				{ apiHost: 'us-east-1.hightouch-events.com' },
			],
			['page'],
			['track', 'Signup', { plan: 'pro' }],
		]);
	});
});
