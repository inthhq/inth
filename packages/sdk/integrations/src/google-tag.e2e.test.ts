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
import type { TestWindow } from './e2e-test-utils';
import { gtag } from './vendors/analytics/google-tag';

describe('gtag contract', () => {
	registerVendorContractCleanup();

	it('acknowledges the consent default before config boot logic', () => {
		installHeadProbe((node, win) => {
			if (!node.src.includes('googletagmanager.com/gtag/js')) {
				return;
			}

			const firstEntry = win.dataLayer?.[0];
			const usesConsentDefault =
				isArgumentsPayload(firstEntry) &&
				toArgs(firstEntry)[0] === 'consent' &&
				toArgs(firstEntry)[1] === 'default' &&
				typeof toArgs(firstEntry)[2] === 'object';

			win.google_tag_data = {
				ics: {
					usedDefault: usesConsentDefault,
					usedImplicit: !usesConsentDefault,
				},
			};

			node.dispatchEvent(new Event('load'));
		});

		loadScripts(
			[
				{
					...gtag({ category: 'measurement', id: 'G-CONTRACT' }),
					id: 'gtag-contract',
				},
			],
			ALL_DENIED
		);

		const win = window as TestWindow;
		expect(Array.isArray(win.dataLayer?.[0])).toBe(false);
		expect(win.google_tag_data?.ics.usedDefault).toBe(true);
		expect(win.google_tag_data?.ics.usedImplicit).toBe(false);
		expect(toArgs(win.dataLayer?.[0])).toEqual([
			'consent',
			'default',
			{
				ad_personalization: 'denied',
				ad_storage: 'denied',
				ad_user_data: 'denied',
				analytics_storage: 'denied',
				functionality_storage: 'denied',
				personalization_storage: 'denied',
				security_storage: 'granted',
			},
		]);
		const jsEntry = toArgs(win.dataLayer?.[1]);
		expect(jsEntry[0]).toBe('js');
		expect(typeof jsEntry[1] === 'number' || jsEntry[1] instanceof Date).toBe(
			true
		);
		expect(toArgs(win.dataLayer?.[2])).toEqual(['config', 'G-CONTRACT']);
	});

	it('requests gtag.js before a choice by default', () => {
		const requests: string[] = [];
		installHeadProbe((node) => {
			requests.push(node.src);
		});

		loadScripts(
			[gtag({ category: 'measurement', id: 'G-DEFAULT' })],
			ALL_DENIED
		);

		expect(requests).toEqual([
			'https://www.googletagmanager.com/gtag/js?id=G-DEFAULT',
		]);
	});
});

describe('gtag loadMode after-consent', () => {
	registerVendorContractCleanup();

	const recordGoogleRequests = function recordGoogleRequests() {
		const requests: { src: string; queue: unknown[][] }[] = [];
		installHeadProbe((node, win) => {
			if (node.src.includes('googletagmanager.com')) {
				requests.push({
					queue: (win.dataLayer ?? []).map((entry) => toArgs(entry)),
					src: node.src,
				});
			}
		});
		return requests;
	};

	it('makes no request to Google and creates no globals before consent', () => {
		const requests = recordGoogleRequests();
		const scripts = [
			gtag({
				category: 'measurement',
				id: 'G-GATED',
				loadMode: 'after-consent',
			}),
		];

		loadScripts(scripts, ALL_DENIED);
		updateScripts(scripts, grantedMarketingConsents);

		const win = window as TestWindow;
		expect(requests).toEqual([]);
		expect(win.dataLayer).toBeUndefined();
		expect(win.gtag).toBeUndefined();
	});

	it('loads once after consent, with the consent default before config', () => {
		const requests = recordGoogleRequests();
		const scripts = [
			gtag({
				category: 'measurement',
				id: 'G-GATED',
				loadMode: 'after-consent',
			}),
		];

		loadScripts(scripts, ALL_DENIED);
		updateScripts(scripts, grantedMeasurementConsents);
		updateScripts(scripts, {
			...grantedMeasurementConsents,
			marketing: true,
		});

		expect(requests).toHaveLength(1);
		const [request] = requests;
		expect(request?.src).toBe(
			'https://www.googletagmanager.com/gtag/js?id=G-GATED'
		);
		expect(request?.queue[0]).toEqual([
			'consent',
			'default',
			{
				ad_personalization: 'denied',
				ad_storage: 'denied',
				ad_user_data: 'denied',
				analytics_storage: 'granted',
				functionality_storage: 'denied',
				personalization_storage: 'denied',
				security_storage: 'granted',
			},
		]);
		expect(request?.queue[1]?.[0]).toBe('js');
		expect(request?.queue[2]).toEqual(['config', 'G-GATED']);

		const win = window as TestWindow;
		expect(toArgs(win.dataLayer?.at(-1))).toEqual([
			'consent',
			'update',
			expect.objectContaining({
				ad_storage: 'granted',
				analytics_storage: 'granted',
			}),
		]);
	});

	it('keeps the tag after withdrawal, denies it, and reuses it on a new grant', () => {
		const requests = recordGoogleRequests();
		const scripts = [
			gtag({
				category: 'measurement',
				id: 'G-GATED',
				loadMode: 'after-consent',
			}),
		];

		loadScripts(scripts, grantedMeasurementConsents);
		const element = document.head.querySelector('script');
		updateScripts(scripts, ALL_DENIED);

		const win = window as TestWindow;
		expect(element?.isConnected).toBe(true);
		expect(toArgs(win.dataLayer?.at(-1))).toEqual([
			'consent',
			'update',
			expect.objectContaining({ analytics_storage: 'denied' }),
		]);

		updateScripts(scripts, grantedMeasurementConsents);

		expect(requests).toHaveLength(1);
		expect(toArgs(win.dataLayer?.at(-1))).toEqual([
			'consent',
			'update',
			expect.objectContaining({ analytics_storage: 'granted' }),
		]);
	});
});

