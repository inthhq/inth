import * as iabDialog from '@inth/sdk/ui/styles/sheets/iab-dialog';
import * as widget from '@inth/sdk/ui/styles/sheets/widget';

import { IAB_FIRST_PAINT_SHEETS } from './iab-first-paint-sheets';
import type { SurfaceStyleSheet } from './surface-styles';

/** Styles for a standalone IAB dialog, loaded with its code. @internal */
export const IAB_DIALOG_SHEETS: readonly SurfaceStyleSheet[] = [
	...IAB_FIRST_PAINT_SHEETS,
	widget,
	iabDialog,
];
