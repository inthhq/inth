import { PHONE_LAYOUT_QUERY } from '@inth/sdk-core';

/**
 * Whether the phone layout applies, and a way to follow it. A browser
 * without `matchMedia` gets desktop.
 */
export const watchPhoneLayout = function watchPhoneLayout(
	onChange: () => void
): { matches: () => boolean; stop: () => void } {
	if (
		typeof window === 'undefined' ||
		typeof window.matchMedia !== 'function'
	) {
		return { matches: () => false, stop: () => undefined };
	}
	const query = window.matchMedia(PHONE_LAYOUT_QUERY);
	query.addEventListener('change', onChange);
	return {
		matches: () => query.matches,
		stop: () => query.removeEventListener('change', onChange),
	};
};
