/** @vitest-environment jsdom */
import { describe } from 'vite-plus/test';

import { describeGoldenTraces } from './golden';
import { remoteTraceFactory } from './remote';

const load = () => import('./specs/cloudflare-zaraz');

describe('npm helper', async () => {
	await describeGoldenTraces(load);
});

// The manifest the Inth server sends, after a JSON round trip, with the
// spec's mapping keyed by Zaraz purpose ID as a dashboard saves it. The
// runtime loads the Cloudflare Zaraz adapter the manifest names.
describe('remote manifest', async () => {
	await describeGoldenTraces(load, {
		factory: remoteTraceFactory('cloudflareZaraz', {
			purposes: { 'p-ads': 'marketing', 'p-analytics': 'measurement' },
		}),
	});
});
