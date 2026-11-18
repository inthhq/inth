/**
 * The consent engine a provider creates for itself: the kernel and every
 * module it mounts. `ConsentProvider` imports it statically.
 * `ConsentRoot` imports it on the server and, in the browser, through
 * `deferred/engine.ts` once it needs the engine, so its first-load chunk
 * does without it.
 *
 * It imports no module of this package: a module the engine chunk shared
 * with the page's first-load graph would make Rolldown (Vite 8) put the
 * engine in a chunk the page imports statically. Callers build the runtime
 * options with `runtimeOptionsFor` (`provider-options.ts`).
 *
 * @packageDocumentation
 * @internal
 */

import {
	defaultTranslationConfig,
	watchRevocationReload,
} from '@inth/sdk/engine';
import { createIframeBlocker } from '@inth/sdk/modules/iframe-blocker';
import { createPersistence } from '@inth/sdk/modules/persistence';
import { createWindowDebug } from '@inth/sdk/modules/window-debug';
import {
	mountRuntimeIAB,
	onDemandRuntimeModules,
} from '@inth/sdk/runtime/on-demand';
import { createConsentProviderRuntime } from '@inth/sdk/runtime/provider';
import type {
	ConsentProviderRuntime,
	ConsentProviderRuntimeOptions,
} from '@inth/sdk/runtime/provider';

/**
 * Creates the runtime a provider owns.
 *
 * @param options - `runtimeOptionsFor` the provider's options, with its
 * `mode` transport.
 * @returns The runtime; the provider starts and disposes it.
 * @internal
 */
export const createOwnedRuntime = function createOwnedRuntime(
	options: ConsentProviderRuntimeOptions
): ConsentProviderRuntime {
	// The surfaces' English fallback (`translation-defaults.ts`), under its
	// global key: this module imports nothing of the package.
	(globalThis as Record<symbol, unknown>)[
		Symbol.for('c15t.svelte.defaultTranslations')
	] = defaultTranslationConfig;
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
