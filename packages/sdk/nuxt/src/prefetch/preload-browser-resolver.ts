import { BROWSER_RESOLVER_SOURCE } from './consent-prefetch.model';
import type { ClientManifestChunk } from './consent-prefetch.model';
import { preloadWithEntry } from './preload-with-entry';

/**
 * Preload the browser resolver with the entry, for
 * `manifest({ resolve: 'browser' })`. The app imports it when the runtime is
 * built, so a page that only learns of it from the entry would wait a round
 * trip for it before the banner can resolve. Same mechanism as
 * `preloadConsentBanner`.
 *
 * @param manifest - Nuxt's client manifest, edited in place.
 * @param srcDir - The directory manifest sources are relative to.
 * @internal
 */
export const preloadBrowserResolver = function preloadBrowserResolver(
	manifest: Record<string, ClientManifestChunk>,
	srcDir: string,
	isConsentFile: (file: string) => boolean
): void {
	preloadWithEntry(manifest, srcDir, isConsentFile, BROWSER_RESOLVER_SOURCE);
};
