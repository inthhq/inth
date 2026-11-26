import type { RemoteManifestRuntime } from '../modules/script-loader/types';

/**
 * Loads the manifest runtime on demand, for `remoteScripts`. Pass it as the
 * `loadManifestRuntime` runtime module; `defaultRuntimeModules` and the
 * on-demand modules do. Its own chunk, so a site that never turns on
 * `remoteScripts` never downloads it. The level 3 part is a chunk of its
 * own too, loaded only for a manifest that requires level 3, and so is
 * each adapter, loaded only for a manifest that names it.
 */
export const loadManifestRuntime =
	async function loadManifestRuntime(): Promise<RemoteManifestRuntime> {
		const runtime = await import('../manifest-runtime/index');
		return runtime.withAdapters(
			runtime.withLevelThreePart(
				runtime,
				() => import('../manifest-runtime/level-three')
			),
			async (id) =>
				(await import('../manifest-runtime/adapters/index')).importAdapter(id)
		);
	};
