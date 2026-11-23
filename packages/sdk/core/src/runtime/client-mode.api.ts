/**
 * The requests a client root's lazy transports send before the module that
 * reads their response has loaded.
 *
 * @packageDocumentation
 * @internal
 */

/**
 * The global `fetch`, bound, or `undefined` where there is none, such as
 * on a server without one.
 *
 * @internal
 */
export const readGlobalFetch = function readGlobalFetch():
	| typeof globalThis.fetch
	| undefined {
	return typeof globalThis.fetch === 'function'
		? globalThis.fetch.bind(globalThis)
		: undefined;
};

/** A request sent before the transport that reads its response loaded. */
export interface EarlyRequest {
	url: string;
	init: RequestInit & { headers: Record<string, string> };
	response: Promise<Response>;
}

/** Sends a request now; nothing reading it is not an unhandled rejection. */
export const sendEarly = function sendEarly(
	fetch: typeof globalThis.fetch,
	url: string,
	init: EarlyRequest['init']
): EarlyRequest {
	const response = fetch(url, init);
	void (async () => {
		try {
			await response;
		} catch {
			// The transport that reads the response reports the failure.
		}
	})();
	return { init, response, url };
};

const isSameRequest = function isSameRequest(
	early: EarlyRequest,
	input: Parameters<typeof globalThis.fetch>[0],
	init: RequestInit | undefined
): boolean {
	return (
		input === early.url &&
		init?.method === early.init.method &&
		init?.credentials === early.init.credentials &&
		JSON.stringify(init?.headers) === JSON.stringify(early.init.headers)
	);
};

/**
 * Hands the early response to the loaded transport's first request that
 * matches it exactly; every other request goes out through `fetch`.
 */
export const withEarlyRequest = function withEarlyRequest(
	fetch: typeof globalThis.fetch,
	early: EarlyRequest
): typeof globalThis.fetch {
	let pending: EarlyRequest | undefined = early;
	const fetchWithEarlyRequest = (
		input: Parameters<typeof globalThis.fetch>[0],
		init?: RequestInit
	): Promise<Response> => {
		if (pending && isSameRequest(pending, input, init)) {
			const { response } = pending;
			pending = undefined;
			return response;
		}
		return fetch(input, init);
	};
	return fetchWithEarlyRequest as typeof globalThis.fetch;
};
