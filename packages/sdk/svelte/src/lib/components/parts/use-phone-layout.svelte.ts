import { PHONE_LAYOUT_QUERY } from '@inth/sdk/engine';

/**
 * Whether the phone layout applies. The server renders desktop; the
 * browser switches once mounted, keeping every node (ARCH-01).
 *
 * Call while a component initializes.
 *
 * @internal
 */
export const usePhoneLayout = function usePhoneLayout(): {
	readonly phone: boolean;
} {
	let phone = $state(false);
	// After mount, so hydration adopts the server's desktop markup first.
	$effect(() => {
		if (typeof window === 'undefined' || !window.matchMedia) {
			return;
		}
		const query = window.matchMedia(PHONE_LAYOUT_QUERY);
		phone = query.matches;
		const listener = () => {
			phone = query.matches;
		};
		query.addEventListener('change', listener);
		return () => query.removeEventListener('change', listener);
	});
	return {
		get phone() {
			return phone;
		},
	};
};
