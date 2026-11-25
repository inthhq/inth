import type { RemoteManifestRuntime } from '../modules/script-loader/types';

/**
 * Loads the manifest runtime on demand, for `remoteScripts`. Pass it as the
 * `loadManifestRuntime` runtime module; `defaultRuntimeModules` and the
 * on-demand modules do. Its own chunk, so a site that never turns on
 * `remoteScripts` never downloads it.
 */
export const loadManifestRuntime =
	function loadManifestRuntime(): Promise<RemoteManifestRuntime> {
		return import('../manifest-runtime/index');
	};
