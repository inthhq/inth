/**
 * `@inth/sdk/gpp` — IAB GPP for a bundled `@inth/sdk` client, the
 * way `@inth/sdk/devtools` mounts the DevTools panel. Script-tag pages
 * load `c15t.gpp.js` instead.
 *
 * @example
 * ```ts
 * import { hosted, init } from '@inth/sdk';
 * import { mountGPP } from '@inth/sdk/gpp';
 *
 * const client = init({
 *   mode: hosted({ projectUrl: 'https://your-instance.c15t.dev' }),
 * });
 * const gpp = mountGPP(client, { usFallback: 'none' });
 * ```
 */

import type { RuntimeGPPOptions } from '@inth/sdk-core/runtime';
import { createGPP } from '@inth/sdk-iab/gpp';
import type { GPPHandle } from '@inth/sdk-iab/gpp';

import type { ConsentClient } from './types';

/**
 * Install `window.__gpp` against a client and keep its GPP string in step
 * with the visitor's choices.
 *
 * @param options - GPP options. Every field is optional.
 * @returns A handle with `getGPPString()`, `getPingData()` and `dispose()`,
 * which removes `__gpp`. Dispose it before disposing the client.
 * @throws {Error} When a CMP that has already loaded owns `__gpp`.
 */
export const mountGPP = function mountGPP(
	client: ConsentClient,
	options: RuntimeGPPOptions = {}
): GPPHandle {
	return createGPP({ ...options, kernel: client.kernel });
};

export type { GPPHandle, GPPPingData } from '@inth/sdk-iab/gpp';
export type { RuntimeGPPOptions } from '@inth/sdk-core/runtime';
