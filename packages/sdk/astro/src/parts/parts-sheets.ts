/**
 * The stylesheets the IAB banner and dialog build on: the theme tokens, the
 * button rules and the shared parts (branding, action rows, legal links),
 * in their own chunk. A page inlines them only while a banner may show, so
 * a returning visitor's IAB dialog brings them when it opens. React's
 * `PARTS_SHEETS`.
 *
 * @internal
 */

import * as button from '@inth/sdk/ui/styles/sheets/button';
import * as parts from '@inth/sdk/ui/styles/sheets/parts';
import * as tokens from '@inth/sdk/ui/styles/sheets/tokens';

import { insertSheets } from './sheets';
import type { StyleSheet } from './sheets';

/** React's `PARTS_SHEETS`, in cascade order. */
export const PARTS_SHEETS: readonly StyleSheet[] = [tokens, button, parts];

/**
 * Add the parts' sheets the page does not hold yet.
 *
 * @param nonce - The page's CSP nonce.
 */
export const insertPartsSheets = function insertPartsSheets(
	nonce: string | undefined
): void {
	insertSheets(PARTS_SHEETS, nonce);
};
