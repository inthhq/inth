const quickPackages = ['@inth/core-benchmarks', '@inth/script-lifecycle-bench'];

/**
 * The bench that hosts each consent gate target. The script tag has no
 * framework bench, so the script-lifecycle bench serves its page.
 */
export const gateTargetPackages = {
	angular: '@inth/angular-browser-bench',
	astro: '@inth/astro-browser-bench',
	nextjs: '@inth/nextjs-browser-bench',
	nuxt: '@inth/nuxt-browser-bench',
	react: '@inth/react-browser-bench',
	'script-tag': '@inth/script-lifecycle-bench',
	sveltekit: '@inth/sveltekit-browser-bench',
	'tanstack-start': '@inth/tanstack-start-browser-bench',
} as const;

export type GateTarget = keyof typeof gateTargetPackages;

const profiles: Record<string, { packages: string[]; suites: string[] }> = {
	bundle: {
		packages: ['@inth/next-bundle-bench'],
		suites: ['bundle', 'artifact'],
	},
	// Each revision builds and measures its own `examples/` starters.
	examples: {
		packages: ['@inth/examples-payload-bench'],
		suites: ['examples-payload'],
	},
	full: {
		packages: [
			...quickPackages,
			'@inth/react-browser-bench',
			'@inth/nextjs-browser-bench',
			'@inth/nuxt-browser-bench',
			'@inth/sveltekit-browser-bench',
			'@inth/astro-browser-bench',
			'@inth/tanstack-start-browser-bench',
		],
		suites: [
			'core-runtime',
			'policy-runtime',
			'script-lifecycle',
			'browser-runtime',
		],
	},
	// CookieBench-equivalent load and tap timings, one job per framework.
	gate: {
		packages: Object.values(gateTargetPackages),
		suites: ['consent-gate'],
	},
	quick: {
		packages: quickPackages,
		suites: ['core-runtime', 'policy-runtime', 'script-lifecycle'],
	},
};

/**
 * Packages split across several runners, with the share each one measures in
 * `INTH_BENCH_ONLY` / `INTH_BENCH_SKIP` syntax (see
 * `benchmarks/shared/src/selection.ts`).
 *
 * Every core-benchmarks pass spends about 30 seconds on each policy fixture
 * and two on all of core-runtime, and a runner makes six passes, so one
 * runner took ten minutes, the slowest job in CI. Each shard still alternates
 * base and head on its own runner. The last shard skips the fixtures named
 * before it rather than listing its own, so a new policy fixture is measured
 * there instead of by nobody.
 */
const shards: Record<string, { id: string; only: string[]; skip: string[] }[]> =
	{
		'@inth/core-benchmarks': [
			{
				id: 'core-benchmarks-eu',
				only: ['core-runtime', 'policy-runtime:optin-choice-eu'],
				skip: [],
			},
			{
				id: 'core-benchmarks-california',
				only: ['policy-runtime:optout-california'],
				skip: [],
			},
			{
				id: 'core-benchmarks-world',
				only: ['policy-runtime'],
				skip: [
					'policy-runtime:optin-choice-eu',
					'policy-runtime:optout-california',
				],
			},
		],
	};

/** One runner's share of a profile. */
export interface BenchmarkShard {
	id: string;
	package: string;
	only: string[];
	skip: string[];
}

/**
 * The runners a profile is measured on, one or more per package. Gate jobs
 * share packages with the runtime profiles, so their ids carry a `gate-`
 * prefix and their artifacts never collide in one workflow run.
 */
export const createBenchmarkShards = function createBenchmarkShards(
	packages: string[],
	mode?: string
): BenchmarkShard[] {
	if (mode === 'gate') {
		return packages.map((name) => ({
			id: `gate-${name.replace('@inth/', '')}`,
			only: [],
			package: name,
			skip: [],
		}));
	}
	return packages.flatMap(
		(name) =>
			(Object.hasOwn(shards, name) ? shards[name] : undefined)?.map(
				(shard) => ({ ...shard, package: name })
			) ?? [
				{ id: name.replace('@inth/', ''), only: [], package: name, skip: [] },
			]
	);
};

/**
 * Resolve the gate targets a run measures: `all`, `none`, or a comma list
 * of target names such as `react,nuxt`. CI passes the targets
 * the caller selected; unknown names fail.
 *
 * @returns The selected hosting packages, in profile order.
 */
export const selectGatePackages = function selectGatePackages(
	targets: string
): string[] {
	const value = targets.trim();
	if (value === '' || value === 'none') {
		return [];
	}
	if (value === 'all') {
		return Object.values(gateTargetPackages);
	}
	const names = value.split(',').map((name) => name.trim());
	const unknown = names.filter(
		(name) => !Object.hasOwn(gateTargetPackages, name)
	);
	if (unknown.length) {
		throw new Error(`Unknown consent gate target: ${unknown.join(', ')}`);
	}
	return Object.values(gateTargetPackages).filter((name) =>
		names.some((target) => gateTargetPackages[target as GateTarget] === name)
	);
};

/**
 * Select the complete profile, one package, or one shard by its matrix id,
 * rejecting empty or unknown selections.
 */
export const createBenchmarkPlan = function createBenchmarkPlan(
	mode: string,
	selector?: string
) {
	const profile = Object.hasOwn(profiles, mode) ? profiles[mode] : undefined;
	if (!profile) {
		throw new Error(`Unknown benchmark mode: ${mode}`);
	}
	const shard = createBenchmarkShards(profile.packages, mode).find(
		(entry) => entry.id === selector
	);
	if (
		selector !== undefined &&
		!shard &&
		!profile.packages.includes(selector)
	) {
		throw new Error(`Unknown benchmark package for ${mode}: ${selector}`);
	}
	const selected = shard?.package ?? selector;
	const packages = selected === undefined ? profile.packages : [selected];
	return {
		// The Nuxt runner records results under the Vue adapter's package name.
		expectedPackages: packages.map((name) =>
			name === '@inth/nuxt-browser-bench' ? '@inth/vue' : name
		),
		only: shard?.only ?? [],
		packages,
		skip: shard?.skip ?? [],
		suites: profile.suites,
	};
};

/**
 * Matrix entries for one or more modes. `gate` runs only the targets in
 * `gateTargets`; the other modes run their whole profile.
 */
export const createBenchmarkMatrix = function createBenchmarkMatrix(
	modes: string[],
	gateTargets = 'all'
): { id: string; package: string; mode: string }[] {
	return modes.flatMap((mode) => {
		const { packages } = createBenchmarkPlan(mode);
		const selected =
			mode === 'gate'
				? packages.filter((name) =>
						selectGatePackages(gateTargets).includes(name)
					)
				: packages;
		return createBenchmarkShards(selected, mode).map(
			({ id, package: name }) => ({
				id,
				mode,
				package: name,
			})
		);
	});
};

if (import.meta.main) {
	// `quick`, `full,gate`, ...; BENCHMARK_GATE_TARGETS narrows `gate`.
	const modes = (process.argv[2] ?? 'quick').split(',').filter(Boolean);
	process.stdout.write(
		JSON.stringify({
			include: createBenchmarkMatrix(
				modes,
				process.env.BENCHMARK_GATE_TARGETS || 'all'
			),
		})
	);
}
