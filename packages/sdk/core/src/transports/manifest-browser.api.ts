/**
 * The `fetch` the browser manifest transport sends its manifest and geo
 * requests with.
 *
 * @packageDocumentation
 * @internal
 */

/**
 * `fetch`, or the global one, bound. Read when a request goes out, so a
 * `fetch` the page replaces later is the one used.
 *
 * @internal
 */
export const resolveManifestFetch = function resolveManifestFetch(
	fetch: typeof globalThis.fetch | undefined
): typeof globalThis.fetch {
	return fetch ?? globalThis.fetch.bind(globalThis);
};
