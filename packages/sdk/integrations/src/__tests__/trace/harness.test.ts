/** @vitest-environment jsdom */
import { describe, expect, it } from 'vite-plus/test';

import { adrollPixel } from '../../vendors/ads-and-pixels/adroll';
import { describeGoldenTraces, readGoldenTrace, scenariosOf } from './golden';
import { runTraceScenario } from './harness';
import { labelStub, toJsonSafe } from './serialize';
import { adrollTrace } from './specs/adroll';

describe('toJsonSafe', () => {
	it('keeps an arguments object apart from an array', () => {
		const args = (function collect(..._values: unknown[]) {
			// oxlint-disable-next-line prefer-rest-params -- The test needs a real arguments object.
			return arguments;
		})('track', 1);
		expect(toJsonSafe([args, ['track', 1]])).toEqual([
			{ '[Arguments]': ['track', 1] },
			['track', 1],
		]);
	});

	it('sorts keys and names stubs, functions and cycles', () => {
		const stub = () => undefined;
		labelStub(stub, 'vendor.track');
		// oxlint-disable-next-line sort-keys -- Out of order on purpose.
		const value: Record<string, unknown> = { b: stub, a: () => undefined };
		value.self = value;
		expect(toJsonSafe(value)).toEqual({
			a: '[Function]',
			b: '[stub vendor.track]',
			self: '[Circular]',
		});
	});
});

describe('golden trace comparison', () => {
	it('fails for a helper that no longer queues its page view', async () => {
		const [scenario] = scenariosOf(adrollTrace);
		if (!scenario) {
			throw new Error('AdRoll has no scenarios');
		}
		const trace = await runTraceScenario(adrollTrace, scenario, () => ({
			...adrollPixel({ advertiserId: 'advertiser', pixelId: 'pixel' }),
			onBeforeLoad: undefined,
		}));
		expect(trace).not.toEqual(
			readGoldenTrace('adroll')?.scenarios[scenario.name]
		);
	});
});

// The path a rebuilt helper takes: another factory, the same fixture.
await describeGoldenTraces(() => import('./specs/adroll'), {
	factory: async () => {
		const { adrollPixel: fresh } =
			await import('../../vendors/ads-and-pixels/adroll');
		return () => fresh({ advertiserId: 'advertiser', pixelId: 'pixel' });
	},
});
