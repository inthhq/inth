import { resolve } from 'node:path';

import {
	BANNER_SOURCE,
	DEFERRED_ENGINE_MANIFEST_KEY,
	ENGINE_SOURCES,
} from './consent-prefetch.model';
import type { ClientManifestChunk } from './consent-prefetch.model';
import { preloadWithEntry } from './preload-with-entry';

/**
 * Name the engine chunk under a key the server render knows.
 *
 * The plugin loads the engine with a dynamic import. A server render whose
 * visitor needs it at once (a returning visitor, IAB, an experiment) adds
 * {@link DEFERRED_ENGINE_MANIFEST_KEY} to the request's modules, and Nuxt
 * preloads the chunk and its imports with the entry; a deferred visitor's
 * HTML does not. The source path the manifest keys the chunk by depends on
 * the install, so the module copies its entry under a fixed key. With
 * `ssr: false` no page renders on the server, so every page preloads the
 * engine and the banner with the entry instead.
 *
 * Call it after `stopPrefetchingConsentChunks`.
 *
 * @param manifest - Nuxt's client manifest, edited in place.
 * @param srcDir - The directory manifest sources are relative to.
 * @internal
 */
export const preloadDeferredEngine = function preloadDeferredEngine(
	manifest: Record<string, ClientManifestChunk>,
	srcDir: string,
	isConsentFile: (file: string) => boolean,
	ssr: boolean
): void {
	const source = ENGINE_SOURCES.find((candidate) =>
		Object.values(manifest).some(
			(chunk) =>
				chunk.isDynamicEntry &&
				chunk.src?.endsWith(candidate) &&
				isConsentFile(resolve(srcDir, chunk.src))
		)
	);
	if (!source) {
		return;
	}
	const [key, chunk] = Object.entries(manifest).find(
		([, entry]) => entry.isDynamicEntry && entry.src?.endsWith(source)
	) as [string, ClientManifestChunk];
	manifest[DEFERRED_ENGINE_MANIFEST_KEY] = {
		...chunk,
		isDynamicEntry: false,
		prefetch: false,
		src: undefined,
	};
	if (!ssr) {
		preloadWithEntry(manifest, srcDir, isConsentFile, BANNER_SOURCE);
		for (const entry of Object.values(manifest)) {
			if (entry.isEntry && !entry.imports?.includes(key)) {
				entry.imports = [...(entry.imports ?? []), key];
			}
		}
	}
};
