'use client';

import {
	forwardRef as createForwardRef,
	lazy,
	Suspense,
	useState,
	useSyncExternalStore,
} from 'react';
import type { ComponentType } from 'react';

/**
 * Share an on-demand module across exports and preloading. Ready client
 * retries run synchronously; Suspense retains server rendering and hydration.
 *
 * A failed import is never kept. A rendered export waiting on it throws the
 * error to its error boundary, and the next export to mount, or the next
 * preload, calls `importModule` again: a dialog whose chunk failed once opens
 * on the next try, without a page load.
 *
 * @internal
 */
export const createDeferredModule = <ModuleType,>(
	importModule: () => Promise<ModuleType>
) => {
	type Snapshot =
		| { status: 'pending' }
		| { status: 'ready'; module: ModuleType }
		| { status: 'error'; error: unknown; failure: number };
	const pending: Snapshot = { status: 'pending' };
	let snapshot: Snapshot = pending;
	let promise: Promise<ModuleType> | undefined;
	// Whether a rendered export is waiting on the current import. A preload
	// nobody rendered from yet (hover, focus or idle warming) fails quietly:
	// no mounted export has a failure to show.
	let rendered = false;
	// Imports that failed while an export waited on them. An export throws
	// only a failure that happened after it mounted, and each failure gets
	// fresh lazy components, since `lazy` keeps a rejection for good.
	let failures = 0;
	const listeners = new Set<() => void>();
	const getSnapshot = () => snapshot;
	const getServerSnapshot = () => pending;
	const load = (fromRender: boolean) => {
		if (promise) {
			rendered ||= fromRender;
			return promise;
		}
		rendered = fromRender;
		promise = (async () => {
			try {
				const module = await importModule();
				snapshot = { module, status: 'ready' };
				return module;
			} catch (error) {
				promise = undefined;
				if (rendered) {
					failures += 1;
					snapshot = { error, failure: failures, status: 'error' };
				}
				throw error;
			}
		})();
		return promise;
	};
	let notificationQueued = false;
	const publish = () => {
		if (notificationQueued) {
			return;
		}
		notificationQueued = true;
		// React.lazy must mark its own promise resolved before the synchronous
		// subscription update. Preserve the same lazy element during hydration.
		queueMicrotask(() => {
			notificationQueued = false;
			snapshot = { ...snapshot };
			for (const listener of listeners) {
				listener();
			}
		});
	};
	const subscribe = (listener: () => void) => {
		listeners.add(listener);
		return () => {
			listeners.delete(listener);
		};
	};
	return {
		component<Props extends object>(
			select: (module: ModuleType) => ComponentType<Props>
		): ComponentType<Props> {
			const createLazy = () =>
				lazy(() => {
					const selected = (async () => {
						const module = await load(true);
						return { default: select(module) };
					})();
					// oxlint-disable-next-line promise/prefer-await-to-then -- Register before React attaches its handler, then notify in the following microtask.
					void selected.catch(() => undefined).then(publish);
					return selected;
				});
			let LazyComponent = createLazy();
			let lazyFailures = 0;
			/** The lazy component for the import after the latest failure. */
			const currentLazy = () => {
				if (lazyFailures !== failures) {
					lazyFailures = failures;
					LazyComponent = createLazy();
				}
				return LazyComponent;
			};
			// React 18 drops a `ref` passed to a function component; forward it
			// to the loaded part, many of which take one.
			const DeferredComponent = createForwardRef<unknown, Props>(
				(props, ref) => {
					const current = useSyncExternalStore(
						subscribe,
						getSnapshot,
						getServerSnapshot
					);
					// oxlint-disable-next-line react/hook-use-state -- Read once at mount; never set.
					const [mountedAfter] = useState(() => failures);
					if (current.status === 'error' && current.failure > mountedAfter) {
						throw current.error;
					}
					const Lazy = currentLazy();
					// The subscription retries this stable boundary synchronously instead
					// of waiting for React's throttled default retry.
					return (
						<Suspense fallback={null}>
							<Lazy
								{...(props as Props)}
								ref={ref}
							/>
						</Suspense>
					);
				}
			);
			DeferredComponent.displayName = 'DeferredComponent';
			return DeferredComponent as unknown as ComponentType<Props>;
		},
		async preload(): Promise<void> {
			try {
				await load(false);
			} catch {
				// Not kept: the next preload or rendered export imports again, and a
				// rendered export reports its own failure to its error boundary.
			}
		},
	};
};
