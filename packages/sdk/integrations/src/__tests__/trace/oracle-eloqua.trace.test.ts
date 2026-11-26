/** @vitest-environment jsdom */
import { describe } from 'vite-plus/test';

import { describeGoldenTraces } from './golden';
import { remoteTraceFactory } from './remote';

const load = () => import('./specs/oracle-eloqua');

describe('npm helper', async () => {
	await describeGoldenTraces(load);
});

/**
 * The manifest the Inth server sends for the spec's options: a dashboard
 * saves the cookie domain in lowercase, as the helper uses it. The runtime
 * loads the Oracle Eloqua adapter the manifest names before it builds it.
 */
describe('remote manifest', async () => {
	await describeGoldenTraces(load, {
		// The loader keeps the script an entry built while its manifest is
		// unchanged, as the helper shares one script for equal options.
		factory: remoteTraceFactory(
			'eloquaTracking',
			{ firstPartyCookieDomain: 'track.example.com', siteId: '1973398186' },
			{ keepScript: true }
		),
	});
});
