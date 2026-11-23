/**
 * Debug-event emission.
 *
 * Two paths:
 * - `onDebug` — synchronous listener supplied by the consumer.
 * - the page's script debug listeners (`subscribeToScriptDebugEvents`),
 *   unless `emitToV2DebugListeners` is off.
 *
 * Listener errors never reach the loader.
 */
import type {
	ScriptLoaderDebugEvent,
	ScriptLoaderTools,
} from './script-loader.model';

export interface DebugEmitterOptions {
	/** Optional consumer listener. */
	onDebug?: (event: ScriptLoaderDebugEvent) => void;
	/** Dispatches to the page's script debug listeners, when they listen. */
	dispatch?: ScriptLoaderTools['debug'];
}

/**
 * Build the merged emit function used throughout the loader. Wraps
 * both callbacks behind a single function call site so other modules
 * don't have to know about the dual-path policy.
 */
export const createDebugEmitter = function createDebugEmitter(
	options: DebugEmitterOptions
) {
	const { onDebug, dispatch } = options;
	return function emit(event: ScriptLoaderDebugEvent): void {
		if (onDebug) {
			try {
				onDebug(event);
			} catch {
				// Swallow consumer listener errors.
			}
		}
		dispatch?.(event);
	};
};
