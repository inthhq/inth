/**
 * `url` without one trailing `/`.
 *
 * @internal
 */
export const trimSlash = function trimSlash(url: string): string {
	return url.endsWith('/') ? url.slice(0, -1) : url;
};
