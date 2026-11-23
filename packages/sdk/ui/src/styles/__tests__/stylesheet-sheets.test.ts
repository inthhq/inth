/**
 * Guards `@inth/sdk/ui/styles/sheets/*`: the stylesheets React and Svelte
 * surfaces render themselves, and Astro inlines or links.
 *
 * Rendered in order, `first-paint` and the later sheets (`widget`,
 * `expand`, `dialog`) must apply exactly what `styles.css` applies, rule
 * for rule and in the same order (the variables the later sheets repeat
 * aside), so a surface that brings its own styles looks the same as an app
 * that imports `styles.css`. `first-paint` must hold no later sheet's rule,
 * so those rules load only with their surface.
 *
 * These read the built artifacts: build `@inth/sdk/ui` first.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { parse } from 'postcss';
import type { AtRule, ChildNode, Container, Declaration } from 'postcss';
import { describe, expect, test } from 'vitest';

import { LATER_SHEETS } from '../../../scripts/stylesheet-parts';

const DIST_DIR = join(__dirname, '..', '..', '..', 'dist');
const SHEETS_DIR = join(DIST_DIR, 'styles', 'sheets');

const readDist = function readDist(path: string): string {
	if (!existsSync(path)) {
		throw new Error(
			`Missing ${path}. Build @inth/sdk/ui first: bun run --cwd packages/sdk/ui build`
		);
	}
	return readFileSync(path, 'utf8');
};

interface Sheet {
	id: string;
	css: string;
}

const importSheet = async function importSheet(name: string): Promise<Sheet> {
	readDist(join(SHEETS_DIR, `${name}.js`));
	return (await import(
		pathToFileURL(join(SHEETS_DIR, `${name}.js`)).href
	)) as Sheet;
};

const contextOf = function contextOf(node: ChildNode): string {
	const context: string[] = [];
	for (
		let parent = node.parent as Container | undefined;
		parent && parent.type !== 'root';
		parent = parent.parent as Container | undefined
	) {
		if (parent.type === 'atrule') {
			const atRule = parent as AtRule;
			context.unshift(`@${atRule.name} ${atRule.params}`);
		}
	}
	return context.join(' ');
};

/** Every rule and its context, in source order. */
const ruleList = function ruleList(css: string): string[] {
	const rules: string[] = [];
	parse(css).walkRules((rule) => {
		const declarations = rule.nodes
			.filter((node): node is Declaration => node.type === 'decl')
			.map((node) => `${node.prop}:${node.value}`)
			.join(';');
		rules.push(`${contextOf(rule)}|${rule.selector}|${declarations}`);
	});
	return rules;
};

/**
 * Every custom property declaration outside `@layer components`, with its
 * selector and context.
 */
const declarationList = function declarationList(css: string): string[] {
	const declarations: string[] = [];
	parse(css).walkDecls(/^--/u, (node) => {
		if (contextOf(node).includes('@layer components')) {
			return;
		}
		const rule = node.parent as Container & { selector?: string };
		declarations.push(
			`${contextOf(node)}|${rule.selector ?? ''}|${node.prop}:${node.value}`
		);
	});
	return declarations;
};

/** The layer order statements, which must open every sheet. */
const layerStatements = (css: string): string[] =>
	parse(css)
		.nodes.filter(
			(node): node is AtRule =>
				node.type === 'atrule' && node.name === 'layer' && !node.nodes
		)
		.map((node) => node.params);

