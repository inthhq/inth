import * as dialog from '@inth/sdk/ui/styles/sheets/dialog';
import * as firstPaint from '@inth/sdk/ui/styles/sheets/first-paint-deferred';
import * as iabDialog from '@inth/sdk/ui/styles/sheets/iab-dialog';
import * as iabFirstPaint from '@inth/sdk/ui/styles/sheets/iab-first-paint';
import * as primitives from '@inth/sdk/ui/styles/sheets/primitives';

import type { SurfaceStyleSheet } from './surface-styles';

/** All rules needed by an IAB dialog, including one without a banner. */
export const IAB_DIALOG_SHEETS: readonly SurfaceStyleSheet[] = [
	firstPaint,
	dialog,
	primitives,
	iabFirstPaint,
	iabDialog,
];
