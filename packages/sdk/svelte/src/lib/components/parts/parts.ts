/**
 * Class and style attributes for the consent prompt's and dialog's parts.
 *
 * React styles each part through its `components` slot (`banner.card`);
 * Svelte reads the same part from `theme.slots` (`consentBannerCard`),
 * which `THEME_SLOT_COMPONENT_KEYS` pairs with it, so a theme styles the
 * same elements in both.
 */
import type { AllThemeKeys, Theme } from '@inth/sdk/ui/theme';
import type { ClassValue } from '@inth/sdk/ui/utils';
import { cn, resolveStyles, toStyleAttributeValue } from '@inth/sdk/ui/utils';

/** What one element binds: `class` and `style`. */
export interface PartAttributes {
	class: string | undefined;
	style: string | undefined;
}

/**
 * The attributes of one part: its stock classes unless `noStyle`, then the
 * theme slot's classes and style when the part has a slot, then the
 * component's own `class` (the root's), which `noStyle` keeps.
 *
 * @internal
 */
export const part = function part(
	themeKey: AllThemeKeys | undefined,
	theme: Theme | undefined,
	baseClassName: ClassValue,
	noStyle: boolean,
	className?: string
): PartAttributes {
	if (!themeKey) {
		return {
			class: cn(noStyle ? undefined : baseClassName, className) || undefined,
			style: undefined,
		};
	}
	const resolved = resolveStyles(
		themeKey,
		theme,
		{ baseClassName, className, noStyle },
		noStyle
	);
	return {
		class: resolved.className || undefined,
		style: toStyleAttributeValue(resolved.style),
	};
};

/**
 * The stock classes, or none under `noStyle`.
 *
 * @internal
 */
export const cx = (
	noStyle: boolean | undefined,
	...names: (string | undefined)[]
): string | undefined =>
	noStyle ? undefined : names.filter(Boolean).join(' ') || undefined;
