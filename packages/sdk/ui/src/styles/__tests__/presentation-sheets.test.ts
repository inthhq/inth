/**
 * Guards the v6 consent prompt's sheets: `surface`, then one of `card`,
 * `bar` or `drawer`, and `expand` (see `PRESENTATION_SHEETS`).
 *
 * The split exists so a site that uses one presentation ships only that
 * presentation's rules:
 *
 * - A Card's inline CSS (`tokens` + `button` + `surface` + `card`) stays
 *   within the banner's first-paint ceiling; the other sheets have budgets
 *   of their own.
 * - No presentation sheet holds another presentation's selectors.
 * - Each sheet reads only what it, `tokens` or `surface` declares.
 *
 * And the cross-presentation rules hold by construction: the blocking
 * treatment wins over every edge style (PERM-07), the tag keeps its hover
 * and focus state over the scrim, and the phone rules use the resolver's
 * breakpoint.
 *
 * These read the built artifacts: build `@inth/sdk/ui` first.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

import { PHONE_LAYOUT_QUERY } from '@inth/sdk-core';
import { parse } from 'postcss';
import type { AtRule, ChildNode, Container } from 'postcss';
import { describe, expect, test } from 'vitest';

import {
	PRESENTATION_COMPONENTS,
	PRESENTATION_SHEETS,
} from '../../../scripts/stylesheet-parts';

const DIST_DIR = join(__dirname, '..', '..', '..', 'dist');
const SHEETS_DIR = join(DIST_DIR, 'styles', 'sheets');
const SOURCE_DIR = join(__dirname, '..', 'components');

/**
 * Brotli 11 and gzip 9 bytes of `tokens` + `button` + `surface` + `card`,
 * a Card's inline CSS. The same ceiling as today's banner
 * (`surface-sheets.test.ts`); 3,649 / 4,139 when set.
 */
const CARD_BROTLI_CEILING = 5700;
const CARD_GZIP_CEILING = 6450;

/**
 * Measured size plus about 10%, when set: `surface` + `bar` 2,442 / 2,764,
 * `surface` + `drawer` 2,666 / 3,009, `expand` 777 / 917. Raise only for
 * rules the presentation needs to paint.
 */
const BUDGETS = {
	bar: { brotli: 2700, gzip: 3050, sheets: ['surface', 'bar'] },
	drawer: { brotli: 2950, gzip: 3300, sheets: ['surface', 'drawer'] },
	expand: { brotli: 860, gzip: 1010, sheets: ['expand'] },
} as const;

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

const readDist = function readDist(path: string): string {
	if (!existsSync(path)) {
		throw new Error(
			`Missing ${path}. Build @inth/sdk/ui first: bun run --cwd packages/sdk/ui build`
		);
	}
	return readFileSync(path, 'utf8');
};

/** The hashed class names of a component's class map. */
const classNamesOf = (component: string): string[] => [
	...new Set(
		[
			...readDist(
				join(DIST_DIR, 'styles', 'components', `${component}.js`)
			).matchAll(/inth-ui-[\w-]+/gu),
		].map((match) => match[0])
	),
];

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

/** Every declaration as `context|selector|prop|value`, keyframes excluded. */
const declarations = function declarations(css: string): string[] {
	const found: string[] = [];
	parse(css).walkDecls((node) => {
		const rule = node.parent as Container & { selector?: string };
		if (rule.selector === undefined || contextOf(node).includes('keyframes')) {
			return;
		}
		found.push(
			`${contextOf(node)}|${rule.selector}|${node.prop}|${node.value}`
		);
	});
	return found;
};

