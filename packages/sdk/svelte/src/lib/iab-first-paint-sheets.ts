import * as firstPaint from '@inth/sdk/ui/styles/sheets/first-paint-deferred';
import * as iabFirstPaint from '@inth/sdk/ui/styles/sheets/iab-first-paint';

import type { SurfaceStyleSheet } from './surface-styles';

/** Base rules and IAB tokens and banner rules, without the dialog CSS. */
export const IAB_FIRST_PAINT_SHEETS: readonly SurfaceStyleSheet[] = [
	firstPaint,
	iabFirstPaint,
];
