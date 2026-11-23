/**
 * Class and style attributes for the consent prompt's and dialog's parts.
 *
 * React styles each part through its `components` slot (`banner.card`);
 * Svelte reads the same part from `theme.slots` (`consentBannerCard`),
 * which `THEME_SLOT_COMPONENT_KEYS` pairs with it, so a theme styles the
 * same elements in both.
 */
import type { AllThemeKeys, ClassNameStyle, Theme } from '@inth/sdk/ui/theme';
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
 * Fold theme slots that style one element into the last key's slot, the
 * one the element resolves: classes in order, later keys winning a shared
 * style, and a `noStyle` on any of them dropping the stock classes but
 * never another slot's.
 *
 * @internal
 */
export const foldSlots = function foldSlots(
	theme: Theme | undefined,
	keys: readonly [AllThemeKeys, ...AllThemeKeys[]]
): Theme | undefined {
	const values = keys.flatMap((key) => {
		const value = theme?.slots?.[key];
		if (value === undefined) {
			return [];
		}
		return [typeof value === 'string' ? { className: value } : value];
	});
	if (!theme || values.length < 2) {
		return theme;
	}
	const style = Object.assign({}, ...values.map((value) => value.style));
	const folded: ClassNameStyle = {
		className: cn(...values.map((value) => value.className)) || undefined,
		noStyle: values.some((value) => value.noStyle === true),
		style: Object.keys(style).length > 0 ? style : undefined,
	};
	const into = keys[keys.length - 1] as AllThemeKeys;
	return { ...theme, slots: { ...theme.slots, [into]: folded } };
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
