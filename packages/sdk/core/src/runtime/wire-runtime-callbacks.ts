/** Forward public policy events without synthesizing choices from permissions. */
import type { ConsentKernel, Unsubscribe } from '../consent-kernel.model';
import type { ConsentRuntimeOptions } from './consent-runtime.model';

export interface WireRuntimeCallbacksOptions {
	kernel: ConsentKernel;
	callbacks?: ConsentRuntimeOptions['callbacks'];
}

/** Render a thrown value as an error message. */
export const stringifyRuntimeError = (error: unknown): string => {
	if (error instanceof Error) {
		return error.message;
	}
	if (typeof error === 'string') {
		return error;
	}
	try {
		return JSON.stringify(error);
	} catch {
		return String(error);
	}
};

/**
 * Subscribe once per owning runtime to explicit actions, permission changes
 * and surface impressions.
 * @returns A disposer for the subscriptions.
 */
export const wireRuntimeCallbacks = ({
	kernel,
	callbacks,
}: WireRuntimeCallbacksOptions): Unsubscribe => {
	const subscriptions = [
		kernel.events.on('choice:recorded', ({ type: _type, ...event }) =>
			callbacks?.onChoiceRecorded?.(event)
		),
		kernel.events.on('permissions:changed', ({ type: _type, ...event }) =>
			callbacks?.onPermissionsChanged?.(event)
		),
		kernel.events.on('surface:shown', ({ type: _type, ...event }) =>
			callbacks?.onSurfaceShown?.(event)
		),
		kernel.events.on('command:error', ({ error }) =>
			callbacks?.onError?.({ error: stringifyRuntimeError(error) })
		),
	];
	return () => {
		for (const dispose of subscriptions) {
			dispose();
		}
	};
};
