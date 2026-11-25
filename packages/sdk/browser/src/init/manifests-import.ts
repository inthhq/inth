/**
 * The script-tag engines' `loadManifestRuntime` runtime module: the
 * manifest runtime from `inth.manifests.js`.
 *
 * @packageDocumentation
 * @internal
 */

import type { RemoteManifestRuntime } from '@inth/sdk-core/modules/script-loader';

import { readNonce } from '../auto-init';
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
 * The manifest runtime, from `inth.manifests.js` at this version
 * (`partSrc`), next to `inth.js`, or next to the engine on a page without
 * one. The `loadManifestRuntime` runtime module of the script-tag engines.
 *
 * @throws {Error} When the file has no URL, fails to load, or is from
 * another release; the loader then reports that remote scripts do not load.
 * @internal
 */
export const loadManifestsFile =
	async function loadManifestsFile(): Promise<RemoteManifestRuntime> {
		// Beside `inth.js` once the engine took over from it, where the init
		// script preloads it, even when `data-hosted-src` moved the engine.
		// Beside the engine on a page with no init script.
		const init = adoptedBoot()?.script;
		const src = init
			? partSrc('manifests', init, init.getAttribute('src'))
			: partSrc('manifests', own, own?.src);
		if (!src) {
			throw new Error('inth.manifests.js has no URL');
		}
		// The nonce the page gave the tag: `data-nonce`, else its own.
		const tag = init ?? own;
		const file = await loadPartFile<ManifestsFile>(
			MANIFESTS_KEY,
			src,
			tag ? readNonce(tag) : undefined
		);
		if (!file) {
			throw new Error(
				`inth.manifests.js did not load from ${src}, or is from another release`
			);
		}
		return file;
	};
