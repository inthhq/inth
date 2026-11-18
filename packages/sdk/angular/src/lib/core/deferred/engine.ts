/**
 * The consent engine chunk: the runtime `provideInth()` owns, with its
 * kernel and modules. The deferred runtime (`deferred-runtime.ts`) loads it
 * after the page for a visitor who still has to choose, at once for every
 * other visitor, and before the render on the server.
 *
 * @packageDocumentation
 * @internal
 */

import type { ConsentSnapshot } from '@inth/sdk/engine';
import type { RuntimePrefetch } from '@inth/sdk/runtime';
import type {
	ConsentProviderRuntime,
	ConsentProviderRuntimeOptions,
} from '@inth/sdk/runtime/provider';
import { createHostedTransport } from '@inth/sdk/transports';

import { provideModeTransports } from '../modes';
import { createOwnedRuntime } from '../owned-runtime';
import type { DeferredCommitted } from './commit';

export { preloadSavePath } from '@inth/sdk/runtime/save-preload';

type Permissions = ConsentSnapshot['effectivePermissions'];

const samePermissions = (left: Permissions, right: Permissions): boolean =>
	Object.keys({ ...left, ...right }).every(
		(category) =>
			left[category as keyof Permissions] ===
			right[category as keyof Permissions]
	);

/**
 * The options after a commit: the prefetch starts from the committed
 * records on the clock now, and `onPermissionsChanged` hears a change
 * only when it differs from what the commit announced, with that as its
 * `previous`.
 */
const committedOptions = function committedOptions(
	options: ConsentProviderRuntimeOptions,
	committed: DeferredCommitted
): ConsentProviderRuntimeOptions {
	const prefetch = options.prefetch as RuntimePrefetch | undefined;
	const next: ConsentProviderRuntimeOptions = {
		...options,
		prefetch: prefetch && {
			...prefetch,
			initialRecords: { ...prefetch.initialRecords, ...committed.records },
			// The records were made after the server's clock; the kernel takes
			// a record newer than its clock for an invalid one.
			now: Math.max(prefetch.now ?? 0, Date.now()),
		},
	};
	const onPermissionsChanged = options.callbacks?.onPermissionsChanged;
	if (!onPermissionsChanged) {
		return next;
	}
	let heard = committed.permissions;
	return {
		...next,
		callbacks: {
			...options.callbacks,
			onPermissionsChanged: (event) => {
				const permissions = event.snapshot.effectivePermissions;
				if (samePermissions(permissions, heard)) {
					return;
				}
				const previous = heard;
				heard = permissions;
				onPermissionsChanged({ ...event, previous });
			},
		},
	};
};

/**
 * Builds the provider's runtime, from a commit made before it, if any.
 *
 * @param options - `runtimeOptionsFor` the provider's options.
 * @param committed - A choice the deferred runtime recorded first.
 * @returns The runtime, not started.
 * @internal
 */
export const createEngine = function createEngine(
	options: ConsentProviderRuntimeOptions,
	committed: DeferredCommitted | undefined
): ConsentProviderRuntime {
	// The mode factories build their transports with the code this chunk
	// carries.
	provideModeTransports({ hosted: createHostedTransport });
	return createOwnedRuntime(
		committed ? committedOptions(options, committed) : options
	);
};
