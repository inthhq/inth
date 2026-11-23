/**
 * `dist/inth.hosted.js`, the engine and stock UI behind `inth.js`.
 *
 * Loaded by the init script (`inth.js`, `./cdn-init.ts`), it replaces the
 * init script's stand-in `window.inth`, replays the calls made to it,
 * takes over its banner and starts from any choice it recorded. Loaded on
 * its own, it installs `window.inth` and initialises from its own tag's
 * `data-*` attributes and queued `config` calls, as a one-file install.
 * Either way it initialises unless the tag carries `data-manual`. The
 * consent UI (the prompt, its options and the dialog) is `inth.choices.js`,
 * which it loads when it first needs it (`../ui/parts/load-script.ts`).
 */

import { publishDevToolsLauncher } from '@inth/sdk-ui/utils/devtools-launcher';

import { autoInit, installGlobal } from '../create-global-with';
import { createHostedGlobal } from '../create-hosted-global';
import { mountConsentUI } from '../ui/mount-consent-ui';

const api = installGlobal(
	createHostedGlobal({
		mountUI: mountConsentUI,
		pkg: '@inth/sdk',
		publishDevToolsLauncher,
	})
);
autoInit(api);
