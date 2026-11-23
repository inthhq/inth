/**
 * The first-paint rules the Astro components inline into the HTML:
 * `first-paint` for a page that cannot know its prompt's container yet
 * (`./browser/first-paint-styles`), and the IAB banner's rules with the
 * shared parts they render.
 */
import {
	css as iabFirstPaintCSS,
	id as iabFirstPaintID,
} from '@inth/sdk/ui/styles/sheets/iab-first-paint';
import {
	css as partsCSS,
	id as partsID,
} from '@inth/sdk/ui/styles/sheets/parts';

export {
	INLINE_STYLES_CSS,
	INLINE_STYLES_ID,
} from './browser/first-paint-styles.model';

/** Marks the IAB banner's inlined first-paint rules. */
export const INLINE_IAB_STYLES_ID = iabFirstPaintID;

/** IAB variables and banner rules; the preference centre loads on demand. */
export const INLINE_IAB_STYLES_CSS = iabFirstPaintCSS;

/** Marks the inlined branding, action-row and legal-link rules. */
export const INLINE_PARTS_STYLES_ID = partsID;

/**
 * The branding, action-row and legal-link rules the IAB banner renders
 * with, for a page whose prompt sheets leave them out.
 */
export const INLINE_PARTS_STYLES_CSS = partsCSS;
