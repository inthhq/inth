// @vitest-environment node
/**
 * The dialog chunk `ConsentDialog` loads on first use carries no embedded
 * `ConsentWidget`: the dialog never renders it, and a page loads it only
 * where it renders it. Walks the dialog's static imports in the source, the
 * graph the bundler puts in that chunk.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from 'vitest';

const LIB = join(dirname(fileURLToPath(import.meta.url)), '../lib');

/** The file a relative specifier names, as Vite resolves it. */
const resolveRelative = function resolveRelative(
	from: string,
	specifier: string
): string | undefined {
	const base = resolve(dirname(from), specifier);
	return [base, `${base}.ts`, join(base, 'index.ts')].find(
		(candidate) => existsSync(candidate) && !candidate.endsWith('/')
	);
};

/** Every module the entry reaches through static relative imports. */
const staticGraph = function staticGraph(entry: string): Set<string> {
	const seen = new Set<string>();
	const pending = [entry];
	while (pending.length > 0) {
		const file = pending.pop() as string;
		if (seen.has(file)) {
			continue;
		}
		seen.add(file);
		const code = readFileSync(file, 'utf8');
		// `import type` is erased, and `import()` makes a chunk of its own.
		for (const match of code.matchAll(
			/^\s*(?:import|export)\s+(?!type\b)[^'"();]*?from\s+['"](?<specifier>\.{1,2}\/[^'"]+)['"]/gmu
		)) {
			const target = resolveRelative(file, match.groups?.specifier as string);
			if (target) {
				pending.push(target);
			}
		}
	}
	return seen;
};

test('the dialog chunk carries no embedded widget', () => {
	const graph = staticGraph(join(LIB, 'components/dialog/dialog.svelte'));
	// The walk follows the dialog's own parts.
	expect(graph).toContain(join(LIB, 'components/dialog/layer.svelte'));
	expect(graph).toContain(join(LIB, 'components/parts/category-group.svelte'));
	expect(graph).not.toContain(join(LIB, 'components/preferences.svelte'));
	expect(graph).not.toContain(join(LIB, 'widget-sheets.ts'));
});
