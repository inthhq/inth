/**
 * What a deferred root shares with the deferred surfaces under it. Small:
 * on first load.
 *
 * @packageDocumentation
 * @internal
 */

import { createContext } from 'react';

import type { DeferredKernelHandle } from './create-deferred-kernel';
import type { Recorded } from './recorded-promise.model';

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
	 * kernel. `pick` may wait for more, such as the banner's container.
	 * One read per `key`.
	 */
	surface: <Value>(
		key: string,
		pick: (engine: unknown) => Value | PromiseLike<Value>
	) => Recorded<Value>;
}

/** @internal */
export const DeferredSessionContext = createContext<DeferredSession | null>(
	null
);
DeferredSessionContext.displayName = 'InthDeferredSessionContext';
