/**
 * `@inth/sdk/transports/manifest` — server-only manifest transport.
 *
 * This module resolves `/init` with `@inth/sdk/schema` and imports every
 * translation language. Import it only in server code: route handlers,
 * Server Components, server load functions and edge middleware. Client code
 * resolves with `@inth/sdk/transports/manifest-browser`, which bundles
 * English only and loads other languages on demand.
 */

import {
	POLICY_CONTRACT_VERSION,
	primaryLanguage,
	resolveInitFromManifest,
} from '@inth/sdk-schema/types';
import type {
	ConsentManifest,
	ConsentManifestGVLReference,
	ConsentSessionSource,
	GlobalVendorList,
	InitOutput,
	ResolveInitFromManifestInputs,
} from '@inth/sdk-schema/types';
import { baseTranslations } from '@inth/sdk-translations/all';
import type { BaseTranslations } from '@inth/sdk-translations/all';

import { failedResponseError } from '../libs/failed-response';
import { isValidSubjectId } from '../libs/generate-subject-id';
import { createUnreportedJourneys } from '../libs/journey';
import {
	reportConsentSession,
	resolveSessionReportProjectUrl,
} from '../libs/session-report';
import type { SessionReportHeaders } from '../libs/session-report';
import { trimSlash } from '../libs/url';
import { inthProtocolHeaders } from '../libs/version-header';
import type {
	InitContext,
	KernelOverrides,
	KernelTransport,
	KernelUser,
	SaveResult,
} from '../types';
import {
	fetchCachedAdTechProviders,
	loadManifestAdTechProviders,
} from './ad-tech-provider-cache';
import {
	buildDecisionAssertion,
	rememberDecisionInputs,
} from './decision-inputs';
import type { RememberedDecisionInputs } from './decision-inputs';
import { fetchCachedGvl } from './gvl-cache';
import { deferInitGvl, deferInitGvlToRoute } from './gvl-reference';
import { toSaveResult } from './hosted-records';
import { mapInitOutputToInitResponse } from './init-output';
import type { TransportInitResponse } from './init-output';
import { projectUrlOfManifest } from './manifest-url';
import { saveFailure } from './save-rejection';
import { buildSubjectPostBody, subjectsURL } from './subject-body';
import type { SubjectSavePayload } from './subject-body';
import {
	mapSubjectRecordToHydrationRecords,
	reviveSubjectRecord,
} from './subject-record';
import type { TransportHydrationRecords } from './subject-record';

const getDefined = <Value>(
	value: Value,
	message = 'Expected value to be defined'
): NonNullable<Value> => {
	if (value === null || value === undefined) {
		throw new Error(message);
	}
	return value;
};

export interface ManifestTransportOptions {
	/** Defer a public list for SSR. Client-only transports retain their fetched list. */
	deferGvl?: boolean;
	/** Init route that serves versioned GVL requests. */
	gvlRoute?: string;
	/**
	 * Base translations used for local manifest resolution. Defaults to every
	 * language bundled by `@inth/sdk/translations`.
	 */
	baseTranslations?: BaseTranslations;

	/**
	 * URL for `GET /manifest`. Either `manifestUrl` or `snapshot` is required.
	 */
	manifestUrl?: string;

	/**
	 * The manifest itself. Either `manifestUrl` or `snapshot` is required.
	 */
	snapshot?: ConsentManifest;

	/**
	 * Backend URL used for `POST /subjects`. Defaults to `manifestUrl` without
	 * its `/manifest` endpoint; a manifest URL that does not end in one names
	 * no backend.
	 */
	projectUrl?: string;

	/**
	 * Fetch implementation. Defaults to `globalThis.fetch`.
	 */
	fetch?: typeof globalThis.fetch;

	/**
	 * Optional GVL fetcher. Called only when the locally resolved policy is IAB.
	 */
	fetchGvl?: (input: {
		reference: ConsentManifestGVLReference;
		language: string;
		fetch: typeof globalThis.fetch;
	}) => Promise<GlobalVendorList | null>;

	/**
	 * Caller-provided decision inputs, usually derived from request headers on
	 * the host server/edge.
	 */
	inputs?: ResolveInitFromManifestInputs;

	/**
	 * Prefetched init output from a same-origin server route. Used to seed the
	 * asserted decision inputs sent with the first manifest-mode save.
	 */
	initialInit?: InitOutput;

	/**
	 * Request headers for fetching `manifestUrl`.
	 */
	headers?: Record<string, string>;

	/**
	 * Fetch credentials mode. Defaults to `'include'`.
	 */
	credentials?: RequestCredentials;

