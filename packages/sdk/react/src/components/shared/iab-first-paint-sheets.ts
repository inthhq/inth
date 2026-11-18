import * as iabFirstPaint from '@inth/sdk/ui/styles/sheets/iab-first-paint';

import { BANNER_SHEETS } from './first-paint-sheets';
import type { SurfaceStyleSheet } from './surface-styles';

/**
 * What the IAB banner renders: the banner's sheets (tokens, button and
 * banner rules, with the variables they read), then the IAB variables and
 * banner rules. The IAB rules read only theme tokens and their own
 * variables, which `tokens` and `iab-first-paint` declare, so the whole
 * `first-paint` sheet is not needed; carrying it next to the banner's
 * sheets shipped every first-paint rule twice to a page with both banners.
 *
 * @internal
 */
export const IAB_FIRST_PAINT_SHEETS: readonly SurfaceStyleSheet[] = [
	...BANNER_SHEETS,
	iabFirstPaint,
];
