/**
 * The stylesheets each part adds to the UI root, from
 * `@inth/sdk-ui/styles/sheets/*`. The stock sheet already holds the theme
 * tokens and the button rules; a part adds only its own, so a page carries
 * the rules of the presentation it shows and nothing else.
 *
 * @packageDocumentation
 * @internal
 */

import * as dialog from '@inth/sdk-ui/styles/sheets/dialog';
import * as expand from '@inth/sdk-ui/styles/sheets/expand';

/** One of `@inth/sdk-ui`'s sheets. */
export interface PartSheet {
	/** Dedupes the sheet: a root holds each `id` once. */
	id: string;
	css: string;
}

/**
 * The options' rules and the dialog's: the in-place panel, then the
 * dialog's rows over it. The dialog sheet carries its own switch and
 * category rows.
 */
export const OPTIONS_SHEETS: readonly PartSheet[] = [expand, dialog];
