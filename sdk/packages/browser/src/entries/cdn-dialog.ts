/**
 * `dist/c15t.dialog.js`: the stock preference centre (dialog, preference
 * widget, vendor list, preference draft), and the dialog's rules for the
 * init script's root, which holds only the banner's. The init script
 * (`c15t.js`) fetches it when the visitor taps Customize before the engine
 * has loaded, and opens the dialog without the engine (`../init/early-dialog.ts`);
 * the engine (`c15t.hosted.js`) fetches it the first time it needs the
 * dialog. See `../init/dialog-file.ts`.
 */

import { DIALOG_KEY } from '../init/dialog-file';
import type { DialogFile } from '../init/dialog-file';
import { openEarlyDialog } from '../init/early-dialog';
import { createDialog } from '../ui/dialog';
import { version } from '../version';

(window as unknown as Record<string, DialogFile>)[DIALOG_KEY] = {
	createDialog,
	openEarlyDialog,
	version,
};
