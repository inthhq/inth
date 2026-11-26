/**
 * Golden traces: each vendor spec's scenarios, recorded from today's npm
 * helper into `fixtures/<spec name>.json`.
 *
 * To record them again after an intended behaviour change, run from
 * `packages/sdk/integrations`:
 *
 *   UPDATE_GOLDEN_TRACES=1 pnpm exec vp test run src/__tests__/trace --coverage.enabled=false
 *   pnpm run fmt
 *
 * and review the fixture diff like code. A run with another `factory`
 * never writes, so a rebuilt helper can only be compared with the fixture.
 */
import type { Script } from '@inth/sdk/engine';
import { afterAll, describe, expect, it, vi } from 'vite-plus/test';

import { runTraceScenario } from './harness';
import type {
	TraceEvent,
	TraceScenario,
	TraceSpec,
	TraceStubs,
} from './harness';
import { standardScenarios } from './scenarios';

export interface GoldenTraceFixture {
	name: string;
	scenarios: Record<string, TraceEvent[]>;
}

// The package's type config leaves out Node's globals; this file runs only
// under Vitest in Node, so it reads the two it needs here.
interface NodeFs {
	existsSync: (path: URL) => boolean;
	mkdirSync: (path: URL, options: { recursive: true }) => void;
	readFileSync: (path: URL, encoding: 'utf8') => string;
	writeFileSync: (path: URL, data: string) => void;
}
interface NodeProcess {
	env: Record<string, string | undefined>;
	getBuiltinModule: (id: 'node:fs') => NodeFs;
}
const nodeProcess = (globalThis as unknown as { process: NodeProcess }).process;

const updating = () => nodeProcess.env.UPDATE_GOLDEN_TRACES === '1';

// Through a variable: Vite rewrites `new URL(..., import.meta.url)` as an asset.
const moduleUrl = import.meta.url;
const fixturesDir = new URL('fixtures/', moduleUrl);
const fixtureUrl = (name: string) => new URL(`${name}.json`, fixturesDir);

export const readGoldenTrace = function readGoldenTrace(
	name: string
): GoldenTraceFixture | undefined {
	const fs = nodeProcess.getBuiltinModule('node:fs');
	const url = fixtureUrl(name);
	if (!fs.existsSync(url)) {
		return undefined;
	}
	return JSON.parse(fs.readFileSync(url, 'utf8')) as GoldenTraceFixture;
};

/** One event per line, so a fixture diff shows which events changed. */
const formatFixture = (fixture: GoldenTraceFixture): string => {
	const scenarios = Object.entries(fixture.scenarios).map(
		([name, events]) =>
			`\t\t${JSON.stringify(name)}: [\n${events
				.map((event) => `\t\t\t${JSON.stringify(event)}`)
				.join(',\n')}\n\t\t]`
	);
	return `{\n\t"name": ${JSON.stringify(fixture.name)},\n\t"scenarios": {\n${scenarios.join(',\n')}\n\t}\n}\n`;
};

const writeGoldenTrace = (fixture: GoldenTraceFixture) => {
	const fs = nodeProcess.getBuiltinModule('node:fs');
	fs.mkdirSync(fixturesDir, { recursive: true });
	fs.writeFileSync(fixtureUrl(fixture.name), formatFixture(fixture));
};

/** The standard scenarios followed by the spec's own, in fixture order. */
export const scenariosOf = function scenariosOf(
	spec: TraceSpec
): TraceScenario[] {
	return [
		...(spec.standardScenarios === false ? [] : standardScenarios),
		...(spec.scenarios ?? []),
	];
};

/**
 * Why `fixture` does not hold exactly the scenarios `spec` runs, or
 * `undefined` when it does. A scenario only in the fixture was renamed or
 * dropped from the spec, and its recorded trace would otherwise go unchecked.
 */
