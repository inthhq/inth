/** Request headers as a Web `Headers` object or a Node header record. */
export type RequestHeaderSource =
	| Headers
	| Record<string, string | string[] | undefined>;

/**
 * The first value of header `name`, matched without regard to case.
 *
 * @param headers - The request's headers.
 * @param name - The header name.
 * @returns Its value, or `undefined`.
 * @internal
 */
export const readHeader = function readHeader(
	headers: RequestHeaderSource | undefined,
	name: string
): string | undefined {
	if (!headers) {
		return undefined;
	}
	if (typeof (headers as Headers).get === 'function') {
		return (headers as Headers).get(name) ?? undefined;
	}
	// Header names are case-insensitive, and a record keeps whatever casing
	// the runtime or the client used.
	const lower = name.toLowerCase();
	const value = Object.entries(
		headers as Record<string, string | string[] | undefined>
	).find(([key]) => key.toLowerCase() === lower)?.[1];
	return Array.isArray(value) ? value[0] : value;
};

/**
 * `headers` as a `Headers` object, keeping the first value of each.
 *
 * @param headers - The request's headers.
 * @returns The headers.
 * @internal
 */
export const toHeaders = function toHeaders(
	headers: RequestHeaderSource | undefined
): Headers {
	// A Headers object from a polyfill or another realm is not an instance
	// of this realm's Headers, and has no enumerable entries to copy.
	if (typeof (headers as Headers | undefined)?.get === 'function') {
		return headers as Headers;
	}
	const result = new Headers();
	for (const [name, value] of Object.entries(headers ?? {})) {
		const first = Array.isArray(value) ? value[0] : value;
		if (first !== undefined) {
			result.set(name, first);
		}
	}
	return result;
};
