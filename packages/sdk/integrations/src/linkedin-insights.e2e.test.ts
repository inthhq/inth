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
	loadScripts,
	registerVendorContractCleanup,
	settleScripts,
	updateScripts,
} from './e2e-test-utils';
import { linkedinInsights } from './vendors/ads-and-pixels/linkedin-insights';

describe('linkedinInsights contract', () => {
	registerVendorContractCleanup();

	it('boots with the required partner globals prepared before load', () => {
		let acknowledged = false;

		installHeadProbe((node, win) => {
			if (
				!node.src.includes('snap.licdn.com/li.lms-analytics/insight.min.js')
			) {
				return;
			}

			acknowledged =
				win._linkedin_partner_id === 'LI-CONTRACT' &&
				Array.isArray(win._linkedin_data_partner_ids) &&
				win._linkedin_data_partner_ids.includes('LI-CONTRACT') &&
				typeof win.lintrk === 'function' &&
				Array.isArray(win.lintrk.q) &&
				win.lintrk.q.length === 0;

			node.dispatchEvent(new Event('load'));
		});

		loadScripts(
			[
				{
					...linkedinInsights({ id: 'LI-CONTRACT' }),
					id: 'linkedin-insights-contract',
				},
			],
			grantedMarketingConsents
		);

		expect(acknowledged).toBe(true);
	});
});

describe.each(npmAndRemote('linkedinInsights', linkedinInsights))(
	'LinkedIn Insight Tag dashboard settings through the %s',
	(_label, build) => {
		registerVendorContractCleanup();

		it('sets no partner globals before marketing, then prepares them before the file runs', async () => {
			let prepared = false;
			installHeadProbe((node, win) => {
				if (
					!node.src.includes('snap.licdn.com/li.lms-analytics/insight.min.js')
				) {
					return;
				}
				prepared =
					win._linkedin_partner_id === '1234567' &&
					Array.isArray(win._linkedin_data_partner_ids) &&
					win._linkedin_data_partner_ids.includes('1234567') &&
					typeof win.lintrk === 'function';
			});
			const win = window as unknown as Record<string, unknown>;
			const scripts = [build({ id: '1234567' })];

			loadScripts(scripts, ALL_DENIED);
			await settleScripts();
			updateScripts(scripts, grantedMeasurementConsents);
			expect(document.querySelector('script[src*="licdn.com"]')).toBeNull();
			expect(win._linkedin_partner_id).toBeUndefined();
			expect(win.lintrk).toBeUndefined();

			updateScripts(scripts, grantedMarketingConsents);
			await settleScripts();
			expect(prepared).toBe(true);
		});
	}
);
