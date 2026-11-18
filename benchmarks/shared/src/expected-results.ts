import { DEFAULT_BENCH_BACKEND_LATENCY_MS, benchScenarioKey } from './browser';
import type { BenchCondition } from './browser';
/**
 * Registry of the benchmark results the comparison gate expects.
 *
 * `run-compare.ts` reads this list to fail a run that measured less than
 * it should have: a missing head artifact, a missing base artifact, or a
 * head artifact whose budget definitions dropped a metric all count as
 * gate failures. The budget definitions are the same objects the runners
 * attach, and the comparison runner checks each head definition against
 * them canonically (metric, comparator, thresholds, arm mapping), so a
 * runner that drops or weakens a budget cannot pass the gate.
 */
import {
	astroBrowserBudgetsForScenario,
	sveltekitBrowserBudgetsForScenario,
	tanstackBrowserBudgetsForScenario,
	bundleEntryBudgets,
	artifactBudgets,
	consentGateBudgets,
	bundleBudgets,
	coreRuntimeBudgets,
	coreRuntimeCoverageBudgets,
	coreRuntimeV3Budgets,
	nextjsBrowserBudgetsForScenario,
	nuxtBrowserBudgetsForScenario,
	policyRuntimeBudgetsForFixture,
	reactBrowserBudgetsForScenario,
	scriptLifecycleBudgetsForMetric,
} from './budgets';
import type { ConsentGateTarget } from './budgets';
import {
	EXAMPLES_PAYLOAD_PACKAGE,
	examplesPayloadBudgetsFor,
	examplesPayloadExamples,
} from './examples-payload';
import { coreFixtures } from './fixtures';
import { policyBenchFixtures } from './policy-fixtures';
import type { BenchmarkSuite, MetricBudget } from './schema';

export interface ExpectedBenchmarkResult {
	/**
	 * `${package}:${scenario}:${suite}`. Browser-runtime scenarios carry the
	 * condition, for example `ssr:profile-none:latency-200ms`.
	 */
	key: string;
	/** Scenario part of {@link key}, as a benchmark selection names it. */
	scenario: string;
	suite: BenchmarkSuite;
	/** Canonical budget definitions the head artifact must carry. */
	budgets: MetricBudget[];
}

/**
 * Identity of a budget within one result: metric, base arm, and whether it
 * is an absolute ceiling. A metric can carry one relative budget and one
 * `absolute-lte` ceiling, for example a banner time that must not grow over
 * its base and must also stay under a fixed limit.
 */
export const budgetIdentity = function budgetIdentity(
	budget: Pick<MetricBudget, 'metric' | 'baseArm' | 'comparator'>
): string {
	const metric =
		budget.comparator === 'absolute-lte'
			? `${budget.metric} (ceiling)`
			: budget.metric;
	return budget.baseArm ? `${metric}@${budget.baseArm}` : metric;
};

/**
 * Canonical comparison of two budget definitions. Descriptions are prose
 * and ignored; everything that changes what the budget enforces must match.
 */
export const describeBudgetDifference = function describeBudgetDifference(
	expected: MetricBudget,
	actual: MetricBudget
): string | null {
	const fields: (keyof MetricBudget)[] = [
		'comparator',
		'threshold',
		'secondaryThreshold',
		'baseArm',
		'baseArmMetric',
	];
	const differences = fields
		.filter((field) => expected[field] !== actual[field])
		.map(
			(field) =>
				`${field} expected ${String(expected[field])} but saw ${String(actual[field])}`
		);
	return differences.length > 0 ? differences.join('; ') : null;
};

const expect = function expect(
	pkg: string,
	scenario: string,
	suite: BenchmarkSuite,
	budgets: MetricBudget[]
): ExpectedBenchmarkResult {
	return {
		budgets,
		key: `${pkg}:${scenario}:${suite}`,
		scenario,
		suite,
	};
};

export const reactBrowserScenarios = [
	'banner-css',
	'baseline',
	'css-banner-modules',
	'full-ui',
	'headless',
	'saved-consent-accept',
	'saved-consent-reject',
	'policy-fresh',
	'policy-reject',
	'policy-notice',
	'policy-none',
	'policy-repeat',
] as const;

export const nextjsBrowserScenarios = [
	'baseline',
	'client',
	'manifest-client',
	'ssr',
	'manifest-ssr',
	'saved-consent-accept',
	'saved-consent-reject',
	'ssr-repeat',
	'typical-install',
	'typical-install-repeat',
	'typical-install-returning',
] as const;

export const nuxtBrowserScenarios = [
	'baseline',
	'baseline-client',
	'ssr',
	'ssr-manifest',
	'client',
	'client-manifest',
	'repeat-visitor',
] as const;

export const scriptLifecycleScenarios = [
	['grant-standard', 'grantStandardLifecycleMs'],
	['revoke-standard', 'revokeStandardLifecycleMs'],
	['reload-single', 'reloadSingleScriptMs'],
	['callback-only-toggle', 'callbackOnlyToggleMs'],
	['always-load-retain', 'alwaysLoadRetentionMs'],
	['persist-after-revoked', 'persistAfterRevokedMs'],
] as const;

export const bundleRouteScenarios = [
	'baseline',
	'core-only',
	'css-banner-modules',
	'css-iab-lazy',
	'css-iab-modules',
	'nextjs-basic',
	'nextjs-ssr',
	'react-banner-only',
	'react-full',
	'react-full-split',
	'react-harness',
	'react-headless',
	'react-manifest-client',
	'react-standard-script-loader',
] as const;

