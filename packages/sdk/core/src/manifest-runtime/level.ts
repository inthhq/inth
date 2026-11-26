import { appendInitParams } from '@inth/sdk-schema/types';

import type { RemoteManifestRuntime } from '../modules/script-loader/types';
import { adapterProblem, isLoaded } from './adapter';
import type { AdapterId, LoadedAdapters, ManifestAdapter } from './adapter';
import { ADAPTER_LEVELS, levelOf } from './features';
import type { LevelThreePart } from './part';
import type { ManifestAdapterField } from './types';

/**
 * The highest manifest runtime level this SDK runs.
 *
 * Level 1 is the manifest shape the first remote scripts used. Level 2
 * adds runtime values read from consent and the script element,
 * `onDisposeSteps`, `callGlobal.path`, `setGlobal.ifNullish`, owned second script tags, the
 * `nameAndArguments` queue format, a script tag `id`, and the `target`,
 * `observeConsentBeforeLoad`, `persistAfterDispose` and `resourceKey`
 * fields, and `globals`, the window roots a manifest's steps may use,
 * which every manifest the SDK runs now carries, so none is level 1.
 * Level 3 adds `if` steps and their conditions, `setFlag`, `listen`,
 * `defer` and `callGlobal.then`, which run in a part of the runtime that
 * loads only for a manifest that requires level 3. Level 4 adds `adapter`:
 * a manifest names an adapter the SDK ships, whose module loads only for a
 * manifest that names it. `features.ts` lists the level of each feature
 * and adapter. A manifest that needs a later level's steps or fields says
 * so in `requires`; one without `requires` needs level 1. The SDK sends
 * this level as `manifestLevel` when it asks for a script registry, and
 * drops any entry above it from a list no server filtered for it.
 */
export const MANIFEST_RUNTIME_LEVEL = 4;

/**
 * `url` with this SDK's level as its `manifestLevel` query parameter, for a
 * request to the Inth server that returns a script registry.
 */
export const withManifestLevel = (url: string): string =>
	appendInitParams(url, { manifestLevel: MANIFEST_RUNTIME_LEVEL });

/** Whether one of `manifests` requires level 3 or later. */
export const requiresLevelThree = (manifests: readonly unknown[]): boolean =>
	manifests.some(
		(manifest) =>
			((manifest as { requires?: unknown } | null)?.requires as number) >= 3
	);

/**
 * `runtime` with a `prepare` that loads the level 3 part with `load` and
 * installs it, the first time a manifest requires level 3.
 */
export const withLevelThreePart = function withLevelThreePart(
	runtime: RemoteManifestRuntime & {
		installLevelThree: (part: LevelThreePart) => void;
	},
	load: () => Promise<{ levelThreePart: LevelThreePart }>
): RemoteManifestRuntime {
	let installed = false;
	/** The download running now, which every list asking for the part shares. */
	let installing: Promise<undefined> | undefined;
	return {
		...runtime,
		prepare: (manifests) => {
			if (installed || !requiresLevelThree(manifests)) {
				return undefined;
			}
			const install = async () => {
				try {
					const { levelThreePart } = await load();
					runtime.installLevelThree(levelThreePart);
					installed = true;
					return undefined;
				} finally {
					// A failed download is tried again for a later list.
					installing = undefined;
				}
			};
			installing ??= install();
			return installing;
		},
	};
};

/** The adapters this SDK ships that `manifests` name, once each. */
export const namedAdapters = (manifests: readonly unknown[]): AdapterId[] => [
	...new Set(
		manifests.flatMap((manifest) => {
			const id = (manifest as { adapter?: { id?: unknown } } | null)?.adapter
				?.id;
			return levelOf(ADAPTER_LEVELS, id) === undefined ? [] : [id as AdapterId];
		})
	),
];

/**
 * `runtime`, made to run adapters. Its `prepare` loads, with `load`, each
 * adapter a list names that has not loaded; one that fails is kept as a
 * failure and tried again for a later list. Its parser checks a manifest's
 * `adapter` (an ID this SDK ships, loaded, with options the adapter
 * accepts) and the rest with `runtime`'s, and refuses with the reason,
 * including why the adapter failed to load. It builds the script from the
 * rest of the manifest and hands it to the adapter, with no `serverStart`:
 * an adapter's hooks run in the browser, so a server render leaves the
 * script to it. When `runtime`'s own `prepare` moves to another runtime,
 * such as the script tag's level 3 file, that one runs the same adapters.
 */
export const withAdapters = function withAdapters(
	runtime: RemoteManifestRuntime,
	load: (id: AdapterId) => Promise<ManifestAdapter<never>>,
	loaded: LoadedAdapters = new Map()
): RemoteManifestRuntime {
	const missing = (manifests: readonly unknown[]) =>
		namedAdapters(manifests).filter((id) => !isLoaded(loaded.get(id)));
	const install = (manifests: readonly unknown[]) =>
		Promise.all(
			missing(manifests).map(async (id) => {
				try {
					loaded.set(id, await load(id));
				} catch (error) {
					loaded.set(id, {
						failure: error instanceof Error ? error.message : String(error),
						id,
					});
				}
			})
		);
	return {
		...runtime,
		parseResolvedManifest: (value) => {
			const { adapter, ...rest } = (value ?? {}) as Record<string, unknown>;
			if (adapter === undefined) {
				return runtime.parseResolvedManifest(value);
			}
			const reason = adapterProblem(adapter, loaded);
			if (reason !== undefined) {
				const id = (adapter as { id?: unknown } | null)?.id;
				// An adapter this SDK ships that has not loaded may load for a
				// later list.
				return levelOf(ADAPTER_LEVELS, id) !== undefined &&
					!isLoaded(loaded.get(id as string))
					? { needsCode: true, ok: false, reason }
					: { ok: false, reason };
			}
			const parsed = runtime.parseResolvedManifest(rest);
			return parsed.ok
				? {
						manifest: {
							...parsed.manifest,
							adapter: adapter as ManifestAdapterField,
						},
						ok: true,
					}
				: parsed;
		},
		prepare: (manifests) => {
			const earlier = runtime.prepare?.(manifests);
			if (!earlier && missing(manifests).length === 0) {
				return undefined;
			}
			const prepare = async () => {
				let next: RemoteManifestRuntime | undefined;
				try {
					next = await earlier;
				} catch {
					// The parser refuses, and reports, each manifest that needed it.
				}
				await install(manifests);
				return next && withAdapters(next, load, loaded);
			};
			return prepare();
		},
		resolvedManifestToScript: ({ adapter, ...manifest }) => {
			const script = runtime.resolvedManifestToScript(manifest);
			if (!adapter) {
				return script;
			}
			const { serverStart: _serverStart, ...base } = script;
			// The parser refused the manifest unless its adapter loaded.
			return (loaded.get(adapter.id) as ManifestAdapter<unknown>).script(
				base,
				adapter.options
			);
		},
	};
};
