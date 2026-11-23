/**
 * The stylesheets the preference widget and the opt-in confirmation render
 * with, in their own chunk.
 *
 * The dialog hosts the opt-in confirmation, which renders with the
 * widget's rules, as React's `WIDGET_SHEETS`. The island renders with
 * `styles: false`, and the page's first paint carries none of these
 * rules, so the client puts them in before the confirmation shows.
 *
 * @internal
 */

import * as button from '@inth/sdk/ui/styles/sheets/button';
import * as parts from '@inth/sdk/ui/styles/sheets/parts';
import * as tokens from '@inth/sdk/ui/styles/sheets/tokens';
import * as widget from '@inth/sdk/ui/styles/sheets/widget';

import { insertSheets } from './sheets';
import type { StyleSheet } from './sheets';

/** React's `WIDGET_SHEETS`, in cascade order. */
export const WIDGET_SHEETS: readonly StyleSheet[] = [
	tokens,
	button,
	parts,
	widget,
];

/**
 * Add the widget's sheets the page does not hold yet.
 *
 * @param nonce - The page's CSP nonce.
 */
export const insertWidgetSheets = function insertWidgetSheets(
	nonce: string | undefined
): void {
	insertSheets(WIDGET_SHEETS, nonce);
};
