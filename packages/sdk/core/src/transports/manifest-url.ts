import { trimSlash } from '../libs/url';

const MANIFEST_PATH = '/manifest';

/**
 * The backend a manifest URL is served from: `manifestUrl` without its
 * `/manifest` endpoint, query and hash. Any other URL, such as a policy
 * file on a CDN, names no backend.
 *
 * @param manifestUrl - Absolute or relative `http(s)` manifest URL.
 * @internal
 */
export const projectUrlOfManifest = function projectUrlOfManifest(
	manifestUrl: string | undefined
): string | undefined {
	if (!manifestUrl) {
		return undefined;
	}
	const trimmed = trimSlash(manifestUrl.split(/[?#]/u)[0] ?? manifestUrl);
	if (!trimmed.endsWith(MANIFEST_PATH)) {
		return undefined;
	}
	try {
		// Parse relative URLs too, without mistaking a host named "manifest"
		// for the endpoint. The base is only used to inspect the pathname.
		const parsed = new URL(trimmed, 'https://inth.invalid');
		if (
			!['http:', 'https:'].includes(parsed.protocol) ||
			!parsed.pathname.endsWith(MANIFEST_PATH)
		) {
			return undefined;
		}
	} catch {
		return undefined;
	}
	return trimmed.slice(0, -MANIFEST_PATH.length);
};