export const scenarioNameMismatch = function scenarioNameMismatch(
	spec: TraceSpec,
	fixture: GoldenTraceFixture | undefined
): string | undefined {
	if (fixture === undefined) {
		return `No fixture at fixtures/${spec.name}.json. Record it with UPDATE_GOLDEN_TRACES=1.`;
	}
	const expected = scenariosOf(spec).map((scenario) => scenario.name);
	const recorded = Object.keys(fixture.scenarios);
	const missing = expected.filter((name) => !recorded.includes(name));
	const extra = recorded.filter((name) => !expected.includes(name));
	if (missing.length === 0 && extra.length === 0) {
		return undefined;
	}
	const list = (names: string[]) => names.map((name) => `"${name}"`).join(', ');
	return [
		`fixtures/${spec.name}.json does not match the spec's scenarios.`,
		missing.length > 0 ? `Not in the fixture: ${list(missing)}.` : '',
		extra.length > 0 ? `Not in the spec: ${list(extra)}.` : '',
		'Record it again with UPDATE_GOLDEN_TRACES=1.',
	]
		.filter(Boolean)
		.join(' ');
};

/** A module of trace specs, such as `specs/adroll.ts`. */
export interface TraceSpecModule {
	traces: readonly TraceSpec[];
}

export interface GoldenTraceOptions {
	/** Only these specs, by name. @default every spec in the module */
	names?: readonly string[];
	/**
	 * Returns the factory to run in place of a spec's helper, compared with
	 * the helper's fixture. It is called before each scenario, after the
	 * module registry is reset, so a module it imports starts fresh:
	 *
	 *   factory: async () => {
	 *     const { appcuesRemote } = await import('../../vendors/functional/appcues');
	 *     const { resolvedManifestToScript } = await import('../../engine/runtime');
	 *     return () => resolvedManifestToScript(appcuesRemote.resolveRemote(options));
	 *   }
	 */
	factory?: (spec: TraceSpec) => Promise<TraceFactory> | TraceFactory;
}

export type TraceFactory = (stubs: TraceStubs) => Script;

/**
 * Registers one test per scenario of each spec in the module `load`
 * imports, and expects the trace in the spec's fixture.
 *
 * Helpers keep page state in module scope (per-document maps, a shared
 * SDK instance), so each scenario imports the spec module again after
 * `vi.resetModules()`; a scenario's trace does not depend on the ones
 * before it.
 */
export const describeGoldenTraces = async function describeGoldenTraces(
	load: () => Promise<TraceSpecModule>,
	options: GoldenTraceOptions = {}
): Promise<void> {
	const { traces } = await load();
	const write = updating() && options.factory === undefined;
	for (const spec of traces) {
		if (options.names && !options.names.includes(spec.name)) {
			continue;
		}
		const fixture = readGoldenTrace(spec.name);
		const recorded = new Map<string, TraceEvent[]>();

		describe(`golden trace: ${spec.name}`, () => {
			// A recording run rewrites the fixture with the spec's scenarios.
			it.skipIf(write)('fixture holds the same scenarios as the spec', () => {
				const mismatch = scenarioNameMismatch(spec, fixture);
				if (mismatch !== undefined) {
					throw new Error(mismatch);
				}
			});

			for (const scenario of scenariosOf(spec)) {
				it(scenario.name, async () => {
					vi.resetModules();
					const fresh =
						(await load()).traces.find((item) => item.name === spec.name) ??
						spec;
					// Custom steps close over their own module's state.
					const steps =
						scenariosOf(fresh).find((item) => item.name === scenario.name) ??
						scenario;
					const factory = await options.factory?.(fresh);
					const trace = await runTraceScenario(fresh, steps, factory);
					if (write) {
						recorded.set(scenario.name, trace);
						return;
					}
					const expected = fixture?.scenarios[scenario.name];
					if (expected === undefined) {
						throw new Error(
							`No golden trace for "${scenario.name}" in fixtures/${spec.name}.json. Record it with UPDATE_GOLDEN_TRACES=1.`
						);
					}
					expect(trace).toEqual(expected);
				});
			}

			afterAll(() => {
				if (!write || recorded.size === 0) {
					return;
				}
				// Scenarios a filtered run skipped keep their recorded trace.
				const scenarios: Record<string, TraceEvent[]> = {};
				for (const scenario of scenariosOf(spec)) {
					const trace =
						recorded.get(scenario.name) ?? fixture?.scenarios[scenario.name];
					if (trace) {
						scenarios[scenario.name] = trace;
					}
				}
				writeGoldenTrace({ name: spec.name, scenarios });
			});
		});
	}
};
