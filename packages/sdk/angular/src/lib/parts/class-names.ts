/**
 * Small helpers the consent UI's parts share: class lists that a
 * surface's `noStyle` drops, and a theme slot's class and style.
 *
 * @packageDocumentation
 */

import type { AllThemeKeys, Theme } from '@inth/sdk/ui/theme';
import { resolveStyles, toStyleAttributeValue } from '@inth/sdk/ui/utils';

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

/** `"true"` or `"false"`, as React renders a boolean ARIA or data attribute. */
export const bool = (value: boolean): 'true' | 'false' =>
	value ? 'true' : 'false';
