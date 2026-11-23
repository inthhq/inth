import { resolve } from 'node:path';

import {
	BROWSER_RESOLVER_SOURCE,
	FIRST_BANNER_SOURCES,
	IAB_FIRST_BANNER_SOURCES,
} from './consent-prefetch.model';
import type {
	ClientManifestChunk,
	ConsentPrefetchOptions,
} from './consent-prefetch.model';
import { createPackageCheck } from './create-package-check';

/**
 * Stop Nuxt prefetching Inth chunks a page loads only after its first
 * banner, or only when it configures them: the script loader, network
 * blocker, data clearing and `consentSource` connection, live option
 * updates, the save path, the preference dialog (which Inth warms itself
 * once the page has loaded), and IAB unless the module options turn it on.
 *
 * Nuxt adds a `<link rel="prefetch">` for every chunk the entry imports
 * dynamically. Each download that finishes queues a task on the main
 * thread, so on a page whose `/v1/consent/init` answer arrives while they land, the
 * banner waits behind them. Chunks another part of the app also reaches
 * keep their hint.
 *
 * @param manifest - Nuxt's client manifest, edited in place.
 * @param srcDir - The directory manifest sources are relative to.
 * @param isConsentFile - Reads the nearest `package.json` by default.
 * @internal
 */
export const stopPrefetchingConsentChunks =
	function stopPrefetchingConsentChunks(
		manifest: Record<string, ClientManifestChunk>,
		srcDir: string,
		isConsentFile: (file: string) => boolean = createPackageCheck(),
		options: ConsentPrefetchOptions = {}
	): void {
		const isConsentSource = (chunk: ClientManifestChunk): boolean =>
			chunk.src !== undefined && isConsentFile(resolve(srcDir, chunk.src));
		const kept = [
			...FIRST_BANNER_SOURCES,
			...(options.browserResolve ? [BROWSER_RESOLVER_SOURCE] : []),
			...(options.iab ? IAB_FIRST_BANNER_SOURCES : []),
		];
		const deferred = new Set<string>();
		for (const [key, chunk] of Object.entries(manifest)) {
			if (
				chunk.isDynamicEntry &&
				isConsentSource(chunk) &&
				!kept.some((source) => chunk.src?.endsWith(source))
			) {
				deferred.add(key);
			}
		}
		const reached = new Set<string>();
		const visit = (key: string): void => {
			if (reached.has(key)) {
				return;
			}
			reached.add(key);
			for (const dependency of manifest[key]?.imports ?? []) {
				visit(dependency);
			}
		};
		for (const [key, chunk] of Object.entries(manifest)) {
			if ((chunk.isEntry || chunk.isDynamicEntry) && !deferred.has(key)) {
				visit(key);
			}
		}
		const reachedStyles = new Set(
			[...reached].flatMap((key) => manifest[key]?.css ?? [])
		);
		const skip = (key: string): void => {
			const chunk = manifest[key];
			if (!chunk || reached.has(key) || chunk.prefetch === false) {
				return;
			}
			chunk.prefetch = false;
			for (const css of chunk.css ?? []) {
				const style = manifest[css];
				if (style && !reachedStyles.has(css)) {
					style.prefetch = false;
				}
			}
			for (const dependency of chunk.imports ?? []) {
				skip(dependency);
			}
		};
		for (const key of deferred) {
			skip(key);
		}
	};
