// @vitest-environment node
/**
 * `ConsentBanner` renders on the server in every Svelte version the package
 * supports, down to 5.20. A component binding (`bind:ref`, `bind:open`, ...)
 * makes Svelte 5.20's server output wrap the template in a function
 * expression and then call it by a name it never declares
 * (`$$render_inner is not defined`), so the whole page fails with a 500.
 * The banner's own components therefore never bind a prop on a component;
 * `bind:this` on an element is fine, and `onref` takes the place of
 * `bind:ref`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from 'vite-plus/test';

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

/** `bind:<prop>=` inside a capitalised component's opening tag. */
const componentBindings = function componentBindings(code: string): string[] {
	const found: string[] = [];
	for (const tag of code.matchAll(/<[A-Z][\w.]*\b(?:=>|[^>])*>/gsu)) {
		for (const binding of tag[0].matchAll(/\bbind:(?<prop>\w+)\s*=/gu)) {
			if (binding.groups?.prop !== 'this') {
				found.push(binding[0]);
			}
		}
	}
	return found;
};

test('the banner binds no prop on a component, which Svelte 5.20 cannot render on the server', () => {
	// The prompt, and the options panel it loads on its own once Customize
	// expands it (a server render of an expanded banner includes it).
	const graph = [
		...new Set([
			...staticGraph(join(LIB, 'components/prompt/prompt.svelte')),
			...staticGraph(join(LIB, 'components/prompt/panel.svelte')),
		]),
	].filter((file) => file.endsWith('.svelte'));
	// The walk reaches the banner's surface and its rights row.
	expect(graph).toContain(join(LIB, 'components/prompt/surface.svelte'));
	expect(graph).toContain(join(LIB, 'components/parts/rights-row.svelte'));

	const offenders = graph.flatMap((file) =>
		componentBindings(readFileSync(file, 'utf8')).map(
			(binding) => `${relative(LIB, file)}: ${binding}`
		)
	);
	expect(offenders).toEqual([]);
});

test('the check sees a component binding', () => {
	expect(
		componentBindings(
			'<ConsentButton\n\tonclick={() => go()}\n\tbind:ref={el}\n>'
		)
	).toEqual(['bind:ref=']);
	expect(componentBindings('<button bind:this={el}>')).toEqual([]);
});
