/**
 * What the preference widget and the opt-in and opt-out confirmations
 * need: the shared parts (`PARTS_SHEETS`), which carry the button,
 * branding, action and legal-link rules, the widget and confirmation rules
 * with the variables they read, then the primitives the widget renders, in
 * the order `styles.css` has them.
 *
 * A module of its own, so only the widget's and the confirmations' code
 * carries the widget rules.
 *
 * @packageDocumentation
 */

import type { SurfaceStyleSheet } from '@inth/angular';
import * as button from '@inth/sdk/ui/styles/sheets/button-deferred';
import * as parts from '@inth/sdk/ui/styles/sheets/parts-deferred';
import * as primitives from '@inth/sdk/ui/styles/sheets/primitives';
import * as tokens from '@inth/sdk/ui/styles/sheets/tokens-deferred';
import * as widget from '@inth/sdk/ui/styles/sheets/widget';

/**
 * The stylesheets the consent widget and the confirmations render: the
 * shared parts (`PARTS_SHEETS`), then the widget's. Written out, not
 * spread: a bundler keeps a spread it can't prove side-effect free, and
 * with it the widget rules, in apps that render no widget.
 */
export const WIDGET_SHEETS: readonly SurfaceStyleSheet[] = [
	tokens,
	button,
	parts,
	widget,
	primitives,
];