describe.each(npmAndRemote('gtag', gtag))(
	'gtag dashboard settings through the %s',
	(_label, build) => {
		registerVendorContractCleanup();
		const recordGoogleRequests = function recordGoogleRequests() {
			const requests: { src: string; queue: unknown[][] }[] = [];
			installHeadProbe((node, win) => {
				if (node.src.includes('googletagmanager.com')) {
					requests.push({
						queue: (win.dataLayer ?? []).map((entry) => toArgs(entry)),
						src: node.src,
					});
				}
			});
			return requests;
		};
		const deniedDefault = {
			ad_personalization: 'denied',
			ad_storage: 'denied',
			ad_user_data: 'denied',
			analytics_storage: 'denied',
			functionality_storage: 'denied',
			personalization_storage: 'denied',
			security_storage: 'granted',
		};

		it('loads before a choice by default, with every type denied before config', async () => {
			const requests = recordGoogleRequests();

			loadScripts([build({ category: 'measurement', id: 'G-DASH1' })], ALL_DENIED);
			await settleScripts();

			expect(requests.map(({ src }) => src)).toEqual([
				'https://www.googletagmanager.com/gtag/js?id=G-DASH1',
			]);
			expect(requests[0]?.queue[0]).toEqual(['consent', 'default', deniedDefault]);
			expect(requests[0]?.queue[2]).toEqual(['config', 'G-DASH1']);
		});

		it('keeps the ad types the visitor allowed when its own category is denied', async () => {
			const win = window as TestWindow;
			const scripts = [build({ category: 'measurement', id: 'G-DASH1' })];

			loadScripts(scripts, ALL_DENIED);
			await settleScripts();
			updateScripts(scripts, grantedMarketingConsents);

			expect(toArgs(win.dataLayer?.at(-1))).toEqual([
				'consent',
				'update',
				expect.objectContaining({
					ad_storage: 'granted',
					analytics_storage: 'denied',
				}),
			]);
		});

		it('with after-consent, waits for its category, loads once, then denies on withdrawal', async () => {
			const requests = recordGoogleRequests();
			const win = window as TestWindow;
			const scripts = [
				build({
					category: 'measurement',
					id: 'G-DASH1',
					loadMode: 'after-consent',
				}),
			];

			loadScripts(scripts, ALL_DENIED);
			await settleScripts();
			updateScripts(scripts, grantedMarketingConsents);
			expect(requests).toEqual([]);
			expect(win.dataLayer).toBeUndefined();
			expect(win.gtag).toBeUndefined();

			updateScripts(scripts, grantedMeasurementConsents);
			await settleScripts();
			expect(requests).toHaveLength(1);
			expect(requests[0]?.queue[0]).toEqual([
				'consent',
				'default',
				{ ...deniedDefault, analytics_storage: 'granted' },
			]);
			expect(requests[0]?.queue[2]).toEqual(['config', 'G-DASH1']);

			updateScripts(scripts, ALL_DENIED);
			expect(toArgs(win.dataLayer?.at(-1))).toEqual([
				'consent',
				'update',
				expect.objectContaining({ analytics_storage: 'denied' }),
			]);
			expect(requests).toHaveLength(1);
		});
	}
);
