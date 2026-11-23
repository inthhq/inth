import * as iabDialog from '@inth/sdk/ui/styles/sheets/iab-dialog';
import * as primitives from '@inth/sdk/ui/styles/sheets/primitives';
import * as widget from '@inth/sdk/ui/styles/sheets/widget';

import { IAB_FIRST_PAINT_SHEETS } from './iab-first-paint-sheets';
import type { SurfaceStyleSheet } from '../../surface-styles';

/** All rules needed by an IAB dialog, including one without a banner. */
export const IAB_DIALOG_SHEETS: readonly SurfaceStyleSheet[] = [
	...IAB_FIRST_PAINT_SHEETS,
	widget,
	primitives,
	iabDialog,
];
