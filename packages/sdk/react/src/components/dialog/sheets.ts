import * as button from '@inth/sdk/ui/styles/sheets/button';
import * as dialog from '@inth/sdk/ui/styles/sheets/dialog';
import * as expand from '@inth/sdk/ui/styles/sheets/expand';
import * as tokens from '@inth/sdk/ui/styles/sheets/tokens';

import type { SurfaceStyleSheet } from '../shared/surface-styles';

/**
 * What the dialog renders: the theme tokens, the button rules, the scroll
 * area and group it shares with the banner's options, then the dialog's
 * own rules, which carry its switch and category rows.
 *
 * @internal
 */
export const DIALOG_SHEETS: readonly SurfaceStyleSheet[] = [
	tokens,
	button,
	expand,
	dialog,
];
