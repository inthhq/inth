// Its own module so a first-load path that only checks for a cookie does
// not bring in the cookie writers and their serialization.

/**
 * Finds one cookie's raw value inside a `Cookie` header or
 * `document.cookie` string.
 *
 * @param cookieHeader - Raw `Cookie` header value, or `document.cookie`.
 * @param name - Cookie name to find
 * @returns The raw value exactly as stored, or `undefined` when the cookie
 * is absent. No decoding or parsing happens here.
 *
 * @internal
 */
export const readCookieValueFromHeader = function readCookieValueFromHeader(
	cookieHeader: string | undefined,
	name: string
): string | undefined {
	if (!cookieHeader) {
		return undefined;
	}

	const nameEQ = `${name}=`;
	for (const cookie of cookieHeader.split(';')) {
		const trimmed = cookie.trim();
		if (trimmed.startsWith(nameEQ)) {
			return trimmed.substring(nameEQ.length);
		}
	}

	return undefined;
};
