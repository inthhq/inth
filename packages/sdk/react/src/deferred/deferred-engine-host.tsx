'use client';

/**
 * The engine side of a deferred root, loaded on demand: the real
 * `InthProvider`, which builds and starts the runtime, and a publisher
 * that hands its kernel to the root's stand-in.
 *
 * @packageDocumentation
 * @internal
 */

import type { ConsentSnapshot } from '@inth/sdk/engine';
import type { RuntimePrefetch } from '@inth/sdk/runtime';
import type { ReactNode } from 'react';
import { useContext, useEffect, useMemo } from 'react';

import {
	KernelContext,
	ProviderServicesContext,
	StreamedPrefetchContext,
} from '../context';
import { InthProvider } from '../provider';
import type {
	InthProviderOptions,
	OwnedRuntimeProviderProps,
} from '../provider';
import type { DeferredEngine } from './create-deferred-kernel';
import type { DeferredCommitted } from './deferred-committed.model';
import { loadDeferredScriptLoader } from './deferred-registry.model';
import type { DeferredModules } from './deferred-registry.model';
import type { Recorded } from './recorded-promise.model';

const modules: DeferredModules = {
	// The root's one import of the loader, so a commit made before the
	// engine and the engine load the same chunk.
	loadScriptLoader: loadDeferredScriptLoader,
};

type Permissions = DeferredCommitted['permissions'];

const samePermissions = (left: Permissions, right: Permissions): boolean =>
	Object.keys({ ...left, ...right }).every(
		(category) =>
			left[category as keyof Permissions] ===
			right[category as keyof Permissions]
	);

/** `config` starting from the committed records, on the clock now. */
const seed = function seed(
	config: RuntimePrefetch | undefined,
	committed: DeferredCommitted
): RuntimePrefetch | undefined {
	if (!config) {
		return config;
	}
	return {
		...config,
		initialRecords: { ...config.initialRecords, ...committed.records },
		// The records were made after the server's clock; the kernel takes
		// a record newer than its clock for an invalid one.
		now: Math.max(config.now ?? 0, Date.now()),
	};
};

/**
 * The provider's `prefetch` with the committed records in it, so the
 * engine's kernel starts from the choice instead of recording it again.
 * A streamed prefetch stays a promise, settled at once when React already
 * read it.
 */
const seedPrefetch = function seedPrefetch(
	prefetch: unknown,
	committed: DeferredCommitted
): unknown {
	const pending = prefetch as Recorded<RuntimePrefetch> | undefined;
	if (typeof pending?.then !== 'function') {
		return seed(prefetch as RuntimePrefetch | undefined, committed);
	}
	if (pending.status === 'fulfilled') {
		const value = seed(pending.value, committed);
		return Object.assign(Promise.resolve(value), {
			status: 'fulfilled',
			value,
		});
	}
	// oxlint-disable-next-line promise/prefer-await-to-then -- Keeps the prefetch a promise.
	return pending.then((config) => seed(config, committed));
};

type CommittedParts = Pick<
	InthProviderOptions,
	'callbacks' | 'prefetch' | 'scripts'
>;

/**
 * The provider options after a commit: seeded records, and the root's
 * `scripts` left to the loader the commit started.
 *
 * The page heard the commit's `onPermissionsChanged`. The engine's kernel
 * reaches the same permissions on its own, from a pending policy when the
 * state streams, and reports that as a change. So a change reaches the
 * page only when it differs from what the page last heard, with that as
 * its `previous`.
 */
const committedOptions = function committedOptions(
	options: CommittedParts,
	committed: DeferredCommitted
): CommittedParts {
	const { callbacks } = options;
	const onPermissionsChanged = callbacks?.onPermissionsChanged;
	let heard = committed.permissions;
	return {
		callbacks: onPermissionsChanged
			? {
					...callbacks,
					onPermissionsChanged: (event) => {
						const next = event.snapshot.effectivePermissions;
						if (samePermissions(next, heard)) {
							return;
						}
						const previous = heard;
						heard = next;
						onPermissionsChanged({ ...event, previous });
					},
				}
			: callbacks,
		prefetch: seedPrefetch(
			options.prefetch,
			committed
		) as InthProviderOptions['prefetch'],
		scripts: committed.ownsScripts ? undefined : options.scripts,
	};
};

/** Attach anyway when the policy is still pending after this long. */
const PENDING_ATTACH_MS = 5000;

const Publisher = ({
	attach,
	committed,
}: {
	attach: (engine: DeferredEngine) => void;
	committed?: DeferredCommitted;
}): null => {
	const kernel = useContext(KernelContext);
	const services = useContext(ProviderServicesContext);
	const streamed = useContext(StreamedPrefetchContext);
	// A passive effect, so it runs after the provider started the runtime
	// (an earlier sibling's effect): stored records are applied by then.
	useEffect(() => {
		if (!(kernel && services)) {
			return;
		}
		const publish = () => attach({ kernel, modules, services, streamed });
		if (committed) {
			// The commit queued its save; send it from the started runtime.
			(kernel as { replaySaves?: () => void }).replaySaves?.();
		}
		// The page already shows the resolved state; attaching while a
		// streamed init or userConsent is still settling would flash the pending one.
		const currentSnapshot = kernel.getSnapshot();
		if (!currentSnapshot.policyPending && !currentSnapshot.userConsentPending) {
			publish();
			return;
		}
		const wait = {
			done: false,
			off: (): void => undefined,
			timer: undefined as ReturnType<typeof setTimeout> | undefined,
		};
		const stop = () => {
			wait.done = true;
			wait.off();
			clearTimeout(wait.timer);
		};
		const finish = () => {
			if (!wait.done) {
				stop();
				publish();
			}
		};
		wait.off = kernel.subscribe((snapshot: ConsentSnapshot) => {
			if (!snapshot.policyPending && !snapshot.userConsentPending) {
				finish();
			}
		});
		wait.timer = setTimeout(finish, PENDING_ATTACH_MS);
		return stop;
	}, [attach, committed, kernel, services, streamed]);
	return null;
};

/** @internal */
export interface DeferredEngineHostProps {
	options: InthProviderOptions;
	attach: (engine: DeferredEngine) => void;
	/** A banner choice the root committed before the engine loaded. */
	committed?: DeferredCommitted;
	/** What the server rendered after the page, to hydrate in place. */
	children?: ReactNode;
}

/**
 * Builds the runtime for a deferred root and attaches its kernel.
 *
 * @internal
 */
export const DeferredEngineHost = ({
	attach,
	children,
	committed,
	options,
}: DeferredEngineHostProps) => {
	const { callbacks, prefetch, scripts } = options;
	// Kept while the root's own values are, so the provider sees no update.
	const parts = useMemo(
		() =>
			committed
				? committedOptions({ callbacks, prefetch, scripts }, committed)
				: undefined,
		[callbacks, committed, prefetch, scripts]
	);
	const effective = parts ? { ...options, ...parts } : options;
	return (
		// The deferred root checked the backend when it took these options.
		<InthProvider options={effective as OwnedRuntimeProviderProps['options']}>
			<Publisher
				attach={attach}
				committed={committed}
			/>
			{children}
		</InthProvider>
	);
};