	/**
	 * Domain sent to POST /subjects. Defaults to the browser hostname, or the
	 * backend URL hostname for absolute URLs in server runtimes.
	 */
	domain?: string;

	/**
	 * Clock used to validate records read from the backend. Defaults to
	 * `Date.now`. Inject for deterministic tests.
	 */
	now?: () => number;

	/**
	 * Send a session report to `POST /sessions` after each `init()`, so the
	 * backend still counts a visitor it never served `/init` to. Server
	 * callers set this; a browser must not, since the report forwards the
	 * visitor's IP and user agent from the incoming request's headers.
	 * Absent means no report.
	 */
	report?: ManifestTransportReportOptions;
}

/** Session reporting for a server-side manifest transport. */
export interface ManifestTransportReportOptions {
	/** Where the resolution happened; `render` for an SSR or RSC prefetch. */
	source: ConsentSessionSource;
	/**
	 * Backend URL as configured, not resolved against the request. Defaults
	 * to the transport's `projectUrl`. Only an absolute URL is reported to;
	 * a relative one resolved to the app's own origin would be its proxy,
	 * and nothing is inferred from the manifest URL.
	 */
	projectUrl?: string;
	/** Package that resolved init, for example `@inth/nextjs`. */
	adapter?: string;
	/**
	 * The visitor's request headers. Only the client IP chain and user agent
	 * are forwarded. Defaults to the transport's `headers`.
	 */
	headers?: SessionReportHeaders;
	/** The request's method, when there is one; only a `GET` is reported. */
	method?: string;
	/**
	 * Receives the report's promise so a runtime that stops detached work
	 * once the response is sent can keep it alive. The promise never
	 * rejects.
	 */
	waitUntil?: (task: Promise<void>) => void;
}

/**
 * The manifest transport's full surface. Same record boundary as the hosted
 * transport, against the same backend routes.
 */
export interface ManifestKernelTransport extends KernelTransport {
	init: (ctx: InitContext) => Promise<TransportInitResponse>;
	save: (payload: SubjectSavePayload) => Promise<SaveResult>;
	identify: (user: KernelUser, subjectId: string | null) => Promise<void>;
	loadSubjectRecord: (
		subjectId: string
	) => Promise<TransportHydrationRecords | null>;
}

/**
 * Places a relative provider list endpoint on the manifest's location, the
 * way a document resolves its own links. Node's fetch rejects a bare path.
 * With no absolute base the endpoint is left for the supplied fetch, such as
 * an in-process adapter, to resolve.
 */
const resolveEndpoint = function resolveEndpoint(
	url: string,
	base: string | undefined
): string {
	if (!base) {
		return url;
	}
	try {
		return new URL(url, base).href;
	} catch {
		return url;
	}
};

const resolveDomain = function resolveDomain(
	projectUrl: string,
	explicit: string | undefined
): string {
	if (explicit) {
		return explicit;
	}
	if (typeof window !== 'undefined' && window.location?.hostname) {
		return window.location.hostname;
	}
	try {
		return new URL(projectUrl).hostname;
	} catch {
		return 'localhost';
	}
};

const toHeadersFromInputs = function toHeadersFromInputs(
	inputs: ResolveInitFromManifestInputs
): Record<string, string> {
	const headers: Record<string, string> = {};
	if (inputs.gpc === true) {
		headers['sec-gpc'] = '1';
	} else if (inputs.gpc === false) {
		headers['sec-gpc'] = '0';
	}
	return headers;
};

const mergeInputs = function mergeInputs(
	optionsInputs: ResolveInitFromManifestInputs | undefined,
	overrides: Readonly<KernelOverrides>
): ResolveInitFromManifestInputs {
	return {
		...optionsInputs,
		country: overrides.country ?? optionsInputs?.country ?? null,
		gpc: overrides.gpc ?? optionsInputs?.gpc,
		language: overrides.language ?? optionsInputs?.language ?? 'en',
		region: overrides.region ?? optionsInputs?.region ?? null,
	};
};

const shouldFetchGvl = function shouldFetchGvl(
	manifest: ConsentManifest,
	payload: InitOutput
): boolean {
	const model =
		payload.policyResolution?.status === 'matched'
			? payload.policyResolution.policy.model
			: undefined;
	return (
		manifest.iab?.enabled === true &&
		manifest.iab.gvl !== undefined &&
		model === 'iab'
	);
};

const defaultFetchGvl = function defaultFetchGvl(input: {
	reference: ConsentManifestGVLReference;
	language: string;
	fetch: typeof globalThis.fetch;
}): Promise<GlobalVendorList | null> {
	return fetchCachedGvl({
		fetch: input.fetch,
		headers: inthProtocolHeaders,
		label: 'inth manifest transport',
		language: input.language,
		url: input.reference.url,
	});
};

