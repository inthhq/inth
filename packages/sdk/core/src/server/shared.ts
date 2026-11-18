/**
 * Small values and helpers every server adapter needs, kept in one module
 * so a copy cannot drift: the default route prefix, the in-process origin,
 * path trimming, the canonical consent request headers and the nonce shape.
 */
import type { ConsentRequestHeaderInputs } from '@inth/sdk-schema/types';

import type { ManifestFetch } from '../libs/manifest-cache-runtime';

/**
 * Where every adapter mounts its consent routes unless told otherwise. A
 * render treats URLs under it on its own origin as its own routes.
 */
export const DEFAULT_CONSENT_ROUTE_PREFIX = '/api/inth';

/**
 * Origin a `/`-relative URL is placed on when the adapter answers its own
 * routes in-process. It is never contacted: requests to it go to the
 * in-process fetch as a path. Loopback, so the cleartext rules treat the
 * in-process hop as local.
 */
export const IN_PROCESS_ORIGIN = 'http://localhost';

/**
 * A nonce an adapter may copy into HTML it writes: base64 characters only,
 * so it cannot close the attribute it sits in.
 */
export const SAFE_NONCE = /^[\w+/=-]+$/u;

/**
 * Removes leading and trailing slashes in linear time, keeping interior
 * segments: `/init/` becomes `init`, `subjects/sub_1/` becomes
 * `subjects/sub_1`.
 *
 * @param value - A path or path segment.
 * @returns The path without surrounding slashes.
 */
export const trimPathSlashes = function trimPathSlashes(value: string): string {
	let start = 0;
	let end = value.length;
	while (end > 0 && value[end - 1] === '/') {
		end -= 1;
	}
	while (start < end && value[start] === '/') {
		start += 1;
	}
	return value.slice(start, end);
};

/** Where {@link writeConsentInputHeaders} writes. */
export type ConsentInputHeaderTarget =
	| Pick<Headers, 'set'>
	| Record<string, string>;

/**
 * Writes resolved geo, language and GPC as the canonical consent request
 * headers (`x-c15t-country`, `x-c15t-region`, `accept-language`,
 * `sec-gpc`), the form every reader downstream understands. Inputs that are
 * unset are left out.
 *
 * @param target - A `Headers` object or a plain header record.
 * @param inputs - The resolved inputs.
 * @returns The target.
 * @throws {TypeError} When `target` is an immutable `Headers` object.
 */
export const writeConsentInputHeaders = function writeConsentInputHeaders<
	Target extends ConsentInputHeaderTarget,
>(target: Target, inputs: ConsentRequestHeaderInputs): Target {
	const set =
		typeof (target as Headers).set === 'function'
			? (name: string, value: string) => (target as Headers).set(name, value)
			: (name: string, value: string) => {
					(target as Record<string, string>)[name] = value;
				};
	if (inputs.country) {
		set('x-c15t-country', inputs.country);
	}
	if (inputs.region) {
		set('x-c15t-region', inputs.region);
	}
	if (inputs.language) {
		set('accept-language', inputs.language);
	}
	if (inputs.gpc !== undefined) {
		set('sec-gpc', inputs.gpc ? '1' : '0');
	}
	return target;
};

/**
 * Sends {@link IN_PROCESS_ORIGIN} URLs to an in-process fetch as paths, so
 * the manifest cache can key them by URL while the fetch sees a path.
 *
 * @param localFetch - The adapter's in-process fetch.
 * @returns A fetch that takes in-process URLs.
 * @internal
 */
export const toPathFetch = function toPathFetch(
	localFetch: ManifestFetch
): ManifestFetch {
	return (input, init) => {
		const url = new URL(input instanceof Request ? input.url : input);
		return localFetch(`${url.pathname}${url.search}`, init);
	};
};
