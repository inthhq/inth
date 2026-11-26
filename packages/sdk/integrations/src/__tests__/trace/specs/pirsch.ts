import { pirsch } from '../../../vendors/analytics/pirsch';
import type { TraceSpec } from '../harness';

export const pirschTrace: TraceSpec = {
	granted: { measurement: true },
	name: 'pirsch',
	onFileLoad(_src, stubs) {
		stubs.install(
			'pirsch',
			stubs.fn('pirsch', () => Promise.resolve(undefined))
		);
		stubs.install('pirschInit', stubs.fn('pirschInit'));
	},
	script: () =>
		pirsch({
			disablePageViews: true,
			domain: ['example.com', 'www.example.com'],
			identificationCode: 'pirsch-code',
		}),
};

export const traces = [pirschTrace];
