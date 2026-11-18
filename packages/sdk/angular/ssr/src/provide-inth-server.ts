/**
 * `provideInthServer()`: resolves the visitor's consent while the server
 * renders, and hands it to the browser through `TransferState`.
 */
import {
	CSP_NONCE,
	DOCUMENT,
	inject,
	makeEnvironmentProviders,
	provideAppInitializer,
	REQUEST,
	TransferState,
} from '@angular/core';
import type { EnvironmentProviders } from '@angular/core';
import { BEFORE_APP_SERIALIZED } from '@angular/platform-server';
import {
	INTH_OPTIONS,
	ɵINTH_SERVER_STATE,
	ɵINTH_SERVER_STATE_GATE,
	ɵServerStateGate,
} from '@inth/angular';
import type { InthProviderOptions } from '@inth/angular';
import { isIABConfigured } from '@inth/sdk/runtime';
import type { RuntimePrefetch } from '@inth/sdk/runtime';
import { resolveRequestConsent, resolveServerMode } from '@inth/sdk/server';
import type { ManifestFetch, ServerModeInput } from '@inth/sdk/server';

import type { ConsentRoute } from './consent-route';
import { addEarlyTapScript } from './early-tap-script';
import { startScriptsOnServer } from './server-script-start';

const ADAPTER = '@inth/angular';

/** Options for {@link provideInthServer}. */
export interface InthServerOptions {
	/**
	 * The app's consent route from `createConsentRoute()`. A relative
	 * backend below its prefix, such as `hosted({ projectUrl: '/api/inth' })`,
	 * is then resolved in-process instead of over the network. In manifest
	 * mode, deferred vendor lists point at its `/init`.
	 */
	route?: ConsentRoute;
	/**
	 * Cookie name holding persisted consent. Set it only when the browser
	 * stores consent under another `storageKey`; they must match.
	 *
	 * @default 'inth'
	 */
	cookieName?: string;
	/** Country that replaces what the request's geo headers say. */
	country?: string;
	/** Region that replaces what the request's geo headers say. */
	region?: string;
	/** Language that replaces the request's `accept-language`. */
	language?: string;
	/**
	 * Extra request headers to forward upstream in hosted mode, such as a
	 * token a private backend needs. `cookie` and `forwarded`/`x-forwarded-*`
	 * cannot be named here.
	 */
	forwardHeaders?: string[];
	/**
	 * Resolve a relative backend against the request's forwarding headers
	 * and forward the visitor IP. Only behind a proxy that sets those
	 * headers and drops incoming ones.
	 *
	 * @default false
	 */
	trustForwardedHeaders?: boolean;
	/** Fetch for a backend on another origin. Defaults to `globalThis.fetch`. */
	fetch?: typeof globalThis.fetch;
	/**
	 * Longest the render waits for the policy, in milliseconds. Past it the
	 * page renders from the cookie alone and the browser resolves the policy
	 * after hydration. `false` waits for the upstream.
	 *
	 * @default 500
	 */
	timeoutMs?: number | false;
	/** Keeps session reports and late upstream work alive past the response. */
	waitUntil?: (task: Promise<void>) => void;
	/**
	 * The HTML is served to more than one visitor, as with a cached route:
	 * no cookie, geo header or clock is read, and only `testing()`
	 * resolves. A render without a request (prerendering) is always shared.
	 *
	 * @default false
	 */
	shared?: boolean;
}

