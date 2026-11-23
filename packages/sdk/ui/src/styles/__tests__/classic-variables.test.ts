/**
 * Keeps the classic-variable map (`scripts/classic-variables.ts`) complete
 * and true. `classic-variables.browser.test.ts` checks each mapping against
 * computed styles; these check the list itself:
 *
 * - Every variable the classic banner and dialog sheets declare or read is
 *   either mapped or listed as unmapped with a reason.
 * - No stylesheet declares a mapped variable outside its rules. A `:root`
 *   default in `styles.css` would replace every v6 default whenever the
 *   whole stylesheets are imported together, and would resolve its tokens
 *   on `:root`, out of reach of a palette scoped to `.inth-theme-root`.
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

const SOURCE_DIR = join(__dirname, '..', 'components');
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

const classicNames = function classicNames(): Set<string> {
	const names = new Set<string>();
	for (const file of ['prompt.module.css', 'panel.module.css']) {
		const source = readFileSync(join(SOURCE_DIR, file), 'utf8');
		for (const match of source.matchAll(/(?<name>--consent-[\w-]+)/gu)) {
			names.add(match.groups?.name ?? '');
		}
	}
	return names;
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
		expect(new Set(listed)).toEqual(classicNames());
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

	test('no stylesheet declares a mapped one outside its rules', () => {
		const files = [
			'styles.css',
			'styles.tw3.css',
			join('styles', 'privacy-choices.css'),
			join('styles', 'privacy-choices.tw3.css'),
			join('iab', 'styles.css'),
		];
		for (const file of files) {
			const declared = declaredOutsideRules(readDist(join(DIST_DIR, file)));

			expect({
				declared: mapped.filter((name) => declared.has(name)),
				file,
			}).toEqual({ declared: [], file });
		}
	});

	test('the docs table lists each one', () => {
		const docs = readFileSync(DOCS, 'utf8');
		const start = docs.indexOf('## Keep classic variables on Privacy Choices');
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
