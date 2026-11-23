import * as primitives from '@inth/sdk/ui/styles/sheets/primitives';
/**
 * What the dialog and the preference widget need: the banner's sheets,
 * which carry the button, branding, action and legal-link rules they share,
 * the dialog and widget rules with the variables they read, then the
 * primitives the Svelte dialog renders, in the order `styles.css` has them.
 *
 * A module of its own, so only the dialog's and widget's code carries the
 * dialog rules.
 */
import * as dialog from '@inth/sdk/ui/styles/sheets/widget';

import { BANNER_SHEETS } from './surface-styles';
import type { SurfaceStyleSheet } from './surface-styles';

export const DIALOG_SHEETS: readonly SurfaceStyleSheet[] = [
	...BANNER_SHEETS,
	dialog,
	primitives,
];