describe('styles/sheets', async () => {
	const firstPaint = await importSheet('first-paint');
	const laterNames = Object.keys(LATER_SHEETS);
	const later = await Promise.all(laterNames.map(importSheet));
	const primitives = await importSheet('primitives');
	const iabFirstPaint = await importSheet('iab-first-paint');
	const iabDialog = await importSheet('iab-dialog');
	const sheets = [firstPaint, ...later, primitives, iabFirstPaint, iabDialog];

	test('each sheet has its own id', () => {
		expect(sheets.map((sheet) => sheet.id)).toEqual([
			'inth-first-paint',
			'inth-widget',
			'inth-expand',
			'inth-dialog',
			'inth-primitives',
			'inth-iab-first-paint',
			'inth-iab-dialog',
		]);
	});

	// Only the token selectors' specificity differs (next test).
	const asInStyles = (rule: string) =>
		rule.replaceAll(':where(:root)', ':root').replaceAll('html.', ':root.');
	// The later sheets repeat the variables they read, so they work after
	// the per-surface sheets too. Those repeats are declarations first-paint
	// already made.
	const firstPaintDeclarations = declarationList(firstPaint.css);
	const repeatedIn = (sheet: Sheet) =>
		ruleList(sheet.css).filter((rule) => !rule.startsWith('@layer components'));
	const ownRules = (sheet: Sheet) => {
		const repeated = repeatedIn(sheet);
		return ruleList(sheet.css).filter((rule) => !repeated.includes(rule));
	};

	test('first-paint and the later sheets apply what styles.css applies, in order', () => {
		const styles = ruleList(readDist(join(DIST_DIR, 'styles.css')));

		expect(styles.length).toBeGreaterThan(0);
		expect(later.flatMap(repeatedIn).length).toBeGreaterThan(0);
		for (const sheet of later) {
			expect(
				declarationList(sheet.css).filter(
					(declaration) => !firstPaintDeclarations.includes(declaration)
				)
			).toEqual([]);
		}
		expect(
			[...ruleList(firstPaint.css), ...later.flatMap(ownRules)].map(
				asInStyles
			)
		).toEqual(styles);
	});

	test("the default tokens rank below the app's own token rules", () => {
		// The sheet can land after the app's stylesheets, so an app's
		// `:root` (0,1,0) and `:root.dark` (0,2,0) overrides must win on
		// specificity: defaults on `:where(:root)` (0,0,0), dark defaults on
		// `html.dark` (0,1,1).
		const selectors = new Set(
			ruleList(firstPaint.css)
				.filter((rule) => rule.split('|')[2]?.includes('--inth-'))
				.map((rule) => rule.split('|')[1] ?? '')
		);

		expect(selectors.size).toBeGreaterThan(0);
		for (const selector of selectors) {
			expect(selector).not.toMatch(/(?<!:where\():root/u);
		}
		expect([...selectors].join('\n')).toContain('html.inth-dark');
	});

	test('primitives applies what styles/primitives.css applies', () => {
		expect(ruleList(primitives.css)).toEqual(
			ruleList(readDist(join(DIST_DIR, 'styles', 'primitives.css')))
		);
	});

	test('every sheet opens with the layer order', () => {
		for (const sheet of sheets) {
			expect(layerStatements(sheet.css)).toEqual([
				'properties, theme, base, components, utilities',
			]);
		}
	});

	test('first-paint holds no rule of a later sheet', () => {
		const laterClasses = Object.values(LATER_SHEETS)
			.flat()
			.flatMap((name) =>
				[
					...readDist(
						join(DIST_DIR, 'styles', 'components', `${name}.js`)
					).matchAll(/inth-ui-[\w-]+/gu),
				].map((match) => match[0])
			);
		const selectors = ruleList(firstPaint.css)
			.map((rule) => rule.split('|')[1])
			.join('\n');

		expect(laterClasses.length).toBeGreaterThan(0);
		expect(laterClasses.filter((name) => selectors.includes(name))).toEqual(
			[]
		);
	});

	test.each(Object.keys(LATER_SHEETS))(
		'%s.css holds the sheet, and its deferred twin loads it',
		async (name) => {
			const sheet = await importSheet(name);
			const deferred = (await importSheet(`${name}-deferred`)) as Sheet & {
				load: () => Promise<string>;
			};

			expect(readDist(join(SHEETS_DIR, `${name}.css`)).trim()).toBe(sheet.css);
			expect(deferred.id).toBe(sheet.id);
			expect(deferred.css).toBe('');
			expect(await deferred.load()).toBe(sheet.css);
		}
	);

	test('IAB sheets preserve every aggregate rule without resetting variables', () => {
		// The aggregate keeps its original panel-before-prompt order. Their
		// selectors are disjoint, so the prompt can arrive before the panel.
		expect(
			[...ruleList(iabFirstPaint.css), ...ruleList(iabDialog.css)]
				.map(asInStyles)
				.sort()
		).toEqual(ruleList(readDist(join(DIST_DIR, 'iab/styles.css'))).sort());
		const declarations: string[] = [];
		parse(iabDialog.css).walkDecls((declaration) => {
			declarations.push(declaration.prop);
		});
		expect(declarations.filter((name) => name.startsWith('--'))).toEqual([]);
	});

	test('IAB banner CSS excludes dialog rules and preserves app overrides', () => {
		const selectors = ruleList(iabFirstPaint.css)
			.map((rule) => rule.split('|')[1])
			.join('\n');
		const panelClasses = [
			...readDist(join(DIST_DIR, 'styles/components/iab-panel.js')).matchAll(
				/inth-ui-[\w-]+/gu
			),
		].map((match) => match[0]);
		expect(panelClasses.length).toBeGreaterThan(0);
		expect(panelClasses.filter((name) => selectors.includes(name))).toEqual([]);
		expect(iabFirstPaint.css).toContain(':where(:root)');
		expect(iabFirstPaint.css).not.toMatch(/(?<!:where\():root/u);
	});

	test('iab-dialog.css holds the IAB dialog sheet', () => {
		expect(readDist(join(SHEETS_DIR, 'iab-dialog.css')).trim()).toBe(
			iabDialog.css
		);
	});
});
