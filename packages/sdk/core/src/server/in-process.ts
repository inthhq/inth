import type { ManifestFetch } from '../libs/manifest-cache-runtime';

/**
 * Origin a `/`-relative URL is placed on when an adapter answers its own
 * routes in-process, so the manifest cache can key it. Never contacted:
 * {@link toPathFetch} sends its requests to the adapter as paths.
 * Loopback, so the cleartext rules treat the in-process hop as local.
 *
 * @internal
 */
export const IN_PROCESS_ORIGIN = 'http://localhost';

/**
 * Sends {@link IN_PROCESS_ORIGIN} URLs to an in-process fetch as paths.
 *
 * @param localFetch - The adapter's in-process fetch.
 * @returns A fetch that takes absolute URLs.
 * @internal
 */
export const toPathFetch = function toPathFetch(
	localFetch: ManifestFetch
): ManifestFetch {
	return (input, init) => {
		const url = new URL(input instanceof Request ? input.url : input);
		return localFetch(`${url.pathname}${url.search}`, init);
	};
};
