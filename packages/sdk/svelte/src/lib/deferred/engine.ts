/**
 * `ConsentRoot`'s consent engine in the browser: the runtime it renders
 * once loaded. The deferred runtime (`runtime.ts`) loads this chunk after
 * the page for a visitor who still has to choose, and at once for every
 * other visitor, whose server render preloads it.
 *
 * @packageDocumentation
 * @internal
 */

import type { ProviderTransportFactory } from '@inth/sdk/engine';
import type { RuntimePrefetch } from '@inth/sdk/runtime';
import { clientMode } from '@inth/sdk/runtime/client-mode';
import type {
	ConsentProviderRuntime,
	ConsentProviderRuntimeOptions,
} from '@inth/sdk/runtime/provider';

import { createOwnedRuntime } from '../owned-runtime';
import type { ConsentRootState } from '../types';
import type { DeferredCommitted } from './commit';

export { preloadSavePath } from '@inth/sdk/runtime/save-preload';

/** What `ConsentRoot` read before it loaded the engine. @internal */
export interface RootEngineInput {
	/** `runtimeOptionsFor` the root's options; `prefetch` is the state's. */
	options: Omit<ConsentProviderRuntimeOptions, 'mode'>;
	/** `data.consent`, from `loadConsent`. */
	state: ConsentRootState;
	/** The root's own transport, when it was given one. */
	mode?: ProviderTransportFactory;
	/** A choice the deferred runtime recorded before the engine loaded. */
	committed?: DeferredCommitted;
}

/** The engine and the transport it was built with. @internal */
export interface RootEngine {
	runtime: ConsentProviderRuntime;
	transport: ProviderTransportFactory;
}

type Permissions = DeferredCommitted['permissions'];

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
	options: RootEngineInput['options'],
	committed: DeferredCommitted
): RootEngineInput['options'] {
	const prefetch = options.prefetch as RuntimePrefetch | undefined;
	const next: RootEngineInput['options'] = {
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
 * Builds the root's runtime in the browser, from the server's state and,
 * after a deferred commit, from the committed records.
 *
 * @param input - What the root read.
 * @returns The runtime, not started, and its transport.
 * @internal
 */
export const createRootEngine = function createRootEngine(
	input: RootEngineInput
): RootEngine {
	const stateMode = input.state.mode;
	// No mode at all is `manifest()`, as in `c15tHandle()`.
	const transport = clientMode(
		input.mode ?? stateMode,
		input.state,
		'@inth/svelte/testing'
	);
	const options = input.committed
		? committedOptions(input.options, input.committed)
		: input.options;
	return {
		runtime: createOwnedRuntime({ ...options, mode: transport }),
		transport,
	};
};
