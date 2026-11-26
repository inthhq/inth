/** @vitest-environment jsdom */
import { describe } from 'vite-plus/test';

import { describeGoldenTraces } from './golden';
import { remoteTraceFactory } from './remote';

const load = () => import('./specs/amazon-ads');

describe('npm helper', async () => {
	await describeGoldenTraces(load);
});

// The manifest the Inth server sends, after a JSON round trip, for the
// specs a dashboard can set. The runtime loads the Amazon Ads adapter the
// manifest names. A country code is per-visitor, so its spec runs only for
// the helper.
describe('remote manifest', async () => {
	await describeGoldenTraces(load, {
		// The helper returns the same script for equal options, as the loader
		// keeps its script while the manifest is unchanged.
		factory: remoteTraceFactory(
			'amazonAdsTag',
			{ tagId: '00000000-0000-0000-0000-000000000000' },
			{ keepScript: true }
		),
		names: ['amazon-ads.no-country'],
	});
	await describeGoldenTraces(load, {
		factory: remoteTraceFactory(
			'amazonAdsTag',
			{
				region: 'EU',
				tagId: '00000000-0000-0000-0000-000000000000',
				trackPageView: false,
			},
			{ keepScript: true }
		),
		names: ['amazon-ads.dashboard'],
	});
});
