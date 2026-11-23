/** URL query helpers shared by the request-parameter modules. */

const PLUS = /\+/gu;

const decodeKey = function decodeKey(raw: string): string {
	try {
		return decodeURIComponent(raw.replace(PLUS, ' '));
	} catch {
		return raw;
	}
};

/**
 * Set query parameters on a URL. A relative URL stays relative and a
 * fragment stays last.
 *
 * Each parameter replaces any the URL already has under the same name, so
 * it appears once and the new value wins. The URL's other parameters keep
 * their order and their original encoding.
 *
 * @param url - The request URL, possibly empty.
 * @param params - The parameters. Nothing changes when empty.
 * @internal
 */
export const appendSearchParams = function appendSearchParams(
	url: string,
	params: URLSearchParams
): string {
	const query = params.toString();
	if (!query) {
		return url;
	}
	const hash = url.indexOf('#');
	const base = hash === -1 ? url : url.slice(0, hash);
	const fragment = hash === -1 ? '' : url.slice(hash);
	const start = base.indexOf('?');
	if (start === -1) {
		return `${base}?${query}${fragment}`;
	}
	const names = new Set(params.keys());
	const kept = base
		.slice(start + 1)
		.split('&')
		.filter((part) => {
			if (!part) {
				return false;
			}
			const equals = part.indexOf('=');
			return !names.has(
				decodeKey(equals === -1 ? part : part.slice(0, equals))
			);
		});
	kept.push(query);
	return `${base.slice(0, start)}?${kept.join('&')}${fragment}`;
};

/**
 * The query parameters of a request URL, absolute or relative, a `URL`, or
 * the parameters themselves. A `?` inside a fragment is not a query.
 *
 * @returns The parameters; empty when the URL has no query.
 */
export const readSearchParams = function readSearchParams(
	source: string | URL | URLSearchParams
): URLSearchParams {
	if (source instanceof URLSearchParams) {
		return source;
	}
	if (source instanceof URL) {
		return source.searchParams;
	}
	const fragment = source.indexOf('#');
	const base = fragment === -1 ? source : source.slice(0, fragment);
	const query = base.indexOf('?');
	return new URLSearchParams(query === -1 ? '' : base.slice(query + 1));
};