/** Custom properties declared outside `@layer components`. */
const rootVariables = function rootVariables(css: string): Set<string> {
	const names = new Set<string>();
	parse(css).walkDecls(/^--/u, (node) => {
		if (!contextOf(node).includes('@layer components')) {
			names.add(node.prop);
		}
	});
	return names;
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

/** Variables read at least once with no fallback. */
const fallbacklessReads = (css: string): Set<string> =>
	new Set(
		[...css.matchAll(/var\(\s*(?<name>--[\w-]+)\s*\)/gu)].map(
			(match) => match.groups?.name ?? ''
		)
	);

const brotli = (text: string): number =>
	brotliCompressSync(text, {
		params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
	}).length;
const gzip = (text: string): number => gzipSync(text, { level: 9 }).length;

describe('v6 presentation sheets', async () => {
	const names = Object.keys(PRESENTATION_SHEETS);
	const sheets = Object.fromEntries(
		await Promise.all(
			names.map(async (name) => [name, await importSheet(name)])
		)
	) as Record<keyof typeof PRESENTATION_SHEETS, Sheet>;
	const tokens = await importSheet('tokens');
	const button = await importSheet('button');
	const styles = readDist(join(DIST_DIR, 'styles.css'));
	const declaredOnRoot = rootVariables(styles);

	test('each sheet has its own id, and its deferred twin the same one', async () => {
		const deferred = await Promise.all(
			names.map((name) => importSheet(`${name}-deferred`))
		);
		const loaded = await Promise.all(deferred.map((sheet) => sheet.load?.()));

		for (const [index, name] of names.entries()) {
			const sheet = sheets[name as keyof typeof sheets];

			expect(sheet.id).toBe(`inth-${name}`);
			expect(deferred[index]?.id).toBe(sheet.id);
			expect(deferred[index]?.css).toBe('');
			expect(loaded[index]).toBe(sheet.css);
		}
	});

	test('each sheet holds its own component and no other presentation', () => {
		for (const [name, components] of Object.entries(PRESENTATION_SHEETS)) {
			const { css } = sheets[name as keyof typeof sheets];
			const own = components.flatMap(classNamesOf);
			const others = PRESENTATION_COMPONENTS.filter(
				(component) => !(components as readonly string[]).includes(component)
			).flatMap(classNamesOf);

			expect(own.some((className) => css.includes(className))).toBe(true);
			expect({
				name,
				others: others.filter((className) => css.includes(className)),
			}).toEqual({ name, others: [] });
		}
	});

	test('card holds no Banner or Drawer placement, and the other way round', () => {
		const placements = {
			bar: /data-placement=['"]?banner-/u,
			card: /data-placement=['"]?card-/u,
			drawer: /data-placement=['"]?drawer-/u,
		};

		for (const [name, own] of Object.entries(placements)) {
			const { css } = sheets[name as keyof typeof placements];
			const foreign = Object.entries(placements)
				.filter(([other, pattern]) => other !== name && pattern.test(css))
				.map(([other]) => other);

			expect(css).toMatch(own);
			expect({ foreign, name }).toEqual({ foreign: [], name });
		}
		for (const name of ['surface', 'expand'] as const) {
			expect(sheets[name].css).not.toMatch(/data-placement=/u);
		}
	});

	test('start and end follow the writing direction, so an RTL page mirrors them', () => {
		// Any physical side would pin a `start` Card or Drawer to the left on
		// a right-to-left page.
		const physical =
			/\|(?:left|right|(?:margin|padding)-(?:left|right)|border-(?:left|right)(?:-\w+)?)\|/u;
		for (const name of ['surface', 'card', 'drawer', 'expand'] as const) {
			const { css } = sheets[name];
			const sides = declarations(css).filter((entry) => physical.test(entry));

			expect({ name, sides }).toEqual({ name, sides: [] });
			expect(css).not.toMatch(
				/card-bottom-(?:left|right)|drawer-(?:left|right)|from-(?:left|right)|to-(?:left|right)/u
			);
		}
		const dialog = readFileSync(
			join(SOURCE_DIR, 'privacy-choices.module.css'),
			'utf8'
		);
		expect(
			declarations(dialog).filter((entry) => physical.test(entry))
		).toEqual([]);
		expect(dialog).toMatch(
			/\.segmented:dir\(rtl\)\[data-selected='1'\] \.segmentedThumb \{\s*transform: translateX\(-100%\);/u
		);

		const card = declarations(sheets.card.css);
		expect(card).toContainEqual(
			expect.stringMatching(
				/\|[^|]*\.inth-ui-root-[\w-]+\|inset-inline-start\|0$/u
			)
		);
		expect(card).toContainEqual(
			expect.stringMatching(/\[data-placement=card-end\]\|inset-inline\|0$/u)
		);

		const drawer = declarations(sheets.drawer.css);
		expect(drawer).toContainEqual(
			expect.stringMatching(
				/\[data-placement=drawer-start\]\|inset-inline\|0 auto$/u
			)
		);
		expect(drawer).toContainEqual(
			expect.stringMatching(
				/\[data-placement=drawer-end\]\|inset-inline\|auto 0$/u
			)
		);
		// The side slides read one sign, which flips under :dir(rtl), so a
		// `start` drawer enters from the start edge in both directions.
		expect(drawer).toContainEqual(
			expect.stringMatching(
				/^@layer components\|\.inth-ui-root-[\w-]+:dir\(rtl\)\|--_consent-inline-sign\|-1$/u
			)
		);
		const slides = [
			...sheets.drawer.css.matchAll(
				/@keyframes [\w-]*consent-drawer-(?:from|to)-(?:start|end)[\w-]*\{[^}]*\{transform:(?<transform>[^}]*)\}/gu
			),
		].map((match) => match.groups?.transform);

		expect(slides).toHaveLength(8);
		for (const transform of slides) {
			expect(transform).toMatch(
				/^translateX\(calc\(.*\* var\(--_consent-inline-sign,\s*1\)\)\)$/u
			);
		}
	});

	test('a Card stays within the first-paint ceiling', () => {
		const card = [tokens, button, sheets.surface, sheets.card]
			.map((sheet) => sheet.css)
			.join('');

		expect(brotli(card)).toBeLessThanOrEqual(CARD_BROTLI_CEILING);
		expect(gzip(card)).toBeLessThanOrEqual(CARD_GZIP_CEILING);
	});

	test.each(Object.entries(BUDGETS))(
		'%s stays within its budget',
		(_name, budget) => {
			const css = budget.sheets
				.map((name) => sheets[name as keyof typeof sheets].css)
				.join('');

			expect(brotli(css)).toBeLessThanOrEqual(budget.brotli);
			expect(gzip(css)).toBeLessThanOrEqual(budget.gzip);
		}
	);

	test('each sheet reads only what it, tokens or surface declares', () => {
		const fromTokens = declaredVariables(tokens.css);
		const fromSurface = declaredVariables(sheets.surface.css);

		for (const [name, sheet] of Object.entries(sheets)) {
			const declared = new Set([
				...fromTokens,
				...fromSurface,
				...declaredVariables(sheet.css),
			]);
			// A `:root` variable of styles.css that the sheet doesn't carry
			// renders the part unstyled wherever styles.css isn't loaded.
			const missingRoot = [...readVariables(sheet.css)].filter(
				(variable) => declaredOnRoot.has(variable) && !declared.has(variable)
			);
			// The parts' private properties come from `surface` or the
			// presentation's own root; `expand` reads them with a fallback.
			const missingPrivate = [...fallbacklessReads(sheet.css)].filter(
				(variable) => variable.startsWith('--_') && !declared.has(variable)
			);

			expect({ missingPrivate, missingRoot, name }).toEqual({
				missingPrivate: [],
				missingRoot: [],
				name,
			});
		}
	});

	test('nothing is declared on :root, so scoped palettes reach every part', () => {
		for (const [name, sheet] of Object.entries(sheets)) {
			expect({ name, root: [...rootVariables(sheet.css)] }).toEqual({
				name,
				root: [],
			});
		}
	});

	test('[PERM-07] [VIS-08] the blocking treatment wins over every edge style', () => {
		const card = classNamesOf('consent-surface').find((name) =>
			name.startsWith('inth-ui-card-')
		);
		const surface = declarations(sheets.surface.css);

		expect(card).toBeDefined();
		// The card reads the blocking value first, whatever sets the rest.
		expect(surface).toContainEqual(
			expect.stringMatching(
				new RegExp(
					`^@layer components\\|\\.${card}\\|box-shadow\\|var\\(--_consent-blocking-shadow,`,
					'u'
				)
			)
		);
		expect(surface).toContainEqual(
			expect.stringMatching(
				new RegExp(
					`^@layer components\\|\\.${card}\\|border\\|1px solid var\\(--_consent-blocking-border,`,
					'u'
				)
			)
		);
		expect(surface).toContainEqual(
			expect.stringMatching(
				/\[data-blocking=true\]\|--_consent-blocking-border\|transparent$/u
			)
		);
		// The presentations style edges through private properties and
		// border widths only, never the card's shadow or border colour.
		for (const name of ['card', 'bar', 'drawer'] as const) {
			const direct = declarations(sheets[name].css).filter((entry) =>
				/\|(?:box-shadow|border|border-color|border-(?:top|right|bottom|left)(?:-color)?)\|/u.test(
					entry
				)
			);

			expect({ direct, name }).toEqual({ direct: [], name });
		}
	});

	test('[PERM-07] the tag keeps its hover and focus border over the scrim', () => {
		const surface = declarations(sheets.surface.css);
		const tagShadow = surface.find((entry) =>
			/\.inth-ui-tag-[\w-]+\|box-shadow\|/u.test(entry)
		);

		// Blocking sets the resting ring; hover and focus set the active ring,
		// which the tag reads first.
		expect(tagShadow).toMatch(
			/box-shadow\|var\(--_consent-tag-ring-active,var\(--_consent-tag-ring,/u
		);
		expect(surface).toContainEqual(
			expect.stringMatching(/\[data-blocking=true\]\|--_consent-tag-ring\|/u)
		);
		expect(surface).toContainEqual(
			expect.stringMatching(/:hover\|--_consent-tag-ring-active\|/u)
		);
		expect(surface).toContainEqual(
			expect.stringMatching(/:focus-visible\|--_consent-tag-ring-active\|/u)
		);
	});

	test('reduced transparency swaps the blurred scrim for the solid one', () => {
		const reduced = declarations(sheets.surface.css).filter((entry) =>
			entry.includes('prefers-reduced-transparency')
		);

		expect(reduced).toContainEqual(
			expect.stringMatching(/\|backdrop-filter\|none$/u)
		);
		expect(reduced).toContainEqual(
			expect.stringMatching(/\|background\|var\(--inth-overlay-block-solid,/u)
		);
	});

	test("the phone rules, the dialog's too, use the resolver breakpoint", () => {
		const widths = [...PRESENTATION_COMPONENTS, 'privacy-choices']
			.flatMap((component) => [
				...readFileSync(
					join(SOURCE_DIR, `${component}.module.css`),
					'utf8'
				).matchAll(/@media\s*(?<query>\([^)]*width[^)]*\))/gu),
			])
			.map((match) => match.groups?.query);

		expect(widths.length).toBeGreaterThan(0);
		expect(new Set(widths)).toEqual(new Set([PHONE_LAYOUT_QUERY]));
	});
});
