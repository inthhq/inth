/**
 * The consent route's guard against an upstream URL that leads back into
 * the route: a `projectUrl` or `manifestUrl` on or beneath the path the
 * route is mounted at. Every request the route sent upstream would arrive
 * at the route again.
 */
import { trimPathSlashes } from './server-adapter.model';

/** Resolves a relative URL's path, `..` segments included. Never contacted. */
const RELATIVE_BASE = 'http://inth.invalid';

/** A configured upstream URL, read for the loop check. */
interface Upstream {
	/** The option that holds it, for the message. */
	name: 'manifestUrl' | 'projectUrl';
	/** Its path, `..` resolved. */
	pathname: string;
	/** `null` for a `/`-relative URL; the host only for `//host/…`. */
	origin: { host: string; proto: string | undefined } | null;
}

const isRelativePath = (url: string): boolean =>
	url.startsWith('/') && !url.startsWith('//');

const readUpstream = function readUpstream(
	name: Upstream['name'],
	url: string
): Upstream | undefined {
	try {
		if (isRelativePath(url)) {
			return {
				name,
				origin: null,
				pathname: new URL(url, RELATIVE_BASE).pathname,
			};
		}
		const protocolRelative = url.startsWith('//');
		// The scheme here only parses the URL; a protocol-relative one takes
		// each request's own when it is checked.
		const parsed = new URL(protocolRelative ? `http:${url}` : url);
		return {
			name,
			origin: {
				host: parsed.host,
				proto: protocolRelative ? undefined : parsed.protocol.slice(0, -1),
			},
			pathname: parsed.pathname,
		};
	} catch {
		return undefined;
	}
};

/** Whether `pathname` is `mount` or beneath it, on a segment boundary. */
const onOrBelow = function onOrBelow(pathname: string, mount: string): boolean {
	const path = `/${trimPathSlashes(pathname)}`;
	return path === mount || path.startsWith(`${mount}/`);
};

/** The configured upstream URLs, parsed once. */
export const readUpstreams = function readUpstreams(options: {
	projectUrl?: string;
	manifestUrl?: string;
}): Upstream[] {
	return (
		[
			['projectUrl', options.projectUrl],
			['manifestUrl', options.manifestUrl],
		] as const
	).flatMap(([name, url]) => {
		const upstream = url ? readUpstream(name, url) : undefined;
		return upstream ? [upstream] : [];
	});
};

/**
 * The relative upstream URL on or beneath the route's mount, when the
 * adapter knows the mount at setup.
 *
 * @param mount - Where the route is mounted, such as `/api/inth`.
 * @returns A message naming the option, or `undefined`.
 */
export const relativeLoop = function relativeLoop(
	upstreams: readonly Upstream[],
	mount: string
): string | undefined {
	const loop = upstreams.find(
		(upstream) =>
			upstream.origin === null && onOrBelow(upstream.pathname, mount)
	);
	return loop
		? `\`${loop.name}\` is on or beneath the consent route (${mount}), so the route would call itself. Pass the Inth backend's URL.`
		: undefined;
};

/**
 * The upstream URL that leads back to this route for one request: a
 * relative one on or beneath the mount, or an absolute one on the request's
 * own site and beneath the mount.
 *
 * @param site - The request's site as the route sees it.
 * @returns A message naming the option, or `undefined`.
 */
export const requestLoop = function requestLoop(
	upstreams: readonly Upstream[],
	mount: string,
	site: { host: string; proto: string }
): string | undefined {
	const loop = upstreams.find(
		(upstream) =>
			onOrBelow(upstream.pathname, mount) &&
			(upstream.origin === null ||
				(upstream.origin.host === site.host &&
					(upstream.origin.proto === undefined ||
						upstream.origin.proto === site.proto)))
	);
	return loop
		? `\`${loop.name}\` points beneath the consent route on this site (${mount}), so the route would call itself. Pass the Inth backend's URL.`
		: undefined;
};

/**
 * Where a catch-all route is mounted: the request path without the part
 * below the route (`context.path`). `undefined` for a route mounted at the
 * site root, which the check leaves alone.
 *
 * @param below - The path below the route.
 * @returns The mount, such as `/api/inth`.
 */
export const mountOf = function mountOf(
	pathname: string,
	below: string
): string | undefined {
	const path = `/${trimPathSlashes(pathname)}`;
	const rest = trimPathSlashes(below);
	if (rest === '') {
		return path === '/' ? undefined : path;
	}
	if (!path.endsWith(`/${rest}`)) {
		return undefined;
	}
	const mount = path.slice(0, -(rest.length + 1));
	return mount === '' ? undefined : mount;
};
