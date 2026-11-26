/** @vitest-environment jsdom */
import { describe } from 'vite-plus/test';

import { describeGoldenTraces } from './golden';
import { remoteTraceFactory } from './remote';

const load = () => import('./specs/hubspot');

describe('npm helper', async () => {
	await describeGoldenTraces(load);
});

/**
 * The manifests the Inth server sends for the specs' options. The runtime
 * loads the HubSpot adapter the manifests name before it builds them.
 */
describe('remote manifest', async () => {
	await describeGoldenTraces(load, {
		factory: remoteTraceFactory('hubspot', { portalId: '53' }),
		names: ['hubspot'],
	});
	await describeGoldenTraces(load, {
		factory: remoteTraceFactory('hubspot', { chat: true, portalId: '53' }),
		names: ['hubspot.chat'],
	});
});
