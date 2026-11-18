/**
 * `url` without one trailing `/`.
 *
 * @param url - A URL or path.
 * @returns The URL without its trailing slash.
 * @internal
 */
export const trimSlash = function trimSlash(url: string): string {
	return url.endsWith('/') ? url.slice(0, -1) : url;
};
