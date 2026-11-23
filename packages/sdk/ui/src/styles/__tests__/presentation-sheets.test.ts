/**
 * Guards the consent prompt's sheets: `surface`, then one of `card`,
 * `banner` or `drawer`, and `expand` (see `SURFACE_SHEETS` and
 * `LATER_SHEETS`).
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
	LATER_SHEETS,
	SURFACE_SHEETS,
} from '../../../scripts/stylesheet-parts';

/** The prompt's sheets, one container each plus the shell and `expand`. */
const PRESENTATION_SHEETS = {
	banner: SURFACE_SHEETS.banner,
	card: SURFACE_SHEETS.card,
	drawer: SURFACE_SHEETS.drawer,
	expand: LATER_SHEETS.expand,
	surface: SURFACE_SHEETS.surface,
} as const;
const PRESENTATION_COMPONENTS = [
	'consent-surface',
	'consent-card',
	'consent-banner',
	'consent-drawer',
	'consent-expand',
] as const;

const DIST_DIR = join(__dirname, '..', '..', '..', 'dist');
const SHEETS_DIR = join(DIST_DIR, 'styles', 'sheets');
const SOURCE_DIR = join(__dirname, '..', 'components');

/**
 * Brotli 11 and gzip 9 bytes of `tokens` + `button` + `surface` + `card`,
 * a Card's inline CSS: 4,238 / 4,794 when the consent UI became the only
 * UI, against 5,472 / 6,175 for the banner it replaced. Fitting a short
 * viewport and wrapping a long label brought it to about 4,350 / 4,920.
 */
const CARD_BROTLI_CEILING = 4400;
const CARD_GZIP_CEILING = 4950;

/**
 * Measured size plus about 2%: `surface` + `banner` 2,912 / 3,251,
 * `surface` + `drawer` 3,081 / 3,453, `expand` 762 / 904. Raise only for
 * rules the container needs to paint. The fallbacks to the classic banner
 * variables cost `surface` + `banner` 252 / 264 bytes and `surface` +
 * `drawer` 254 / 263. Fitting a short viewport, and wrapping a label
 * before it is cut off, cost `surface` + `banner` about 75 / 125.
 */
