/**
 * Builds a session report from an init resolution.
 *
 * Shared between the backend, whose `/v1/consent/init` emits one, and the host
 * adapters, which post one after resolving locally, so both describe a
 * resolution the same way and a consumer never has to reconcile two shapes.
 */

import type {
	ConsentSessionReport,
	ConsentSessionSource,
} from '../api/consent-session.model';
import type { InitOutput } from '../api/init-output.model';
import type { ConsentManifest } from './consent-manifest';
import { appendSearchParams, readSearchParams } from './search-params.model';

/**
 * Request header a host puts the visitor's IP on when it reports a session.
 *
 * A dedicated header rather than `x-forwarded-for`: a platform in front of
 * the backend rewrites the standard chain to the connecting server, and the
 * backend's proxy-header precedence was written for a visitor's own
 * request, not a server-to-server one. The backend applies its `ipAddress`
 * masking and tracking settings to this value exactly as it would to a
 * connection-derived one.
 */
export const CONSENT_SESSION_CLIENT_IP_HEADER = 'x-inth-client-ip';

/**
 * Request header that carries the banner-experiment arm a visitor runs, as
 * `<id>=<arm>` with both parts URI-encoded. A client sends it on `/v1/consent/init`
 * only while the visitor has no stored choice, so a session that carries it
 * is one where the banner was owed under that arm. A browser sends the same
 * value as the `experiment` query parameter instead, so a cross-origin
 * `/v1/consent/init` needs no CORS preflight.
 */
export const CONSENT_EXPERIMENT_HEADER = 'x-inth-experiment';

/** Longest experiment id or arm name a session report carries. */
const EXPERIMENT_TEXT_MAX = 128;

/** The experiment arm a session ran. */
export interface SessionExperiment {
	id: string;
	arm: string;
}

/**
 * The {@link CONSENT_EXPERIMENT_HEADER} value for an arm.
 */
export const formatExperimentHeader = function formatExperimentHeader(
	experiment: SessionExperiment
): string {
	return `${encodeURIComponent(experiment.id)}=${encodeURIComponent(experiment.arm)}`;
};

/**
 * Read a {@link CONSENT_EXPERIMENT_HEADER} value. Anything malformed or
 * longer than 128 characters per part reads as no experiment: the header is
 * analytics and never fails a request.
 */
export const parseExperimentHeader = function parseExperimentHeader(
	value: string | null | undefined
): SessionExperiment | null {
	if (!value) {
		return null;
	}
	const separator = value.indexOf('=');
	if (separator <= 0 || separator === value.length - 1) {
		return null;
	}
	try {
		const id = decodeURIComponent(value.slice(0, separator));
		const arm = decodeURIComponent(value.slice(separator + 1));
		return id.length <= EXPERIMENT_TEXT_MAX && arm.length <= EXPERIMENT_TEXT_MAX
			? { arm, id }
			: null;
	} catch {
		return null;
	}
};

/**
 * Query parameter carrying the consent journey id on `GET /v1/consent/init` and
 * `POST /v1/consent/records`. A query parameter, not a header, so it adds no CORS
 * preflight.
 */
export const CONSENT_JOURNEY_PARAM = 'journey';

/** Query parameter that carries the journey's scope: `page` or `tab`. */
export const CONSENT_JOURNEY_SCOPE_PARAM = 'journeyScope';

/**
 * Query parameter on `GET /v1/consent/init`: `1` when the browser had a stored choice
 * or notice dismissal when the journey started, else `0`.
 */
export const CONSENT_JOURNEY_STORED_PARAM = 'stored';

/**
 * The journey parameter names `3.0.0-alpha.8` and `alpha.9` clients sent:
 * `c15tJourney`, `c15tJourneyScope` and `c15tStored`. Readers fall back to
 * them when a request carries no journey under the current names. Never
 * written. Remove once the alpha clients that send them are retired.
 *
 * @internal
 */
export const LEGACY_CONSENT_JOURNEY_PARAMS = {
	id: 'c15tJourney',
	scope: 'c15tJourneyScope',
	stored: 'c15tStored',
} as const;

/**
 * How long a journey id lives in the browser.
 *
 * - `page`: one page load, in memory only.
 * - `tab`: carried across navigations in the same tab while a prompt is
 *   due, through `sessionStorage`.
 */
export type ConsentJourneyScope = 'page' | 'tab';

/** A journey as it travels on a request. */
export interface ConsentJourneyParams {
	id: string;
	scope: ConsentJourneyScope;
	/** Whether a choice or notice dismissal was stored at the start. `/v1/consent/init` only. */
	storedChoice?: boolean;
}

