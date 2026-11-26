/**
 * Adapters: code the SDK ships for a vendor whose consent handling is a
 * state machine no manifest steps express. A manifest names one in
 * `adapter`, with options; the script is built from the rest of the
 * manifest and handed to the adapter, which adds its lifecycle hooks.
 *
 * Only a runtime from `withAdapters` runs them: it loads each adapter a
 * list names, checks the `adapter` field and builds the script. The
 * runtime's own parser refuses the field, so the manifest runtime files
 * carry none of this, and no runtime builds such a manifest without its
 * adapter.
 */
import type { Script } from '../libs/script-loader/types';
import { ADAPTER_LEVELS, levelOf } from './features';

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

/** The adapters a runtime has loaded, or why each did not, by ID. */
export type LoadedAdapters = Map<string, ManifestAdapter | FailedAdapter>;

/** Whether `entry` is an adapter that loaded. */
export const isLoaded = (
	entry: ManifestAdapter | FailedAdapter | undefined
): entry is ManifestAdapter => entry !== undefined && 'script' in entry;

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const ADAPTER_KEYS: ReadonlySet<string> = new Set(['id', 'options']);

/**
 * Why a manifest's `adapter` cannot run, as the rest of a parser reason:
 * an ID this SDK does not ship, an adapter that is not loaded or failed to
 * load, or options the adapter refuses.
 */
export const adapterProblem = function adapterProblem(
	adapter: unknown,
	loaded: LoadedAdapters
): string | undefined {
	if (
		!(isRecord(adapter) && isRecord(adapter.options)) ||
		Object.keys(adapter).some((key) => !ADAPTER_KEYS.has(key))
	) {
		return 'its adapter is not an id with options';
	}
	const { id } = adapter;
	if (levelOf(ADAPTER_LEVELS, id) === undefined) {
		return `it names the adapter ${JSON.stringify(id)}, which this SDK does not have`;
	}
	const entry = loaded.get(id as string);
	if (!isLoaded(entry)) {
		return `its ${String(id)} adapter ${entry ? `did not load: ${entry.failure}` : 'is not loaded'}`;
	}
	const problem = entry.problem(adapter.options);
	return problem && `its ${String(id)} adapter options are wrong: ${problem}`;
};
