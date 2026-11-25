/**
 * `dist/inth.choices.js`: the consent UI the banner needs (the prompt in
 * each container and the in-place options). The engine (`inth.hosted.js`)
 * fetches it the first time the page needs one of them, after publishing
 * the functions that keep per-kernel state for it to call. The dialog and
 * the opt-in confirmation are its chunk `inth.choices-dialog.js`, which
 * {@link ChoicesFile.loadDialog} loads when the engine first asks for
 * them. See `../ui/load-choices-file.ts`.
 */

import { retrySrc } from '../init/part-src';
import type {
	ChoicesFile,
	DialogFile,
	DialogFileSource,
} from '../ui/load-choices-file';
import { CHOICES_KEY } from '../ui/load-choices-file';
import * as card from '../ui/prompt/card';
import * as drawer from '../ui/prompt/drawer';
import * as panel from '../ui/prompt/panel';
import * as banner from '../ui/prompt/strip';
import { version } from '../version';

// The chunk runtime's hooks (rspack): where a chunk loads from, and the
// nonce its `<script>` carries. The build allows this file one chunk, the
// dialog (`scripts/mode-bundle-boundary.ts`).
declare let __webpack_public_path__: string;
declare let __webpack_get_script_filename__: (chunkId: unknown) => string;
declare let __webpack_nonce__: string | undefined;

/** Failed loads of the dialog so far: each retry asks for a URL of its own. */
let dialogFailures = 0;

const loadDialog = async function loadDialog(
	source: DialogFileSource
): Promise<DialogFile> {
	// The engine knows the URL (`__inthChoicesDialogSrc`, the tag's
	// `data-choices-dialog-src`, or next to this file), not this file's
	// runtime. Read when the runtime adds the `<script>`, which it does
	// once per load: a load in flight is shared, and a failed one is
	// forgotten, so the next call adds a new one.
	__webpack_public_path__ = '';
	__webpack_get_script_filename__ = () => retrySrc(source.src, dialogFailures);
	__webpack_nonce__ = source.nonce;
	try {
		const module = await import(
			// oxlint-disable-next-line no-inline-comments -- The chunk's name.
			/* webpackChunkName: "inth.choices-dialog" */ './cdn-choices-dialog'
		);
		return module.file;
	} catch (error) {
		dialogFailures += 1;
		throw error;
	}
};

const file: ChoicesFile = {
	banner,
	card,
	drawer,
	loadDialog,
	panel,
	version,
};
(window as unknown as Record<string, ChoicesFile>)[CHOICES_KEY] = file;
