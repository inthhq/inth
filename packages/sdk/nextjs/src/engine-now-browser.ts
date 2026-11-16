/**
 * The browser build of `#engine-now`: no engine, so `ConsentRoot` loads it
 * with `import()` after the page (see `./engine-now`).
 *
 * @internal
 */
import type * as RootEngine from './root-engine';

/** The engine's module, or `undefined` where it loads with `import()`. */
export const engineNow: typeof RootEngine | undefined = undefined;
