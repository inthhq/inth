/**
 * Guards the default theme tokens that `generate-css-entrypoints.ts` bakes
 * into the render-blocking stylesheets (`styles.css`, `styles.tw3.css`). The
 * IAB and primitive sheets load next to one of those and carry no second
 * copy.
 *
 * Without them every component rule resolves `var(--inth-surface)`,
 * `var(--inth-radius-lg)` and friends against nothing, and an app that imports
 * the stylesheet without passing a `theme` renders the banner unstyled.
 *
 * These read the built artifacts, so `bun run --cwd packages/sdk/ui build` (or
 * `turbo run build --filter=@inth/sdk-ui`, which `test` depends on) must have run.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeEach, describe, expect, test } from 'vite-plus/test';

import {
	defaultTheme,
	generatePrimaryTintSupportsCSS,
	themeToVars,
} from '../../theme/utils';

const DIST_DIR = join(__dirname, '..', '..', '..', 'dist');

const ENTRYPOINTS = ['styles.css', 'styles.tw3.css'];

/** Sheets that load next to `styles.css` and must not repeat its tokens. */
const COMPANION_SHEETS = [
	join('iab', 'styles.css'),
	join('iab', 'styles.tw3.css'),
	join('styles', 'primitives.css'),
];

const readEntrypoint = function readEntrypoint(relativePath: string): string {
	const path = join(DIST_DIR, relativePath);

	if (!existsSync(path)) {
		throw new Error(
			`Missing ${path}. Build @inth/sdk/ui first: bun run --cwd packages/sdk/ui build`
		);
	}

	return readFileSync(path, 'utf8');
};

