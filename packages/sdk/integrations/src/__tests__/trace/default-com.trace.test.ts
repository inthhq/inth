/** @vitest-environment jsdom */
import { describe } from 'vite-plus/test';

import { describeGoldenTraces } from './golden';
import { remoteTraceFactory } from './remote';

const load = () => import('./specs/default-com');

describe('npm helper', async () => {
	await describeGoldenTraces(load);
});

// The manifests the Inth server sends, after a JSON round trip, for the
// specs' options as a dashboard saves them: scheduler origins as domains,
// and the scheduler switch as an enum. The runtime loads the Default
// adapter the manifest names, so the conflict checks run there too.
describe('remote manifest', async () => {
	await describeGoldenTraces(load, {
		factory: remoteTraceFactory('defaultComPixel', {
			publicKey: 'public-key',
			schedulerDomains: ['example.com'],
		}),
		names: ['default-com.pixel', 'default-com.pixel.forms-sdk-present'],
	});
	await describeGoldenTraces(load, {
		factory: remoteTraceFactory('defaultComPixel', {
			autoDisplayScheduler: 'off',
			product: 'forms',
			publicKey: 'public-key',
		}),
		names: ['default-com.forms', 'default-com.forms.pixel-config-present'],
	});
});
