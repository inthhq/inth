import type { Theme } from './types';

/**
 * The `id` of the `<style>` element that carries a theme's `--inth-*`
 * variables. The React `ConsentTheme` and the Astro components render it,
 * and the providers look for it before warning about unapplied tokens.
 */
export const THEME_STYLE_ELEMENT_ID = 'inth-theme';

/** `Theme` keys that only reach the page as CSS variables. */
const TOKEN_KEYS = [
	'colors',
	'dark',
	'motion',
	'radius',
	'shadows',
	'spacing',
	'typography',
] as const satisfies readonly (keyof Theme)[];

/**
 * Warn when the provider's `theme` carries design tokens the page has no
 * stylesheet for.
 *
 * Providers apply slots and `consentActions` from `theme`, but do not turn
 * tokens into CSS in the browser. A `<style id="inth-theme">` counts as
 * applied. Call it in development only.
 *
 * @param theme - The provider's `theme` option.
 * @param document - The page's document.
 * @param fix - How to apply tokens with this adapter, with its docs link.
 */
export const warnOnUnappliedThemeTokens = function warnOnUnappliedThemeTokens(
	theme: Theme | undefined,
	document: Document,
	fix: string
): void {
	if (
		!theme ||
		!TOKEN_KEYS.some((key) => theme[key] !== undefined) ||
		document.getElementById(THEME_STYLE_ELEMENT_ID)
	) {
		return;
	}
	console.warn(
		`inth: colors, radius and other tokens in the provider \`theme\` are not turned into CSS in the browser; \`theme\` applies slots and consentActions only. ${fix}`
	);
};
