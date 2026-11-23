import type { SurfaceStyleSheet } from '@inth/angular';
import * as button from '@inth/sdk/ui/styles/sheets/button-deferred';
import * as iabFirstPaint from '@inth/sdk/ui/styles/sheets/iab-first-paint';
import * as parts from '@inth/sdk/ui/styles/sheets/parts-deferred';
import * as tokens from '@inth/sdk/ui/styles/sheets/tokens-deferred';

/**
 * What the IAB banner renders first: the shared parts (`PARTS_SHEETS`),
 * then the IAB tokens and banner rules, without the dialog CSS.
 */
export const IAB_FIRST_PAINT_SHEETS: readonly SurfaceStyleSheet[] = [
	tokens,
	button,
	parts,
	iabFirstPaint,
];
