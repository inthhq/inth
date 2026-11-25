/**
 * The page runtime for the script-tag builds, with every module imported
 * statically. Replaces `create-runtime.ts` there (see `rslib.config.ts`).
 *
 * `createConsentRuntime` from `@inth/sdk/runtime` loads the network
 * blocker and data clearing through `import()`. In one file both modules are
 * bundled anyway, so that only adds the on-demand wrapper and mounts them a
 * tick late. This mounts them as it mounts the rest.
 */
import { watchRevocationReload } from '@inth/sdk-core';
import { createClearOnRevocation } from '@inth/sdk-core/modules/clear-on-revocation';
import { createIframeBlocker } from '@inth/sdk-core/modules/iframe-blocker';
import { createNetworkBlocker } from '@inth/sdk-core/modules/network-blocker';
import { createPersistence } from '@inth/sdk-core/modules/persistence';
import { createScriptLoader } from '@inth/sdk-core/modules/script-loader';
import { createWindowDebug } from '@inth/sdk-core/modules/window-debug';
import type {
	ConsentRuntime,
	ConsentRuntimeOptions,
} from '@inth/sdk-core/runtime';
import { connectConsentSource } from '@inth/sdk-core/runtime/controls';
import {
	createConsentRuntimeWith,
	mountRuntimeIAB,
} from '@inth/sdk-core/runtime/on-demand';
import type { ScriptRegistryWire } from '@inth/sdk-schema/types';

import { adoptedBoot } from './init/adopt';
import { loadManifestsFile } from './init/manifests-import';

/**
 * Creates the page runtime with every module mounted statically.
 *
 * @internal
 */
export const createBrowserRuntime = function createBrowserRuntime(
	options: ConsentRuntimeOptions
): ConsentRuntime {
	// A script tag loads the integrations added on the Inth server unless
	// the page turns that off (`data-remote-scripts="false"`).
	return createConsentRuntimeWith(
		{ ...options, remoteScripts: options.remoteScripts ?? true },
		{
			connectConsentSource,
			createClearOnRevocation,
			createIframeBlocker,
			createNetworkBlocker,
			createPersistence,
			createScriptLoader,
			createWindowDebug,
			// `remoteScripts` runs manifests from `inth.manifests.js`.
			loadManifestRuntime: loadManifestsFile,
			mountIAB: mountRuntimeIAB,
			// The list the init script cached, for an unavailable registry.
			readCachedScriptRegistry: () =>
				adoptedBoot()?.cachedRegistry?.() as ScriptRegistryWire | undefined,
			watchRevocationReload,
		}
	);
};
