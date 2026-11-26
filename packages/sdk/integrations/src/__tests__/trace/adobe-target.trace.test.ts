/** @vitest-environment jsdom */
import { describe } from 'vite-plus/test';

import { describeGoldenTraces } from './golden';
import { remoteTraceFactory } from './remote';

const load = () => import('./specs/adobe-target');

describe('npm helper', async () => {
	await describeGoldenTraces(load);
});

// The Web SDK through the manifest the Inth server sends, after a JSON
// round trip. The runtime loads the Adobe Target adapter the manifest
// names. at.js loads the site's own download, so it runs only for the
// helper.
describe('remote manifest', async () => {
	await describeGoldenTraces(load, {
		// The helper returns the same script for equal options, as the loader
		// keeps its script while the manifest is unchanged.
		factory: remoteTraceFactory(
			'adobeTarget',
			{
				datastreamId: 'datastream-id',
				orgId: 'ORG@AdobeOrg',
				version: '2.21.0',
			},
			{ keepScript: true }
		),
		names: ['adobe-target.websdk'],
	});
});
