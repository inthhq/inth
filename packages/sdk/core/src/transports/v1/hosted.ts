/**
 * Hosted `/v1` transport: the backend picks the policy in
 * `GET /v1/consent/init`, and saves go to `POST /v1/consent/records`.
 * Init answers in the shapes of the current policy contract.
 */
import {
	CONSENT_REQUEST_HEADER_NAMES,
	extractConsentRequestInputs,
	POLICY_CONTRACT_VERSION,
} from '@inth/sdk-schema/types';
import type { InitOutput } from '@inth/sdk-schema/types';

import { consumePrefetchedInitialData } from '../../libs/prefetch/prefetch';
import type { SSRInitialData } from '../../options/ssr';
import type { InitContext, KernelOverrides } from '../../types';
import {
	decisionInputsMatchOverrides,
	gpcFromHeaders,
	rememberDecisionInputs,
} from '../decision-inputs';
import type { RememberedDecisionInputs } from '../decision-inputs';
import { mapInitOutputToInitResponse } from '../init-output';
import type { TransportInitResponse } from '../init-output';
import { readApiError } from './error';
import { createV1InitRequest } from './init-request';
import { trimTrailingSlash, V1_ROUTES } from './paths';
import { createV1RecordTransport } from './records';
import type { V1RecordTransport, V1RecordTransportOptions } from './records';
import { resolveV1Fetch } from './routes';

/** Options for {@link createV1HostedTransport}. */
export interface V1HostedTransportOptions extends V1RecordTransportOptions {
	/**
	 * URL for the init request. Defaults to
	 * `${projectUrl}/v1/consent/init`. Point it at a same-origin route that
	 * answers init, while saves still go to the project URL.
	 */
	initUrl?: string;
	/**
	 * Assert the resolved policy decision on saves that carry no signed
	 * `policySnapshotToken`, so the backend can refuse an answer made against
	 * a stale policy. Enable it when `initUrl` resolves init from a manifest,
	 * which issues no snapshot token.
	 *
	 * @defaultValue false
	 */
	assertDecisionInputs?: boolean;
	/** Decision inputs a server-side render already resolved. */
	decisionInputs?: RememberedDecisionInputs;
	/**
	 * An init response already requested, for example during a server
	 * render. The first `init()` uses it instead of fetching. A rejected or
	 * empty promise falls back to the fetch.
	 */
	initialData?: Promise<SSRInitialData | undefined>;
	/**
	 * Whether the first `init()` may use the response an inline init script
	 * left on the page. Defaults to `true` unless `fetch` is set: the script
	 * sends init with the global `fetch`, so a custom `fetch` that signs,
	 * routes or instruments requests would never see it.
	 * @internal
	 */
	pagePrefetch?: boolean;
	/**
	 * Request headers a server-side caller forwards to init. Only the init
	 * inputs (`accept-language`, the supported geo headers, `sec-gpc`) are
	 * forwarded. In a browser, use the kernel's `overrides` instead.
	 */
	headers?: Record<string, string>;
}

/** The hosted `/v1` transport: init plus the record methods. */
export interface V1HostedTransport extends V1RecordTransport {
	init: (ctx: InitContext) => Promise<TransportInitResponse>;
}

const INIT_HEADER_ALLOWLIST = new Set<string>(CONSENT_REQUEST_HEADER_NAMES);

const allowedInitHeaders = function allowedInitHeaders(
	headers: Record<string, string> | undefined
): Record<string, string> {
	const allowed: Record<string, string> = {};
	for (const [name, value] of Object.entries(headers ?? {})) {
		const normalized = name.toLowerCase();
		if (INIT_HEADER_ALLOWLIST.has(normalized)) {
			allowed[normalized] = value;
		}
	}
	return allowed;
};

/**
 * Whether initial data answers this init: it has a payload, and when it
 * says which journey and experiment arm its request carried, they are this
 * init's.
 */
const usableInitialData = function usableInitialData(
	data: SSRInitialData | undefined,
	{ experiment, journey }: Pick<InitContext, 'experiment' | 'journey'>
): data is SSRInitialData & { init: InitOutput } {
	if (!data?.init) {
		return false;
	}
	const sentArm = data.metadata?.experiment;
	if (
		sentArm !== undefined &&
		(sentArm?.id !== experiment?.id || sentArm?.arm !== experiment?.arm)
	) {
		return false;
	}
	const sent = data.metadata?.journey;
	if (sent === undefined) {
		return true;
	}
	if (!journey) {
		return !sent;
	}
	return Boolean(
		sent && sent.id === journey.id && sent.storedChoice === journey.storedChoice
	);
};

