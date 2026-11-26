/** @vitest-environment jsdom */
import { describe } from 'vite-plus/test';

import { describeGoldenTraces } from './golden';
import { remoteTraceFactory } from './remote';

const load = () => import('./specs/pirsch');

describe('npm helper', async () => {
	await describeGoldenTraces(load);
});

describe('remote manifest', async () => {
	await describeGoldenTraces(load, {
		factory: remoteTraceFactory('pirsch', {
			disablePageViews: true,
			domain: ['example.com', 'www.example.com'],
			identificationCode: 'pirsch-code',
		}),
	});
});
