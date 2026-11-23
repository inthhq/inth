/**
 * Keeps the classic-variable map (`scripts/classic-variables.ts`) complete
 * and true. `classic-variables.browser.test.ts` checks each mapping against
 * computed styles; these check the list itself:
 *
 * - Every classic variable is listed once, mapped or unmapped with a
 *   reason, and every mapped one is still read by a shipped stylesheet.
 * - No stylesheet declares a classic variable outside its rules. A `:root`
 *   default in `styles.css` would replace every default it falls back to,
 *   and would resolve its tokens on `:root`, out of reach of a palette
 *   scoped to `.inth-theme-root`.
 * - The docs table matches the list.
 *
 * These read the built artifacts: build `@inth/sdk/ui` first.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parse } from 'postcss';
import type { Container } from 'postcss';
import { describe, expect, test } from 'vitest';

import {
	CLASSIC_UNMAPPED,
	CLASSIC_VARIABLES,
} from '../../../scripts/classic-variables';

const DIST_DIR = join(__dirname, '..', '..', '..', 'dist');
const DOCS = join(
	__dirname,
	'..',
	'..',
	'..',
	'..',
	'docs',
	'customization',
	'tokens.mdx'
);

const readDist = function readDist(path: string): string {
	if (!existsSync(path)) {
		throw new Error(
			`Missing ${path}. Build @inth/sdk/ui first: bun run --cwd packages/sdk/ui build`
		);
	}
	return readFileSync(path, 'utf8');
};

/** Custom properties declared outside any rule's `@layer components`. */
const declaredOutsideRules = function declaredOutsideRules(
	css: string
): Set<string> {
	const names = new Set<string>();
	parse(css).walkDecls(/^--/u, (node) => {
		let parent = node.parent as Container | undefined;
		while (parent && parent.type !== 'root') {
			if (
				parent.type === 'atrule' &&
				'name' in parent &&
				parent.name === 'layer'
			) {
				return;
			}
			parent = parent.parent as Container | undefined;
		}
		names.add(node.prop);
	});
	return names;
};

const mapped = CLASSIC_VARIABLES.map((mapping) => mapping.classic);
const unmapped = CLASSIC_UNMAPPED.map((entry) => entry.classic);

describe('classic component variables', () => {
	test('each one is mapped or listed as unmapped, once', () => {
		const listed = [...mapped, ...unmapped];

		expect(new Set(listed).size).toBe(listed.length);
	});

	test('styles.css still reads each mapped one', () => {
		const css = readDist(join(DIST_DIR, 'styles.css'));

		expect(mapped.filter((name) => !css.includes(`var(${name}`))).toEqual(
			[]
		);
	});

	test('each mapping is tested, through each hook it names', () => {
		for (const mapping of CLASSIC_VARIABLES) {
			const probed = new Set(
				mapping.probes.flatMap((probe) => (probe.hook ? [probe.hook] : []))
			);

			expect({
				classic: mapping.classic,
				probes: mapping.probes.length > 0,
			}).toEqual({ classic: mapping.classic, probes: true });
			expect({
				classic: mapping.classic,
				hooks: [...probed].toSorted(),
			}).toEqual({
				classic: mapping.classic,
				hooks: [...mapping.hooks].toSorted(),
			});
		}
	});

	test('no stylesheet declares one outside its rules', () => {
		const files = ['styles.css', 'styles.tw3.css', join('iab', 'styles.css')];
		for (const file of files) {
			const declared = declaredOutsideRules(readDist(join(DIST_DIR, file)));

			expect({
				// The preference widget's own variables stay declared for it.
				declared: [...mapped, ...unmapped].filter(
					(name) => declared.has(name) && !name.startsWith('--consent-manager-')
				),
				file,
			}).toEqual({ declared: [], file });
		}
	});

	test('the docs table lists each one', () => {
		const docs = readFileSync(DOCS, 'utf8');
		const start = docs.indexOf('## Classic variable compatibility');
		const end = docs.indexOf('\n## ', start + 1);
		const rows = docs
			.slice(start, end)
			.split('\n')
			.filter((line) => line.startsWith('| `--'));
		const expected = [
			...CLASSIC_VARIABLES.map(
				(mapping) =>
					`| \`${mapping.classic}\` | ${
						mapping.hooks.length > 0
							? mapping.hooks.map((hook) => `\`${hook}\``).join(', ')
							: '—'
					} | ${mapping.parts} |`
			),
			...CLASSIC_UNMAPPED.map(
				(entry) => `| \`${entry.classic}\` | ${entry.reason} |`
			),
		];

		expect(start).toBeGreaterThan(-1);
		expect(rows).toEqual(expected);
	});
});
