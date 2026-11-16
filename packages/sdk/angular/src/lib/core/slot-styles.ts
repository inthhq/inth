/**
 * Theme and styling helpers for the stock surfaces.
 *
 * @packageDocumentation
 */

import type {
	AllThemeKeys,
	ClassNameStyle,
	Theme,
	ThemeValue,
} from '@c15t/ui/theme';
import { resolveStyles, toStyleAttributeValue } from '@c15t/ui/utils';

/**
 * Resolves a surface part's class and style: the theme's slot for
 * `themeKey` merged with the component's own.
 *
 * @param themeKey - The theme slot the part reads.
 * @param theme - `ConsentTheme.theme()`.
 * @param componentStyle - The part's own class and style.
 * @param noStyle - Drop the stock classes.
 * @returns The class name and style to render.
 */
export const resolveComponentStyles = function resolveComponentStyles(
	themeKey: AllThemeKeys,
	theme: Theme | undefined,
	componentStyle: ClassNameStyle | undefined,
	noStyle: boolean | undefined
): ClassNameStyle {
	return resolveStyles(
		themeKey,
		theme,
		componentStyle as ThemeValue | undefined,
		noStyle
	) as ClassNameStyle;
};

/**
 * Serializes a slot's `style` object for a `style` attribute. camelCase
 * keys become kebab-case, custom properties stay as written, empty values
 * are dropped, and a number gets `px` unless the property is unitless.
 *
 * @param style - The resolved slot style.
 * @returns The attribute value, or `undefined` when there is nothing to set.
 */
export const toStyleAttribute = function toStyleAttribute(
	style: ClassNameStyle['style'] | undefined
): string | undefined {
	return toStyleAttributeValue(style);
};

/**
 * The host appearance of one consent action. Policy action constraints
 * stay in core.
 *
 * @param theme - `ConsentTheme.theme()`.
 * @param action - The action the button performs.
 * @returns The merged `consentActions` entry.
 */
export const resolveConsentActionStyle = function resolveConsentActionStyle(
	theme: Theme | undefined,
	action: 'accept' | 'reject' | 'customize' | 'dismiss' | 'save'
) {
	const specific =
		action === 'save' ? undefined : theme?.consentActions?.[action];
	return { ...theme?.consentActions?.default, ...specific };
};
