'use client';

import { getEventDispatcher } from '@inth/sdk/events';
import type {
	EventDispatcher,
	RuntimeEventDispatcherOptions,
} from '@inth/sdk/events';
import { useContext, useMemo } from 'react';

import { ProviderServicesContext } from './context';
import { useCommittedRef } from './hooks/use-committed-ref';

/**
 * Get the provider's event dispatcher.
 *
 * It delivers to the scripts the provider registered, plus any you pass, and
 * checks consent when it sends, so a revoked category stops the next event.
 * The returned object stays the same for the provider's lifetime, and
 * pageview de-duplication survives navigation, consent changes and the
 * `enabled` toggle.
 *
 * @param options - Extra `scripts`, SPA `pageviews` integrations and
 * injectable `globals`. The latest committed options apply on each call.
 * @returns A dispatcher with `track` and `pageview`.
 * @throws {Error} When called outside `InthProvider`.
 * @example
 * ```tsx
 * const events = useEventDispatcher({ pageviews: ['posthog'] });
 * const pathname = usePathname();
 * useEffect(() => events.pageview(pathname), [events, pathname]);
 * ```
 */
export const useEventDispatcher = function useEventDispatcher(
	options: RuntimeEventDispatcherOptions = {}
): EventDispatcher {
	const services = useContext(ProviderServicesContext);
	if (!services) {
		throw new Error(
			'inth: useEventDispatcher() needs <InthProvider> from @inth/react.'
		);
	}
	const latest = useCommittedRef(options);
	// The provider's services object can change (the `enabled` toggle);
	// the dispatcher keeps its identity and reads the latest one.
	const current = useCommittedRef(services);
	return useMemo(() => {
		// Read the runtime when sending: under a deferred root it is set
		// once the engine attaches.
		const send = (deliver: (dispatcher: EventDispatcher) => void): void => {
			const live = current.current;
			if (live.runtime) {
				deliver(getEventDispatcher(live.runtime, latest.current));
				return;
			}
			// Delivered, in order, once the engine attached. Waiting does not
			// load it: until then the visitor has granted nothing optional.
			// oxlint-disable-next-line promise/prefer-await-to-then -- Fire and forget, like the dispatcher.
			void live.ready?.then(() => {
				deliver(getEventDispatcher(current.current.runtime, latest.current));
			});
		};
		return {
			pageview: (path) => send((dispatcher) => dispatcher.pageview(path)),
			track: (event, properties) =>
				send((dispatcher) => dispatcher.track(event, properties)),
		};
	}, [current, latest]);
};

export type { EventDispatcher, EventProperties } from '@inth/sdk/events';
export type { RuntimeEventDispatcherOptions as UseEventDispatcherOptions };
