/**
 * The script-tag engines' `loadManifestRuntime` runtime module: the
 * manifest runtime from `inth.manifests.js`.
 *
 * @packageDocumentation
 * @internal
 */

import { requiresLevelThree } from '@inth/sdk-core/manifest-runtime';
import type { RemoteManifestRuntime } from '@inth/sdk-core/modules/script-loader';

import { readNonce } from '../auto-init';
import { adoptedBoot } from './adopt';
import { LEVEL_THREE_KEY, MANIFESTS_KEY } from './manifests-file';
import type { ManifestsFile } from './manifests-file';
import { loadPartFile } from './part-file';
import { partSrc } from './part-src';

// Read while this file runs: `currentScript` is the engine's own tag.
const own =
	typeof document === 'undefined'
		? null
		: (document.currentScript as HTMLScriptElement | null);

/**
 * The manifest runtime, from `inth.manifests.js` at this version
 * (`partSrc`), next to `inth.js`, or next to the engine on a page without
 * one. When one of `manifests` requires level 3 it is
 * `inth.manifests3.js`, the same runtime with level 3, from the same place
 * with the same nonce; a later list that needs level 3 moves to it
 * through `prepare`. When `inth.manifests3.js` fails for the first list,
 * it is `inth.manifests.js`. The `loadManifestRuntime` runtime module of
 * the script-tag engines.
 *
 * @throws {Error} When the file has no URL, fails to load, or is from
 * another release; the loader then reports that remote scripts do not load.
 * @internal
 */
export const loadManifestsFile = async function loadManifestsFile(
	manifests: readonly unknown[] = []
): Promise<RemoteManifestRuntime> {
	// Beside `inth.js` once the engine took over from it, where the init
	// script preloads it, even when `data-hosted-src` moved the engine.
	// Beside the engine on a page with no init script.
	const init = adoptedBoot()?.script;
	// The nonce the page gave the tag: `data-nonce`, else its own.
	const tag = init ?? own;
	const nonce = tag ? readNonce(tag) : undefined;
	const load = async (levelThree: boolean): Promise<ManifestsFile> => {
		const file = levelThree ? 'manifests3' : 'manifests';
		const name = `inth.${file}.js`;
		const src = init
			? partSrc(file, init, init.getAttribute('src'))
			: partSrc(file, own, own?.src);
		if (!src) {
			throw new Error(`${name} has no URL`);
		}
		const loaded = await loadPartFile<ManifestsFile>(
			levelThree ? LEVEL_THREE_KEY : MANIFESTS_KEY,
			src,
			nonce
		);
		if (!loaded) {
			throw new Error(
				`${name} did not load from ${src}, or is from another release`
			);
		}
		return loaded;
	};
	const levelTwo = async (
		failed: readonly unknown[] = []
	): Promise<RemoteManifestRuntime> => ({
		...(await load(false)),
		prepare: (later) =>
			requiresLevelThree(later) &&
			!(
				later.length === failed.length &&
				later.every((manifest, index) => manifest === failed[index])
			)
				? load(true)
				: undefined,
	});
	if (requiresLevelThree(manifests)) {
		try {
			return await load(true);
		} catch {
			// The list's level 1 and 2 entries still run. The parser refuses,
			// and the loader reports, each entry that needs level 3. A later
			// list tries the file again; this one does not wait for it twice.
			return levelTwo(manifests);
		}
	}
	return levelTwo();
};
