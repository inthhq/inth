/**
 * Manifest `/v1` transport: init resolves locally from the project's
 * consent manifest (`GET /v1/consent/manifest`), saves go to
 * `POST /v1/consent/records`, and a server-side caller reports each
 * resolution to `POST /v1/consent/sessions`.
 *
 * Server-only: resolution imports every translation language. Import it in
 * route handlers, server components, server load functions and edge
 * middleware only.
 */
import {
	POLICY_CONTRACT_VERSION,
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

import { createUnreportedJourneys } from '../../libs/journey';
import { resolveSessionReportProjectUrl } from '../../libs/session-report';
import type { SessionReportHeaders } from '../../libs/session-report';
import type { InitContext, KernelOverrides } from '../../types';
import {
	fetchCachedAdTechProviders,
	loadManifestAdTechProviders,
} from '../ad-tech-provider-cache';
import { rememberDecisionInputs } from '../decision-inputs';
import type { RememberedDecisionInputs } from '../decision-inputs';
import { fetchCachedGvl } from '../gvl-cache';
import { mapInitOutputToInitResponse } from '../init-output';
import type { TransportInitResponse } from '../init-output';
import { readInthApiError } from './error';
import { createV1RecordTransport } from './records';
import type { V1RecordTransport, V1RecordTransportOptions } from './records';
import { resolveV1Fetch, trimTrailingSlash, V1_ROUTES } from './routes';
import { reportV1ConsentSession } from './session-report';

/** Session reporting for a server-side manifest transport. */
export interface V1ManifestReportOptions {
	/** Where the resolution happened; `render` for a server render. */
	source: ConsentSessionSource;
	/**
	 * Project URL to report to. Defaults to the transport's `projectUrl`.
	 * Only an absolute URL is reported to.
	 */
	projectUrl?: string;
	/** Package that resolved init, for example `@inth/nextjs`. */
	adapter?: string;
	/** The visitor's request headers. Only IP and user agent are forwarded. */
	headers?: SessionReportHeaders;
	/** The request's method; only a `GET` is reported. */
	method?: string;
	/** Keeps the report alive on runtimes that stop detached work. */
	waitUntil?: (task: Promise<void>) => void;
}

/** Options for {@link createV1ManifestTransport}. */
export interface V1ManifestTransportOptions extends V1RecordTransportOptions {
	/**
	 * Where the manifest is fetched. Defaults to
	 * `${projectUrl}/v1/consent/manifest`.
	 */
	manifestUrl?: string;
	/** The manifest itself. When set, nothing is fetched for it. */
	snapshot?: ConsentManifest;
	/** Request headers for the manifest fetch. */
	headers?: Record<string, string>;
	/** Decision inputs from the visitor's request: geo, language, GPC. */
	inputs?: ResolveInitFromManifestInputs;
	/** Base translations. Defaults to every bundled language. */
	baseTranslations?: BaseTranslations;
	/** Vendor list fetcher, called only when the resolved policy is IAB. */
	fetchGvl?: (input: {
		reference: ConsentManifestGVLReference;
		language: string;
		fetch: typeof globalThis.fetch;
	}) => Promise<GlobalVendorList | null>;
	/**
	 * Report each `init()` to `POST /v1/consent/sessions`. Server callers
	 * only: the report forwards the visitor's IP and user agent.
	 */
	report?: V1ManifestReportOptions;
}

/** The manifest `/v1` transport: init plus the record methods. */
export interface V1ManifestTransport extends V1RecordTransport {
	init: (ctx: InitContext) => Promise<TransportInitResponse>;
}

const mergeInputs = function mergeInputs(
	base: ResolveInitFromManifestInputs | undefined,
	overrides: Readonly<KernelOverrides>
): ResolveInitFromManifestInputs {
	return {
		...base,
		country: overrides.country ?? base?.country ?? null,
		gpc: overrides.gpc ?? base?.gpc,
		language: overrides.language ?? base?.language ?? 'en',
		region: overrides.region ?? base?.region ?? null,
	};
};

const gpcHeaders = function gpcHeaders(
	inputs: ResolveInitFromManifestInputs
): Record<string, string> {
	if (inputs.gpc === undefined) {
		return {};
	}
	return { 'sec-gpc': inputs.gpc ? '1' : '0' };
};

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

/**
 * Build a manifest `/v1` transport.
 *
 * @param options - Project URL, manifest source and resolver inputs.
 * @returns A kernel transport backed by local manifest resolution.
 * @example
 * ```ts
 * const transport = createV1ManifestTransport({
 *   projectUrl: 'https://your-project.inth.app',
 *   inputs: { country: 'DE', language: 'de', region: null },
 *   report: { source: 'render', headers: request.headers },
 * });
 * ```
 */
export const createV1ManifestTransport = function createV1ManifestTransport(
	options: V1ManifestTransportOptions
): V1ManifestTransport {
	const base = trimTrailingSlash(options.projectUrl);
	const fetchImpl = resolveV1Fetch(options.fetch, 'createV1ManifestTransport');
	const manifestUrl = options.manifestUrl ?? `${base}${V1_ROUTES.manifest}`;
	const unreported = createUnreportedJourneys();
	let lastDecisionInputs: RememberedDecisionInputs | undefined;
	// Overlapping inits: only the latest may update the assertion state.
	let initGeneration = 0;
	let manifestPromise: Promise<ConsentManifest> | undefined;

	const fetchManifest =
		async function fetchManifest(): Promise<ConsentManifest> {
			const response = await fetchImpl(manifestUrl, {
				credentials: options.credentials,
				headers: { accept: 'application/json', ...options.headers },
				method: 'GET',
			});
			if (!response.ok) {
				throw await readInthApiError(
					`Inth transport: ${V1_ROUTES.manifest}`,
					response
				);
			}
			return (await response.json()) as ConsentManifest;
		};

	const getManifest = function getManifest(): Promise<ConsentManifest> {
		if (options.snapshot) {
			return Promise.resolve(options.snapshot);
		}
		// Cached on success only, so the kernel's init retry fetches again.
		manifestPromise ??= (async () => {
			try {
				return await fetchManifest();
			} catch (error) {
				manifestPromise = undefined;
				throw error;
			}
		})();
		return manifestPromise;
	};

	const fetchGvl =
		options.fetchGvl ??
		((input) =>
			fetchCachedGvl({
				fetch: input.fetch,
				label: 'Inth transport',
				language: input.language,
				url: input.reference.url,
			}));

	const records = createV1RecordTransport(
		{ ...options, fetch: fetchImpl, projectUrl: base },
		() => lastDecisionInputs
	);

	return {
		...records,
		async init(ctx: InitContext): Promise<TransportInitResponse> {
			initGeneration += 1;
			const generation = initGeneration;
			const manifest = await getManifest();
			const inputs = mergeInputs(options.inputs, ctx.overrides);
			const { journey } = ctx;
			const payload: InitOutput = resolveInitFromManifest(manifest, inputs, {
				baseTranslations: options.baseTranslations ?? baseTranslations,
			});
			const providers = loadManifestAdTechProviders(
				manifest,
				payload,
				(reference) =>
					fetchCachedAdTechProviders({
						fetch: fetchImpl,
						reference: {
							...reference,
							url: resolveEndpoint(reference.url, manifestUrl),
						},
					})
			);
			const model =
				payload.policyResolution?.status === 'matched'
					? payload.policyResolution.policy.model
					: undefined;
			if (
				manifest.iab?.enabled === true &&
				manifest.iab.gvl &&
				model === 'iab'
			) {
				payload.gvl = await fetchGvl({
					fetch: fetchImpl,
					language: payload.translations.language.split('-')[0] || 'en',
					reference: manifest.iab.gvl,
				});
			}
			const adTechProviders = await providers;
			if (adTechProviders) {
				payload.adTechProviders = adTechProviders;
			}
			if (generation === initGeneration) {
				lastDecisionInputs = rememberDecisionInputs(payload, inputs.gpc);
			}

			const reportTo =
				options.report &&
				resolveSessionReportProjectUrl({
					projectUrl: options.report.projectUrl ?? options.projectUrl,
				});
			if (options.report && reportTo) {
				unreported.reported(journey);
				// Detached: the report never rejects and never fails the init.
				void reportV1ConsentSession({
					adapter: options.report.adapter,
					experiment: ctx.experiment,
					fetch: fetchImpl,
					headers: options.report.headers,
					init: payload,
					inputs,
					journey,
					manifest,
					method: options.report.method,
					projectUrl: reportTo,
					source: options.report.source,
					waitUntil: options.report.waitUntil,
				});
			} else {
				// Nothing carried this journey, so its saves send none either.
				unreported.resolvedLocally(journey);
			}
			return mapInitOutputToInitResponse(payload, gpcHeaders(inputs), {
				producerContract: POLICY_CONTRACT_VERSION,
			});
		},
		save: (payload) => records.save(unreported.strip(payload)),
	};
};
