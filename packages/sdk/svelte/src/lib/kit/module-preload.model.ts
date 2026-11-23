/**
 * The on-demand chunks a SvelteKit page can preload, and the placeholder
 * each chunk's URL takes in the server build until `consentManifest()` from
 * `@inth/svelte/vite` writes the URL in.
 */

/**
 * The on-demand chunks a page can preload: the one that holds the script
 * loader and the network blocker, and `InthProvider`'s consent engine.
 */
export type PreloadChunkName = 'engine' | 'loader-and-blocker';

/**
 * Each chunk's URL, written into the server build by `consentManifest()`.
 *
 * @internal
 */
export const MODULE_PRELOAD_PLACEHOLDERS: Readonly<
	Record<PreloadChunkName, string>
> = {
	engine: '__INTH_MODULEPRELOAD_ENGINE__',
	'loader-and-blocker': '__INTH_MODULEPRELOAD_LOADER_AND_BLOCKER__',
};
