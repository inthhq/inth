/**
 * `#server-root` in the browser build. `ConsentRoot` calls
 * `createServerRoot` only while it renders on the server, so the browser
 * gets this stand-in instead of the module that imports the engine (see
 * `server-root.ts`).
 *
 * @packageDocumentation
 * @internal
 */

import type { createServerRoot as CreateServerRoot } from './server-root';

/**
 * Never called in a browser.
 *
 * @throws {Error} Always.
 * @internal
 */
export const createServerRoot: typeof CreateServerRoot = () => {
	throw new Error('[c15t] createServerRoot runs only on the server.');
};
