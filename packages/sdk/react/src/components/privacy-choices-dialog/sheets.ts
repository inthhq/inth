import * as button from '@inth/sdk/ui/styles/sheets/button';
import * as expand from '@inth/sdk/ui/styles/sheets/expand';
import * as privacyChoicesDialog from '@inth/sdk/ui/styles/sheets/privacy-choices-dialog';
import * as tokens from '@inth/sdk/ui/styles/sheets/tokens';

import type { SurfaceStyleSheet } from '../shared/surface-styles';

/**
 * What the dialog renders: the theme tokens, the button rules, the scroll
 * area and group it shares with the banner panels, then the dialog's own
 * rules. The classic dialog sheet stays off the page: the v6 sheet carries
 * its own switch and category rows.
 *
 * @internal
 */
export const DIALOG_SHEETS: readonly SurfaceStyleSheet[] = [
	tokens,
	button,
	expand,
	privacyChoicesDialog,
];
