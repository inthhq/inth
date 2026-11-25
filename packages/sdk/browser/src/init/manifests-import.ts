/**
 * The script-tag engines' `loadManifestRuntime` runtime module: the
 * manifest runtime from `inth.manifests.js`.
 *
 * @packageDocumentation
 * @internal
 */

import type { RemoteManifestRuntime } from '@inth/sdk-core/modules/script-loader';

import { adoptedBoot } from './adopt';
import { MANIFESTS_KEY } from './manifests-file';
import type { ManifestsFile } from './manifests-file';
import { loadPartFile } from './part-file';
import { partSrc } from './part-src';

// Read while this file runs: `currentScript` is the engine's own tag.
const own =
	typeof document === 'undefined'
		? null
		: (document.currentScript as HTMLScriptElement | null);

/**
 * The manifest runtime, from `inth.manifests.js` next to the engine, at
 * this version (`partSrc`). The `loadManifestRuntime` runtime module of the
 * script-tag engines.
 *
 * @throws {Error} When the file has no URL, fails to load, or is from
 * another release; the loader then reports that remote scripts do not load.
 * @internal
 */
export const loadManifestsFile =
	async function loadManifestsFile(): Promise<RemoteManifestRuntime> {
		const src = partSrc('manifests', adoptedBoot()?.script ?? own, own?.src);
		if (!src) {
			throw new Error('inth.manifests.js has no URL');
		}
		const file = await loadPartFile<ManifestsFile>(
			MANIFESTS_KEY,
			src,
			own?.nonce || undefined
		);
		if (!file) {
			throw new Error(
				`inth.manifests.js did not load from ${src}, or is from another release`
			);
		}
		return file;
	};
