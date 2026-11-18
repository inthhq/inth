/**
 * `POST /v1/consent/sessions`: the per-visitor signal manifest mode would
 * otherwise lose.
 *
 * A server that resolves init from a manifest never sends the backend an
 * init request, so it reports the resolution after the fact. Server-only:
 * the report forwards the visitor's IP and user agent, which a browser
 * could not do and must not try to. Best effort: it never rejects, and a
 * failed report changes no consent decision.
 */
import {
	buildConsentSessionReport,
	CONSENT_EXPERIMENT_HEADER,
	parseExperimentHeader,
	readSessionJourney,
} from '@inth/sdk-schema/types';
import type {
	BuildConsentSessionReportOptions,
	V1ConsentSessionReport,
} from '@inth/sdk-schema/types';

import {
	forwardSessionReportHeaders,
	isSpeculativeRequest,
	resolveSessionReportProjectUrl,
} from '../../libs/session-report';
import type { SessionReportHeaders } from '../../libs/session-report';
import { V1_ROUTES } from './routes';

/** How long a report may take before it is abandoned. */
const REPORT_TIMEOUT_MS = 3000;

/** Options for {@link reportV1ConsentSession}. */
export interface V1SessionReportOptions extends BuildConsentSessionReportOptions {
	/**
	 * Project URL as configured. Only an absolute `http(s)` URL is reported
	 * to: a relative one resolved against the request would be the app's
	 * own proxy.
	 */
	projectUrl?: string | null;
	/** Fetch implementation. Defaults to `globalThis.fetch`. */
	fetch?: typeof globalThis.fetch;
	/**
	 * The visitor's request headers. Only the user agent and the client IP
	 * are forwarded.
	 */
	headers?: SessionReportHeaders;
	/** The request's method; only a `GET` is reported. */
	method?: string;
	/**
	 * URL of the browser's request the resolution answers. The journey it
	 * carries as query parameters goes on the report when `journey` is unset.
	 */
	url?: string | URL;
	/** Keeps the report alive on runtimes that stop detached work. */
	waitUntil?: (task: Promise<void>) => void;
}

const readHeader = function readHeader(
	headers: SessionReportHeaders | undefined,
	name: string
): string | undefined {
	if (!headers) {
		return undefined;
	}
	if (headers instanceof Headers) {
		return headers.get(name) ?? undefined;
	}
	for (const [key, value] of Object.entries(headers)) {
		if (key.toLowerCase() === name) {
			return Array.isArray(value) ? value[0] : value;
		}
	}
	return undefined;
};

/**
 * The `/v1` report body: the same report, with the journey's site named
 * `property`, lowercase.
 *
 * @param options - What to report.
 * @returns The body of `POST /v1/consent/sessions`.
 */
export const buildV1ConsentSessionReport = function buildV1ConsentSessionReport(
	options: BuildConsentSessionReportOptions
): V1ConsentSessionReport {
	const { journey, ...report } = buildConsentSessionReport(options);
	if (!journey) {
		return report;
	}
	const { domain, ...rest } = journey;
	return {
		...report,
		journey: domain ? { ...rest, property: domain.toLowerCase() } : rest,
	};
};

/**
 * Send one session report to `POST /v1/consent/sessions`, detached.
 *
 * Never throws and never rejects. A prefetch or prerender request, a
 * non-`GET` request and a relative project URL send nothing.
 *
 * @param options - What to report, where, and how to keep it alive.
 * @returns A promise that settles when the report finishes or fails.
 */
export const reportV1ConsentSession = function reportV1ConsentSession(
	options: V1SessionReportOptions
): Promise<void> {
	const projectUrl = resolveSessionReportProjectUrl(options);
	const fetchImpl = options.fetch ?? globalThis.fetch?.bind(globalThis);
	if (
		!projectUrl ||
		!fetchImpl ||
		isSpeculativeRequest(options.headers) ||
		(options.method !== undefined && options.method.toUpperCase() !== 'GET')
	) {
		return Promise.resolve();
	}

	const task = (async () => {
		try {
			const body = buildV1ConsentSessionReport({
				...options,
				experiment:
					options.experiment ??
					parseExperimentHeader(
						readHeader(options.headers, CONSENT_EXPERIMENT_HEADER)
					),
				journey:
					options.journey ??
					readSessionJourney(
						options.url,
						readHeader(options.headers, 'origin') ?? options.url
					),
			});
			const response = await fetchImpl(`${projectUrl}${V1_ROUTES.sessions}`, {
				body: JSON.stringify(body),
				headers: {
					'content-type': 'application/json',
					...forwardSessionReportHeaders(options.headers),
				},
				method: 'POST',
				signal:
					typeof AbortSignal !== 'undefined' &&
					typeof AbortSignal.timeout === 'function'
						? AbortSignal.timeout(REPORT_TIMEOUT_MS)
						: undefined,
			});
			await response.body?.cancel();
		} catch {
			// Best effort. The decision already happened; nothing to recover.
		}
	})();
	try {
		options.waitUntil?.(task);
	} catch {
		// A lifetime hook called outside its request scope throws; the report
		// is not the visitor's consent decision.
	}
	return task;
};
