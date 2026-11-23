/**
 * What the dialog renders: the theme tokens and the button rules, which
 * the prompt has usually put on the page already, then the scroll area and
 * group it shares with the prompt's options, then the dialog's own rules,
 * which carry its switch and category rows.
 *
 * A module of the dialog's chunk, so only the dialog's code carries the
 * text of its own rules.
 */
import * as button from '@inth/sdk/ui/styles/sheets/button-deferred';
import * as dialog from '@inth/sdk/ui/styles/sheets/dialog';
import * as expand from '@inth/sdk/ui/styles/sheets/expand';
import * as tokens from '@inth/sdk/ui/styles/sheets/tokens-deferred';

import type { SurfaceStyleSheet } from '../../surface-styles';

/** @internal */
export const DIALOG_SHEETS: readonly SurfaceStyleSheet[] = [
	tokens,
	button,
	expand,
	dialog,
];
