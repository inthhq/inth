/// <reference types="node" />
/**
 * `@inth/sdk/surface-state` and `@inth/sdk/iab-support` exist so that a
 * consent surface, or a lazily loaded IAB chunk, can import what it needs
 * without the engine. A bundler that splits by file (esbuild) loads every
 * module a first-load import reaches, so one value import of the kernel,
 * a transport, the policy resolver, the evaluator or the experiment
 * controller anywhere in these entries' static graph would load it on
 * every page. This walks the graph from source and fails on such a module.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vite-plus/test';

const SOURCE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Modules the engine alone needs. */
const ENGINE_ONLY = [
	/^kernel\//u,
	/^transports\//u,
	/^server\//u,
	/^policy\.ts$/u,
	/^consent-record\/evaluate/u,
	/^modules\/has\.ts$/u,
	/^modules\/category-gate\.ts$/u,
	/^libs\/experiment\.ts$/u,
	/^libs\/experiment-(?:assignment|engine|storage)\.ts$/u,
	/^runtime\/(?!lazy-iab|pending-snapshot)/u,
];

const STATIC_VALUE_IMPORT =
	/^(?:import|export)\s+(?!type\b)(?:\{[^}]*\}|[^;]*?)\s*from\s+'(?<specifier>\.[^']*)';/gmu;

const resolveRelative = function resolveRelative(
	from: string,
	specifier: string
): string {
	const base = normalize(join(dirname(from), specifier));
	for (const candidate of [`${base}.ts`, join(base, 'index.ts')]) {
		try {
			readFileSync(candidate);
			return candidate;
		} catch {
			// Try the next candidate.
		}
	}
	throw new Error(`Cannot resolve ${specifier} from ${from}`);
};

/** Every source file the entry reaches through static value imports. */
const staticGraph = function staticGraph(entry: string): string[] {
	const seen = new Set<string>();
	const pending = [join(SOURCE_DIR, entry)];
	while (pending.length > 0) {
		const file = pending.pop() as string;
		if (!seen.has(file)) {
			seen.add(file);
			for (const match of readFileSync(file, 'utf8').matchAll(
				STATIC_VALUE_IMPORT
			)) {
				pending.push(resolveRelative(file, match.groups?.specifier as string));
			}
		}
	}
	return [...seen].map((file) => relative(SOURCE_DIR, file)).sort();
};

describe.each(['surface-state.ts', 'iab-support.ts'])('%s', (entry) => {
	test('reaches no module only the engine needs', () => {
		const engineOnly = staticGraph(entry).filter((file) =>
			ENGINE_ONLY.some((pattern) => pattern.test(file))
		);
		expect(engineOnly).toEqual([]);
	});
});
