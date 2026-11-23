/**
 * `loadConsent` — the `+layout.server.ts` half of the SvelteKit layer.
 *
 * Returns `{ consent }`: a plain, serializable state for `<InthProvider
 * state>`. With it the kernel resolves the policy on the server, so the
 * banner is in the first HTML instead of appearing a frame after
 * hydration. The resolution itself is `resolveRequestConsent` from
 * `@inth/sdk/server`; this module supplies what SvelteKit knows about the
 * request: `event.request`, `event.url`, `event.fetch`, the platform's
 * `waitUntil`, and the config and inputs `inthHandle` stored.
 */
import { building } from '$app/env';
import type { ServerExperiment } from '@inth/sdk/engine';
import {
	projectUrl as builtProjectUrl,
	snapshot as builtSnapshot,
} from '@inth/sdk/generated';
import {
	readWaitUntil,
	resolveRequestConsent,
	resolveServerMode,
} from '@inth/sdk/server';
import type { ServerMode } from '@inth/sdk/server';
import type { RequestEvent } from '@sveltejs/kit';

import type { InthProviderState } from '../consent-manager-options.model';
import type { InthLocals, ConsentRequestOptions } from './kit-locals.model';

/** Options for {@link loadConsent}, when you call it from your own `load`. */
export interface LoadConsentOptions extends ConsentRequestOptions {
	/**
	 * Keeps session reports and unfinished init requests alive after the response.
	 * Used when `event.platform.context.waitUntil` is unavailable. Pass the
	 * platform's `waitUntil`, such as the one from `@vercel/functions`.
	 */
	onBackgroundRevalidate?: (task: Promise<void>, event: RequestEvent) => void;

	/**
	 * Extra request headers to forward upstream in hosted mode, such as a
	 * token a private backend needs. Like the consent cookie (the only
	 * cookie forwarded), they travel only over `https`, to a loopback host,
	 * or in-process. `cookie` and `forwarded`/`x-forwarded-*` cannot be
	 * named here.
	 */
	forwardHeaders?: string[];

	/**
	 * Hosted mode: resolve a relative `projectUrl` against the request's
	 * `forwarded`, `x-forwarded-host` and `x-forwarded-proto` headers instead
	 * of `event.url`. Any client can send those headers, and `loadConsent`
	 * forwards the consent cookie to the resolved backend, so set this
	 * only behind a proxy that sets them and drops incoming ones. Prefer
	 * setting the origin where SvelteKit builds `event.url`: `paths.origin`
	 * in SvelteKit 3 (adapter-node's `ORIGIN` in SvelteKit 2, which
	 * SvelteKit 3 ignores), or the adapter's `HOST_HEADER` and
	 * `PROTOCOL_HEADER`. Also forwards the visitor IP to the backend as
	 * `x-forwarded-for`, which is skipped otherwise.
	 *
	 * @defaultValue false
	 */
	trustForwardedHeaders?: boolean;

	/**
	 * Fetch for a backend on another origin. Defaults to the global `fetch`;
	 * a URL on this app's origin always goes through `event.fetch`,
	 * in-process. A custom fetch keeps the vendor list inline, since the
	 * browser cannot replay it.
	 */
	fetch?: typeof globalThis.fetch;

	/**
	 * Longest `loadConsent` waits for the manifest or the backend `/v1/consent/init`,
	 * in milliseconds. When it runs out, `loadConsent` returns the
	 * cookie-only state, the same as when the call fails: the page renders
	 * without consent UI in the server HTML, optional categories stay
	 * denied, and the browser resolves the policy after hydration.
	 *
	 * `false` (or `Infinity`) waits for the upstream, however long it takes.
	 * Any other value that is not a finite, non-negative number uses the
	 * default.
	 *
	 * @default 500
	 */
	timeoutMs?: number | false;

	/**
	 * The banner experiment with the arm this request runs, from your
	 * feature flag. While the visitor has no stored choice, the server's
	 * `/v1/consent/init` carries the arm, or its session report does in manifest mode.
	 * The state carries the experiment to `InthProvider`.
	 */
	experiment?: ServerExperiment;
}

/** @internal */
export const readLocals = function readLocals(
	event: RequestEvent
): InthLocals | undefined {
	return (event.locals as { inth?: InthLocals } | undefined)?.inth;
};

