/**
 * The browser's `GET /manifest` request. A module of its own so a client
 * that sends the request early, while the resolver chunk loads, builds the
 * same request the resolver would, without importing the resolver.
 */
import { inthProtocolHeaders } from './version-header';

/**
 * Builds the fetch options for the browser's manifest request.
 *
 * @internal
 */
export const createManifestRequestInit = function createManifestRequestInit(
	options: {
		credentials?: RequestCredentials;
		headers?: Record<string, string>;
	} = {}
): RequestInit & { headers: Record<string, string> } {
	const init: RequestInit & { headers: Record<string, string> } = {
		headers: {
			accept: 'application/json',
			...inthProtocolHeaders,
			...options.headers,
		},
		method: 'GET',
	};
	if (options.credentials !== undefined) {
		init.credentials = options.credentials;
	}
	return init;
};
