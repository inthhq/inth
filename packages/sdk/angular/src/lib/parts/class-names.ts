/**
 * Small helpers the consent UI's parts share: class lists that a
 * surface's `noStyle` drops, and a theme slot's class and style.
 *
 * @packageDocumentation
 */

import type { AllThemeKeys, ClassNameStyle, Theme } from '@inth/sdk/ui/theme';
import { cn, resolveStyles, toStyleAttributeValue } from '@inth/sdk/ui/utils';

/** A part's `class` and `style` attributes; `null` leaves one off. */
export interface PartAttributes {
	readonly className: string | null;
	readonly style: string | null;
}

/**
 * The stock classes, joined, or `null` under `noStyle` or when none are
 * set, so the element renders no `class` attribute as in React.
 *
 * @internal
 */
export const cx = function cx(
	noStyle: boolean,
	...names: (string | undefined)[]
): string | null {
	if (noStyle) {
		return null;
	}
	return names.filter(Boolean).join(' ') || null;
};

/**
 * A part's attributes: its stock classes plus the theme slot `key`, as
 * React merges a `components` part over its base classes.
 *
 * @internal
 */
export const slotPart = function slotPart(
	key: AllThemeKeys | undefined,
	theme: Theme | undefined,
	noStyle: boolean,
	...base: (string | undefined)[]
): PartAttributes {
	const baseClassName = base.filter(Boolean).join(' ') || undefined;
	if (!key) {
		return { className: noStyle ? null : (baseClassName ?? null), style: null };
	}
	const resolved = resolveStyles(
		key,
		theme,
		{ baseClassName, noStyle },
		noStyle
	);
	return {
		className: resolved.className || null,
		style: toStyleAttributeValue(resolved.style) ?? null,
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

/** `"true"` or `"false"`, as React renders a boolean ARIA or data attribute. */
export const bool = (value: boolean): 'true' | 'false' =>
	value ? 'true' : 'false';
