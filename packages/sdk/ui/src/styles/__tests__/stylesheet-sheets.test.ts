/**
 * Guards `@inth/sdk/ui/styles/sheets/*`: the stylesheets React and Svelte
 * surfaces render themselves, and Astro inlines or links.
 *
 * Rendered in order, `first-paint`, the v6 presentation sheets and `dialog`
 * must apply exactly what `styles.css` applies, rule for rule and in the
 * same order (the variables the later sheets repeat aside), so a surface
 * that brings its own styles looks the same as an app that imports
 * `styles.css`. `first-paint` must hold no dialog rule, so the dialog's
 * rules load only with the dialog, and no v6 presentation rule, which no
 * host that inlines it renders yet.
 *
 * These read the built artifacts: build `@inth/sdk/ui` first.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { parse } from 'postcss';
import type { AtRule, ChildNode, Container, Declaration } from 'postcss';
import { describe, expect, test } from 'vitest';

import {
	DIALOG_COMPONENTS,
	PRESENTATION_COMPONENTS,
	PRESENTATION_SHEETS,
} from '../../../scripts/stylesheet-parts';

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
	const dialog = await importSheet('dialog');
	const primitives = await importSheet('primitives');
	const iabFirstPaint = await importSheet('iab-first-paint');
	const iabDialog = await importSheet('iab-dialog');
	const sheets = [firstPaint, dialog, primitives, iabFirstPaint, iabDialog];
	// In `styles.css` order: each sheet's components, by
	// PRESENTATION_COMPONENTS.
	const presentationNames = Object.entries(PRESENTATION_SHEETS)
		.sort(
			([, a], [, b]) =>
				PRESENTATION_COMPONENTS.indexOf(a[0]) -
				PRESENTATION_COMPONENTS.indexOf(b[0])
		)
		.map(([name]) => name);
	const presentations = await Promise.all(presentationNames.map(importSheet));

	test('each sheet has its own id', () => {
		expect(sheets.map((sheet) => sheet.id)).toEqual([
			'inth-first-paint',
			'inth-dialog',
			'inth-primitives',
			'inth-iab-first-paint',
			'inth-iab-dialog',
		]);
	});

	test('first-paint, the presentations and dialog apply what styles.css applies, in order', () => {
		const styles = ruleList(readDist(join(DIST_DIR, 'styles.css')));
		// Only the token selectors' specificity differs (next test).
		const asInStyles = (rule: string) =>
			rule.replaceAll(':where(:root)', ':root').replaceAll('html.', ':root.');
		// The dialog repeats the variables it reads, so it works after the
		// per-surface sheets too. Those repeats are declarations
		// first-paint already made.
		const firstPaintDeclarations = declarationList(firstPaint.css);
		const repeatedIn = (sheet: Sheet) =>
			ruleList(sheet.css).filter(
				(rule) => !rule.startsWith('@layer components')
			);
		const ownRules = (sheet: Sheet) => {
			const repeated = repeatedIn(sheet);
			return ruleList(sheet.css).filter((rule) => !repeated.includes(rule));
		};

		expect(styles.length).toBeGreaterThan(0);
		expect(repeatedIn(dialog).length).toBeGreaterThan(0);
		for (const sheet of [...presentations, dialog]) {
			expect(
				declarationList(sheet.css).filter(
					(declaration) => !firstPaintDeclarations.includes(declaration)
				)
			).toEqual([]);
		}
		expect(
			[
				...ruleList(firstPaint.css),
				...presentations.flatMap(ownRules),
				...ownRules(dialog),
			].map(asInStyles)
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

	test('first-paint holds no dialog or widget rule', () => {
		const dialogClasses = DIALOG_COMPONENTS.flatMap((name) =>
			[
				...readDist(
					join(DIST_DIR, 'styles', 'components', `${name}.js`)
				).matchAll(/inth-ui-[\w-]+/gu),
			].map((match) => match[0])
		);
		const selectors = ruleList(firstPaint.css)
			.map((rule) => rule.split('|')[1])
			.join('\n');

		expect(dialogClasses.length).toBeGreaterThan(0);
		expect(dialogClasses.filter((name) => selectors.includes(name))).toEqual(
			[]
		);
	});

	test('first-paint holds no v6 presentation rule', () => {
		const presentationClasses = PRESENTATION_COMPONENTS.flatMap((name) =>
			[
				...readDist(
					join(DIST_DIR, 'styles', 'components', `${name}.js`)
				).matchAll(/inth-ui-[\w-]+/gu),
			].map((match) => match[0])
		);
		const selectors = ruleList(firstPaint.css)
			.map((rule) => rule.split('|')[1])
			.join('\n');

		expect(presentationClasses.length).toBeGreaterThan(0);
		expect(
			presentationClasses.filter((name) => selectors.includes(name))
		).toEqual([]);
	});

	test('dialog.css holds the dialog sheet', () => {
		expect(readDist(join(SHEETS_DIR, 'dialog.css')).trim()).toBe(dialog.css);
	});

	test('IAB sheets preserve every aggregate rule without resetting variables', () => {
		const asInStyles = (rule: string) =>
			rule.replaceAll(':where(:root)', ':root').replaceAll('html.', ':root.');
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
