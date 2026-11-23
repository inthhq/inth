/**
 * Post-build script for @inth/sdk-ui:
 * 1. Renames primitive `*_module.css` files to `*.module.css` (rslib emits
 *    underscores) and fixes the matching references in `.module.js` files
 * 2. Generates aggregated CSS entrypoints from `dist/styles/primitives` and
 *    the flat component CSS in `dist/styles/components` (produced by
 *    `generate-style-artifacts.ts`, which must run first):
 *    - the `defaultTheme` base tokens (`--inth-surface`, `--inth-radius-lg`,
 *      `--inth-font-family`, ...) are emitted first and unlayered, so an app
 *      that imports the stylesheet without passing a `theme` still renders the
 *      styled UI instead of falling back to browser defaults
 *    - :root custom properties and @keyframes stay unlayered
 *    - `styles.css` / `iab/styles.css` wrap component rules in `@layer components`
 *      for Tailwind 4 and native CSS layer consumers; every layered file opens
 *      with Tailwind 4's layer order statement so `components` never ranks
 *      below `base`
 *    - `styles.tw3.css` / `iab/styles.tw3.css` emit the same component rules
 *      flat. They predate `@inth/sdk-ui/postcss-tailwind3` covering the
 *      entrypoints and stay for apps that already import them; new Tailwind 3
 *      setups import `styles.css` and run the plugin
 *
 * | File | Holds | Loaded by |
 * | --- | --- | --- |
 * | `styles.css`, `styles.tw3.css` | default tokens, every `:root` variable and `@keyframes`, rules for the banner, dialog trigger, ConsentGate, v6 presentations, dialog and preference widget | the app, once |
 * | `styles/primitives.css` | rules for the `@inth/sdk-ui/styles/primitives` class maps | Svelte's `styles.css` and hosts that render those class maps |
 * | `iab/styles.css`, `iab/styles.tw3.css` | IAB variables and rules only | the app, next to `styles.css` |
 * | `styles/dialog.css`, `styles/dialog.js` | nothing; kept so existing imports resolve | — |
 * | `styles/sheets/first-paint.js` | `styles.css` up to its dialog rules, as a string | Svelte surfaces, IAB banners and Astro, which render it as a `<style>` |
 * | `styles/sheets/tokens.js` | the default theme tokens, as a string | React surfaces, before their own sheet |
 * | `styles/sheets/{button,banner,trigger,consent-gate}.js` | one surface's rules and the component variables they read, as a string (see `SURFACE_SHEETS`) | React surfaces |
 * | `styles/sheets/{surface,card,bar,drawer,expand}.js` | the v6 consent prompt, one presentation each, as a string (see `PRESENTATION_SHEETS`) | nothing yet; the v6 renderers |
 * | `styles/sheets/*-deferred.js` | the same `id` as the sheet it names, no text, and a `load()` for it | browser bundles of server-rendered apps (the Next.js adapter aliases them) |
 * | `styles/sheets/dialog.js`, `styles/sheets/dialog.css` | the dialog and preference-widget rules and the component variables they read, as a string and as a file | the dialog and widget, with their lazy code; Astro links the file when the dialog opens |
 * | `styles/sheets/primitives.js` | `styles/primitives.css`, as a string | the Svelte dialog |
 * | `styles/sheets/iab-first-paint.js` | IAB variables and banner rules, as a string | IAB banners and standalone dialogs |
 * | `styles/sheets/iab-dialog.js`, `styles/sheets/iab-dialog.css` | IAB dialog rules, as a string and file | IAB dialogs, with their lazy code; Astro links the file before opening |
 *
 * No JavaScript in the package imports a stylesheet. The Next.js Pages
 * Router refuses to build an app whose dependencies import global CSS, so
 * rules reach the page through component-rendered styles or a stylesheet
 * the app imports itself.
 *
 * Every variable stays in `styles.css`. The sheets declare variables on
 * `:where(:root)`, below any host override, so a sheet that lands later and
 * repeats a declaration changes nothing.
 */
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

import { parse } from 'postcss';
import type { AtRule, Rule } from 'postcss';

import {
	defaultTheme,
	defaultThemeReferences,
	generateDefaultThemeCSS,
	generatePrimaryTintSupportsCSS,
} from '../src/theme/utils';
import {
	DIALOG_COMPONENTS,
	FIRST_PAINT_COMPONENTS,
	IAB_DIALOG_COMPONENTS,
	IAB_FIRST_PAINT_COMPONENTS,
	IAB_PREFIX,
	LAYER_ORDER,
	PRESENTATION_COMPONENTS,
	PRESENTATION_SHEETS,
	SURFACE_SHEETS,
} from './stylesheet-parts';

