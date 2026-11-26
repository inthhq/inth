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
import type { TestWindow } from './e2e-test-utils';
import { hotjar } from './vendors/analytics/hotjar';
import { matomoAnalytics } from './vendors/analytics/matomo-analytics';
import { mixpanelAnalytics } from './vendors/analytics/mixpanel-analytics';
import { vercelAnalytics } from './vendors/analytics/vercel-analytics';

describe('analytics queue contracts', () => {
	registerVendorContractCleanup();

	it('boots Hotjar settings and queue before append', () => {
		let queueSnapshot: unknown[][] | undefined;
		let settingsSnapshot: TestWindow['_hjSettings'];
		let scriptSrc: string | undefined;

		installHeadProbe((node, win) => {
			if (!node.src.includes('static.hotjar.com/c/hotjar-123456.js')) {
				return;
			}

			win.hj?.('event', 'Signup');
			queueSnapshot = win.hj?.q?.map((entry) => [...entry]);
			settingsSnapshot = win._hjSettings;
			scriptSrc = node.src;
			node.dispatchEvent(new Event('load'));
		});

		loadScripts(
			[
				{
					...hotjar({ siteId: 123456, version: 7 }),
					id: 'hotjar-contract',
				},
			],
			grantedMeasurementConsents
		);

		expect(scriptSrc).toContain('/hotjar-123456.js?sv=7');
		expect(settingsSnapshot).toEqual({
			hjid: '123456',
			hjsv: 7,
		});
		expect(queueSnapshot).toEqual([['event', 'Signup']]);
	});

	it('queues Matomo setup and consent commands before append', () => {
		let queueSnapshot: unknown[] | undefined;
		let scriptSrc: string | undefined;

		installHeadProbe((node, win) => {
			if (!node.src.includes('analytics.example.com/matomo.js')) {
				return;
			}

			scriptSrc = node.src;
			queueSnapshot = win._paq?.map((entry) => {
				if (Array.isArray(entry)) {
					return [...entry];
				}
				return entry;
			});
			node.dispatchEvent(new Event('load'));
		});

		loadScripts(
			[
				{
					...matomoAnalytics({
						defaultConsent: 'required',
						disableCookies: true,
						enableLinkTracking: true,
						matomoUrl: 'https://analytics.example.com',
						siteId: 42,
					}),
					id: 'matomo-analytics-contract',
				},
			],
			grantedMeasurementConsents
		);

		expect(scriptSrc).toContain('/matomo.js');
		expect(queueSnapshot).toEqual([
			['setTrackerUrl', 'https://analytics.example.com/matomo.php'],
			['setSiteId', '42'],
			['enableLinkTracking'],
			['disableCookies'],
			['requireConsent'],
			['setConsentGiven'],
			['trackPageView'],
		]);
	});

	it('boots Mixpanel snippet contract and pre-load consent handoff', () => {
		let methodTypes: Record<string, string> | undefined;
		let snippetVersion: number | undefined;
		let pendingInits: unknown[][] | undefined;
		let queueBeforeLoad: unknown[] | undefined;
		let queueAfterLoad: unknown[] | undefined;

		installHeadProbe((node, win) => {
			if (!node.src.includes('cdn.mxpnl.com/libs/mixpanel-2-latest.min.js')) {
				return;
			}

			const mixpanel = win.mixpanel as
				| NonNullable<TestWindow['mixpanel']>
				| undefined;
			methodTypes = {
				identify: typeof mixpanel?.identify,
				init: typeof mixpanel?.init,
				optIn: typeof mixpanel?.opt_in_tracking,
				optOut: typeof mixpanel?.opt_out_tracking,
				register: typeof mixpanel?.register,
				reset: typeof mixpanel?.reset,
				track: typeof mixpanel?.track,
			};

			snippetVersion = mixpanel?.__SV;
			pendingInits = mixpanel?._i?.map((entry) => [...entry]);
			mixpanel?.track?.('Signup', { plan: 'pro' });
			queueBeforeLoad = Array.from(mixpanel ?? []);
			node.dispatchEvent(new Event('load'));
			queueAfterLoad = Array.from(mixpanel ?? []);
		});

		loadScripts(
			[
				{
					...mixpanelAnalytics({
						initOptions: { debug: true },
						token: '1234567890abcdef1234567890abcdef',
					}),
					id: 'mixpanel-analytics-contract',
				},
			],
			grantedMeasurementConsents
		);

		expect(methodTypes).toEqual({
			identify: 'function',
			init: 'undefined',
			optIn: 'function',
			optOut: 'function',
			register: 'function',
			reset: 'function',
			track: 'function',
		});
		expect(queueBeforeLoad).toEqual([
			['opt_in_tracking'],
			['track', 'Signup', { plan: 'pro' }],
		]);
		expect(snippetVersion).toBe(1.2);
		expect(pendingInits).toEqual([
			[
				'1234567890abcdef1234567890abcdef',
				{
					debug: true,
					opt_out_persistence_by_default: true,
					opt_out_tracking_by_default: true,
				},
				'mixpanel',
			],
		]);
		expect(queueAfterLoad).toEqual([
			['opt_in_tracking'],
			['track', 'Signup', { plan: 'pro' }],
		]);
	});

	it('boots Vercel Analytics queue and loader attributes before append', () => {
		let attributes: Record<string, string | boolean | null> | undefined;
		let queueSnapshot: unknown[] | undefined;

		installHeadProbe((node, win) => {
			if (!node.src.includes('va.vercel-scripts.com/v1/script.debug.js')) {
				return;
			}

			win.va?.('Signup', { plan: 'pro' });
			attributes = {
				dataDisableAutoTrack: node.getAttribute('data-disable-auto-track'),
				dataDsn: node.getAttribute('data-dsn'),
				dataEndpoint: node.getAttribute('data-endpoint'),
				dataSdkn: node.getAttribute('data-sdkn'),
				defer: node.defer,
			};
			queueSnapshot = win.vaq?.map((entry) => [...entry]);
			node.dispatchEvent(new Event('load'));
		});

		loadScripts(
			[
				{
					...vercelAnalytics({
						debug: true,
						disableAutoTrack: true,
						dsn: 'VERCEL-CONTRACT',
						endpoint: '/analytics',
					}),
					id: 'vercel-analytics-contract',
				},
			],
			grantedMeasurementConsents
		);

		expect(attributes).toEqual({
			dataDisableAutoTrack: '1',
			dataDsn: 'VERCEL-CONTRACT',
			dataEndpoint: '/analytics',
			dataSdkn: 'inth',
			defer: true,
		});
		expect(queueSnapshot).toEqual([['Signup', { plan: 'pro' }]]);
	});
});

