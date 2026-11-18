/**
 * `c15t.dialog.js`, the stock preference centre as a file of its own.
 *
 * The init script (`c15t.js`) loads it when the visitor taps Customize
 * before the engine, and opens the dialog without the engine. The engine
 * (`c15t.hosted.js`) loads it the first time it opens the dialog, or at
 * idle once a banner is on screen, as the ESM build loads the dialog chunk.
 * The file publishes what it holds on {@link DIALOG_KEY}; this module
 * loads it and checks it came from the same release.
 *
 * @packageDocumentation
 * @internal
 */

import type { createDialog } from '../ui/dialog';
import { version } from '../version';
import type { openEarlyDialog } from './early-dialog';

/** Global `c15t.dialog.js` publishes its {@link DialogFile} on. */
export const DIALOG_KEY = '__inthDialog';

/** What `c15t.dialog.js` publishes. @internal */
export interface DialogFile {
	/** The stock dialog surface, for the engine. */
	createDialog: typeof createDialog;
	/** The dialog over the init script's stand-in, for the init script. */
	openEarlyDialog: typeof openEarlyDialog;
	/** The package version the file was built from. */
	version: string;
}

const published = (): DialogFile | undefined => {
	const file = (window as unknown as Record<string, DialogFile | undefined>)[
		DIALOG_KEY
	];
	// A file from another release may not match this bundle's markup.
	return file?.version === version ? file : undefined;
};

const loads = new Map<string, Promise<DialogFile | undefined>>();

/**
 * Load `c15t.dialog.js` from `src`, once per URL, unless a file from this
 * release has run already.
 *
 * @param src - The file's URL.
 * @param nonce - The page's script nonce, if any.
 * @returns What the file published, or `undefined` when it failed to load,
 * did not publish, or came from another release. A failed load is tried
 * again on the next call.
 * @internal
 */
export const loadDialogFile = function loadDialogFile(
	src: string,
	nonce?: string
): Promise<DialogFile | undefined> {
	const ready = published();
	if (ready) {
		return Promise.resolve(ready);
	}
	let pending = loads.get(src);
	if (!pending) {
		// oxlint-disable-next-line promise/avoid-new -- Settled by the script element.
		pending = new Promise((resolve) => {
			const element = document.createElement('script');
			element.src = src;
			if (nonce) {
				element.nonce = nonce;
			}
			const settle = () => {
				const file = published();
				if (!file) {
					loads.delete(src);
				}
				resolve(file);
			};
			element.addEventListener('load', settle);
			element.addEventListener('error', settle);
			document.head.append(element);
		});
		loads.set(src, pending);
	}
	return pending;
};
