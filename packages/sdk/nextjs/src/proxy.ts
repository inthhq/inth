import type { StorageConfig } from '@inth/sdk/engine';
import { extractConsentRequestInputs } from '@inth/sdk/schema/types';
import { writeConsentInputHeaders } from '@inth/sdk/server';
import { NextResponse } from 'next/server.js';
import type { NextRequest } from 'next/server.js';

export interface InthProxyOptions {
	/**
	 * Also persist normalized geo into cookies for runtimes that do not keep
	 * middleware request headers visible to RSC.
	 */
	cookie?: boolean | { countryName?: string; regionName?: string };

	/**
	 * @deprecated Inth no longer sets a subject cookie, so the proxy reads
	 * nothing from this. Removed in v4.
	 */
	storage?: Pick<
		StorageConfig,
		'crossSubdomain' | 'defaultDomain' | 'defaultExpiryDays' | 'storageKey'
	>;

	/**
	 * @deprecated Inth no longer sets a subject cookie, so the proxy reads
	 * nothing from this. Removed in v4.
	 */
	trustForwardedHeaders?: boolean;

	/**
	 * @deprecated Inth no longer sets a subject cookie, so this does
	 * nothing. Removed in v4.
	 */
	subjectCookie?: boolean;
}

const DEFAULT_COUNTRY_COOKIE = 'inth-country';
const DEFAULT_REGION_COOKIE = 'inth-region';

/**
 * Creates a `NextResponse.next()` that forwards normalized consent headers.
 *
 * Use from `proxy.ts` (Next 16) or `middleware.ts` (Next 15). It forwards
 * geo the deployment platform exposes to the proxy but strips before Server
 * Components or Route Handlers. It sets no cookie unless `cookie` asks for
 * the geo cookies. `@inth/nextjs/middleware` exports the same function as
 * `inthMiddleware`.
 *
 * @example
 * ```ts
 * // proxy.ts
 * import { inthProxy } from '@inth/nextjs/proxy';
 * import type { NextRequest } from 'next/server';
 *
 * export const proxy = (request: NextRequest) => inthProxy(request);
 * ```
 *
 * @param request - The incoming Next.js request.
 * @param options - Header and cookie forwarding options.
 * @returns A response that forwards normalized consent headers.
 */
export const inthProxy = function inthProxy(
	request: NextRequest,
	options: InthProxyOptions = {}
): NextResponse {
	const requestHeaders = new Headers(request.headers);
	const inputs = extractConsentRequestInputs(request.headers);

	// The visitor's own `accept-language` list stays for the app to read.
	writeConsentInputHeaders(requestHeaders, { ...inputs, language: undefined });

	const response = NextResponse.next({
		request: {
			headers: requestHeaders,
		},
	});

	if (options.cookie && inputs.country) {
		const countryName =
			typeof options.cookie === 'object'
				? (options.cookie.countryName ?? DEFAULT_COUNTRY_COOKIE)
				: DEFAULT_COUNTRY_COOKIE;
		response.cookies.set(countryName, inputs.country, {
			httpOnly: true,
			path: '/',
			sameSite: 'lax',
		});
	}
	if (options.cookie && inputs.region) {
		const regionName =
			typeof options.cookie === 'object'
				? (options.cookie.regionName ?? DEFAULT_REGION_COOKIE)
				: DEFAULT_REGION_COOKIE;
		response.cookies.set(regionName, inputs.region, {
			httpOnly: true,
			path: '/',
			sameSite: 'lax',
		});
	}

	return response;
};
