/**
 * `dist/inth.js`, the default hosted one-tag install: the init script.
 *
 * Small enough to finish before the page's largest image. It installs a
 * stand-in `window.inth`, starts `/init`, shows the stock banner from the
 * answer, records an accept or reject tapped before the engine, and starts
 * the scripts a choice allows. It then loads `inth.hosted.js`, the engine
 * and the rest of the UI, which takes all of that over. See
 * `../init/run.ts`.
 */

import { runInitScript } from '../init/run';

runInitScript(document.currentScript as HTMLScriptElement | null);
