import { trimSlash } from '../libs/url';
import { V1_ROUTES } from './v1/routes';

/** The backend's manifest route, then a same-origin consent route's. */
const MANIFEST_PATHS = [V1_ROUTES.manifest, '/manifest'] as const;

/**
 * The project URL a manifest URL is served from: `manifestUrl` without its
 * manifest route, query and hash. Any other URL, such as a policy file on a
 * CDN, names no project.
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
	const path = MANIFEST_PATHS.find((candidate) => trimmed.endsWith(candidate));
	if (path === undefined) {
		return undefined;
	}
	try {
		// Parse relative URLs too, without mistaking a host named "manifest"
		// for the endpoint. The base is only used to inspect the pathname.
		const parsed = new URL(trimmed, 'https://inth.invalid');
		if (
			!['http:', 'https:'].includes(parsed.protocol) ||
			!parsed.pathname.endsWith(path)
		) {
			return undefined;
		}
	} catch {
		return undefined;
	}
	return trimmed.slice(0, -path.length);
};
