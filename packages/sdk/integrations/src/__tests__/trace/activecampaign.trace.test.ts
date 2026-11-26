/** @vitest-environment jsdom */
import { describe } from 'vite-plus/test';

import { describeGoldenTraces } from './golden';
import { remoteTraceFactory } from './remote';

const load = () => import('./specs/activecampaign');

describe('npm helper', async () => {
	await describeGoldenTraces(load);
});

/**
 * The manifest the Inth server sends for an account ID. The runtime loads
 * the ActiveCampaign adapter the manifest names before it builds it.
 */
describe('remote manifest', async () => {
	await describeGoldenTraces(load, {
		factory: remoteTraceFactory('activeCampaignTracking', {
			accountId: '12345',
		}),
		names: ['activecampaign.dashboard', 'activecampaign.unmanaged-tracker'],
	});
});