/** What the visitor's first layer was at the start of a journey. */
export type ConsentJourneyPrompt = 'due' | 'stored' | 'not-required';

const JOURNEY_ID =
	/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/iu;

/**
 * Read a journey id. Anything but a UUID reads as none: the parameter is
 * analytics and never fails a request.
 *
 * @returns The id in lower case, or `null`.
 */
export const parseJourneyId = function parseJourneyId(
	value: string | null | undefined
): string | null {
	return typeof value === 'string' && JOURNEY_ID.test(value)
		? value.toLowerCase()
		: null;
};

/**
 * Read a journey scope. Anything but `page` or `tab` reads as none.
 */
export const parseJourneyScope = function parseJourneyScope(
	value: string | null | undefined
): ConsentJourneyScope | null {
	return value === 'page' || value === 'tab' ? value : null;
};

const JOURNEY_PARAM_NAMES = [
	{
		id: CONSENT_JOURNEY_PARAM,
		scope: CONSENT_JOURNEY_SCOPE_PARAM,
		stored: CONSENT_JOURNEY_STORED_PARAM,
	},
	LEGACY_CONSENT_JOURNEY_PARAMS,
] as const;

const readJourneyNamed = function readJourneyNamed(
	params: URLSearchParams,
	names: (typeof JOURNEY_PARAM_NAMES)[number]
): ConsentJourneyParams | null {
	const id = parseJourneyId(params.get(names.id));
	const scope = parseJourneyScope(params.get(names.scope));
	if (!(id && scope)) {
		return null;
	}
	const stored = params.get(names.stored);
	return stored === '1' || stored === '0'
		? { id, scope, storedChoice: stored === '1' }
		: { id, scope };
};

/**
 * Read the journey a request carries in its query string.
 *
 * Both the id and the scope must be well formed, or there is no journey.
 * `storedChoice` is set only for `stored=1` or `stored=0`. A request with
 * no journey under the current names is read under the alpha names in
 * {@link LEGACY_CONSENT_JOURNEY_PARAMS}; the two sets are never mixed.
 *
 * @param source - The request URL, absolute or relative, or its query.
 */
export const readJourneyParams = function readJourneyParams(
	source: string | URL | URLSearchParams | null | undefined
): ConsentJourneyParams | null {
	if (!source) {
		return null;
	}
	const params = readSearchParams(source);
	for (const names of JOURNEY_PARAM_NAMES) {
		const journey = readJourneyNamed(params, names);
		if (journey) {
			return journey;
		}
	}
	return null;
};

/**
 * Append a journey to a URL's query string. A relative URL stays relative.
 *
 * @param journey - The journey. `storedChoice` is written when set.
 */
export const appendJourneyParams = function appendJourneyParams(
	url: string,
	journey: ConsentJourneyParams
): string {
	const params = new URLSearchParams({
		[CONSENT_JOURNEY_PARAM]: journey.id,
		[CONSENT_JOURNEY_SCOPE_PARAM]: journey.scope,
	});
	if (journey.storedChoice !== undefined) {
		params.set(CONSENT_JOURNEY_STORED_PARAM, journey.storedChoice ? '1' : '0');
	}
	return appendSearchParams(url, params);
};

/**
 * Whether the first layer was owed, already answered, or never part of
 * this resolution.
 *
 * A failed resolution keeps the first layer hidden, and a matched policy
 * whose prompt is `none` (every `none` model) shows none, so both are
 * `not-required`. `no-match` and `unconfigured` still show the safe opt-in
 * fallback, so they are owed like a matched prompt.
 */
export const deriveJourneyPrompt = function deriveJourneyPrompt(
	init: Pick<InitOutput, 'policyResolution'>,
	storedChoice: boolean
): ConsentJourneyPrompt {
	const resolution = init.policyResolution;
	if (
		!resolution ||
		resolution.status === 'failed' ||
		(resolution.status === 'matched' && resolution.policy.prompt === 'none')
	) {
		return 'not-required';
	}
	return storedChoice ? 'stored' : 'due';
};

/** A journey as a report receives it. */
export interface SessionJourney {
	id: string;
	scope: ConsentJourneyScope;
	/** Whether a choice or notice dismissal was stored at the start. */
	storedChoice: boolean;
	/** Hostname of the site the visitor was on, when known. */
	domain?: string;
}

/**
 * The hostname of an `Origin` header or a request URL, or `undefined` for
 * anything that is not an `http(s)` URL (including the opaque `null` origin).
 */
