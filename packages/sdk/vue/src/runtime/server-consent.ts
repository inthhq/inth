import type { ServerExperiment } from '@inth/sdk/engine';
/**
 * Server-side consent resolution for the Nuxt plugin. Server-only: the
 * plugin loads it behind `import.meta.server`, so the resolver, its
 * translations and the server snapshot never reach the client bundle.
 *
 * The rules (request read, forwarding, budget, merge, experiment arm) live
 * in `resolveRequestConsent` from `@inth/sdk/server`, shared with every
 * other adapter. This module supplies what Nuxt knows about the request.
 */
import {
	readWaitUntil,
	resolveRequestConsent,
	resolveServerMode,
} from '@inth/sdk/server';
import type { ManifestFetch, RequestConsentState } from '@inth/sdk/server';

import snapshot from '#@inth/sdk/server-manifest-snapshot';

import type { RuntimeConsentConfig } from './kernel';
import { readNuxtMode, readNuxtRoutePrefix } from './nuxt-mode';
import type { NuxtResolvedModeConfig } from './nuxt-mode';

/** What the plugin read about the request with Nuxt's own composables. */
export interface NuxtConsentRequest {
	/** `useRequestHeaders()`. */
	headers: Record<string, string | undefined>;
	/** `useRequestURL()`. */
	url?: URL | string;
	/**
	 * `useRequestEvent()`: its `fetch` answers this app's routes in-process
	 * (Nitro's local fetch), and its `waitUntil` keeps detached work alive.
	 */
	event?: { fetch?: unknown; waitUntil?: unknown } | null;
}

/**
 * Resolves the visitor's consent state for a Nuxt server render, by the
 * rule `resolveServerMode` applies in every adapter: `manifest()` from the
 * snapshot, or the manifest read at runtime, falling back to the backend's
 * `/init`; `hosted()` from the backend's `/init`.
 *
 * @param config - The merged Inth runtime config. Its `projectUrl` is the
 * server's: the private `NUXT_INTH_PROJECT_URL` over the public one, as the
 * consent route reads it.
 * @param request - The request facts from Nuxt's composables.
 * @returns The serializable state the client hydrates from.
 */
export const resolveNuxtConsent = async function resolveNuxtConsent(
	config: Partial<RuntimeConsentConfig> & NuxtResolvedModeConfig,
	request: NuxtConsentRequest
): Promise<RequestConsentState> {
	const experiment =
		config.experiment?.arm === undefined
			? undefined
			: (config.experiment as ServerExperiment);
	const localFetch =
		typeof request.event?.fetch === 'function'
			? (request.event.fetch as ManifestFetch)
			: undefined;
	// The experiment rides along for the arm rule only; the Vue kernel seeds
	// the experiment from its own config.
	const server = resolveServerMode({
		adapter: '@inth/nuxt',
		buildSnapshot: snapshot,
		mode: readNuxtMode(config),
		projectUrl: config.projectUrl,
		routePrefix: readNuxtRoutePrefix(config),
	});
	const { experiment: _carried, ...state } = await resolveRequestConsent({
		...server.consent,
		adapter: '@inth/nuxt',
		experiment,
		localFetch,
		// Off here means the page has no journey: the state says so and the
		// browser sends none.
		request: { headers: request.headers, url: request.url },
		storage: config.storageConfig,
		timeoutMs: config.timeoutMs,
		waitUntil: readWaitUntil(request.event),
	});
	return state;
};
