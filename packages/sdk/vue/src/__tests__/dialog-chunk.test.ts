// @vitest-environment node
/**
 * The dialog's chunk carries no embedded `ConsentWidget`.
 *
 * The banner warms the dialog on intent and the Nuxt plugin loads it
 * before the engine, so whatever `dialog.vue` imports statically reaches
 * every page that might open it. The widget and its sheets belong only to
 * a page that renders one.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from 'vite-plus/test';

const COMPONENTS = join(
	dirname(fileURLToPath(import.meta.url)),
	'../runtime/components'
);

/** The file a relative specifier names, as Vite resolves it. */
const resolveRelative = (from: string, specifier: string): string | null => {
	const base = resolve(dirname(from), specifier);
	for (const candidate of [
		base,
		`${base}.ts`,
		`${base}.vue`,
		join(base, 'index.ts'),
	]) {
		if (existsSync(candidate) && /\.(?:ts|vue)$/u.test(candidate)) {
			return candidate;
		}
	}
	return null;
};

/** Every file `entry` pulls in through static relative imports. */
const staticGraph = (entry: string): Set<string> => {
	const seen = new Set<string>();
	const visit = (file: string): void => {
		if (seen.has(file)) {
			return;
		}
		seen.add(file);
		const code = readFileSync(file, 'utf8');
		for (const match of code.matchAll(
			/^\s*(?:import|export)\s+(?!type\b)[^'"]*?from\s+["'](?<specifier>\.{1,2}\/[^"']+)["']|^\s*import\s+["'](?<bare>\.{1,2}\/[^"']+)["']/gmu
		)) {
			const specifier = match.groups?.specifier ?? match.groups?.bare;
			const next = specifier ? resolveRelative(file, specifier) : null;
			if (next) {
				visit(next);
			}
		}
	};
	visit(entry);
	return seen;
};

test('the dialog chunk carries no embedded widget', () => {
	const graph = staticGraph(join(COMPONENTS, 'dialog/dialog.vue'));
	// The walk reaches the dialog's own parts.
	expect(graph.has(join(COMPONENTS, 'dialog/layer.vue'))).toBe(true);
	expect(graph.has(join(COMPONENTS, 'preferences.vue'))).toBe(false);
});
