import type { SurfaceStyleSheet } from '@c15t/angular';
import * as firstPaint from '@c15t/ui/styles/sheets/first-paint-deferred';
import * as iabFirstPaint from '@c15t/ui/styles/sheets/iab-first-paint';

/** Base rules and IAB tokens and banner rules, without the dialog CSS. */
export const IAB_FIRST_PAINT_SHEETS: readonly SurfaceStyleSheet[] = [
	firstPaint,
	iabFirstPaint,
];
