import * as dialog from '@inth/sdk/ui/styles/sheets/dialog';

import { BANNER_SHEETS } from './first-paint-sheets';
import type { SurfaceStyleSheet } from './surface-styles';

/**
 * What the dialog and the preference widget render: the banner's sheets,
 * which carry the button, branding, action and legal-link rules they share,
 * then the dialog and widget rules with the variables they read. Only their
 * lazy chunks import `dialog`, so its rules load with the dialog's code.
 *
 * @internal
 */
export const DIALOG_SHEETS: readonly SurfaceStyleSheet[] = [
	...BANNER_SHEETS,
	dialog,
];
