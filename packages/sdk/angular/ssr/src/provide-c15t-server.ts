/**
 * `provideC15tServer()`: resolves the visitor's consent while the server
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
	C15T_OPTIONS,
	ɵC15T_SERVER_STATE,
	ɵC15T_SERVER_STATE_GATE,
	ɵServerStateGate,
} from '@c15t/angular';
import type { C15tProviderOptions } from '@c15t/angular';
import type { ProviderTransportFactory } from '@c15t/core';
import { isIABConfigured } from '@c15t/core/runtime';
import type { RuntimePrefetch } from '@c15t/core/runtime';
import { resolveRequestConsent } from '@c15t/core/server';
import type {
	ManifestFetch,
	ResolveRequestConsentOptions,
} from '@c15t/core/server';
import { assertNotProduction } from '@c15t/core/testing';
import { recommendedPolicyRules } from '@c15t/schema/types';
import type { ConsentManifest } from '@c15t/schema/types';

import type { ConsentRoute } from './consent-route';
import { addEarlyTapScript } from './early-tap-script';
import { startScriptsOnServer } from './server-script-start';

const ADAPTER = '@c15t/angular';

/** Options for {@link provideC15tServer}. */
export interface C15tServerOptions {
	/**
	 * The app's consent route from `createConsentRoute()`. A relative
	 * backend below its prefix, such as `hosted({ backendURL: '/api/c15t' })`,
	 * is then resolved in-process instead of over the network. In manifest
	 * mode, deferred vendor lists point at its `/init`.
	 */
	route?: ConsentRoute;
	/**
	 * Cookie name holding persisted consent. Set it only when the browser
	 * stores consent under another `storageKey`; they must match.
	 *
	 * @default 'c15t'
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
	 * no cookie, geo header or clock is read, and only a testing value
	 * resolves. A render without a request (prerendering) is always shared.
	 *
	 * @default false
	 */
	shared?: boolean;
}

type ModeData = Partial<ProviderTransportFactory> & {
	type?: string;
	backendURL?: string;
	headers?: Record<string, string>;
	initURL?: string;
	manifestURL?: string;
	resolve?: 'server' | 'browser';
	snapshot?: ConsentManifest;
};

/**
 * How the server resolves the provider's options: a testing value, then
 * `mode` read from its data, then the hosted backend at `backendURL`.
 */
const serverResolution = function serverResolution(
	provider: C15tProviderOptions,
	route: ConsentRoute | undefined
): Partial<ResolveRequestConsentOptions> {
	if (provider.testing) {
		// The recommended pack, resolved here so the banner renders on the
		// server, and never in production.
		assertNotProduction('@c15t/angular/testing');
		const iab = provider.testing.iab ?? isIABConfigured(provider.iab);
		return {
			mode: 'offline',
			offline: {
				iabEnabled: isIABConfigured(provider.iab),
				policyRules: recommendedPolicyRules({ iab }),
			},
		};
	}
	const data: ModeData | undefined =
		(provider.mode as ModeData | undefined) ??
		(provider.backendURL === undefined
			? undefined
			: { backendURL: provider.backendURL, type: 'hosted' });
	switch (data?.type) {
		case 'hosted':
			return {
				backendURL: data.backendURL,
				initHeaders: data.headers,
				initURL: data.initURL,
				mode: 'hosted',
			};
		case 'manifest':
			// The browser resolves; the server reads the cookie only.
			if (data.resolve === 'browser') {
				return {};
			}
			return {
				backendURL: data.backendURL,
				gvlRoute: route ? `${route.routePrefix}/init` : undefined,
				manifest: data.snapshot,
				manifestURL: data.manifestURL,
				mode: 'manifest',
			};
		default:
			// A transport of its own: nothing the server can call. The cookie
			// still seeds the state.
			return {};
	}
};

/**
 * Resolves the visitor's consent for one request.
 *
 * @internal
 */
const resolveServerState = function resolveServerState(
	options: C15tServerOptions,
	provider: C15tProviderOptions,
	request: Request | null
): Promise<RuntimePrefetch> {
	const localFetch: ManifestFetch | undefined =
		options.route?.localFetchFor(request);
	return resolveRequestConsent({
		adapter: ADAPTER,
		...serverResolution(provider, options.route),
		fetch: options.fetch,
		forwardHeaders: options.forwardHeaders,
		journey: provider.journey,
		localFetch,
		overrides: {
			country: options.country,
			language: options.language,
			region: options.region,
		},
		ownRoutes: options.route ? [options.route.routePrefix] : undefined,
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
 * the `mode` given to `provideC15t()` (a backend `/init` for `hosted()`,
 * local policy rules for `local()`, the manifest for `manifest()`), and
 * stores the result in `TransferState`. `provideC15t()` reads it there on
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
 * @param options - The consent route, request overrides and upstream
 * settings. Every one is optional.
 * @returns Providers for the server application config.
 *
 * @example
 * ```ts
 * // app.config.server.ts
 * import { mergeApplicationConfig } from '@angular/core';
 * import { provideServerRendering, withRoutes } from '@angular/ssr';
 * import { provideC15tServer } from '@c15t/angular/ssr';
 *
 * export const config = mergeApplicationConfig(appConfig, {
 *   providers: [
 *     provideServerRendering(withRoutes(serverRoutes)),
 *     provideC15tServer({ route: consentRoute }),
 *   ],
 * });
 * ```
 */
export const provideC15tServer = function provideC15tServer(
	options: C15tServerOptions = {}
): EnvironmentProviders {
	return makeEnvironmentProviders([
		{
			provide: ɵC15T_SERVER_STATE_GATE,
			useFactory: () => new ɵServerStateGate(),
		},
		provideAppInitializer(async () => {
			const provider = inject(C15T_OPTIONS);
			// A ConsentManager another initializer built waits for this.
			const gate = inject(ɵC15T_SERVER_STATE_GATE);
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
				transferState.set(ɵC15T_SERVER_STATE, state);
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
					inject(C15T_OPTIONS).nonce ?? inject(CSP_NONCE, { optional: true });
				// After the render, so it is added only for a page with a banner.
				return () => addEarlyTapScript(document, nonce);
			},
		},
	]);
};
