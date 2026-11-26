/** @vitest-environment jsdom */
import { describe } from 'vite-plus/test';

import { describeGoldenTraces } from './golden';
import { remoteTraceFactory } from './remote';

const load = () => import('./specs/pendo');

describe('npm helper', async () => {
	await describeGoldenTraces(load);
});

describe('remote manifest', async () => {
	await describeGoldenTraces(load, {
		// The helper returns the same script for equal options, as the loader
		// keeps its script while the manifest is unchanged.
		factory: remoteTraceFactory(
			'pendo',
			{ apiKey: 'api-key' },
			{ keepScript: true }
		),
		names: ['pendo.dashboard'],
	});
});
