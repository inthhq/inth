import { createScriptLoaderWith } from './loader';
/**
 * `@inth/sdk/modules/script-loader`
 *
 * Kernel-consuming script loader. Subscribes to the kernel snapshot and
 * reconciles DOM: mounts scripts that pass their consent condition,
 * unmounts scripts that no longer do, fires `onLoad` / `onError` /
 * `onConsentChange` callbacks, honors `alwaysLoad` /
 * `persistAfterConsentRevoked` / `callbackOnly` / `anonymizeId`.
 *
 * `loader.ts` is written against the tools `index.ts` passes in, so it
 * can load on demand as one chunk.
 *
 * Invariants:
 * - Idempotent by resolved element ID: calling `createScriptLoader` twice
 *   with the same scripts only mounts DOM once; later instances register
 *   the existing DOM element as loaded but do not own it.
 * - Minimal module state: anonymized element IDs are cached per page so
 *   fresh loader instances resolve the same DOM IDs. Other state remains
 *   per loader, except DOM append targets and the page's script debug
 *   listeners.
 * - `dispose()` removes every element this loader mounted and
 *   disconnects the kernel subscription. Elements mounted by other
 *   loaders (or already in the DOM) are left alone.
 */
import { scriptLoaderTools } from './tools';
import type { ScriptLoaderHandle, ScriptLoaderOptions } from './types';

export {
	getScriptDiagnostics,
	subscribeScriptDiagnostics,
} from './diagnostics';
export type { ScriptDiagnostic, ScriptDiagnosticStatus } from './diagnostics';

export type {
	Script,
	ScriptCallbackInfo,
	ScriptLoaderDebugEvent,
	ScriptLoaderHandle,
	ScriptLoaderOptions,
} from './types';

/**
 * Create a script loader: mounts each script whose consent condition
 * passes and unmounts it when consent is withdrawn.
 */
export const createScriptLoader = function createScriptLoader(
	options: ScriptLoaderOptions
): ScriptLoaderHandle {
	return createScriptLoaderWith(options, scriptLoaderTools);
};
