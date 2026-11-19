import { PREFETCH_WINDOW_KEY } from '../page-globals';

/**
 * Whether an inline prefetch script stored any init request on `window`.
 *
 * @returns `true` in a browser with at least one stored request.
 * @internal
 */
export const hasPrefetchedInitialData =
	function hasPrefetchedInitialData(): boolean {
		if (typeof window === 'undefined') {
			return false;
		}
		const entries = (window as unknown as Record<string, unknown>)[
			PREFETCH_WINDOW_KEY
		];
		return (
			typeof entries === 'object' &&
			entries !== null &&
			Object.keys(entries).length > 0
		);
	};