const DIST_DIR = join(import.meta.dirname, '..', 'dist');
const TYPES_DIR = join(import.meta.dirname, '..', 'dist-types');
const PRIMITIVES_DIR = join(DIST_DIR, 'styles', 'primitives');
const COMPONENTS_DIR = join(DIST_DIR, 'styles', 'components');

// Rename *_module.css → *.module.css and strip the bare
// `import"./foo.module.css"` side-effect imports from the class maps:
// - Class names are hardcoded in the JS (rslib resolves them at build time)
// - Styles are loaded via the aggregated entrypoint (styles.css / iab/styles.css)
// Removing them keeps the package CSS contract centered on the aggregated
// entrypoints and avoids relying on host bundlers to process module CSS from
// node_modules.
for (const file of readdirSync(PRIMITIVES_DIR)) {
	if (file.endsWith('_module.css')) {
		renameSync(
			join(PRIMITIVES_DIR, file),
			join(PRIMITIVES_DIR, file.replace('_module.css', '.module.css'))
		);
	}
}

for (const file of readdirSync(PRIMITIVES_DIR)) {
	if (file.endsWith('.module.js')) {
		const filePath = join(PRIMITIVES_DIR, file);
		let content = readFileSync(filePath, 'utf-8');
		if (content.includes('_module.css')) {
			content = content.replace(/_module\.css/gu, '.module.css');
		}
		content = content.replace(
			/import\s*["'][^"']+\.module\.css["']\s*;?/gu,
			''
		);
		writeFileSync(filePath, content);
	}
}

const discoverPrimitiveNames = function discoverPrimitiveNames(): string[] {
	return readdirSync(PRIMITIVES_DIR)
		.filter((f) => f.endsWith('.module.css'))
		.map((f) => f.replace('.module.css', ''))
		.sort();
};

/**
 * Component CSS is the flat `<name>.css` triple member. Anything still named
 * `*.module.css` / `*_module.css` means `generate-style-artifacts.ts` has not
 * run, so fail loudly instead of silently building a partial stylesheet.
 */
const discoverComponentNames = function discoverComponentNames(): string[] {
	if (!existsSync(COMPONENTS_DIR)) {
		return [];
	}
	const files = readdirSync(COMPONENTS_DIR);
	const stale = files.filter(
		(f) => f.endsWith('_module.css') || f.endsWith('.module.css')
	);
	if (stale.length > 0) {
		throw new Error(
			`generate-css-entrypoints: dist/styles/components still contains rslib CSS Module artifacts (${stale.join(
				', '
			)}); run generate-style-artifacts.ts first`
		);
	}
	return files
		.filter((f) => f.endsWith('.css'))
		.map((f) => f.replace(/\.css$/u, ''))
		.sort();
};

const NON_IAB_PRIMITIVES = discoverPrimitiveNames();
const allComponents = discoverComponentNames();
const NON_IAB_COMPONENTS = allComponents.filter(
	(c) => !c.startsWith(IAB_PREFIX)
);
const IAB_COMPONENTS = allComponents.filter((c) => c.startsWith(IAB_PREFIX));

if (NON_IAB_PRIMITIVES.length === 0) {
	throw new Error(
		'generate-css-entrypoints: no primitives found in dist/styles/primitives/'
	);
}
if (NON_IAB_COMPONENTS.length === 0) {
	throw new Error(
		'generate-css-entrypoints: no components found in dist/styles/components/'
	);
}

const firstPaintNames = new Set<string>(FIRST_PAINT_COMPONENTS);
const presentationNames = new Set<string>(PRESENTATION_COMPONENTS);
const dialogNames = new Set<string>(DIALOG_COMPONENTS);
const unassigned = NON_IAB_COMPONENTS.filter(
	(c) =>
		!(firstPaintNames.has(c) || presentationNames.has(c) || dialogNames.has(c))
);
if (unassigned.length > 0) {
	throw new Error(
		`generate-css-entrypoints: add ${unassigned.join(
			', '
		)} to FIRST_PAINT_COMPONENTS, PRESENTATION_SHEETS or DIALOG_COMPONENTS in scripts/stylesheet-parts.ts`
	);
}
const listedTwice = [...presentationNames].filter(
	(c) => firstPaintNames.has(c) || dialogNames.has(c)
);
if (listedTwice.length > 0) {
	throw new Error(
		`generate-css-entrypoints: ${listedTwice.join(', ')} must sit in one list in scripts/stylesheet-parts.ts`
	);
}
const missing = [
	...firstPaintNames,
	...presentationNames,
	...dialogNames,
].filter((c) => !NON_IAB_COMPONENTS.includes(c));
if (missing.length > 0) {
	throw new Error(
		`generate-css-entrypoints: scripts/stylesheet-parts.ts lists ${missing.join(
			', '
		)}, which dist/styles/components does not contain`
	);
}

