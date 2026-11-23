/**
 * The "Consent by" tag for `branding.astro` and the browser-rendered
 * banner: the shared tag model with its `theme.slots` entry applied.
 */

import type { ConsentSnapshot } from '@inth/sdk/engine';
import type { Theme } from '@inth/sdk/ui/theme';
import { resolveBrandingTag } from '@inth/sdk/ui/utils/branding';
import type { BrandingSurface, BrandingTag } from '@inth/sdk/ui/utils/branding';

import type { ClassNameMap } from './class-names';
import { resolveSlotBinding } from './theme-slots';
import type { SlotBinding } from './theme-slots';

/** Input for {@link resolveBrandingModel}. */
export interface BrandingModelInput {
	/** Render nothing. */
	hide?: boolean;
	/** Ship the DOM without the bundled stylesheet's class names. */
	noStyle?: boolean;
	/** The surface the tag sits on. */
	surface: BrandingSurface;
	/** The brand the snapshot resolved. */
	branding: ConsentSnapshot['branding'];
	/** The host to attribute the referral to. */
	hostname?: string;
	/** The branding stylesheet's class names. */
	styles: ClassNameMap;
	/** The integration's `theme`, for the tag's `slots` entry. */
	theme?: Theme;
}

/** The tag, with its root's final `class` and `style`. */
export type BrandingModel = BrandingTag & { root: SlotBinding };

/**
 * Resolve the tag and apply its `theme.slots` entry.
 *
 * @param input - The snapshot's brand and the surface's options.
 * @returns The tag, or `null` when nothing should render.
 */
export const resolveBrandingModel = function resolveBrandingModel(
	input: BrandingModelInput
): BrandingModel | null {
	const tag = input.hide ? null : resolveBrandingTag(input);
	return (
		tag && {
			...tag,
			root: resolveSlotBinding(input.theme, tag.slot, tag.classes.root),
		}
	);
};
