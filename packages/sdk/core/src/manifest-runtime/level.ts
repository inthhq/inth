import { appendInitParams } from '@inth/sdk-schema/types';

import type { RemoteManifestRuntime } from '../modules/script-loader/types';
import type { LevelThreePart } from './part';

/**
 * The highest manifest runtime level this SDK runs.
 *
 * Level 1 is the manifest shape the first remote scripts used. Level 2
 * adds runtime values read from consent and the script element,
 * `onDisposeSteps`, `callGlobal.path`, owned second script tags, the
 * `nameAndArguments` queue format, a script tag `id`, and the `target`,
 * `observeConsentBeforeLoad`, `persistAfterDispose` and `resourceKey`
 * fields, and `globals`, the window roots a manifest's steps may use,
 * which every manifest the SDK runs now carries, so none is level 1.
 * Level 3 adds `if` steps and their conditions, `setFlag`, `listen` and
 * `callGlobal.then`, which run in a part of the runtime that loads only
 * for a manifest that requires level 3. `features.ts` lists the level of
 * each. A manifest that needs a later level's steps or fields says so in
 * `requires`; one without `requires` needs level 1. The SDK sends this
 * level as `manifestLevel` when it asks for a script registry, and drops
 * any entry above it from a list no server filtered for it.
 */
export const MANIFEST_RUNTIME_LEVEL = 3;

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
	return {
		...runtime,
		prepare: (manifests) => {
			if (installed || !requiresLevelThree(manifests)) {
				return undefined;
			}
			const install = async () => {
				const { levelThreePart } = await load();
				runtime.installLevelThree(levelThreePart);
				installed = true;
				return undefined;
			};
			return install();
		},
	};
};