/**
 * The handle's mode, resolved for the render, the consent route and the
 * browser. The backend URL is the handle's, then the one the build read.
 *
 * @internal
 */
export const readServerMode = function readServerMode(
	locals: InthLocals | undefined
): ServerMode {
	return resolveServerMode({
		adapter: '@inth/svelte',
		buildSnapshot: locals?.snapshot ?? builtSnapshot,
		mode: locals?.mode,
		projectUrl: locals?.projectUrl ?? builtProjectUrl,
		proxy: locals?.proxy,
		routePrefix: locals?.routePrefix,
	});
};

const backgroundWorkFor = (
	event: RequestEvent,
	fallback: LoadConsentOptions['onBackgroundRevalidate']
) => {
	const platformHook = readWaitUntil(
		(event.platform as { context?: unknown } | undefined)?.context
	);
	return (
		platformHook ??
		(fallback ? (task: Promise<void>) => fallback(task, event) : undefined)
	);
};

const requestFrom = function requestFrom(
	event: RequestEvent,
	locals: InthLocals | undefined,
	overridesPerCall: boolean
) {
	return {
		headers: event.request.headers,
		inputs: locals && !overridesPerCall ? locals.inputs : undefined,
		url: event.url,
	};
};

/**
 * Resolves the visitor's consent for `<InthProvider state>`. Export it as
 * the root layout's `load`:
 *
 * ```ts
 * // src/routes/+layout.server.ts
 * export { loadConsent as load } from '@inth/svelte/kit';
 * ```
 *
 * ```svelte
 * <!-- src/routes/+layout.svelte -->
 * <InthProvider state={data.consent}>
 * ```
 *
 * It resolves with the mode `inthHandle()` was given. With none, or with
 * `manifest()`, it resolves from the snapshot `consentManifest()`
 * downloaded, or fetches and caches the backend's manifest. With
 * `hosted()` it asks the backend's `/v1/consent/init`.
 *
 * Never throws: a failed upstream call degrades to the cookie-only state
 * rather than taking the page down with it. Neither does a slow one: after
 * `timeoutMs` (500 ms by default) the cookie-only state is returned. While
 * SvelteKit prerenders, the page carries no visitor's consent and makes no
 * upstream call; the browser resolves the visitor itself.
 *
 * @returns `{ consent }`, for `<InthProvider state={data.consent}>`.
 */
export const loadConsent = async function loadConsent(
	event: RequestEvent,
	options: LoadConsentOptions = {}
): Promise<{ consent: InthProviderState }> {
	const locals = readLocals(event);
	const server = readServerMode(locals);
	// Per-call inputs beat the handle's: a route that passes `country` is
	// naming the country for that page. The handle's cookie name is part of
	// the request context, so a per-call `country` keeps it.
	const overridesPerCall =
		options.country !== undefined ||
		options.language !== undefined ||
		options.region !== undefined;
	const cookieName = options.cookieName ?? locals?.cookieName;
	const shared = building || locals?.shared === true;
	const state = await resolveRequestConsent({
		...server.consent,
		adapter: '@inth/svelte',
		experiment: options.experiment,
		fetch: options.fetch,
		forwardHeaders: options.forwardHeaders,
		// SvelteKit answers this app's own routes in-process, so the consent
		// route never leaves the server and the request's host never picks
		// where a relative backend goes.
		localFetch: event.fetch,
		overrides: {
			country: options.country,
			language: options.language,
			region: options.region,
		},
		request: requestFrom(event, locals, overridesPerCall),
		// A prerendered page is one HTML file for every visitor.
		shared,
		storage: cookieName ? { storageKey: cookieName } : undefined,
		timeoutMs: options.timeoutMs,
		trustForwardedHeaders: options.trustForwardedHeaders,
		waitUntil: backgroundWorkFor(event, options.onBackgroundRevalidate),
	});
	const consent: InthProviderState = {
		mode: server.browser.mode,
		prefetch: state,
	};
	if (server.browser.projectUrl !== undefined) {
		consent.projectUrl = server.browser.projectUrl;
	}
	if (locals?.routePrefix !== undefined) {
		consent.routePrefix = locals.routePrefix;
	}
	return { consent };
};
