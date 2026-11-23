/**
 * The request behind the `useFetch` stub: a JSON `GET` (or `method`) that
 * throws on a non-2xx response.
 */
export const fetchStubJson = async function fetchStubJson<T>(
	target: string,
	init: { headers?: Record<string, string>; method: string }
): Promise<T> {
	const response = await fetch(target, {
		headers: init.headers,
		method: init.method,
	});

	if (!response.ok) {
		throw new Error(
			`[inth] fetch failed (${response.status} ${response.statusText})`
		);
	}

	return (await response.json()) as T;
};
