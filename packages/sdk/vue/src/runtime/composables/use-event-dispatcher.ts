import { getEventDispatcher } from '@inth/sdk/events';
import type {
	EventDispatcher,
	RuntimeEventDispatcherOptions,
} from '@inth/sdk/events';
import { toValue } from 'vue';
import type { MaybeRefOrGetter } from 'vue';

import { useConsentKernelContext } from './use-consent-kernel';

/**
 * Get the app's event dispatcher.
 *
 * It delivers to the `scripts` in the Inth config, plus any you pass, and
 * checks consent when it sends, so a revoked category stops the next event.
 * Every dispatcher in the app shares one pageview history, so a component
 * that mounts again does not replay a navigation.
 *
 * @param options - Extra `scripts`, SPA `pageviews` integrations and
 * injectable `globals`. A ref or getter is read on each call.
 * @returns A dispatcher with `track` and `pageview`.
 * @throws {Error} When the Inth plugin is not installed.
 * @example
 * ```ts
 * const events = useEventDispatcher({ pageviews: ['posthog'] });
 * const route = useRoute();
 * watch(() => route.fullPath, (path) => events.pageview(path), { immediate: true });
 * ```
 */
export const useEventDispatcher = function useEventDispatcher(
	options: MaybeRefOrGetter<RuntimeEventDispatcherOptions> = {}
): EventDispatcher {
	const context = useConsentKernelContext();
	// Read the runtime when sending: under the Nuxt plugin's deferred
	// context it is set once the engine attaches.
	const send = (deliver: (dispatcher: EventDispatcher) => void): void => {
		const { runtime } = context;
		if (runtime) {
			deliver(getEventDispatcher(runtime, toValue(options)));
			return;
		}
		// Delivered, in order, once the engine attached. Waiting does not
		// load it: until then the visitor has granted nothing optional.
		// oxlint-disable-next-line promise/prefer-await-to-then -- Fire and forget, like the dispatcher.
		void context.ready.then(() => {
			if (context.runtime) {
				deliver(getEventDispatcher(context.runtime, toValue(options)));
			}
		});
	};
	return {
		pageview: (path) => send((dispatcher) => dispatcher.pageview(path)),
		track: (event, properties) =>
			send((dispatcher) => dispatcher.track(event, properties)),
	};
};

export type { EventDispatcher, EventProperties } from '@inth/sdk/events';
export type { RuntimeEventDispatcherOptions as UseEventDispatcherOptions };
