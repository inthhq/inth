import { BANNER_SOURCE } from './consent-prefetch.model';
import type { ClientManifestChunk } from './consent-prefetch.model';
import { preloadWithEntry } from './preload-with-entry';

/**
 * Preload the banner chunk with the entry on every page.
 *
 * Nuxt's root imports the banner dynamically, so its stylesheets stay out
 * of the entry. Nuxt preloads a dynamic chunk only when the page server
 * renders it; elsewhere (an `ssr: false` shell, a prerendered page, a
 * visitor whose banner the browser opens later) the browser would find it
 * only after the entry runs, and the banner would wait for it after
 * `/v1/consent/init`. Listed among the entry's imports in the manifest, the chunk and
 * its imports get a `modulepreload` link in every page's HTML, as when the
 * banner was part of the entry. The browser still loads the chunk with a
 * dynamic import, which brings its stylesheets.
 *
 * Call it after `preloadInlinedConsentStyles`, which reads the
 * entry's real static imports.
 *
 * @param manifest - Nuxt's client manifest, edited in place.
 * @param srcDir - The directory manifest sources are relative to.
 * @internal
 */
export const preloadConsentBanner = function preloadConsentBanner(
	manifest: Record<string, ClientManifestChunk>,
	srcDir: string,
	isConsentFile: (file: string) => boolean
): void {
	preloadWithEntry(manifest, srcDir, isConsentFile, BANNER_SOURCE);
};
