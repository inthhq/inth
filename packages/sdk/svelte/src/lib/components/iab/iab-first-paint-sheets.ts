import * as iabFirstPaint from '@inth/sdk/ui/styles/sheets/iab-first-paint';

import { PARTS_SHEETS } from './parts-sheets';
import type { SurfaceStyleSheet } from './surface-styles';

/**
 * What the IAB banner renders: the shared parts (tokens, button, branding,
 * action and legal-link rules), then the IAB variables and banner rules,
 * without the dialog CSS.
 */
export const IAB_FIRST_PAINT_SHEETS: readonly SurfaceStyleSheet[] = [
	...PARTS_SHEETS,
	iabFirstPaint,
];