const BUDGETS = {
	banner: { brotli: 3050, gzip: 3450, sheets: ['surface', 'banner'] },
	drawer: { brotli: 3200, gzip: 3600, sheets: ['surface', 'drawer'] },
	expand: { brotli: 800, gzip: 950, sheets: ['expand'] },
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

describe('prompt container sheets', async () => {
	const names = Object.keys(PRESENTATION_SHEETS);
	const sheets = Object.fromEntries(
		await Promise.all(
			names.map(async (name) => [name, await importSheet(name)])
		)
	) as Record<keyof typeof PRESENTATION_SHEETS, Sheet>;
	const tokens = await importSheet('tokens');
	const button = await importSheet('button');
	// The variables a page that imports whole stylesheets declares.
	const declaredOnRoot = rootVariables(readDist(join(DIST_DIR, 'styles.css')));
	const dialogSource = readFileSync(
		join(SOURCE_DIR, 'consent-dialog.module.css'),
		'utf8'
	);
	// The prompt's and the dialog's rules, as their sheets deliver them.
	const consentUi = (
		await Promise.all(
			['surface', 'card', 'banner', 'drawer', 'expand', 'dialog'].map(
				async (name) => (await importSheet(name)).css
			)
		)
	).join('\n');

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
			banner: /data-placement=['"]?banner-/u,
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
		expect(
			declarations(dialogSource).filter((entry) => physical.test(entry))
		).toEqual([]);
		expect(dialogSource).toMatch(
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
					`^@layer components\\|\\.${card}\\|border\\|var\\(--consent-banner-border-width,1px\\) solid var\\(--_consent-blocking-border,`,
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
		for (const name of ['card', 'banner', 'drawer'] as const) {
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
			expect.stringMatching(
				/\|background\|var\(--_consent-veil,var\(--inth-overlay-block-solid,/u
			)
		);
	});

	test('the top Drawer spaces its tag by logical margins, so RTL mirrors it', () => {
		const tag = declarations(sheets.drawer.css).filter((entry) =>
			/\[data-placement=drawer-top\] \.inth-ui-tag-[\w-]+\|margin/u.test(entry)
		);

		expect(tag.map((entry) => entry.split('|').slice(2).join('|'))).toEqual([
			'margin-block|var(--inth-space-sm) 0',
			'margin-inline|0 var(--_consent-gutter)',
		]);
	});

	test('[LAY-08] the scroll fades register prefixed properties only', () => {
		// `@property` is document-wide, so `--fade-top` would retype a host's
		// own variable of that name.
		const registered = [
			...sheets.expand.css.matchAll(/@property\s+(?<name>--[\w-]+)/gu),
		].map((match) => match.groups?.name);

		expect(registered).toEqual(['--inth-fade-top', '--inth-fade-bottom']);
		expect(sheets.expand.css).toMatch(/var\(--inth-fade-top\)/u);
		for (const [name, sheet] of Object.entries(sheets)) {
			expect({
				name,
				unprefixed: /--fade-(?:top|bottom)/u.test(sheet.css),
			}).toEqual({ name, unprefixed: false });
		}
		expect(consentUi).not.toMatch(/--fade-(?:top|bottom)/u);
	});

	test('[VIS-05] dark values reach every selector the dark tokens answer to', () => {
		// The theme's dark tokens apply under `.dark`, `.inth-dark` and both
		// on a shadow host. A rule keyed to one of them leaves the others
		// with the light value.
		const darkSelectors = [
			'.dark',
			'.inth-dark',
			':host(.dark)',
			':host(.inth-dark)',
		];
		const darkRules = (css: string) => {
			const found: string[][] = [];
			parse(css).walkRules((rule) => {
				if (/(?:^|[\s,(])\.(?:inth-)?dark\b/u.test(rule.selector)) {
					found.push(
						rule.selectors.map((part) => part.trim().split(' ')[0] ?? '')
					);
				}
			});
			return found;
		};
		const shipped = [
			...Object.values(sheets).map((sheet) => sheet.css),
			consentUi,
		].join('\n');

		// Only the nested-sheet dim has no dark token; it lists all four.
		const dim: string[][] = [];
		parse(consentUi).walkDecls('background', (node) => {
			const rule = node.parent as Container & { selectors?: string[] };
			if (node.value.includes('57%') && rule.selectors) {
				dim.push(rule.selectors.map((part) => part.split(' ')[0] ?? ''));
			}
		});
		expect(dim).toEqual([darkSelectors]);
		for (const prefixes of darkRules(shipped)) {
			expect(prefixes).toEqual(darkSelectors);
		}
		// A minifier that folds the list into `:is()` would put `:host` where
		// some engines don't match it against the shadow host.
		expect(shipped).not.toMatch(/:is\([^{]*:host/u);
		// The scrim and the nudge take their dark values from tokens the
		// dark palette sets.
		const tokenReads = declarations(shipped).filter((entry) =>
			/\|(?:background|box-shadow)\|.*var\(--inth-(?:overlay-block|overlay-block-solid|danger),/u.test(
				entry
			)
		);
		expect(tokenReads.length).toBeGreaterThanOrEqual(3);
		for (const token of ['overlay-block', 'overlay-block-solid', 'danger']) {
			expect(tokens.css).toMatch(
				new RegExp(`html\\.inth-dark[^{]*\\{[^}]*--inth-${token}:`, 'u')
			);
		}
	});

	test('[VIS-06] the theme-switch guard covers the surface and the dialog, in a shadow root too', () => {
		const guarded = (css: string, className: string) => {
			const selectors: string[] = [];
			parse(css).walkRules((rule) => {
				const reset = rule.nodes.some(
					(node) =>
						node.type === 'decl' &&
						node.prop === 'transition' &&
						node.value === 'none' &&
						node.important
				);
				if (reset) {
					// The `disableAnimation` reset shares the declaration.
					selectors.push(
						...rule.selectors.filter(
							(selector) =>
								selector.includes(className) &&
								selector.includes('data-theme-switching')
						)
					);
				}
			});
			return selectors.map((selector) => selector.replace(className, '.root'));
		};
		// The minifier writes `.root *::before` as `.root :before`.
		const expected = [
			'html[data-theme-switching]',
			':host([data-theme-switching])',
		].flatMap((scope) =>
			['', ' *', ' :before', ' :after'].map((part) => `${scope} .root${part}`)
		);
		const surfaceRoot = classNamesOf('consent-surface').find((name) =>
			name.startsWith('inth-ui-root-')
		);
		const dialogRoot = classNamesOf('consent-dialog').find((name) =>
			name.startsWith('inth-ui-backdrop-')
		);

		expect(surfaceRoot).toBeDefined();
		expect(dialogRoot).toBeDefined();
		expect(guarded(sheets.surface.css, `.${surfaceRoot}`)).toEqual(expected);
		expect(guarded(consentUi, `.${dialogRoot}`)).toEqual(expected);
	});

	test("[MOT-03] disableAnimation stops the dialog's backdrop, card and sheets", () => {
		const backdrop = classNamesOf('consent-dialog').find((name) =>
			name.startsWith('inth-ui-backdrop-')
		);
		const card = classNamesOf('consent-dialog').find((name) =>
			name.startsWith('inth-ui-card-')
		);
		expect(backdrop).toBeDefined();
		expect(card).toBeDefined();
		const reset: string[] = [];
		parse(consentUi).walkRules((rule) => {
			const resets = (prop: string) =>
				rule.nodes.some(
					(node) =>
						node.type === 'decl' &&
						node.prop === prop &&
						node.value === 'none' &&
						node.important
				);
			if (resets('animation') && resets('transition')) {
				reset.push(...rule.selectors);
			}
		});
		const off = `.${backdrop}[data-animation=off]`;
		// The phone sheets rename their animations on `.card`, under it.
		expect(reset).toEqual(
			expect.arrayContaining([off, `${off} .${card}`, `${off} .${card}:after`])
		);
	});

	test("the phone rules, the dialog's too, use the resolver breakpoint", () => {
		const widths = [...PRESENTATION_COMPONENTS, 'consent-dialog']
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
