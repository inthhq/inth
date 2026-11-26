/**
 * Where adapters plug into the manifest runtime. An adapter is code the SDK
 * ships for a vendor whose consent handling is a state machine no manifest
 * steps express. A manifest names one in `adapter`, with options; the
 * runtime builds the script from the rest of the manifest and hands it to
 * the adapter, which adds its lifecycle hooks.
 *
 * Adapter modules load on demand (`withAdapters`), so this file holds only
 * the ones installed so far. Each runtime file has its own, so the script
 * tag installs an adapter into whichever runtime file it uses.
 */
import type { Script } from '../libs/script-loader/types';
import type { ADAPTER_LEVELS } from './features';

/** The ID of an adapter this SDK ships. */
export type AdapterId = keyof typeof ADAPTER_LEVELS;

/** An adapter module. */
export interface ManifestAdapter<Options = never> {
	readonly id: AdapterId;
	/**
	 * Why `options` cannot run, or `undefined`. It refuses any name it does
	 * not know and any value that is not plain JSON of the right type.
	 */
	readonly problem: (
		options: Readonly<Record<string, unknown>>
	) => string | undefined;
	/** `base` with the adapter's lifecycle hooks, for options that passed `problem`. */
	readonly script: (base: Script, options: Options) => Script;
}

/** An adapter that did not load, and why. */
export interface FailedAdapter {
	readonly id: string;
	readonly failure: string;
}

const installed = new Map<string, ManifestAdapter | FailedAdapter>();

/** Whether `entry` is an adapter that loaded. */
export const isLoaded = (
	entry: ManifestAdapter | FailedAdapter | undefined
): entry is ManifestAdapter => entry !== undefined && 'script' in entry;

/**
 * Lets the runtime build manifests that name `adapter`, or records why it
 * did not load, so the parser reports that for each manifest that names
 * it. A failure never replaces an adapter that loaded.
 */
export const installAdapter = function installAdapter(
	adapter: ManifestAdapter<never> | FailedAdapter
): void {
	if (!isLoaded(installed.get(adapter.id))) {
		installed.set(adapter.id, adapter);
	}
};

/** The adapter installed under `id`, or why it did not load. */
export const installedAdapter = (
	id: string
): ManifestAdapter | FailedAdapter | undefined => installed.get(id);
