/**
 * `dist/inth.gpp.js` — IAB GPP as a second script tag.
 *
 * ```html
 * <script src=".../inth.gpp.js"></script>
 * <script src=".../inth.js" data-project-url="..." defer></script>
 * ```
 *
 * Works with `inth.js`, `inth.headless.js` and `inth.iab.js`, in either
 * order. It installs the `__gpp` stub as soon as it runs, so load it before
 * ad tags that call `__gpp`, then hands `createGPP` to the client, which
 * mounts the API with the page's `gpp` options. `gpp: false` turns it off.
 */

import {
	createGPP,
	destroyGPPStub,
	initializeGPPStub,
} from '@inth/sdk-iab/gpp';

import type { InthGlobal, QueuedCall } from '../global';
import { GLOBAL_NAME } from '../global-name';
import type { ConsentClient } from '../types';

type GlobalWindow = Window & {
	[GLOBAL_NAME]?: InthGlobal | QueuedCall[];
};

initializeGPPStub();

const provided = { createGPP };
const removeStubWhenOff = function removeStubWhenOff(
	client: ConsentClient
): void {
	if (client.options.gpp === false) {
		destroyGPPStub();
	}
};

const existing = (window as GlobalWindow)[GLOBAL_NAME];
if (existing && !Array.isArray(existing)) {
	if (typeof existing.provideGPP === 'function') {
		existing.provideGPP(provided);
		existing.onInit(removeStubWhenOff);
	} else {
		// oxlint-disable-next-line no-console -- Authoring-time diagnostic.
		console.warn(
			'@inth/sdk: inth.gpp.js needs a newer inth.js. Load both from the same version.'
		);
	}
} else {
	// The main tag has not run yet; it replays these once it installs.
	(window as GlobalWindow)[GLOBAL_NAME] = [
		...(existing ?? []),
		['provideGPP', provided],
		['onInit', removeStubWhenOff],
	];
}
