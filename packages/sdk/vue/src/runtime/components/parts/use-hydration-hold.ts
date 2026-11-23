import { onScopeDispose } from 'vue';

import { useConsentKernelContext } from '../../composables/kernel';

/**
 * Keep the Nuxt plugin's deferred banner on the server's snapshot until
 * the returned function runs, or this component unmounts.
 *
 * A part with a chunk of its own (a container, the all-in-one options)
 * hydrates once that chunk arrives, which can be after the banner reported
 * that it hydrated. Reading the live snapshot then would render something
 * else than the server's HTML. Take a hold while such a part renders from
 * server HTML, and release it once the part mounts or its chunk fails.
 * Outside the deferred context, or once the banner reads the live
 * snapshot, it holds nothing.
 *
 * @internal
 */
export const useHydrationHold = function useHydrationHold(): () => void {
	const view = useConsentKernelContext().bannerView;
	if (!view || typeof window === 'undefined') {
		return () => undefined;
	}
	const release = view.hold();
	onScopeDispose(release);
	return release;
};