export const bundleEntryScenarios = [
	'browser-full',
	'browser-headless',
	'iab-lazy',
	'kernel-hosted',
	'kernel-hosted-offline',
	'manifest-transport',
	'provider',
	'ordinary-react',
] as const;

const bundleRouteBudget = function bundleRouteBudget(
	scenario: string
): MetricBudget[] {
	return bundleBudgets.filter((budget) => budget.metric === scenario);
};

/**
 * The package each consent gate target reports under. Nuxt results use the
 * Vue adapter's name like its other results; the script tag is hosted by the
 * script-lifecycle bench.
 */
export const consentGatePackages: Record<ConsentGateTarget, string> = {
	angular: '@c15t/angular-browser-bench',
	astro: '@c15t/astro-browser-bench',
	nextjs: '@c15t/nextjs-browser-bench',
	nuxt: '@inth/vue',
	react: '@c15t/react-browser-bench',
	'script-tag': '@c15t/script-lifecycle-bench',
	sveltekit: '@c15t/sveltekit-browser-bench',
	'tanstack-start': '@c15t/tanstack-start-browser-bench',
};

/** The condition `scripts/benchmark-run.ts` measures by default. */
export const defaultBenchCondition: BenchCondition = {
	backendLatencyMs: DEFAULT_BENCH_BACKEND_LATENCY_MS,
	profile: 'none',
};

/**
 * Every result the gate expects when the browser benches ran under
 * `condition`. Only browser-runtime keys depend on it.
 *
 * @param condition - Throttle profile and backend latency of the run.
 */
export const expectedBenchmarkResultsFor = function expectedBenchmarkResultsFor(
	condition: BenchCondition
): ExpectedBenchmarkResult[] {
	const browser = (scenario: string) => benchScenarioKey(scenario, condition);
	return [
		...[
			'baseline',
			'ssr',
			'ssr-manifest',
			'ssr-deferred',
			'repeat-visitor',
			'scripts',
			'repeat-visitor-scripts',
		].map((scenario) =>
			expect(
				'@c15t/astro-browser-bench',
				browser(scenario),
				'browser-runtime',
				astroBrowserBudgetsForScenario(scenario)
			)
		),
		...[
			'baseline',
			'baseline-client',
			'ssr',
			'ssr-manifest',
			'client',
			'client-manifest',
			'repeat-visitor',
			'scripts',
			'repeat-visitor-scripts',
		].map((scenario) =>
			expect(
				'@c15t/sveltekit-browser-bench',
				browser(scenario),
				'browser-runtime',
				sveltekitBrowserBudgetsForScenario(scenario)
			)
		),
		...[
			'baseline',
			'client',
			'manifest-client',
			'ssr',
			'ssr-stream',
			'manifest-ssr',
			'manifest-ssr-proxy',
			'saved-consent-accept',
			'saved-consent-reject',
		].map((scenario) =>
			expect(
				'@c15t/tanstack-start-browser-bench',
				browser(scenario),
				'browser-runtime',
				tanstackBrowserBudgetsForScenario(scenario)
			)
		),
		...Object.keys(coreFixtures).map((fixture) =>
			expect('@c15t/core-benchmarks', fixture, 'core-runtime', [
				...coreRuntimeBudgets,
				...coreRuntimeCoverageBudgets,
				...coreRuntimeV3Budgets,
			])
		),
		...Object.values(policyBenchFixtures).map((fixture) =>
			expect(
				'@c15t/core-benchmarks',
				fixture.name,
				'policy-runtime',
				policyRuntimeBudgetsForFixture(fixture)
			)
		),
		...reactBrowserScenarios.map((scenario) =>
			expect(
				'@c15t/react-browser-bench',
				browser(scenario),
				'browser-runtime',
				reactBrowserBudgetsForScenario(scenario)
			)
		),
		...nextjsBrowserScenarios.map((scenario) =>
			expect(
				'@c15t/nextjs-browser-bench',
				browser(scenario),
				'browser-runtime',
				nextjsBrowserBudgetsForScenario(scenario)
			)
		),
		...nuxtBrowserScenarios.map((scenario) =>
			expect(
				'@inth/vue',
				browser(scenario),
				'browser-runtime',
				nuxtBrowserBudgetsForScenario(scenario)
			)
		),
		...scriptLifecycleScenarios.map(([scenario, metric]) =>
			expect(
				'@c15t/script-lifecycle-bench',
				scenario,
				'script-lifecycle',
				scriptLifecycleBudgetsForMetric(metric)
			)
		),
		...bundleRouteScenarios.map((scenario) =>
			expect(
				'@c15t/next-bundle-bench',
				scenario,
				'bundle',
				bundleRouteBudget(scenario)
			)
		),
		expect('@c15t/next-bundle-bench', 'tarballs', 'artifact', artifactBudgets),
		...bundleEntryScenarios.map((scenario) =>
			expect(
				'@c15t/next-bundle-bench',
				scenario,
				'bundle',
				bundleEntryBudgets(scenario)
			)
		),
		...(
			Object.entries(consentGatePackages) as [ConsentGateTarget, string][]
		).map(([target, pkg]) =>
			expect(
				pkg,
				`consent-gate:latency-${condition.backendLatencyMs}ms`,
				'consent-gate',
				consentGateBudgets(target)
			)
		),
		...examplesPayloadExamples.map((example) =>
			expect(
				EXAMPLES_PAYLOAD_PACKAGE,
				example.name,
				'examples-payload',
				examplesPayloadBudgetsFor(example.kind)
			)
		),
	];
};

/** {@link expectedBenchmarkResultsFor} at {@link defaultBenchCondition}. */
export const expectedBenchmarkResults: ExpectedBenchmarkResult[] =
	expectedBenchmarkResultsFor(defaultBenchCondition);
