/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vite-plus/test';

import { adrollPixel } from '../../vendors/ads-and-pixels/adroll';
import {
	describeGoldenTraces,
	readGoldenTrace,
	scenarioNameMismatch,
	scenariosOf,
} from './golden';
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

describe('fixture scenario names', () => {
	const fixtureOf = (names: string[]) => ({
		name: adrollTrace.name,
		scenarios: Object.fromEntries(names.map((name) => [name, []])),
	});
	const specNames = scenariosOf(adrollTrace).map((scenario) => scenario.name);

	it("accepts a fixture with the spec's scenarios", () => {
		expect(
			scenarioNameMismatch(adrollTrace, fixtureOf(specNames))
		).toBeUndefined();
	});

	it('fails for a scenario only in the fixture', () => {
		expect(
			scenarioNameMismatch(
				adrollTrace,
				fixtureOf([...specNames, 'a scenario the spec dropped'])
			)
		).toContain('Not in the spec: "a scenario the spec dropped"');
	});

	it('fails for a scenario only in the spec', () => {
		expect(
			scenarioNameMismatch(adrollTrace, fixtureOf(specNames.slice(1)))
		).toContain(`Not in the fixture: "${specNames[0]}"`);
	});

	it('fails for a missing fixture', () => {
		expect(scenarioNameMismatch(adrollTrace, undefined)).toContain(
			'No fixture at fixtures/adroll.json'
		);
	});
});

describe('idle callbacks', () => {
	it('runs them on fake timers when the page brings its own', async () => {
		// As a jsdom that implements them would: never driven by fake timers.
		const page = window as unknown as Record<string, unknown>;
		page.requestIdleCallback = () => 0;
		page.cancelIdleCallback = () => undefined;
		try {
			vi.resetModules();
			const { sentryCdnTrace } = await import('./specs/sentry');
			const [scenario] = scenariosOf(sentryCdnTrace);
			if (!scenario) {
				throw new Error('Sentry has no scenarios');
			}
			expect(await runTraceScenario(sentryCdnTrace, scenario)).toEqual(
				readGoldenTrace('sentry.cdn')?.scenarios[scenario.name]
			);
		} finally {
			Reflect.deleteProperty(page, 'requestIdleCallback');
			Reflect.deleteProperty(page, 'cancelIdleCallback');
		}
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
