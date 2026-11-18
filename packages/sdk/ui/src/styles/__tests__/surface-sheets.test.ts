/**
 * Guards the per-surface sheets React renders: `tokens`, then `button`,
 * `banner`, `trigger` and `consent-gate` (see `SURFACE_SHEETS`), and the
 * `dialog` sheet that follows them.
 *
 * A server-rendered banner puts `tokens`, `button` and `banner` in every
 * HTML response, ahead of the page's own content, so they must hold what
 * the banner needs to paint and nothing else:
 *
 * - Each is an exact subset of `first-paint`: the same rules, selectors,
 *   values and order. Splitting may drop, never change.
 * - Together the surface sheets hold every `first-paint` rule once.
 * - Every variable a sheet reads, and `styles.css` declares, is declared in
 *   that sheet or in `tokens`. A missing one renders the banner unstyled
 *   until the browser inserts the rest, and only with JavaScript.
 * - The banner's sheets stay under a compressed byte budget.
 *
 * These read the built artifacts: build `@inth/sdk/ui` first.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

import { parse } from 'postcss';
import type { AtRule, ChildNode, Container, Declaration } from 'postcss';
import { describe, expect, test } from 'vitest';

import { SURFACE_SHEETS } from '../../../scripts/stylesheet-parts';

const DIST_DIR = join(__dirname, '..', '..', '..', 'dist');
const SHEETS_DIR = join(DIST_DIR, 'styles', 'sheets');

/**
 * Brotli 11 and gzip 9 bytes of `tokens` + `button` + `banner`, the inline
 * CSS of a fresh visit. At 5,472 / 6,175 when set; `first-paint` is 7,778 /
 * 8,872. Raise only for rules the banner needs to paint.
 */
const BANNER_BROTLI_CEILING = 5700;
const BANNER_GZIP_CEILING = 6450;

interface Sheet {
	id: string;
	css: string;
	load?: () => Promise<string>;
}

const importSheet = async function importSheet(name: string): Promise<Sheet> {
	const path = join(SHEETS_DIR, `${name}.js`);
	if (!existsSync(path)) {
		throw new Error(
			`Missing ${path}. Build @inth/sdk/ui first: bun run --cwd packages/sdk/ui build`
		);
	}
	return (await import(pathToFileURL(path).href)) as Sheet;
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
		} else if (parent.type === 'rule') {
			context.unshift((parent as unknown as { selector: string }).selector);
		}
	}
	return context.join(' ');
};

const inComponentsLayer = (node: ChildNode): boolean =>
	contextOf(node).includes('@layer components');

/** Rules inside `@layer components`, in source order. */
const componentRules = function componentRules(css: string): string[] {
	const rules: string[] = [];
	parse(css).walkRules((rule) => {
		if (!inComponentsLayer(rule)) {
			return;
		}
		const declarations = rule.nodes
			.filter((node): node is Declaration => node.type === 'decl')
			.map((node) => `${node.prop}:${node.value}`)
			.join(';');
		rules.push(`${contextOf(rule)}|${rule.selector}|${declarations}`);
	});
	return rules;
};

/**
 * Custom property declarations outside `@layer components` (tokens and
 * component variables), with their selector and context.
 */
const variableDeclarations = function variableDeclarations(
	css: string
): string[] {
	const declarations: string[] = [];
	parse(css).walkDecls(/^--/u, (node) => {
		if (!inComponentsLayer(node)) {
			declarations.push(`${contextOf(node)}|${node.prop}:${node.value}`);
		}
	});
	return declarations;
};

const declaredVariables = function declaredVariables(css: string): Set<string> {
	const names = new Set<string>();
	parse(css).walkDecls(/^--/u, (node) => {
		names.add(node.prop);
	});
	return names;
};