describe.each(npmAndRemote('hotjar', hotjar))(
	'Hotjar dashboard settings through the %s',
	(_label, build) => {
		registerVendorContractCleanup();

		it('waits for measurement consent, then boots settings and queue before append', async () => {
			let settingsSnapshot: TestWindow['_hjSettings'];
			let scriptSrc: string | undefined;
			installHeadProbe((node, win) => {
				if (!node.src.includes('static.hotjar.com/c/')) {
					return;
				}
				settingsSnapshot = win._hjSettings;
				scriptSrc = node.src;
				node.dispatchEvent(new Event('load'));
			});
			const scripts = [build({ siteId: '1234567' })];

			loadScripts(scripts, ALL_DENIED);
			await settleScripts();
			expect(document.querySelector('script')).toBeNull();
			expect((window as TestWindow).hj).toBeUndefined();

			updateScripts(scripts, grantedMeasurementConsents);
			expect(scriptSrc).toBe(
				'https://static.hotjar.com/c/hotjar-1234567.js?sv=6'
			);
			expect(settingsSnapshot).toEqual({ hjid: '1234567', hjsv: 6 });
		});
	}
);

describe.each(npmAndRemote('matomoAnalytics', matomoAnalytics))(
	'Matomo dashboard settings through the %s',
	(_label, build) => {
		registerVendorContractCleanup();

		it('waits for measurement consent, then queues setup before append', async () => {
			let queueSnapshot: unknown[] | undefined;
			let scriptSrc: string | undefined;
			installHeadProbe((node, win) => {
				if (!node.src.includes('matomo.js')) {
					return;
				}
				scriptSrc = node.src;
				queueSnapshot = win._paq?.map((entry) =>
					Array.isArray(entry) ? [...entry] : entry
				);
				node.dispatchEvent(new Event('load'));
			});
			const scripts = [
				build({
					cloudId: 'example.matomo.cloud',
					disableCookies: true,
					enableLinkTracking: true,
					siteId: '42',
				}),
			];

			loadScripts(scripts, ALL_DENIED);
			await settleScripts();
			expect(document.querySelector('script')).toBeNull();

			updateScripts(scripts, grantedMeasurementConsents);
			expect(scriptSrc).toBe(
				'https://cdn.matomo.cloud/example.matomo.cloud/matomo.js'
			);
			expect(queueSnapshot).toEqual([
				['setTrackerUrl', 'https://example.matomo.cloud/matomo.php'],
				['setSiteId', '42'],
				['enableLinkTracking'],
				['disableCookies'],
				['trackPageView'],
			]);
		});
	}
);

