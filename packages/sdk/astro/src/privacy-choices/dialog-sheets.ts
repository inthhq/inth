/**
 * The stylesheets the Privacy Choices dialog renders with, in their own
 * chunk so a page on the classic design never downloads them: the theme
 * tokens, the button rules, the scroll area and group it shares with the
 * banner panels, then the dialog's own rules. The classic dialog sheet
 * stays off the page; the v6 sheet carries its own switch and category
 * rows. The same list React's `DIALOG_SHEETS` renders.
 *
 * The island renders with `styles: false`, so the client puts these in
 * before it mounts, as it links the classic dialog's stylesheets.
 *
 * @internal
 */

import * as button from '@inth/sdk/ui/styles/sheets/button';
import * as privacyChoicesDialog from '@inth/sdk/ui/styles/sheets/dialog';
import * as expand from '@inth/sdk/ui/styles/sheets/expand';
import * as tokens from '@inth/sdk/ui/styles/sheets/tokens';

import { insertSheets } from './sheets';
import type { PrivacyChoicesSheet } from './sheets';

/** The dialog's sheets, in cascade order. */
export const PRIVACY_CHOICES_DIALOG_SHEETS: readonly PrivacyChoicesSheet[] = [
	tokens,
	button,
	expand,
	privacyChoicesDialog,
];

/**
 * Add the dialog's sheets the page does not hold yet.
 *
 * @param nonce - The page's CSP nonce.
 */
export const insertPrivacyChoicesDialogSheets =
	function insertPrivacyChoicesDialogSheets(nonce: string | undefined): void {
		insertSheets(PRIVACY_CHOICES_DIALOG_SHEETS, nonce);
	};
