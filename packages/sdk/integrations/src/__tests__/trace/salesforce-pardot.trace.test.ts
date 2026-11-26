/** @vitest-environment jsdom */
import { describe } from 'vite-plus/test';

import { describeGoldenTraces } from './golden';
import { remoteTraceFactory } from './remote';

const load = () => import('./specs/salesforce-pardot');

describe('npm helper', async () => {
	await describeGoldenTraces(load);
});

describe('remote manifest', async () => {
	// Consent mode, the default, through the manifest the Inth server sends:
	// the spec's tracker domain is the dashboard's tracker hostname. The
	// runtime loads the Salesforce Pardot adapter the manifest names. The
	// loader keeps the script an entry built while its manifest is
	// unchanged, as the helper shares one script for equal options.
	await describeGoldenTraces(load, {
		factory: remoteTraceFactory(
			'pardotTracking',
			{ piAId: '123456', piCId: '654321', piHostname: 'go.example.com' },
			{ keepScript: true }
		),
		names: ['salesforce-pardot'],
	});

	// Classic mode, a plain manifest, after a JSON round trip.
	await describeGoldenTraces(load, {
		factory: remoteTraceFactory('pardotTracking', {
			mode: 'classic',
			piAId: '123456',
			piCId: '654321',
		}),
		names: ['salesforce-pardot.classic'],
	});
});
