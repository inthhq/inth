/**
 * What the consent dialog renders: the theme tokens, the button rules, the
 * scroll area and group it shares with the prompt's options, then the
 * dialog's own rules, which carry its switch and category rows.
 *
 * A module of its own, so only the dialog's chunk names these sheets.
 *
 * @packageDocumentation
 */

import * as button from '@inth/sdk/ui/styles/sheets/button-deferred';
import * as dialog from '@inth/sdk/ui/styles/sheets/dialog-deferred';
import * as expand from '@inth/sdk/ui/styles/sheets/expand-deferred';
import * as tokens from '@inth/sdk/ui/styles/sheets/tokens-deferred';

import type { SurfaceStyleSheet } from '../core/consent-styles';

/** @internal */
export const DIALOG_SHEETS: readonly SurfaceStyleSheet[] = [
	tokens,
	button,
	expand,
	dialog,
];
