/**
 * The first-paint rules the Astro components inline into the HTML: the
 * standard banner's (`./browser/first-paint-styles`) and the IAB banner's.
 */
import {
	css as iabFirstPaintCSS,
	id as iabFirstPaintID,
} from '@c15t/ui/styles/sheets/iab-first-paint';

export {
	INLINE_STYLES_CSS,
	INLINE_STYLES_ID,
} from './browser/first-paint-styles';

/** Marks the IAB banner's inlined first-paint rules. */
export const INLINE_IAB_STYLES_ID = iabFirstPaintID;

/** IAB variables and banner rules; the preference centre loads on demand. */
export const INLINE_IAB_STYLES_CSS = iabFirstPaintCSS;
