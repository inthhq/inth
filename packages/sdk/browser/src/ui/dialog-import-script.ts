// A promise chain, not an async function: see `./dialog-surface.ts`.
/* oxlint-disable promise/prefer-await-to-then */
/**
 * The engine's dialog in `c15t.hosted.js`: `c15t.dialog.js`, loaded the
 * first time the engine needs it. `rslib.config.ts` swaps this in for
 * `./dialog-import.ts` in that build.
 *
 * The file's URL is the backend's, the init tag's `data-dialog-src`, or
 * `c15t.dialog.js` next to this file, at this version (`partSrc`). When the file is missing, fails to load or is from another
 * release, the engine uses its own copy of the dialog, so a site that
 * serves only `c15t.js` and `c15t.hosted.js` still has a preference
 * centre. The file is still worth serving: the init script opens it on a
 * Customize tap before the engine has loaded.
 *
 * @packageDocumentation
 * @internal
 */

import { adoptedBoot } from '../init/adopt';
import { loadDialogFile } from '../init/dialog-file';
import { partSrc } from '../init/part-src';
import { createDialog } from './dialog';
import { shareLocks } from './locks';

// Read while this file runs: `currentScript` is this file's tag.
const own =
	typeof document === 'undefined'
		? null
		: (document.currentScript as HTMLScriptElement | null);

const dialogSrc = (): string | null =>
	partSrc('dialog', adoptedBoot()?.script, own?.src);

/**
 * Load `c15t.dialog.js`, or fall back to the engine's own dialog.
 *
 * @returns The dialog factory: the file's, or the built-in one when the
 * file cannot be found, fails to load, or is from another release.
 * @internal
 */
export const importDialog = (): Promise<typeof createDialog> => {
	const src = dialogSrc();
	if (!src) {
		return Promise.resolve(createDialog);
	}
	shareLocks();
	return loadDialogFile(src, own?.nonce || undefined).then(
		(file) => file?.createDialog ?? createDialog
	);
};