const readVariables = (css: string): Set<string> =>
	new Set(
		[...css.matchAll(/var\(\s*(?<name>--[\w-]+)/gu)].map(
			(match) => match.groups?.name ?? ''
		)
	);

const keyframes = function keyframes(css: string): string[] {
	const blocks: string[] = [];
	parse(css).walkAtRules('keyframes', (node) => {
		blocks.push(node.toString());
	});
	return blocks;
};

/** Whether `part` appears in `whole` in the same relative order. */
const isSubsequence = function isSubsequence(
	part: string[],
	whole: string[]
): string[] {
	let cursor = 0;
	const missing: string[] = [];
	for (const item of part) {
		const found = whole.indexOf(item, cursor);
		if (found === -1) {
			missing.push(item);
		} else {
			cursor = found + 1;
		}
	}
	return missing;
};

const brotli = (text: string): number =>
	brotliCompressSync(text, {
		params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
	}).length;
const gzip = (text: string): number => gzipSync(text, { level: 9 }).length;

describe('per-surface sheets', async () => {
	const firstPaint = await importSheet('first-paint');
	const tokens = await importSheet('tokens');
	const dialog = await importSheet('dialog');
	const surfaceNames = Object.keys(SURFACE_SHEETS);
	const surfaces = Object.fromEntries(
		await Promise.all(
			surfaceNames.map(async (name) => [name, await importSheet(name)])
		)
	) as Record<string, Sheet>;
	const styles = readFileSync(join(DIST_DIR, 'styles.css'), 'utf8');
	const declaredInStyles = declaredVariables(styles);

	test('each sheet has its own id, and its deferred twin the same one', async () => {
		const names = ['tokens', ...surfaceNames];
		const deferred = await Promise.all(
			names.map((name) => importSheet(`${name}-deferred`))
		);
		const loaded = await Promise.all(deferred.map((sheet) => sheet.load?.()));

		for (const [index, name] of names.entries()) {
			const sheet = name === 'tokens' ? tokens : surfaces[name];

			expect(sheet?.id).toBe(`c15t-${name}`);
			expect(deferred[index]?.id).toBe(sheet?.id);
			expect(deferred[index]?.css).toBe('');
			expect(loaded[index]).toBe(sheet?.css);
		}
	});

	test('each sheet is an exact subset of first-paint', () => {
		const rules = componentRules(firstPaint.css);
		const variables = variableDeclarations(firstPaint.css);
		const frames = keyframes(firstPaint.css);

		for (const sheet of [tokens, ...Object.values(surfaces)]) {
			expect(isSubsequence(componentRules(sheet.css), rules)).toEqual([]);
			expect(
				variableDeclarations(sheet.css).filter(
					(declaration) => !variables.includes(declaration)
				)
			).toEqual([]);
			expect(
				keyframes(sheet.css).filter((block) => !frames.includes(block))
			).toEqual([]);
		}
	});

	test('together the surface sheets hold every first-paint rule once', () => {
		const split = Object.values(surfaces).flatMap((sheet) =>
			componentRules(sheet.css)
		);
		const rules = componentRules(firstPaint.css);

		expect(split.length).toBeGreaterThan(0);
		expect([...split].sort()).toEqual([...rules].sort());
	});

	test('tokens holds the default theme tokens of first-paint', () => {
		const themeTokens = variableDeclarations(firstPaint.css).filter(
			(declaration) => declaration.includes('.c15t-theme-root')
		);

		expect(themeTokens.length).toBeGreaterThan(0);
		expect(variableDeclarations(tokens.css)).toEqual(themeTokens);
	});

	test('every variable a sheet reads is declared in it or in tokens', () => {
		const fromTokens = declaredVariables(tokens.css);

		for (const sheet of [...Object.values(surfaces), dialog]) {
			const declared = new Set([
				...fromTokens,
				...declaredVariables(sheet.css),
			]);
			const missing = [...readVariables(sheet.css)].filter(
				// Undeclared hooks such as `var(--x, fallback)` are left to
				// css-var-references.test.ts.
				(name) => declaredInStyles.has(name) && !declared.has(name)
			);

			expect({ id: sheet.id, missing }).toEqual({ id: sheet.id, missing: [] });
		}
	});

	test('every keyframes a sheet names ships with it', () => {
		const names = keyframes(firstPaint.css).map(
			(block) => /@keyframes\s+(?<name>[\w-]+)/u.exec(block)?.groups?.name ?? ''
		);

		for (const sheet of [...Object.values(surfaces), dialog]) {
			const own = keyframes(sheet.css).map(
				(block) =>
					/@keyframes\s+(?<name>[\w-]+)/u.exec(block)?.groups?.name ?? ''
			);
			const text = sheet.css.replaceAll(/@keyframes\s+[\w-]+/gu, '');
			const named = names.filter((name) =>
				new RegExp(`(?<![\\w-])${name}(?![\\w-])`, 'u').test(text)
			);

			expect({
				id: sheet.id,
				missing: named.filter((n) => !own.includes(n)),
			}).toEqual({ id: sheet.id, missing: [] });
		}
	});

	test('the IAB sheets read nothing only first-paint declares', async () => {
		// `@inth/react` renders the IAB banner over `tokens`, `button` and
		// `banner`, and the IAB dialog over those and `dialog`, not over
		// `first-paint`: carrying it next to the banner's sheets shipped every
		// first-paint rule twice. So an IAB rule may read theme tokens, the
		// banner's or the dialog's variables and the IAB variables, never a
		// variable only `first-paint` declares.
		const iabFirstPaint = await importSheet('iab-first-paint');
		const iabDialog = await importSheet('iab-dialog');
		const declaredInIabStyles = declaredVariables(
			readFileSync(join(DIST_DIR, 'iab', 'styles.css'), 'utf8')
		);
		const bannerSheets = [tokens, surfaces.button, surfaces.banner].filter(
			(sheet): sheet is Sheet => sheet !== undefined
		);
		const cases: [Sheet, Sheet[]][] = [
			[iabFirstPaint, [...bannerSheets, iabFirstPaint]],
			[iabDialog, [...bannerSheets, iabFirstPaint, dialog, iabDialog]],
		];

		for (const [sheet, under] of cases) {
			const declared = new Set(
				under.flatMap((other) => [...declaredVariables(other.css)])
			);
			const missing = [...readVariables(sheet.css)].filter(
				(name) =>
					(declaredInStyles.has(name) || declaredInIabStyles.has(name)) &&
					!declared.has(name)
			);

			expect({ id: sheet.id, missing }).toEqual({ id: sheet.id, missing: [] });
		}
	});

	test('the banner sheets hold no trigger, ConsentGate or dialog variable', () => {
		const banner = [tokens, surfaces.button, surfaces.banner]
			.map((sheet) => sheet?.css ?? '')
			.join('\n');

		expect(banner).not.toMatch(/--consent-gate-/u);
		expect(banner).not.toMatch(/--(?:switch|accordion|tabs|collapsible)-/u);
		expect(banner).not.toMatch(/--cdtt?-/u);
	});

	test('the inline CSS of a fresh visit stays under its byte budget', () => {
		const banner = [tokens, surfaces.button, surfaces.banner]
			.map((sheet) => sheet?.css ?? '')
			.join('');

		expect(brotli(banner)).toBeLessThanOrEqual(BANNER_BROTLI_CEILING);
		expect(gzip(banner)).toBeLessThanOrEqual(BANNER_GZIP_CEILING);
		expect(brotli(banner)).toBeLessThan(brotli(firstPaint.css));
	});
});
