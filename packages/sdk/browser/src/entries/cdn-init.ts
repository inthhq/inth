/**
 * `dist/inth.js`, the default hosted one-tag install: the init script.
 *
 * Small enough to finish before the page's largest image. It installs a
 * stand-in `window.inth`, starts `/v1/consent/init`, shows the stock banner from the
 * answer, records an accept or reject tapped before the engine, and starts
 * the scripts a choice allows. It then loads `inth.hosted.js`, the engine
 * and the rest of the UI, which takes all of that over. See
 * `../init/run-init-script.ts`.
 */

import { runInitScript } from '../init/run-init-script';

runInitScript(document.currentScript as HTMLScriptElement | null);
