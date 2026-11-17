/**
 * The transport `ConsentRoot` runs for a config's mode, built from
 * `@c15t/core/runtime/client-mode`.
 *
 * Each mode's code loads with `import()` from core's self-contained
 * chunks (`@c15t/core/runtime/lazy-*`), which share no module with the
 * page. A loader that imports a transport module the page also uses
 * makes Turbopack split the page's first-load chunk by which lazy chunk
 * shares each module, costing several hundred bytes gzip per page.
 *
 * @internal
 */
import type { ConsentMode, WithoutNetworkTestingData } from '@c15t/core/modes';
import {
	lazyBrowserManifest,
	lazyHosted,
	lazyWithoutNetwork,
} from '@c15t/core/runtime/client-mode';
import type { LazyBrowserManifestOptions } from '@c15t/core/runtime/client-mode';
import type { ProviderTransportFactory } from '@c15t/react';

/**
 * Bundlers replace `process.env.NODE_ENV` at build time, so production
 * bundles drop the warnings behind it.
 */
declare const process: { env: { NODE_ENV?: string } };

let warnedImplementation = false;

/** Where the transport sends requests. */
export interface NextClientModeOptions {
	/** Backend URL for saves, and for `GET /init` in hosted mode. */
	backendURL?: string;
	/**
	 * The consent route forwards writes, so the browser sends everything
	 * to `routePrefix`, even for a `hosted()` with its own `backendURL`.
	 * The server helpers keep using the absolute URLs.
	 */
	proxy?: boolean;
	/** Prefix of the app's catch-all consent route, such as `/api/c15t`. */
	routePrefix?: string;
}

/**
 * The transport factory for a mode, carrying the mode's data like core's
 * `clientMode()`.
 *
 * - `manifest()` resolved on the server (the default): saves through the
 *   record transport; a re-init loads the hosted transport and asks
 *   `${routePrefix}/init`, else `${backendURL}/init`.
 * - `manifest({ resolve: 'browser' })`: the browser resolver, loaded on
 *   first init, reading `${routePrefix}/manifest`, else
 *   `${backendURL}/manifest`.
 * - No mode: the hosted backend's transport, loaded on first init.
 * - `withoutNetwork()` from `c15t/next/testing`: the transport that
 *   resolves the recommended pack in the browser, loaded on first init.
 *   The loaded chunk throws in production builds.
 *
 * @param mode - The mode or testing value as data, a transport factory,
 *   used as is, or `undefined` for the hosted backend.
 * @param options - Backend URL, route prefix and `proxy`.
 * @returns A provider transport factory.
 * @throws {Error} When the hosted backend or `manifest()` has no backend
 *   URL.
 * @internal
 */
export const createClientMode = function createClientMode(
	mode:
		| ConsentMode
		| WithoutNetworkTestingData
		| ProviderTransportFactory
		| undefined,
	options: NextClientModeOptions
): ProviderTransportFactory {
	if (typeof mode === 'function') {
		if (process.env.NODE_ENV !== 'production' && !warnedImplementation) {
			warnedImplementation = true;
			console.warn(
				`[c15t] ConsentRoot \`mode\` is the ${mode.kind}() transport itself, so its code ships in the first-load bundle. Use ${mode.kind}() from c15t/next instead: it is plain data, and the root loads the code only when it runs.`
			);
		}
		return mode;
	}
	// `defineConsentConfig` trimmed the prefix and checked that the mode
	// has a backend URL. Without a config there may be none: say so rather
	// than run a mode the app never chose.
	const { routePrefix } = options;
	if (mode?.type === 'without-network') {
		return lazyWithoutNetwork(
			'@c15t/nextjs/testing',
			mode.iab === undefined ? {} : { iab: mode.iab }
		);
	}
	// Saves never fall back to `routePrefix`: the route takes writes only
	// with `proxy`.
	const backendURL = options.proxy ? routePrefix : options.backendURL;
	if (!backendURL) {
		// Production builds drop the setup hint and its variable names.
		throw new Error(
			`@c15t/nextjs: \`backendURL\` is required.${
				process.env.NODE_ENV === 'production'
					? ''
					: ' Set NEXT_PUBLIC_C15T_BACKEND_URL (or NEXT_PUBLIC_INTH_PROJECT_URL), or `backendURL` in c15t.config.ts.'
			}`
		);
	}
	if (mode === undefined) {
		return lazyHosted({ backendURL });
	}
	const data = mode;
	if (data.resolve === 'browser') {
		const {
			resolve: _resolve,
			source: _source,
			type: _type,
			...browser
		} = data;
		return Object.assign(
			lazyBrowserManifest({
				...browser,
				backendURL,
				manifestURL:
					data.manifestURL ??
					(routePrefix === undefined ? undefined : `${routePrefix}/manifest`),
			} as LazyBrowserManifestOptions),
			data
		);
	}
	return Object.assign(
		lazyHosted({
			backendURL,
			initURL: routePrefix === undefined ? undefined : `${routePrefix}/init`,
			kind: 'manifest',
		}),
		data
	);
};