const resolveServerState = function resolveServerState(
	options: InthServerOptions,
	provider: InthProviderOptions,
	request: Request | null
): Promise<RuntimePrefetch> {
	const localFetch: ManifestFetch | undefined =
		options.route?.localFetchFor(request);
	return resolveRequestConsent({
		adapter: ADAPTER,
		...resolveServerMode({
			adapter: ADAPTER,
			// A transport of the provider's own carries no mode data: nothing
			// the server can call, so the cookie alone seeds the state.
			browserTransports: true,
			iab: isIABConfigured(provider.iab),
			mode: provider.mode as ServerModeInput,
			projectUrl: provider.projectUrl,
			routePrefix: options.route?.routePrefix,
		}).consent,
		fetch: options.fetch,
		forwardHeaders: options.forwardHeaders,
		journey: provider.journey,
		localFetch,
		overrides: {
			country: options.country,
			language: options.language,
			region: options.region,
		},
		request: request ? { headers: request.headers, url: request.url } : {},
		shared: options.shared === true || request === null,
		storage: options.cookieName
			? { storageKey: options.cookieName }
			: undefined,
		timeoutMs: options.timeoutMs,
		trustForwardedHeaders: options.trustForwardedHeaders,
		waitUntil: options.waitUntil,
	}) as Promise<RuntimePrefetch>;
};

/**
 * Resolves the visitor's consent on the server, so the first HTML is
 * authoritative: the banner is in it for a visitor who owes a choice, and
 * absent for one who already made it.
 *
 * Add it to `app.config.server.ts`, next to `provideServerRendering()`.
 * It reads the request through Angular's `REQUEST` token, resolves with
 * the `mode` given to `provideInth()` (a backend `/init` for `hosted()`,
 * local policy rules for `local()`, the manifest for `manifest()`), and
 * stores the result in `TransferState`. `provideInth()` reads it there on
 * the server and again in the browser, so hydration matches.
 *
 * It never fails the render: an unreachable or slow upstream gives the
 * cookie-only state, and the browser resolves the policy after hydration.
 * When the visitor's stored consent already allows some `scripts`, their
 * start is added to the end of `<body>`, so they run before the app
 * hydrates. Ignored with an external `runtime` or an explicit `prefetch`.
 *
 * When the page has the stock banner, a small script in `<head>` holds a
 * tap on it made before the app hydrates; the banner records that choice
 * once it hydrates.
 *
 * @example
 * ```ts
 * // app.config.server.ts
 * import { mergeApplicationConfig } from '@angular/core';
 * import { provideServerRendering, withRoutes } from '@angular/ssr';
 * import { provideInthServer } from '@inth/angular/ssr';
 *
 * export const config = mergeApplicationConfig(appConfig, {
 *   providers: [
 *     provideServerRendering(withRoutes(serverRoutes)),
 *     provideInthServer({ route: consentRoute }),
 *   ],
 * });
 * ```
 */
export const provideInthServer = function provideInthServer(
	options: InthServerOptions = {}
): EnvironmentProviders {
	return makeEnvironmentProviders([
		{
			provide: ɵINTH_SERVER_STATE_GATE,
			useFactory: () => new ɵServerStateGate(),
		},
		provideAppInitializer(async () => {
			const provider = inject(INTH_OPTIONS);
			// A ConsentManager another initializer built waits for this.
			const gate = inject(ɵINTH_SERVER_STATE_GATE);
			if (provider.runtime || provider.prefetch) {
				gate.open();
				return;
			}
			const request = inject(REQUEST, { optional: true });
			const transferState = inject(TransferState);
			const document = inject(DOCUMENT);
			const nonce = provider.nonce ?? inject(CSP_NONCE, { optional: true });
			let state: RuntimePrefetch;
			try {
				state = await resolveServerState(options, provider, request);
				transferState.set(ɵINTH_SERVER_STATE, state);
			} finally {
				gate.open();
			}
			if (provider.scripts?.length) {
				await startScriptsOnServer(document, provider, state, nonce);
			}
		}),
		{
			multi: true,
			provide: BEFORE_APP_SERIALIZED,
			useFactory: () => {
				const document = inject(DOCUMENT);
				const nonce =
					inject(INTH_OPTIONS).nonce ?? inject(CSP_NONCE, { optional: true });
				// After the render, so it is added only for a page with a banner.
				return () => addEarlyTapScript(document, nonce);
			},
		},
	]);
};
