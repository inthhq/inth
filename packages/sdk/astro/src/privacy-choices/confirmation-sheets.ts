/**
 * The stylesheets the opt-in confirmation renders with on a Privacy
 * Choices page, in their own chunk.
 *
 * The confirmation keeps its classic design under the Privacy Choices
 * design, as in React, where it brings the dialog's sheets with it
 * (`DIALOG_SHEETS`). The island renders with `styles: false`, and a
 * Privacy Choices page carries none of the classic rules, so the client
 * puts these in before the confirmation shows.
 *
 * @internal
 */

import * as button from '@inth/sdk/ui/styles/sheets/button';
import * as banner from '@inth/sdk/ui/styles/sheets/parts';
import * as tokens from '@inth/sdk/ui/styles/sheets/tokens';
import * as dialog from '@inth/sdk/ui/styles/sheets/widget';

import { insertSheets } from './sheets';
import type { PrivacyChoicesSheet } from './sheets';

/** React's `DIALOG_SHEETS`, in cascade order. */
export const CONFIRMATION_SHEETS: readonly PrivacyChoicesSheet[] = [
	tokens,
	button,
	banner,
	dialog,
];

/**
 * Add the confirmation's sheets the page does not hold yet.
 *
 * @param nonce - The page's CSP nonce.
 */
export const insertConfirmationSheets = function insertConfirmationSheets(
	nonce: string | undefined
): void {
	insertSheets(CONFIRMATION_SHEETS, nonce);
};
