/**
 * What the dialog and the preference widget need: the banner's sheets,
 * which carry the button, branding, action and legal-link rules they share,
 * the dialog and widget rules with the variables they read, then the
 * primitives the dialog renders, in the order `styles.css` has them.
 *
 * A module of its own, so only the dialog's and widget's code carries the
 * dialog rules.
 *
 * @packageDocumentation
 */

import type { SurfaceStyleSheet } from '@inth/angular';
import * as banner from '@inth/sdk/ui/styles/sheets/banner-deferred';
import * as button from '@inth/sdk/ui/styles/sheets/button-deferred';
import * as dialog from '@inth/sdk/ui/styles/sheets/dialog';
import * as primitives from '@inth/sdk/ui/styles/sheets/primitives';
import * as tokens from '@inth/sdk/ui/styles/sheets/tokens-deferred';

/**
 * The stylesheets the consent dialog and the consent widget render: the
 * banner's sheets (`BANNER_SHEETS`), then the dialog's. Written out, not
 * spread: a bundler keeps a spread it can't prove side-effect free, and
 * with it the dialog rules, in apps that render no dialog.
 */
export const DIALOG_SHEETS: readonly SurfaceStyleSheet[] = [
	tokens,
	button,
	banner,
	dialog,
	primitives,
];