export const journeyDomainFrom = function journeyDomainFrom(
	value: string | URL | null | undefined
): string | undefined {
	if (!value) {
		return undefined;
	}
	try {
		const url = value instanceof URL ? value : new URL(value);
		return url.protocol === 'http:' || url.protocol === 'https:'
			? url.hostname || undefined
			: undefined;
	} catch {
		return undefined;
	}
};

/**
 * The journey a browser's `GET /v1/consent/init` carries, as a report records it.
 *
 * The stored flag is required here: without it a report cannot say
 * whether the prompt was owed, so a journey without it is none.
 *
 * @param url - The `/v1/consent/init` request URL.
 * @param site - Where the domain comes from: the request's `Origin`, or the
 *   URL of the page or route the browser asked.
 */
export const readSessionJourney = function readSessionJourney(
	url: string | URL | null | undefined,
	site?: string | URL | null
): SessionJourney | null {
	const params = readJourneyParams(url);
	if (!params || params.storedChoice === undefined) {
		return null;
	}
	const journey: SessionJourney = {
		id: params.id,
		scope: params.scope,
		storedChoice: params.storedChoice,
	};
	const domain = journeyDomainFrom(site);
	if (domain) {
		journey.domain = domain;
	}
	return journey;
};

/** The resolver inputs a report records alongside the decision. */
export interface SessionReportInputs {
	country?: string | null;
	region?: string | null;
	gpc?: boolean;
}

export interface BuildConsentSessionReportOptions {
	init: InitOutput;
	/** The manifest it was resolved from. Only its identity is read. */
	manifest: Pick<ConsentManifest, 'revision' | 'tenantId'>;
	/** The geo and GPC inputs the resolution ran with. */
	inputs?: SessionReportInputs;
	source: ConsentSessionSource;
	/** Package that resolved init, for example `@inth/nextjs`. */
	adapter?: string;
	/**
	 * The banner-experiment arm the visitor runs, when they have no stored
	 * choice yet. See {@link CONSENT_EXPERIMENT_HEADER}.
	 */
	experiment?: SessionExperiment | null;
	/**
	 * The consent journey the resolution belongs to. The report adds the
	 * `prompt` it derives from `init`. See {@link CONSENT_JOURNEY_PARAM}.
	 */
	journey?: SessionJourney | null;
}

/** Builds the session report body for one resolution. */
export const buildConsentSessionReport = function buildConsentSessionReport(
	options: BuildConsentSessionReportOptions
): ConsentSessionReport {
	const resolution = options.init.policyResolution;
	const report: ConsentSessionReport = {
		country: options.inputs?.country ?? null,
		gpc: options.inputs?.gpc === true,
		language: options.init.translations.language,
		policy:
			resolution?.status === 'matched'
				? {
						fingerprint: resolution.fingerprints.policy,
						id: resolution.policyId,
						matchedBy: resolution.matchedBy,
						model: resolution.policy.model,
					}
				: null,
		region: options.inputs?.region ?? null,
		resolution: resolution?.status ?? 'failed',
		revision: options.manifest.revision,
		source: options.source,
	};
	if (options.adapter) {
		report.adapter = options.adapter;
	}
	if (options.experiment) {
		report.experiment = {
			arm: options.experiment.arm,
			id: options.experiment.id,
		};
	}
	if (options.journey) {
		const { domain, id, scope, storedChoice } = options.journey;
		report.journey = {
			id,
			prompt: deriveJourneyPrompt(options.init, storedChoice),
			scope,
			storedChoice,
		};
		if (domain) {
			report.journey.domain = domain;
		}
	}
	if (options.manifest.tenantId !== undefined) {
		report.tenantId = options.manifest.tenantId;
	}
	return report;
};

/**
 * Request headers that mark a prefetch or prerender rather than a page
 * view: the browsers' purpose headers, and the flags Next.js's router and
 * middleware set. A server that forwards a request forwards these so the
 * backend can tell too.
 */
export const SPECULATION_HEADERS = [
	'sec-purpose',
	'purpose',
	'x-purpose',
	'x-moz',
	'next-router-prefetch',
	'x-middleware-prefetch',
] as const;

/**
 * Whether a request is speculative: a browser, CDN, or router prefetching
 * or prerendering a page the visitor may never open. Such a request still
 * resolves consent so the response is right, but it is not a session;
 * reporting it would count visits that never happened.
 *
 * @returns `true` when a {@link SPECULATION_HEADERS} header names a
 * prefetch or prerender, or is the flag `1`.
 */
export const isSpeculativeRequest = function isSpeculativeRequest(
	headers: Headers
): boolean {
	return SPECULATION_HEADERS.some((name) => {
		const value = headers.get(name)?.toLowerCase() ?? '';
		return (
			value === '1' || value.includes('prefetch') || value.includes('prerender')
		);
	});
};