describe.each(npmAndRemote('mixpanelAnalytics', mixpanelAnalytics))(
	'Mixpanel dashboard settings through the %s',
	(_label, build) => {
		registerVendorContractCleanup();

		it('loads opted out before consent, then opts in on grant', async () => {
			let pendingInits: unknown[][] | undefined;
			installHeadProbe((node, win) => {
				if (!node.src.includes('cdn.mxpnl.com/libs/mixpanel-2-latest.min.js')) {
					return;
				}
				const mixpanel = win.mixpanel as
					| NonNullable<TestWindow['mixpanel']>
					| undefined;
				pendingInits = mixpanel?._i?.map((entry) => [...entry]);
				node.dispatchEvent(new Event('load'));
			});
			const token = '0123456789abcdef0123456789abcdef';
			const scripts = [build({ token })];

			loadScripts(scripts, ALL_DENIED);
			await settleScripts();
			const queue = () =>
				Array.from(
					((window as TestWindow).mixpanel ?? []) as ArrayLike<unknown>
				);
			expect(pendingInits).toEqual([
				[
					token,
					{
						opt_out_persistence_by_default: true,
						opt_out_tracking_by_default: true,
					},
					'mixpanel',
				],
			]);
			expect(queue()).toEqual([['opt_out_tracking']]);

			updateScripts(scripts, grantedMeasurementConsents);
			expect(queue()).toEqual([['opt_out_tracking'], ['opt_in_tracking']]);
		});
	}
);

describe.each(npmAndRemote('vercelAnalytics', vercelAnalytics))(
	'Vercel Web Analytics dashboard settings through the %s',
	(_label, build) => {
		registerVendorContractCleanup();

		it('waits for measurement consent, then sets loader attributes before append', async () => {
			let attributes: Record<string, string | boolean | null> | undefined;
			installHeadProbe((node) => {
				if (!node.src.includes('va.vercel-scripts.com/v1/script.debug.js')) {
					return;
				}
				attributes = {
					dataDisableAutoTrack: node.getAttribute('data-disable-auto-track'),
					dataDsn: node.getAttribute('data-dsn'),
					dataEndpoint: node.getAttribute('data-endpoint'),
					defer: node.defer,
				};
				node.dispatchEvent(new Event('load'));
			});
			const scripts = [
				build({ debug: true, disableAutoTrack: true, dsn: 'prj_AbC123dEf456' }),
			];

			loadScripts(scripts, ALL_DENIED);
			await settleScripts();
			expect(document.querySelector('script')).toBeNull();

			updateScripts(scripts, grantedMeasurementConsents);
			expect(attributes).toEqual({
				dataDisableAutoTrack: '1',
				dataDsn: 'prj_AbC123dEf456',
				dataEndpoint: null,
				defer: true,
			});
		});
	}
);
