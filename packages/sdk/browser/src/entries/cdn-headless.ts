/**
 * `dist/inth.headless.js` — the runtime with no UI or CSS.
 *
 * Installs `window.inth` and initialises from the script tag unless it
 * carries `data-manual`. The page renders its own banner against the
 * client's events and `data-inth-action` buttons.
 */

import { autoInit, createGlobal, installGlobal } from '../global';

const api = installGlobal(createGlobal({ pkg: '@inth/sdk/headless' }));
autoInit(api);