const surfaceSheetNames = Object.values(SURFACE_SHEETS).flat();
const surfaceSheetProblems = [
	...surfaceSheetNames.filter(
		(name, index) => surfaceSheetNames.indexOf(name) !== index
	),
	...[...firstPaintNames].filter(
		(name) => !(surfaceSheetNames as string[]).includes(name)
	),
];
if (surfaceSheetProblems.length > 0) {
	throw new Error(
		`generate-css-entrypoints: SURFACE_SHEETS in scripts/stylesheet-parts.ts must list each FIRST_PAINT_COMPONENTS entry once (check ${surfaceSheetProblems.join(', ')})`
	);
}

const presentationSheetNames: string[] =
	Object.values(PRESENTATION_SHEETS).flat();
const presentationSheetProblems = [
	...presentationSheetNames.filter(
		(name, index) => presentationSheetNames.indexOf(name) !== index
	),
	...[...presentationNames].filter(
		(name) => !presentationSheetNames.includes(name)
	),
	...presentationSheetNames.filter((name) => !presentationNames.has(name)),
];
if (presentationSheetProblems.length > 0) {
	throw new Error(
		`generate-css-entrypoints: PRESENTATION_SHEETS and PRESENTATION_COMPONENTS in scripts/stylesheet-parts.ts must list the same components once (check ${presentationSheetProblems.join(', ')})`
	);
}

/**
 * Locate the `@layer components { ... }` block, matching braces so nested
 * `@media` / `@supports` blocks inside the layer are handled correctly.
 */
