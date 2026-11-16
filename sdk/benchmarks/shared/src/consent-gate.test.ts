import { runInNewContext } from 'node:vm';

import { describe, expect, it } from 'vitest';

import { consentGateBudgets, consentGateTargets } from './budgets';
import {
	acceptMetrics,
	INP_CENSOR_FLOOR_MS,
	interactionDuration,
	returningScripts,
	summarizeGateSamples,
} from './consent-gate';
import type { GateIterationSample } from './consent-gate';
import {
	COOKIEBENCH_HERO_BYTES,
	createGateHeroPng,
	gateScriptBody,
} from './consent-gate-assets';
import type { GateObservations } from './consent-gate-observer';
import { updateGateBridge } from './consent-gate-page';
import { budgetIdentity, expectedBenchmarkResults } from './expected-results';

const observations = (
	overrides: Partial<GateObservations> = {}
): GateObservations => ({
	allowedCategories: ['measurement', 'marketing'],
	consent: 'accepted',
	dismissedAt: 1080,
	effectiveAt: 1040,
	events: [
		{ duration: 24, interactionId: 7, name: 'pointerdown', startTime: 1000 },
		{ duration: 56, interactionId: 7, name: 'click', startTime: 1010 },
		{ duration: 900, interactionId: 3, name: 'click', startTime: 400 },
	],
	heroComplete: true,
	input: { at: 1000, type: 'pointerdown' },
	inputEvents: [
		{ at: 1000, type: 'pointerdown' },
		{ at: 1010, type: 'click' },
	],
	scripts: [
		{ at: 1150, category: 'measurement', id: 'gate-script-0' },
		{ at: 1190, category: 'marketing', id: 'gate-script-1' },
	],
	...overrides,
});

describe('consent gate metrics', () => {
	it('times Accept from its pointerdown, like CookieBench', () => {
		expect(acceptMetrics(observations())).toEqual({
			consentEffectiveMs: 40,
			dismissedMs: 80,
			inputToNextPaintMs: 56,
			scriptsCompleteMs: 190,
		});
	});

	it('ignores interactions that are not the armed tap', () => {
		expect(
			interactionDuration(
				observations({
					events: [
						{ duration: 900, interactionId: 3, name: 'click', startTime: 400 },
					],
				})
			)
		).toBe(INP_CENSOR_FLOOR_MS);
	});

	it('fails a visit whose gated scripts did not all run', () => {
		expect(() =>
			acceptMetrics(
				observations({ scripts: observations().scripts.slice(0, 1) })
			)
		).toThrow('Expected 2 gated scripts');
	});

	it('fails a visit that never took effect instead of dropping it', () => {
		expect(() =>
			acceptMetrics(observations({ effectiveAt: undefined }))
		).toThrow('Accept did not complete');
	});

	it('fails a returning visit whose scripts did not each run once', () => {
		const script = (category: string, at: number) => ({
			at,
			category,
			id: category,
		});
		expect(
			returningScripts({
				scripts: [script('measurement', 900), script('marketing', 1200)],
			})
		).toBe(1200);
		expect(() =>
			returningScripts({
				scripts: [script('measurement', 900), script('measurement', 1000)],
			})
		).toThrow('to run once');
	});

	it('pairs LCP with the same iteration control', () => {
		const sample = (
			lcpMs: number,
			controlLcpMs: number
		): GateIterationSample => ({
			bannerVisibleMs: 230,
			consentEffectiveMs: 50,
			controlFcpMs: 240,
			controlLcpMs,
			dismissedMs: 50,
			fcpMs: 250,
			inputToNextPaintMs: 16,
			lcpMs,
			preferencesVisibleMs: 640,
			returningLcpMs: lcpMs - 20,
			returningScriptsMs: 2100,
			scriptsCompleteMs: 190,
		});
		const metrics = summarizeGateSamples([
			sample(3100, 3000),
			sample(3500, 3300),
			sample(3200, 3150),
		]);
		const byName = new Map(metrics.map((metric) => [metric.name, metric]));
		expect(byName.get('lcpDeltaMs')?.samples).toEqual([100, 200, 50]);
		expect(byName.get('returningLcpDeltaMs')?.samples).toEqual([80, 180, 30]);
		expect(byName.get('returningScriptsMs')?.median).toBe(2100);
		expect(byName.get('slowestTapMs')?.median).toBe(640);
	});
});

