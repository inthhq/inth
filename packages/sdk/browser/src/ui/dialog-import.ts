// A promise chain, not an async function: see `./dialog-surface.ts`.
/* oxlint-disable promise/prefer-await-to-then */
import type { createDialog } from './dialog';

/**
 * Load the dialog chunk. `rslib.config.ts` swaps in
 * `./dialog-import-script.ts` for `c15t.hosted.js`, which has no chunks
 * and loads `c15t.dialog.js` instead.
 *
 * @internal
 */
export const importDialog = (): Promise<typeof createDialog> =>
	import('./dialog').then(({ createDialog: create }) => create);