const findComponentsLayer = function findComponentsLayer(
	css: string
): { start: number; bodyStart: number; end: number } | null {
	const match = /@layer\s+components\s*\{/u.exec(css);
	if (!match) {
		return null;
	}
	const bodyStart = match.index + match[0].length;
	let depth = 1;
	for (let index = bodyStart; index < css.length; index += 1) {
		const char = css[index];
		if (char === '{') {
			depth += 1;
		} else if (char === '}') {
			depth -= 1;
			if (depth === 0) {
				return { bodyStart, end: index, start: match.index };
			}
		}
	}
	throw new Error(
		'generate-css-entrypoints: unbalanced @layer components block'
	);
};

/**
 * Split a stylesheet into the part that must stay unlayered (`:root`
 * custom properties, `@keyframes`, media-scoped overrides) and the component
 * rules from inside `@layer components`.
 *
 * Stylesheets without a `@layer components` wrapper (e.g. panel-trigger,
 * which inlines its variables into selectors) are treated entirely as
 * component rules.
 */
const splitStylesheet = function splitStylesheet(source: string): {
	unlayered: string;
	componentRules: string;
} {
	// Component files open with the layer order statement for Vue's
	// per-component imports. The entrypoints write their own once.
	const css = source.replace(LAYER_ORDER, '');
	const layer = findComponentsLayer(css);
	if (!layer) {
		return { componentRules: css.trim(), unlayered: '' };
	}
	const componentRules = css.slice(layer.bodyStart, layer.end).trim();
	const unlayered = `${css.slice(0, layer.start)}${css.slice(
		layer.end + 1
	)}`.trim();
	return { componentRules, unlayered };
};

/**
 * Split CSS into top-level statements (`:root{...}`, `@keyframes x{...}`,
 * `@media{...}`) by brace matching, so identical blocks can be deduplicated.
 */
const splitTopLevelStatements = function splitTopLevelStatements(
	css: string
): string[] {
	const statements: string[] = [];
	let depth = 0;
	let start = 0;
	for (let index = 0; index < css.length; index += 1) {
		const char = css[index];
		if (char === '{') {
			depth += 1;
		} else if (char === '}') {
			depth -= 1;
			if (depth === 0) {
				statements.push(css.slice(start, index + 1).trim());
				start = index + 1;
			}
		}
	}
	const tail = css.slice(start).trim();
	if (tail) {
		statements.push(tail);
	}
	return statements.filter(Boolean);
};

/**
 * Add `:host` to every `:root` selector in a block of unlayered statements.
 *
 * Component stylesheets declare their variables on `:root`, which nothing
 * inside a shadow root matches; a script-tag host that renders the banner
 * in a shadow root would otherwise resolve `var(--consent-dialog-max-width)`
 * and friends against nothing. `:host` matches nothing in the light DOM, so
 * framework hosts see no change.
 */
const scopeRootToHost = function scopeRootToHost(css: string): string {
	return css.replace(
		/(?<before>^|[\s,}{;]):root(?<className>\.[A-Za-z0-9_-]+)?(?=[\s,{])/gu,
		(_match, before: string, className: string | undefined) =>
			className
				? `${before}:root${className}, :host(${className})`
				: `${before}:root, :host`
	);
};

interface StylesheetSource {
	/** Which output file receives the rules. */
	group: string;
	label: string;
	path: string;
}

/**
 * Read each source, keep its unlayered statements (`:root` variables,
 * `@keyframes`) in one list and its component rules in a list per output
 * group. `seenUnlayered` is shared across calls so a statement already
 * emitted in `styles.css` is not repeated in the IAB sheet.
 */
const collectCssParts = function collectCssParts(
	sources: StylesheetSource[],
	seenUnlayered: Set<string>
): { rootParts: string[]; ruleParts: Map<string, string[]> } {
	const rootParts: string[] = [];
	const ruleParts = new Map<string, string[]>();

	for (const { group, label, path } of sources) {
		const { unlayered, componentRules } = splitStylesheet(
			readFileSync(path, 'utf-8')
		);
		// Several components inline the same shared animation stylesheet, so
		// the same @keyframes / :root block shows up more than once. Keep the
		// first.
		const uniqueUnlayered = splitTopLevelStatements(
			scopeRootToHost(unlayered)
		).filter((statement) => {
			if (seenUnlayered.has(statement)) {
				return false;
			}
			seenUnlayered.add(statement);
			return true;
		});
		if (uniqueUnlayered.length > 0) {
			rootParts.push(`/* ${label} vars */\n${uniqueUnlayered.join('\n')}`);
		}
		if (componentRules) {
			const parts = ruleParts.get(group) ?? [];
			parts.push(`/* ${label} */\n${componentRules}`);
			ruleParts.set(group, parts);
		}
	}

	return { rootParts, ruleParts };
};

/**
 * The `defaultTheme` base tokens, serialized by the same code as the
 * `generateThemeCSS` a host calls for its own theme. Every component stylesheet resolves its
 * colours, radii, fonts and motion through these, mostly without `var()`
 * fallbacks, so a stylesheet that ships without them renders unstyled in any
 * app that does not pass a `theme` — including server-rendered, zero-JS pages
 * that can never inject them.
 *
 * `defaultTheme` stays the single source of truth: this is generated at build
 * time from the same object the runtime exports, so CSS and JS cannot drift.
 *
 * Emitted first and **unlayered** in every entrypoint, on the base `:root`
 * selectors. In the light DOM, a host's `<style id="inth-theme">` from
 * `generateThemeCSS` wins wherever it lands: its selectors carry one more
 * specificity point (`:root:root`), so it overrides these even when it comes
 * first in the document, as SvelteKit's `<svelte:head>` does. Its `:host`
 * selector does not, so inside a shadow root the theme must come after this
 * stylesheet. When a host imports the
 * stylesheet into a cascade layer (`@import ... layer(inth)`), unlayered
 * theme declarations outrank it by layer precedence too.
 */
const DEFAULT_THEME_BANNER =
	'/* default theme tokens (generated from defaultTheme) */';
const DEFAULT_THEME_CSS = [
	DEFAULT_THEME_BANNER,
	// Only the package defaults use references, so a CSS-only theme that sets
	// --inth-primary, --inth-surface or the radius scale also moves the
	// tokens derived from them, as `themeToVars` does for a JS theme.
	generateDefaultThemeCSS({
		...defaultTheme,
		colors: { ...defaultTheme.colors, ...defaultThemeReferences.colors },
		dark: { ...defaultTheme.dark, ...defaultThemeReferences.dark },
		radius: { ...defaultTheme.radius, ...defaultThemeReferences.radius },
	}),
	generatePrimaryTintSupportsCSS(),
].join('\n');

/**
 * Sits directly above each layer block. Tailwind 3 without
 * `@inth/sdk-ui/postcss-tailwind3` fails on that block, and bundlers print the
 * lines above the failing one, so the fix shows up in the build error.
 * Avoids the word "layer" after an at-sign so layer scans skip it.
 */
const TAILWIND3_HINT =
	"/* Tailwind 3 cannot build the next block on its own. Add '@inth/sdk-ui/postcss-tailwind3' before 'tailwindcss' in your PostCSS plugins. */";

/**
 * Wrap component rules in `@layer components`. Tailwind 4 declares that layer
 * before its utilities, so bare utilities override Inth without
 * `!important`. Tailwind 3 hosts run `@inth/sdk-ui/postcss-tailwind3`, which
 * unwraps the layer in every built stylesheet.
 */
const layered = function layered(ruleParts: string[]): string {
	return `${TAILWIND3_HINT}\n@layer components {\n${ruleParts.map((r) => `  ${r}`).join('\n\n')}\n}`;
};

const joinParts = function joinParts(parts: (string | undefined)[]): string {
	return `${parts.filter((part) => part && part.length > 0).join('\n\n')}\n`;
};

const rulesFor = function rulesFor(
	ruleParts: Map<string, string[]>,
	group: string,
	file: string
): string[] {
	const parts = ruleParts.get(group) ?? [];
	if (parts.length === 0) {
		throw new Error(
			`generate-css-entrypoints: no component rules collected for ${file}`
		);
	}
	return parts;
};

const writeDist = function writeDist(relativePath: string, css: string) {
	const target = join(DIST_DIR, relativePath);
	mkdirSync(dirname(target), { recursive: true });
	writeFileSync(target, css);
};

/**
 * Rank the default tokens and variables of a sheet a component renders
 * below the app's own token rules, wherever the sheet lands.
 *
 * An app overrides a token with a `:root` rule, and a dark one with
 * `:root.dark` or `:root.inth-dark`. Against `styles.css` those win by
 * coming later, since the app imports Inth's stylesheet first. A
 * component's `<style>` can come after the app's stylesheets instead:
 * React hoists it into `<head>` after them, and Svelte appends it. So the
 * defaults rank by specificity here: a bare `:root` becomes `:where(:root)`
 * (0,0,0), below an app's `:root` (0,1,0), and `:root.dark` becomes
 * `html.dark` (0,1,1), above an app's plain `:root` but below its
 * `:root.dark` (0,2,0). `:host` is left alone: these sheets never render
 * into a shadow root.
 */
const yieldToAppRoot = function yieldToAppRoot(css: string): string {
	return css
		.replace(/:root(?=[.[:])/gu, 'html')
		.replace(/:root(?![\w-])/gu, ':where(:root)');
};

/**
 * Write `dist/styles/sheets/<name>.js`: a module exporting a stylesheet as
 * a string, and the `id` a component dedupes it by.
 *
 * Comments are dropped: the string ships in JavaScript and in every
 * server-rendered page, where nobody reads them.
 */
const writeSheet = function writeSheet(name: string, css: string): string {
	const text = css
		.replace(/\/\*[\s\S]*?\*\//gu, '')
		.replace(/\n{2,}/gu, '\n')
		.trim();
	writeDist(
		`styles/sheets/${name}.js`,
		`export const id = ${JSON.stringify(`inth-${name}`)};\nexport const css = ${JSON.stringify(text)};\n`
	);
	const declaration = join(TYPES_DIR, 'styles', 'sheets', `${name}.d.ts`);
	mkdirSync(dirname(declaration), { recursive: true });
	writeFileSync(
		declaration,
		[
			'/** Identifies the stylesheet, so a page renders it once. */',
			'export declare const id: string;',
			'/** The stylesheet text. */',
			'export declare const css: string;',
			'',
		].join('\n')
	);
	// Watch builds keep dist, so remove declarations from the earlier output
	// layout as well as emitting them in the package's types directory.
	rmSync(join(DIST_DIR, 'styles', 'sheets', `${name}.d.ts`), { force: true });
	return text;
};

const seenUnlayered = new Set<string>();
const nonIab = collectCssParts(
	[
		...NON_IAB_PRIMITIVES.map((name) => ({
			group: 'primitives',
			label: `primitives/${name}`,
			path: join(PRIMITIVES_DIR, `${name}.module.css`),
		})),
		...NON_IAB_COMPONENTS.map((name) => ({
			// First-paint rules are grouped per component, so each surface
			// sheet can take its own.
			group: dialogNames.has(name) ? 'dialog' : name,
			label: `components/${name}`,
			path: join(COMPONENTS_DIR, `${name}.css`),
		})),
	],
	seenUnlayered
);
const rootCss = nonIab.rootParts.join('\n\n');
/** First-paint component rules, in the order `styles.css` holds them. */
const firstPaintRulesOf = (components: readonly string[]): string[] =>
	NON_IAB_COMPONENTS.filter((name) => components.includes(name)).flatMap(
		(name) => nonIab.ruleParts.get(name) ?? []
	);
const firstPaintRules = firstPaintRulesOf([...firstPaintNames]);
if (firstPaintRules.length === 0) {
	throw new Error(
		'generate-css-entrypoints: no component rules collected for styles.css'
	);
}
/** The v6 presentation rules, in `PRESENTATION_COMPONENTS` order. */
const presentationRulesOf = (components: readonly string[]): string[] =>
	PRESENTATION_COMPONENTS.filter((name) => components.includes(name)).flatMap(
		(name) => nonIab.ruleParts.get(name) ?? []
	);
// The dialog's rules follow the first-paint rules, the order the cascade had
// while they shipped in a stylesheet of their own that loaded later. The v6
// presentation rules sit between: their selectors match none of the
// others' elements.
const componentRules = [
	...firstPaintRules,
	...presentationRulesOf(PRESENTATION_COMPONENTS),
	...rulesFor(nonIab.ruleParts, 'dialog', 'styles.css'),
];

writeDist(
	'styles.css',
	joinParts([LAYER_ORDER, DEFAULT_THEME_CSS, rootCss, layered(componentRules)])
);

writeDist(
	'styles.tw3.css',
	joinParts([DEFAULT_THEME_CSS, rootCss, componentRules.join('\n\n')])
);

// dist/styles/dialog.css and dist/styles/dialog.js (`@inth/sdk-ui/styles/dialog`)
// once carried the dialog's rules separately, and React's dialog modules
// imported them. styles.css holds those rules now. Both files stay empty so
// existing imports keep resolving without loading a rule twice.
writeDist(
	'styles/dialog.css',
	'/* Deprecated and empty: @inth/sdk-ui/styles.css includes the dialog rules. */\n'
);
writeDist(
	'styles/dialog.js',
	'// Deprecated and empty: @inth/sdk-ui/styles.css includes the dialog rules.\nexport {};\n'
);
writeDist('styles/dialog.d.ts', 'export {};\n');

// dist/styles/primitives.css — rules for the primitive class maps, which
// React never renders. Svelte's styles.css and custom hosts import it.
const primitiveRules = rulesFor(
	nonIab.ruleParts,
	'primitives',
	'styles/primitives.css'
);
writeDist(
	'styles/primitives.css',
	joinParts([
		LAYER_ORDER,
		'/* @inth/sdk-ui primitive styles. Needs @inth/sdk-ui/styles.css for tokens and variables. */',
		layered(primitiveRules),
	])
);

/** Every custom property a stylesheet text reads through `var()`. */
const readVariables = (css: string): Set<string> =>
	new Set(
		[...css.matchAll(/var\(\s*(?<name>--[\w-]+)/gu)].map(
			(match) => match.groups?.name ?? ''
		)
	);

/** Each variable's declared values across `rootCss`, media overrides too. */
const variableValues = new Map<string, string[]>();
parse(rootCss).walkDecls(/^--/u, (declaration) => {
	const values = variableValues.get(declaration.prop) ?? [];
	values.push(declaration.value);
	variableValues.set(declaration.prop, values);
});

/**
 * The part of `rootCss` a block of component rules needs: the variables the
 * rules read, the variables those read in turn, and the `@keyframes` any of
 * them name. Declarations keep their selectors, values and order, so the
 * result is a subset of `rootCss`. Theme tokens come from the `tokens`
 * sheet, not from here.
 */
const variablesFor = function variablesFor(rules: string): string {
	const needed = new Set<string>();
	const pending = [...readVariables(rules)];
	while (pending.length > 0) {
		const name = pending.pop() as string;
		if (needed.has(name)) {
			continue;
		}
		needed.add(name);
		for (const value of variableValues.get(name) ?? []) {
			pending.push(...readVariables(value));
		}
	}
	const root = parse(yieldToAppRoot(rootCss));
	const usedText = [
		rules,
		...[...needed].flatMap((name) => variableValues.get(name) ?? []),
	].join('\n');
	root.walkAtRules('keyframes', (atRule: AtRule) => {
		const name = atRule.params.trim();
		if (!new RegExp(`(?<![\\w-])${name}(?![\\w-])`, 'u').test(usedText)) {
			atRule.remove();
		}
	});
	root.walkDecls(/^--/u, (declaration) => {
		if (!needed.has(declaration.prop)) {
			declaration.remove();
		}
	});
	// A registered property ships with the rules that read it.
	root.walkAtRules('property', (atRule: AtRule) => {
		if (!needed.has(atRule.params.trim())) {
			atRule.remove();
		}
	});
	root.walkRules((rule: Rule) => {
		if (rule.nodes.length === 0) {
			rule.remove();
		}
	});
	root.walkAtRules((atRule: AtRule) => {
		if (atRule.nodes && atRule.nodes.length === 0) {
			atRule.remove();
		}
	});
	return root.toString().trim();
};

/**
 * Write `dist/styles/sheets/<name>-deferred.js`: the same `id` as `<name>`
 * and no text, with a `load()` that imports it. The Next.js adapter aliases
 * `<name>` to it in browser bundles, where the server-rendered HTML already
 * holds the sheet, so the text ships once.
 */
const writeDeferredSheet = function writeDeferredSheet(name: string): void {
	writeDist(
		`styles/sheets/${name}-deferred.js`,
		[
			`export const id = ${JSON.stringify(`inth-${name}`)};`,
			'export const css = "";',
			`export const load = () => import(${JSON.stringify(`./${name}.js`)}).then((sheet) => sheet.css);`,
			'',
		].join('\n')
	);
	writeFileSync(
		join(TYPES_DIR, 'styles', 'sheets', `${name}-deferred.d.ts`),
		[
			'/** Identifies the stylesheet, so a page renders it once. */',
			'export declare const id: string;',
			'/** Empty: the text loads through `load`. */',
			'export declare const css: string;',
			'/** Loads the stylesheet text. */',
			'export declare const load: () => Promise<string>;',
			'',
		].join('\n')
	);
};

// dist/styles/sheets/*.js — the same rules as `styles.css` and
// `styles/primitives.css`, as strings, for components that render their own
// `<style>` instead of asking the app to import a stylesheet. A stylesheet
// the app imports is linked from `<head>` and holds the first paint until
// it downloads; a `<style>` in the server-rendered HTML, or one the banner's
// code inserts, does not.
//
// `first-paint` holds what `styles.css` holds up to its v6 presentation
// rules, so a banner, trigger or ConsentGate needs nothing else. The
// presentation sheets hold the v6 rules, `dialog` the dialog and
// preference-widget rules and the variables they read, and `primitives`
// the primitive rules the Svelte dialog renders. Concatenated in that
// order they apply exactly what `styles.css` and `styles/primitives.css`
// apply; the variables the later sheets repeat from `first-paint` are
// identical declarations.
writeSheet(
	'first-paint',
	[
		LAYER_ORDER,
		yieldToAppRoot(DEFAULT_THEME_CSS),
		yieldToAppRoot(rootCss),
		`@layer components{${firstPaintRules.join('\n')}}`,
	].join('\n')
);
writeDeferredSheet('first-paint');

// `tokens` and the surface sheets split `first-paint` for React: a page
// carries the tokens and the sheets of the surfaces it renders, nothing
// else. The server HTML of a fresh visit holds `tokens`, `button` and
// `banner`, not the trigger's or the ConsentGate's rules, nor the variables
// only the dialog reads. Each first-paint rule sits in one surface sheet,
// and each sheet keeps the order `first-paint` gives its rules.
writeSheet(
	'tokens',
	[LAYER_ORDER, yieldToAppRoot(DEFAULT_THEME_CSS)].join('\n')
);
writeDeferredSheet('tokens');
for (const [name, components] of Object.entries(SURFACE_SHEETS)) {
	const rules = firstPaintRulesOf(components);
	if (rules.length === 0) {
		throw new Error(
			`generate-css-entrypoints: no component rules collected for styles/sheets/${name}.js`
		);
	}
	writeSheet(
		name,
		[
			LAYER_ORDER,
			variablesFor(rules.join('\n')),
			`@layer components{${rules.join('\n')}}`,
		]
			.filter(Boolean)
			.join('\n')
	);
	writeDeferredSheet(name);
}
// The v6 presentations, one sheet each, like the surface sheets. A page
// renders `surface` and its presentation's sheet after `tokens` and
// `button`, and `expand` when the options open in place.
for (const [name, components] of Object.entries(PRESENTATION_SHEETS)) {
	const rules = presentationRulesOf(components);
	if (rules.length === 0) {
		throw new Error(
			`generate-css-entrypoints: no component rules collected for styles/sheets/${name}.js`
		);
	}
	writeSheet(
		name,
		[
			LAYER_ORDER,
			variablesFor(rules.join('\n')),
			`@layer components{${rules.join('\n')}}`,
		]
			.filter(Boolean)
			.join('\n')
	);
	writeDeferredSheet(name);
}
const dialogRules = rulesFor(
	nonIab.ruleParts,
	'dialog',
	'styles/sheets/dialog.js'
);
const dialogSheet = [
	LAYER_ORDER,
	variablesFor(dialogRules.join('\n')),
	`@layer components{${dialogRules.join('\n')}}`,
]
	.filter(Boolean)
	.join('\n');
// The same rules as a file, for hosts that link the dialog's rules when it
// opens instead of carrying them in its code (Astro).
writeDist('styles/sheets/dialog.css', `${writeSheet('dialog', dialogSheet)}\n`);
writeSheet(
	'primitives',
	`${LAYER_ORDER}\n@layer components{${primitiveRules.join('\n')}}`
);

// Loaded next to styles.css, so they carry only IAB variables and rules:
// no second copy of the tokens or of the variables styles.css declares.
if (IAB_COMPONENTS.length > 0) {
	const iabFirstPaintNames = new Set<string>(IAB_FIRST_PAINT_COMPONENTS);
	const iabDialogNames = new Set<string>(IAB_DIALOG_COMPONENTS);
	const unassignedIab = IAB_COMPONENTS.filter(
		(name) => !(iabFirstPaintNames.has(name) || iabDialogNames.has(name))
	);
	const missingIab = [...iabFirstPaintNames, ...iabDialogNames].filter(
		(name) => !IAB_COMPONENTS.includes(name)
	);
	if (unassignedIab.length > 0 || missingIab.length > 0) {
		throw new Error(
			`generate-css-entrypoints: IAB stylesheet groups differ from components (unassigned: ${unassignedIab.join(', ')}; missing: ${missingIab.join(', ')})`
		);
	}
	const iab = collectCssParts(
		IAB_COMPONENTS.map((name) => ({
			group: name,
			label: `components/${name}`,
			path: join(COMPONENTS_DIR, `${name}.css`),
		})),
		seenUnlayered
	);
	// Keep the existing aggregate's component order for manual CSS users.
	const iabRules = IAB_COMPONENTS.flatMap((name) =>
		rulesFor(iab.ruleParts, name, 'iab/styles.css')
	);
	const iabBanner =
		'/* @inth/sdk-ui IAB TCF styles. Load after @inth/sdk-ui/styles.css, which holds the tokens. */';
	const iabRoot = iab.rootParts.join('\n\n');

	writeDist(
		'iab/styles.css',
		joinParts([LAYER_ORDER, iabBanner, iabRoot, layered(iabRules)])
	);

	writeDist(
		'iab/styles.tw3.css',
		joinParts([iabBanner, iabRoot, iabRules.join('\n\n')])
	);

	// IAB variables are delivered once, before either component's rules, so
	// opening a dialog cannot reset an app's token overrides.
	writeSheet(
		'iab-first-paint',
		[
			LAYER_ORDER,
			yieldToAppRoot(iabRoot),
			`@layer components{${IAB_FIRST_PAINT_COMPONENTS.flatMap((name) => rulesFor(iab.ruleParts, name, 'styles/sheets/iab-first-paint.js')).join('\n')}}`,
		].join('\n')
	);
	const iabDialogSheet = `${LAYER_ORDER}\n@layer components{${IAB_DIALOG_COMPONENTS.flatMap((name) => rulesFor(iab.ruleParts, name, 'styles/sheets/iab-dialog.js')).join('\n')}}`;
	writeDist(
		'styles/sheets/iab-dialog.css',
		`${writeSheet('iab-dialog', iabDialogSheet)}\n`
	);
}

console.log(
	'Generated dist/styles.css, dist/styles.tw3.css, dist/styles/dialog.css, dist/styles/dialog.js, dist/styles/primitives.css, dist/styles/sheets/*.js, dist/iab/styles.css, and dist/iab/styles.tw3.css'
);
