/**
 * The page `fetch` the FullStory snippet saves and wraps, as
 * @fullstory/snippet 2.1.0 does.
 */

/** The page's `fetch`, read before FullStory wraps it. */
export const readPageFetch = (): typeof fetch => window.fetch;

/**
 * Replaces the page's `fetch` with one that calls the `fetch` FullStory saved
 * (`saved()`), keeping the original's properties.
 */
export const routePageFetchThrough = (
	saved: () => typeof fetch | undefined
): void => {
	if (window.fetch) {
		window.fetch = Object.assign(function instrumentedFetch(
			this: Window,
			...args: Parameters<typeof fetch>
		): Promise<Response> {
			const original = saved();
			if (!original) {
				throw new Error('fullStory: saved fetch is unavailable');
			}
			return original.apply(this, args);
		}, window.fetch);
	}
};