const findBlockStart = function findBlockStart(
	css: string,
	selector: string
): number {
	const pattern = selector
		.split(',')
		.map((part) => part.trim().replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'))
		.join('\\s*,\\s*');
	return css.search(new RegExp(`${pattern}\\s*\\{`, 'u'));
};

/**
 * Slice out one `selector { ... }` block by brace matching, so nested blocks
 * inside the stylesheet do not truncate it early.
 */
const readBlock = function readBlock(
	css: string,
	selector: string
): string | null {
	const start = findBlockStart(css, selector);

	if (start === -1) {
		return null;
	}

	const bodyStart = css.indexOf('{', start) + 1;
	let depth = 1;

	for (let index = bodyStart; index < css.length; index += 1) {
		const char = css[index];

		if (char === '{') {
			depth += 1;
		} else if (char === '}') {
			depth -= 1;

			if (depth === 0) {
				return css.slice(bodyStart, index);
			}
		}
	}

	return null;
};

/**
 * Tokens the stylesheet writes as references rather than the literal in
 * `defaultTheme`, so a CSS-only theme moves them with the tokens they
 * derive from.
 */
const REFERENCED_LIGHT: Record<string, string> = {
	'--inth-primary-text': 'var(--inth-primary)',
	'--inth-primary-tint':
		'color-mix(in srgb, var(--inth-primary) 10%, var(--inth-surface))',
	'--inth-radius-container': 'min(var(--inth-radius-lg), 0.75rem)',
	'--inth-radius-nested': 'min(var(--inth-radius-md), 0.5rem)',
	'--inth-switch-track-active': 'var(--inth-primary)',
};
const REFERENCED_DARK: Record<string, string> = {
	...REFERENCED_LIGHT,
	// Not a reference: blue text needs its own colour on a dark card (VIS-02).
	'--inth-primary-text': '#8ab4ff',
	'--inth-primary-tint':
		'color-mix(in srgb, var(--inth-primary) 18%, var(--inth-surface))',
};

const LIGHT_SELECTOR = ':root, :host, .inth-theme-root';
const DARK_SELECTOR = [
	':root.dark',
	':host(.dark)',
	'.dark .inth-theme-root',
	':root.inth-dark',
	':host(.inth-dark)',
	'.inth-dark .inth-theme-root',
].join(', ');

describe.each(ENTRYPOINTS)('%s', (entrypoint) => {
	const css = readEntrypoint(entrypoint);

	test('defines every light token themeToVars(defaultTheme) emits', () => {
		const block = readBlock(css, LIGHT_SELECTOR);
		expect(block).not.toBeNull();

		for (const [name, value] of Object.entries(
			themeToVars(defaultTheme, false)
		)) {
			expect(block).toContain(`${name}: ${REFERENCED_LIGHT[name] ?? value}`);
		}
	});

	test('defines every dark token themeToVars(defaultTheme, true) emits', () => {
		const block = readBlock(css, DARK_SELECTOR);
		expect(block).not.toBeNull();

		for (const [name, value] of Object.entries(
			themeToVars(defaultTheme, true)
		)) {
			expect(block).toContain(`${name}: ${REFERENCED_DARK[name] ?? value}`);
		}
	});

	test('[VIS-03] makes the referenced primary tint opaque where it can', () => {
		// `color-mix` keeps a translucent `--inth-primary`'s alpha; the base
		// declarations above stay for browsers without relative colour syntax.
		expect(css).toContain(generatePrimaryTintSupportsCSS());
	});

	test('scopes every :root block to :host too, for shadow-root hosts', () => {
		// A bare `:root{` (component variables) or `:root.x{` without a
		// `:host` twin would leave a shadow-root banner unstyled.
		const bare =
			css.match(/(?:^|[\s,}{;]):root(?:\.[A-Za-z0-9_-]+)?\s*\{/gu) ?? [];
		expect(bare).toEqual([]);
		expect(css).toMatch(/:root\s*,\s*:host/u);
	});

	test('emits the tokens first, so they read as the file preamble', () => {
		// Only the layer order statement may precede them.
		const preamble = css.replace(/^@layer [^;{]+;\s*/u, '');
		expect(preamble.startsWith('/* default theme tokens')).toBe(true);
	});

	test('emits the tokens unlayered', () => {
		// Unlayered, so a host's own unlayered `:root` overrides placed after
		// the stylesheet still win by source order, as they always have. A
		// `generateThemeCSS` theme wins by specificity wherever it lands.
		const layerStart = css.indexOf('@layer components');
		const tokensStart = findBlockStart(css, LIGHT_SELECTOR);
		expect(tokensStart).toBeGreaterThanOrEqual(0);
		const tokensEnd = css.indexOf('}', tokensStart);

		expect(tokensEnd).toBeLessThan(layerStart === -1 ? Infinity : layerStart);
	});
});

describe.each(COMPANION_SHEETS)('%s', (entrypoint) => {
	const css = readEntrypoint(entrypoint);

	test('does not repeat the default tokens', () => {
		expect(findBlockStart(css, LIGHT_SELECTOR)).toBe(-1);
		expect(findBlockStart(css, DARK_SELECTOR)).toBe(-1);
		expect(css).not.toContain('--inth-surface:');
	});

	test('scopes every :root block to :host too, for shadow-root hosts', () => {
		const bare =
			css.match(/(?:^|[\s,}{;]):root(?:\.[A-Za-z0-9_-]+)?\s*\{/gu) ?? [];
		expect(bare).toEqual([]);
	});
});

describe('surface font variables', () => {
	/**
	 * `typography.fontFamily` reaches the page as `--inth-font-family`. A
	 * surface whose own font variable hardcodes a stack instead ignores the
	 * theme: the preference list did, so its category rows kept the system
	 * font under a themed dialog title. A variable several sheets read
	 * is not declared at all; its default is the fallback where it is read.
	 */
	const fontVariables = [
		readEntrypoint('styles.css'),
		readEntrypoint(join('iab', 'styles.css')),
	].flatMap((css) =>
		[
			...css.matchAll(
				/(?<name>--(?:iab-)?(?:consent|cd)-[a-z-]*font-family)\s*:\s*(?<value>[^;}]+)/gu
			),
			...css.matchAll(
				/var\(\s*(?<name>--(?:iab-)?(?:consent|cd)-[a-z-]*font-family)\s*,\s*(?<value>[^()]*(?:\([^()]*\))?)\s*\)/gu
			),
		].map((match) => [match.groups?.name, match.groups?.value?.trim()])
	);

	test('the sheets declare them', () => {
		expect(fontVariables.map(([name]) => name)).toEqual(
			expect.arrayContaining([
				'--consent-banner-font-family',
				'--consent-dialog-font-family',
				'--consent-manager-font-family',
				'--iab-consent-banner-font-family',
				'--iab-cd-font-family',
			])
		);
	});

	test('every one resolves through --inth-font-family', () => {
		expect(
			fontVariables.filter(([, value]) => value !== 'var(--inth-font-family)')
		).toEqual([]);
	});
});

describe('an app that imports the stylesheet without a theme', () => {
	beforeEach(() => {
		document.head.innerHTML = '';
		document.documentElement.className = '';
	});

	/**
	 * jsdom's CSS parser rejects the whole stylesheet — it does not understand
	 * `@layer`, `color-mix()` or range media queries — and a rejected sheet
	 * contributes nothing to the cascade. Mount the real artifact's token
	 * preamble instead: still the shipped bytes, minus the layer order
	 * statement and the component rules jsdom could not apply anyway.
	 */
	const mountStylesheet = function mountStylesheet() {
		const css = readEntrypoint('styles.css');
		const tokensStart = css.indexOf('/* default theme tokens');
		const componentsStart = css.indexOf('/* primitives/');
		expect(tokensStart).toBeGreaterThanOrEqual(0);
		expect(componentsStart).toBeGreaterThan(tokensStart);

		const style = document.createElement('style');
		style.textContent = css.slice(tokensStart, componentsStart);
		document.head.appendChild(style);
	};

	test('resolves the base tokens on :root', () => {
		mountStylesheet();

		const computed = getComputedStyle(document.documentElement);

		expect(computed.getPropertyValue('--inth-surface')).toBe(
			defaultTheme.colors.surface
		);
		expect(computed.getPropertyValue('--inth-radius-lg')).toBe(
			defaultTheme.radius.lg
		);
		expect(computed.getPropertyValue('--inth-font-family')).toBe(
			defaultTheme.typography.fontFamily
		);
	});

	test('lets a provider-injected <style id="inth-theme"> override them', () => {
		mountStylesheet();

		const injected = document.createElement('style');
		injected.id = 'inth-theme';
		injected.textContent = `${LIGHT_SELECTOR} { --inth-surface: rebeccapurple; }`;
		document.head.appendChild(injected);

		expect(
			getComputedStyle(document.documentElement).getPropertyValue(
				'--inth-surface'
			)
		).toBe('rebeccapurple');
	});
});
