/**
 * `inth.dialog.js`, the stock preference centre as a file of its own.
 *
 * The init script (`inth.js`) loads it when the visitor taps Customize
 * before the engine, and opens the dialog without the engine. The engine
 * (`inth.hosted.js`) loads it the first time it opens the dialog, or at
 * idle once a banner is on screen, as the ESM build loads the dialog chunk.
 * The file publishes what it holds on {@link DIALOG_KEY}; this module
 * loads it and checks it came from the same release.
 *
 * @packageDocumentation
 * @internal
 */

import type { createDialog } from '../ui/dialog';
import type { openEarlyDialog } from './early-dialog';
import { loadPartFile } from './part-file';
import type { PartFile } from './part-file';

/** Global `inth.dialog.js` publishes its {@link DialogFile} on. */
export const DIALOG_KEY = '__inthDialog';

/** What `inth.dialog.js` publishes. @internal */
export interface DialogFile extends PartFile {
	/** The stock dialog surface, for the engine. */
	createDialog: typeof createDialog;
	/** The dialog over the init script's stand-in, for the init script. */
	openEarlyDialog: typeof openEarlyDialog;
}

/**
 * Load `inth.dialog.js` from `src`, once per URL, unless a file from this
 * release has run already.
 *
 * @returns What the file published, or `undefined` when it failed to load,
 * did not publish, or came from another release. A failed load is tried
 * again on the next call.
 * @internal
 */
export const loadDialogFile = function loadDialogFile(
	src: string,
	nonce?: string
): Promise<DialogFile | undefined> {
	return loadPartFile<DialogFile>(DIALOG_KEY, src, nonce);
};
