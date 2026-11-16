/**
 * `ConsentRoot`'s engine, imported statically wherever the code does not
 * ship to a browser. A server render, including a synchronous
 * `renderToString`, then finds the engine loaded and never suspends on it.
 *
 * Browser bundles resolve `#engine-now` to `./engine-now-browser` instead,
 * so the engine stays out of the first-load chunk there and loads with
 * `import()`.
 *
 * @internal
 */
import * as RootEngine from './root-engine';

/** The engine's module, or `undefined` where it loads with `import()`. */
export const engineNow: typeof RootEngine | undefined = RootEngine;