describe('consent gate fixture', () => {
	it('generates the same hero every time, near CookieBench weight', () => {
		const hero = createGateHeroPng();
		expect(hero.equals(createGateHeroPng())).toBe(true);
		expect(Math.abs(hero.length / COOKIEBENCH_HERO_BYTES - 1)).toBeLessThan(
			0.05
		);
	});

	it('records a gated script execution in the bridge', () => {
		const sandbox: { window: Record<string, unknown>; performance: unknown } = {
			performance: { now: () => 12 },
			window: {},
		};
		runInNewContext(gateScriptBody('s', 'marketing'), sandbox);
		expect(sandbox.window.__cookiebench).toMatchObject({
			scripts: [{ at: 12, category: 'marketing', id: 's' }],
		});
	});

	it('bridges effective permissions, not the requested choice', () => {
		const global = globalThis as unknown as {
			window?: unknown;
			document?: unknown;
			__cookiebench?: { allowedCategories: string[]; consent: string };
		};
		const dataset: Record<string, string> = {};
		global.window = global;
		global.document = { documentElement: { dataset } };
		try {
			updateGateBridge({
				effectivePermissions: {
					marketing: false,
					measurement: true,
					necessary: true,
				},
				explicitChoice: {
					categories: {
						marketing: { value: true },
						measurement: { value: true },
					},
				},
				resolution: { status: 'matched' },
			});
			expect(global.__cookiebench).toMatchObject({
				allowedCategories: ['measurement'],
				consent: 'accepted',
			});
			expect(dataset.consentReady).toBe('true');
		} finally {
			delete global.window;
			delete global.document;
			delete global.__cookiebench;
		}
	});
});

describe('consent gate budgets', () => {
	it('expects one gate result with every budget for each target', () => {
		const gate = expectedBenchmarkResults.filter(
			(entry) => entry.suite === 'consent-gate'
		);
		expect(gate).toHaveLength(consentGateTargets.length);
		for (const entry of gate) {
			const metrics = entry.budgets.map((budget) => budget.metric);
			for (const metric of [
				'lcpDeltaMs',
				'bannerVisibleMs',
				'consentEffectiveMs',
				'dismissedMs',
				'inputToNextPaintMs',
				'scriptsCompleteMs',
				'preferencesVisibleMs',
				'slowestTapMs',
				'returningLcpDeltaMs',
				'returningScriptsMs',
				'rejectedScriptRequests',
			]) {
				expect(metrics).toContain(metric);
			}
		}
	});

	it('keeps a relative budget and a ceiling on one metric apart', () => {
		const identities = consentGateBudgets('nextjs').map(budgetIdentity);
		expect(new Set(identities).size).toBe(identities.length);
		expect(identities).toEqual(
			expect.arrayContaining(['bannerVisibleMs', 'bannerVisibleMs (ceiling)'])
		);
	});

	it('allows no gated script request after a reject', () => {
		for (const target of consentGateTargets) {
			const budget = consentGateBudgets(target).find(
				(entry) => entry.metric === 'rejectedScriptRequests'
			);
			expect(budget?.comparator).toBe('absolute-lte');
			expect(budget?.threshold).toBe(0);
		}
	});

	it('holds every tap to 1,000 ms', () => {
		for (const target of consentGateTargets) {
			const ceiling = consentGateBudgets(target).find(
				(budget) => budget.metric === 'slowestTapMs'
			);
			expect(ceiling?.comparator).toBe('absolute-lte');
			expect(ceiling?.threshold).toBe(1000);
		}
	});

	it('sets a banner ceiling only for server-rendered banners', () => {
		const ceilings = consentGateTargets.filter((target) =>
			consentGateBudgets(target).some(
				(budget) =>
					budget.metric === 'bannerVisibleMs' &&
					budget.comparator === 'absolute-lte'
			)
		);
		expect(ceilings).toEqual([
			'nextjs',
			'nuxt',
			'astro',
			'sveltekit',
			'tanstack-start',
			'angular',
		]);
	});
});
