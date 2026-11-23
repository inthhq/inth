/**
 * A configure-once runtime that mounts the module factories its host
 * chooses, for hosts that load some modules on demand.
 *
 * `createConsentRuntime` from `@inth/sdk/runtime` mounts
 * `defaultRuntimeModules`, which imports the script loader statically. A
 * page-level host (the script tag, an Astro page) that wants
 * `onDemandRuntimeModules` instead builds its runtime here, so its first
 * load never names the static script loader.
 */
import { assembleConsentRuntime } from './assemble';
import type {
	ConsentRuntime,
	ConsentRuntimeModules,
	ConsentRuntimeOptions,
} from './consent-runtime.model';

/**
 * Creates a consent runtime that mounts the given module factories.
 *
 * Same lifecycle as `createConsentRuntime`; only the modules differ.
 *
 * @throws {Error} When `mode` is not a transport factory.
 *
 * @example
 * ```ts
 * import { watchRevocationReload } from '@inth/sdk-core';
 * import { createIframeBlocker } from '@inth/sdk-core/modules/iframe-blocker';
 * import { createPersistence } from '@inth/sdk-core/modules/persistence';
 * import { createWindowDebug } from '@inth/sdk-core/modules/window-debug';
 * import {
 *   createConsentRuntimeWith,
 *   onDemandRuntimeModules,
 * } from '@inth/sdk-core/runtime/provider';
 *
 * const runtime = createConsentRuntimeWith(options, {
 *   ...onDemandRuntimeModules,
 *   createIframeBlocker,
 *   createPersistence,
 *   createWindowDebug,
 *   watchRevocationReload,
 * });
 * runtime.start();
 * ```
 */
export const createConsentRuntimeWith = function createConsentRuntimeWith(
	options: ConsentRuntimeOptions,
	modules: ConsentRuntimeModules
): ConsentRuntime {
	return assembleConsentRuntime(options, modules).runtime;
};
