/**
 * The consent engine `provideInth()` creates when it is not handed one:
 * the kernel and every module it mounts.
 *
 * @packageDocumentation
 * @internal
 */

import { createIframeBlocker } from '@inth/sdk/modules/iframe-blocker';
import { createPersistence } from '@inth/sdk/modules/persistence';
import { createWindowDebug } from '@inth/sdk/modules/window-debug';
import {
	mountRuntimeIAB,
	onDemandRuntimeModules,
} from '@inth/sdk/runtime/on-demand';
import {
	createConsentProviderRuntime,
	watchRevocationReload,
} from '@inth/sdk/runtime/provider';
import type {
	ConsentProviderRuntime,
	ConsentProviderRuntimeOptions,
} from '@inth/sdk/runtime/provider';

/**
 * Creates the runtime the provider owns.
 *
 * Construction is SSR safe: it touches no storage and no DOM. The
 * `ConsentManager` starts it in the browser after the first render and
 * disposes it with the application.
 *
 * @param options - `runtimeOptionsFor` the provider's options.
 * @internal
 */
export const createOwnedRuntime = function createOwnedRuntime(
	options: ConsentProviderRuntimeOptions
): ConsentProviderRuntime {
	return createConsentProviderRuntime(options, {
		// The script loader, network blocker, data clearing and a
		// `consentSource` connection load on demand, each only when
		// configured.
		...onDemandRuntimeModules,
		createIframeBlocker,
		createPersistence,
		createWindowDebug,
		mountIAB: mountRuntimeIAB,
		watchRevocationReload,
	});
};
