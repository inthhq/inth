import type { SurfaceStyleSheet } from '@inth/angular';
import * as button from '@inth/sdk/ui/styles/sheets/button-deferred';
import * as iabDialog from '@inth/sdk/ui/styles/sheets/iab-dialog';
import * as iabFirstPaint from '@inth/sdk/ui/styles/sheets/iab-first-paint';
import * as parts from '@inth/sdk/ui/styles/sheets/parts-deferred';
import * as primitives from '@inth/sdk/ui/styles/sheets/primitives';
import * as tokens from '@inth/sdk/ui/styles/sheets/tokens-deferred';
import * as widget from '@inth/sdk/ui/styles/sheets/widget';

/**
 * All rules an IAB dialog needs, including one without a banner: the IAB
 * banner's sheets, then the widget rules, the primitives it renders and the
 * IAB dialog rules.
 */
export const IAB_DIALOG_SHEETS: readonly SurfaceStyleSheet[] = [
	tokens,
	button,
	parts,
	iabFirstPaint,
	widget,
	primitives,
	iabDialog,
];
