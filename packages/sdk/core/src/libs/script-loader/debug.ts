import { SCRIPT_DEBUG_LISTENERS_KEY } from '../../runtime/page-globals';
import type {
	ScriptDebugEvent,
	ScriptDebugEventInput,
	ScriptDebugListener,
} from './types';

let fallbackListeners: Set<ScriptDebugListener> | null = null;

const getListeners = function getListeners(): Set<ScriptDebugListener> {
	if (typeof window === 'undefined') {
		if (!fallbackListeners) {
			fallbackListeners = new Set();
		}
		return fallbackListeners;
	}

	const host = window as unknown as Record<string, unknown>;
	const existing = host[SCRIPT_DEBUG_LISTENERS_KEY] as
		| Set<ScriptDebugListener>
		| undefined;
	if (existing) {
		return existing;
	}

	const listeners = new Set<ScriptDebugListener>();
	host[SCRIPT_DEBUG_LISTENERS_KEY] = listeners;
	return listeners;
};

/**
 * Hands `event` to every subscribed listener. A listener that throws is
 * logged, so debug instrumentation cannot break script loading.
 *
 * @internal
 */
export const dispatchScriptDebugEvent = function dispatchScriptDebugEvent(
	event: ScriptDebugEvent
): void {
	for (const listener of getListeners()) {
		try {
			listener(event);
		} catch (error) {
			console.error('Failed to handle inth script debug event listener', error);
		}
	}
};

export const emitScriptDebugEvent = function emitScriptDebugEvent(
	event: ScriptDebugEventInput
): ScriptDebugEvent {
	const fullEvent: ScriptDebugEvent = {
		...event,
		timestamp: Date.now(),
	};
	dispatchScriptDebugEvent(fullEvent);
	return fullEvent;
};

export const subscribeToScriptDebugEvents =
	function subscribeToScriptDebugEvents(
		listener: ScriptDebugListener
	): () => void {
		const listeners = getListeners();
		listeners.add(listener);

		return () => {
			listeners.delete(listener);
		};
	};
