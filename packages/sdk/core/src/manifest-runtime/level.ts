import { appendInitParams } from '@inth/sdk-schema/types';

import type { RemoteManifestRuntime } from '../modules/script-loader/types';
import type { AdapterId, ManifestAdapter } from './adapter';
import { ADAPTER_LEVELS, levelOf } from './features';
import type { LevelThreePart } from './part';

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
 * `runtime` with a `prepare` that loads, with `load`, each adapter a
 * manifest names that `runtime` has not installed, and installs it. One
 * that fails to load is installed as a failure, so the parser reports why
 * for each manifest that names it, and is tried again for a later list.
 * When the runtime's own `prepare` moves to another runtime, such as the
 * script tag's level 3 file, the adapters install into that one.
 */
export const withAdapters = function withAdapters(
	runtime: RemoteManifestRuntime,
	load: (id: AdapterId) => Promise<ManifestAdapter<never>>
): RemoteManifestRuntime {
	const installed = new Set<string>();
	const install = (manifests: readonly unknown[]) =>
		Promise.all(
			namedAdapters(manifests)
				.filter((id) => !installed.has(id))
				.map(async (id) => {
					try {
						runtime.installAdapter?.(await load(id));
						installed.add(id);
					} catch (error) {
						runtime.installAdapter?.({
							failure: error instanceof Error ? error.message : String(error),
							id,
						});
					}
				})
		);
	return {
		...runtime,
		prepare: (manifests) => {
			const earlier = runtime.prepare?.(manifests);
			if (
				!earlier &&
				namedAdapters(manifests).every((id) => installed.has(id))
			) {
				return undefined;
			}
			const prepare = async () => {
				let next: RemoteManifestRuntime | undefined;
				try {
					next = await earlier;
				} catch {
					// The parser refuses, and reports, each manifest that needed it.
				}
				if (next) {
					const adapted = withAdapters(next, load);
					await adapted.prepare?.(manifests);
					return adapted;
				}
				await install(manifests);
				return undefined;
			};
			return prepare();
		},
	};
};
