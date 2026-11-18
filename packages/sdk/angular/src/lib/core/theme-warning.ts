import type { Theme } from '@inth/sdk/ui/theme';

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
 * Warns in development when the provider's `theme` carries design tokens
 * the page has no stylesheet for.
 *
 * The provider applies slots and `consentActions` from `theme`, but it does
 * not turn tokens into CSS in the browser. A `<style id="inth-theme">`
 * rendered from `generateThemeCSS` counts as applied.
 *
 * @param theme - The provider's `theme` option.
 * @param document - The page's document.
 * @internal
 */
export const warnOnUnappliedThemeTokens = function warnOnUnappliedThemeTokens(
	theme: Theme | undefined,
	document: Document
): void {
	if (
		!theme ||
		!TOKEN_KEYS.some((key) => theme[key] !== undefined) ||
		document.getElementById('inth-theme')
	) {
		return;
	}
	console.warn(
		'inth: colors, radius and other tokens in the provider `theme` are ignored in the browser; `theme` applies slots and consentActions only. Put the --inth-* variables, or the CSS from generateThemeCSS(theme), in your stylesheet and drop the tokens from `theme`.'
	);
};