const sameOverrides = (left: KernelOverrides, right: KernelOverrides) =>
	left.country === right.country &&
	left.region === right.region &&
	left.language === right.language &&
	left.gpc === right.gpc;

/**
 * Build a hosted `/v1` transport.
 *
 * @param options - Project URL and request settings.
 * @returns A kernel transport with `init`, `save` and `identify`.
 * @example
 * ```ts
 * const transport = createV1HostedTransport({
 *   projectUrl: 'https://your-project.inth.app',
 * });
 * ```
 */
export const createV1HostedTransport = function createV1HostedTransport(
	options: V1HostedTransportOptions
): V1HostedTransport {
	const base = trimTrailingSlash(options.projectUrl);
	const fetchImpl = resolveV1Fetch(options.fetch, 'createV1HostedTransport');
	const initHeaders = allowedInitHeaders(options.headers);
	let lastDecisionInputs = options.assertDecisionInputs
		? options.decisionInputs
		: undefined;
	// Overlapping inits: only the latest may update the assertion state.
	let initGeneration = 0;
	let lastInitOverrides: KernelOverrides | undefined;
	let pendingInit: Promise<TransportInitResponse> | undefined;
	let { initialData } = options;
	const pagePrefetch = options.pagePrefetch ?? options.fetch === undefined;

	const prepareInit = (ctx: InitContext) => {
		if (options.assertDecisionInputs && lastDecisionInputs) {
			const stale = lastInitOverrides
				? !sameOverrides(lastInitOverrides, ctx.overrides)
				: !decisionInputsMatchOverrides(lastDecisionInputs, ctx.overrides);
			if (stale) {
				lastDecisionInputs = undefined;
			}
		}
		lastInitOverrides = { ...ctx.overrides };
	};

	const runInit = async (ctx: InitContext): Promise<TransportInitResponse> => {
		initGeneration += 1;
		const generation = initGeneration;
		prepareInit(ctx);
		const request = createV1InitRequest({
			credentials: options.credentials,
			experiment: ctx.experiment,
			headers: initHeaders,
			initUrl: options.initUrl,
			journey: ctx.journey,
			overrides: ctx.overrides,
			projectUrl: base,
		});
		const { requestHeaders } = request;
		const supplied =
			initialData ??
			(options.initUrl || !pagePrefetch
				? undefined
				: consumePrefetchedInitialData({
						credentials: request.init.credentials,
						overrides: {
							...extractConsentRequestInputs(new Headers(requestHeaders)),
							...ctx.overrides,
						},
						projectUrl: base,
					}));
		initialData = undefined;
		const prefetched = supplied && (await supplied.catch(() => undefined));
		let payload: InitOutput;
		let readHeaders = requestHeaders;
		if (usableInitialData(prefetched, ctx)) {
			payload = prefetched.init;
			const gpc = prefetched.metadata?.requestContext?.gpc;
			if (gpc !== undefined) {
				readHeaders = { ...requestHeaders, 'sec-gpc': gpc ? '1' : '0' };
			}
		} else {
			const response = await fetchImpl(request.url, request.init);
			if (!response.ok) {
				throw await readApiError(`Inth transport: ${V1_ROUTES.init}`, response);
			}
			payload = (await response.json()) as InitOutput;
		}
		if (options.assertDecisionInputs && generation === initGeneration) {
			lastDecisionInputs = rememberDecisionInputs(
				payload,
				gpcFromHeaders(readHeaders) ?? payload.resolvedPrivacySignals?.gpc
			);
		}
		// The `/v1` path names the contract; no response header declares it.
		return mapInitOutputToInitResponse(payload, readHeaders, {
			producerContract: POLICY_CONTRACT_VERSION,
		});
	};

	const records = createV1RecordTransport(
		{ ...options, fetch: fetchImpl, projectUrl: base },
		{
			inputs: () => lastDecisionInputs,
			pending: () => pendingInit,
			required: options.assertDecisionInputs === true,
		}
	);

	return {
		...records,
		async init(ctx: InitContext): Promise<TransportInitResponse> {
			const run = runInit(ctx);
			pendingInit = run;
			try {
				return await run;
			} finally {
				if (pendingInit === run) {
					pendingInit = undefined;
				}
			}
		},
	};
};
