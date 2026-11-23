/**
 * The stylesheets the dialog renders with, in their own chunk so a page
 * that never opens it never downloads them: the theme tokens, the button
 * rules, the scroll area and group it shares with the prompt's options,
 * then the dialog's own rules, which carry its switch and category rows.
 * The same list React's `DIALOG_SHEETS` renders.
 *
 * The island renders with `styles: false`, so the client puts these in
 * before it mounts.
 *
 * @internal
 */

import * as button from '@inth/sdk/ui/styles/sheets/button';
import * as dialogSheet from '@inth/sdk/ui/styles/sheets/dialog';
import * as expand from '@inth/sdk/ui/styles/sheets/expand';
import * as tokens from '@inth/sdk/ui/styles/sheets/tokens';

import { insertSheets } from '../parts/sheets';
import type { StyleSheet } from '../parts/sheets';

/** The dialog's sheets, in cascade order. */
export const DIALOG_SHEETS: readonly StyleSheet[] = [
	tokens,
	button,
	expand,
	dialogSheet,
];

/**
 * Add the dialog's sheets the page does not hold yet.
 *
 * @param nonce - The page's CSP nonce.
 */
export const insertDialogSheets = function insertDialogSheets(
	nonce: string | undefined
): void {
	insertSheets(DIALOG_SHEETS, nonce);
};
