/**
 * What a deferred root shares with the deferred surfaces under it, and the
 * promise helpers they render with. Small: on first load.
 *
 * @packageDocumentation
 * @internal
 */

import * as React from 'react';
import { createContext } from 'react';

import type { DeferredKernelHandle } from './deferred-kernel';

/** A promise that keeps its result where a render can read it. @internal */
export type Recorded<Value> = Promise<Value> & {
	status?: 'pending' | 'fulfilled' | 'rejected';
	value?: Value;
	reason?: unknown;
};

/**
 * `promise`, recording its outcome on itself, so `read` returns at once
 * once it settled, also under React 18.
 *
 * @internal
 */
export const record = function record<Value>(
	promise: Promise<Value>
): Recorded<Value> {
	const recorded = promise as Recorded<Value>;
	if (!recorded.status) {
		recorded.status = 'pending';
		const track = async (): Promise<void> => {
			try {
				recorded.value = await promise;
				recorded.status = 'fulfilled';
			} catch (error) {
				recorded.reason = error;
				recorded.status = 'rejected';
			}
		};
		void track();
	}
	return recorded;
};

/**
 * `load()`, recorded and shared by every call. After a failed load the next
 * call loads again, a second later, up to three loads in all; after that
 * the failure stays, so `read` throws it to the error boundary.
 *
 * @remarks
 * Three loads a second apart ride out a dropped connection, while a chunk
 * a deploy removed fails within seconds instead of being requested in a
 * loop by every render that reads it.
 *
 * @internal
 */
export const recordOnce = function recordOnce<Value>(
	load: () => Promise<Value>
): () => Recorded<Value> {
	let loading: Recorded<Value> | undefined;
	let loads = 0;
	return () => {
		if (!loading || (loading.status === 'rejected' && loads < 3)) {
			loads += 1;
			loading = record(
				loads > 1
					? (async () => {
							await new Promise((resolve) => {
								setTimeout(resolve, 1000);
							});
							return load();
						})()
					: load()
			);
		}
		return loading;
	};
};

/** React 19's `use`, absent from React 18. */
const { use } = React as {
	use?: <Value>(value: Promise<Value>) => Value;
};

/**
 * Reads a recorded promise during render: its value once settled, else it
 * suspends. Render-only, like `use`.
 *
 * @internal
 */
export const read = function read<Value>(promise: Recorded<Value>): Value {
	if (promise.status === 'fulfilled') {
		return promise.value as Value;
	}
	if (promise.status === 'rejected') {
		throw promise.reason;
	}
	if (use) {
		// oxlint-disable-next-line react-hooks/rules-of-hooks -- `read` is `use` with a React 18 fallback.
		return use(promise);
	}
	throw promise;
};

/** One deferred root's engine load. @internal */
export interface DeferredSession {
	handle: DeferredKernelHandle;
	/** Starts loading the engine and the banner. Idempotent. */
	start: () => void;
	/** The engine's module, once started and loaded. */
	engine: () => Recorded<unknown>;
	/**
	 * A value from the engine's module, such as a stock surface, read once
	 * the engine attached, so the surface hydrates against the engine's
	 * kernel. One read per `key`.
	 */
	surface: <Value>(
		key: string,
		pick: (engine: unknown) => Value
	) => Recorded<Value>;
}

/** @internal */
export const DeferredSessionContext = createContext<DeferredSession | null>(
	null
);
DeferredSessionContext.displayName = 'C15tDeferredSessionContext';