/**
 * Build a transport that resolves `/init` locally from a consent manifest
 * and posts saves to the backend.
 *
 * Server-only: resolution pulls in `@inth/sdk/schema` and every translation
 * language, so import it from `@inth/sdk/transports/manifest` in server
 * code (route handlers, RSC, edge) only. `@inth/sdk/engine` deliberately does not
 * re-export it. Browser code uses `createBrowserManifestTransport` from
 * `@inth/sdk/transports/manifest-browser`.
 *
 * Saves without a signed `policySnapshotToken` carry the resolved policy
 * id, fingerprint, geo, language, and GPC signal so the backend can reject
 * a consent recorded against a stale policy.
 *
 * @returns A kernel transport backed by local manifest resolution.
 * @throws {Error} When neither `snapshot` nor `manifestUrl` is provided, or no
 * `fetch` implementation is available.
 * @example
 * ```ts
 * import { createManifestTransport } from '@inth/sdk-core/transports/manifest';
 *
 * const transport = createManifestTransport({
 *   manifestUrl: 'https://api.example.com/inth/manifest',
 *   inputs: { country: 'DE', language: 'de', region: null },
 * });
 * ```
 */
export const createManifestTransport = function createManifestTransport(
	options: ManifestTransportOptions
): ManifestKernelTransport {
	const fetchImpl = options.fetch ?? globalThis.fetch?.bind(globalThis);
	if (!fetchImpl) {
		throw new Error(
			'createManifestTransport: no fetch available. Pass `fetch` in options.'
		);
	}
	if (!options.snapshot && !options.manifestUrl) {
		throw new Error(
			'createManifestTransport: either `snapshot` or `manifestUrl` is required.'
		);
	}

	const projectUrl = options.projectUrl
		? trimSlash(options.projectUrl)
		: (projectUrlOfManifest(options.manifestUrl) ?? '');
	const credentials = options.credentials ?? 'include';
	const domain = resolveDomain(projectUrl, options.domain);
	const now = options.now ?? Date.now;
	const jsonHeaders = {
		accept: 'application/json',
		'content-type': 'application/json',
		...inthProtocolHeaders,
	};
	const requireProjectUrl = function requireProjectUrl(what: string): string {
		if (!projectUrl) {
			throw new Error(
				`createManifestTransport: \`projectUrl\` is required to ${what} when using a \`snapshot\` without \`manifestUrl\`.`
			);
		}
		return projectUrl;
	};
	const subjectURL = (subjectId: string): string =>
		`${requireProjectUrl('read a subject')}/subjects/${encodeURIComponent(subjectId)}`;
	let manifestPromise: Promise<ConsentManifest> | undefined;
	const unreported = createUnreportedJourneys();
	/**
	 * Without a report nothing carries an init's journey, so the saves that
	 * follow send none either.
	 */
	const noteJourney = function noteJourney(
		journey: InitContext['journey']
	): void {
		const reportsTo =
			options.report &&
			resolveSessionReportProjectUrl({
				projectUrl: options.report.projectUrl ?? options.projectUrl,
			});
		if (reportsTo) {
			unreported.reported(journey);
		} else {
			unreported.resolvedLocally(journey);
		}
	};
	let lastDecisionInputs: RememberedDecisionInputs | undefined =
		options.initialInit
			? rememberDecisionInputs(options.initialInit, options.inputs?.gpc)
			: undefined;

	const getManifest = function getManifest(): Promise<ConsentManifest> {
		if (options.snapshot) {
			return Promise.resolve(options.snapshot);
		}
		if (!manifestPromise) {
			// Cached on success only. A rejected fetch is dropped so the kernel's
			// init retry fetches again instead of replaying the same failure.
			manifestPromise = (async () => {
				try {
					const response = await fetchImpl(getDefined(options.manifestUrl), {
						credentials,
						headers: {
							accept: 'application/json',
							...inthProtocolHeaders,
							...options.headers,
						},
						method: 'GET',
					});

					if (!response.ok) {
						throw await failedResponseError(
							'inth manifest transport: /manifest',
							response
						);
					}

					return (await response.json()) as ConsentManifest;
				} catch (error) {
					manifestPromise = undefined;
					throw error;
				}
			})();
		}
		return manifestPromise;
	};

	return {
		async identify(user, subjectId): Promise<void> {
			if (!subjectId) {
				// No server subject to link. The identity stays in the kernel and
				// travels with the next save; nothing is owed to the network. Same
				// contract as the hosted transport.
				return;
			}
			const response = await fetchImpl(subjectURL(subjectId), {
				body: JSON.stringify({
					externalId: user.externalId,
					identityProvider: user.identityProvider,
					identityToken: user.identityToken,
				}),
				credentials,
				headers: jsonHeaders,
				method: 'PATCH',
			});
			// A backend older than first-load subject IDs only knows subjects
			// a save created. The identity then travels with the next save.
			// The backend rejects an ID of another form, and so would the save.
			if (response.status === 404 && isValidSubjectId(subjectId)) {
				return;
			}
			if (!response.ok) {
				throw await failedResponseError(
					'inth manifest transport: /subjects/:id',
					response
				);
			}
		},

		async init(ctx: InitContext): Promise<TransportInitResponse> {
			const manifest = await getManifest();
			const inputs = mergeInputs(options.inputs, ctx.overrides);
			// Read once: the request this init would have made is the report.
			const { journey } = ctx;
			let payload: InitOutput = resolveInitFromManifest(manifest, inputs, {
				baseTranslations: options.baseTranslations ?? baseTranslations,
			});

			// Google Additional Consent providers load beside the vendor list.
			const providers = loadManifestAdTechProviders(
				manifest,
				payload,
				(reference) =>
					fetchCachedAdTechProviders({
						fetch: fetchImpl,
						headers: inthProtocolHeaders,
						reference: {
							...reference,
							url: resolveEndpoint(
								reference.url,
								options.manifestUrl ?? projectUrl
							),
						},
					})
			);
			if (shouldFetchGvl(manifest, payload) && manifest.iab?.gvl) {
				const language = primaryLanguage(payload.translations.language) ?? 'en';
				payload.gvl = await (options.fetchGvl ?? defaultFetchGvl)({
					fetch: fetchImpl,
					language,
					reference: manifest.iab.gvl,
				});
			}
			const adTechProviders = await providers;
			if (adTechProviders) {
				payload.adTechProviders = adTechProviders;
			}

			if (
				payload.gvl &&
				manifest.iab?.gvl &&
				(options.gvlRoute ||
					(options.deferGvl && !options.fetch && !options.fetchGvl))
			) {
				payload = options.gvlRoute
					? deferInitGvlToRoute(payload, options.gvlRoute)
					: deferInitGvl(payload, manifest.iab.gvl.url);
			}
			lastDecisionInputs = rememberDecisionInputs(payload, inputs.gpc);
			noteJourney(journey);
			if (options.report) {
				// Detached: the report is telemetry and the decision is already
				// made. It never rejects, so nothing here can fail the init.
				reportConsentSession({
					adapter: options.report.adapter,
					experiment: ctx.experiment,
					fetch: fetchImpl,
					headers: options.report.headers ?? options.headers,
					init: payload,
					inputs,
					journey,
					manifest,
					method: options.report.method,
					// The caller's own backend, never the one derived from the
					// manifest URL.
					projectUrl: options.report.projectUrl ?? options.projectUrl,
					source: options.report.source,
					waitUntil: options.report.waitUntil,
				});
			}
			// Local resolution always produces the v3 wire; the manifest's own
			// schema version decides matched, lifted, or failed inside it.
			return mapInitOutputToInitResponse(payload, toHeadersFromInputs(inputs), {
				producerContract: POLICY_CONTRACT_VERSION,
			});
		},

		async loadSubjectRecord(
			subjectId
		): Promise<TransportHydrationRecords | null> {
			const response = await fetchImpl(subjectURL(subjectId), {
				credentials,
				headers: { accept: 'application/json', ...inthProtocolHeaders },
				method: 'GET',
			});
			if (response.status === 404) {
				return null;
			}
			if (!response.ok) {
				throw await failedResponseError(
					'inth manifest transport: /subjects/:id',
					response
				);
			}
			const record = reviveSubjectRecord(await response.json());
			if (!record) {
				throw new Error(
					'inth manifest transport: /subjects/:id returned an unreadable record'
				);
			}
			return mapSubjectRecordToHydrationRecords(record, { now: now() });
		},

		async save(saved): Promise<SaveResult> {
			const payload = unreported.strip(saved);
			const response = await fetchImpl(
				subjectsURL(requireProjectUrl('save'), payload.journey),
				{
					body: JSON.stringify({
						...buildSubjectPostBody(payload, { domain }),
						...buildDecisionAssertion(payload, lastDecisionInputs),
					}),
					credentials,
					headers: jsonHeaders,
					method: 'POST',
				}
			);

			if (!response.ok) {
				throw await saveFailure(response, 'inth manifest transport');
			}

			return toSaveResult(await response.json());
		},
	};
};
