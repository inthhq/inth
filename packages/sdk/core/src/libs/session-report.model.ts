/**
 * What a session report sends about the visitor, and when it is sent at
 * all. The report itself is `reportV1ConsentSession`.
 *
 * Server-only: it forwards the visitor's IP and user agent to the backend,
 * which a browser could not do and must not try to.
 */

import {
	CONSENT_SESSION_CLIENT_IP_HEADER,
	getIpAddress,
	isSpeculativeRequest as isSpeculativeHeaders,
} from '@inth/sdk-schema/types';

import { readHeader, toHeaders } from './http-headers.model';
import { trimSlash } from './trim-slash';

/** Headers as any server runtime hands them over. */
export type SessionReportHeaders =
	| Headers
	| Record<string, string | string[] | undefined>;

const ABSOLUTE_URL = /^https?:\/\//iu;

/**
 * Where a session report is sent, or `undefined` to send none.
 *
 * Only an explicit, absolute `http(s)` backend qualifies. A relative URL
 * cannot be fetched from a server, and resolved against the request it is
 * the app's own proxy route, which would count the visitor twice. Nothing
 * is ever inferred from a manifest URL: a manifest may be served from a CDN
 * that exists only to hand out public policy data, and a report carries the
 * visitor's address and user agent.
 *
 * @param source - The backend URL as configured, not resolved against the request.
 * @returns The backend base URL without a trailing slash.
 */
export const resolveSessionReportProjectUrl =
	function resolveSessionReportProjectUrl(source: {
		projectUrl?: string | null;
	}): string | undefined {
		return source.projectUrl && ABSOLUTE_URL.test(source.projectUrl)
			? trimSlash(source.projectUrl)
			: undefined;
	};

/**
 * Whether a request is a prefetch or prerender the visitor may never open.
 * The shared check from `@inth/sdk/schema`, accepting any header shape a server
 * runtime hands over.
 *
 * @returns `true` for a speculative request.
 */
export const isSpeculativeRequest = function isSpeculativeRequest(
	headers: SessionReportHeaders | undefined
): boolean {
	return isSpeculativeHeaders(toHeaders(headers));
};

/**
 * The visitor headers a report forwards, read from any header shape: the
 * user agent, and the client IP on `x-inth-client-ip`. Cookies never are.
 *
 * The IP travels on a dedicated header rather than as the forwarded chain.
 * A platform in front of the backend rewrites `x-forwarded-for` to the
 * connecting server, which would make every report look like the host.
 *
 * The client IP is the address the shared derivation recovers from the
 * request's proxy headers, unmasked: masking is the backend's decision and
 * happens there. An `x-inth-client-ip` already on the incoming request is
 * ignored on purpose: a visitor can send that header to a public init
 * route, and honouring it would let them choose the address the backend
 * attributes to them.
 *
 * @returns The user agent and client IP that were present.
 */
export const forwardSessionReportHeaders = function forwardSessionReportHeaders(
	headers: SessionReportHeaders | undefined
): Record<string, string> {
	const forwarded: Record<string, string> = {};
	const userAgent = readHeader(headers, 'user-agent');
	if (userAgent) {
		forwarded['user-agent'] = userAgent;
	}
	const ip = getIpAddress(toHeaders(headers), { masking: false });
	if (ip) {
		forwarded[CONSENT_SESSION_CLIENT_IP_HEADER] = ip;
	}
	return forwarded;
};
