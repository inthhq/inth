/**
 * Server side of the Nuxt plugin's deferred engine: whether the browser may
 * render this visitor from the server's snapshot and load the consent
 * engine later (`create-deferred-context.ts`), and the manifest key of the engine chunk.
 * Only the server render imports it.
 *
 * @packageDocumentation
 * @internal
 */

import type { ConsentSnapshot } from '@inth/sdk/engine';

/**
 * Key of the engine chunk in the client manifest the module adds at build
 * time (`preloadDeferredEngine` in `prefetch.ts`). A server render that
 * adds it to `ssrContext.modules` preloads the engine and its imports.
 *
 * @internal
 */
export const DEFERRED_ENGINE_MANIFEST_KEY = 'inth:deferred-engine';

/** State the Nuxt payload carries for a deferred browser start. @internal */
export interface NuxtConsentBoot {
	/** The snapshot the server rendered the page from. */
	s: ConsentSnapshot;
}
