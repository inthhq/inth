import type { ProviderTransportFactory } from '@inth/react';
/**
 * The transport `ConsentRoot` runs for a config's mode, built from
 * `@inth/sdk/runtime/client-mode`.
 *
 * Each mode's code loads with `import()` from core's self-contained
 * chunks (`@inth/sdk/runtime/lazy-*`), which share no module with the
 * page. A loader that imports a transport module the page also uses
 * makes Turbopack split the page's first-load chunk by which lazy chunk
 * shares each module, costing several hundred bytes gzip per page.
 *
 * @internal
 */
import type { ConsentMode } from '@inth/sdk/modes';
import { testingOptionsOf } from '@inth/sdk/modes';
import {
	lazyBrowserManifest,
	lazyHosted,
	lazyTesting,
} from '@inth/sdk/runtime/client-mode';
import type { LazyBrowserManifestOptions } from '@inth/sdk/runtime/client-mode';

/**
 * Bundlers replace `process.env.NODE_ENV` at build time, so production
 * bundles drop the warnings behind it.
 */
declare const process: { env: { NODE_ENV?: string } };

let warnedImplementation = false;

/** Where the transport sends requests. */
export interface NextClientModeOptions {
	/** Backend URL for saves, and for `GET /init` in hosted mode. */
	projectUrl?: string;
	/**
	 * The consent route forwards writes, so the browser sends everything
	 * to `routePrefix`, even for a `hosted()` with its own `projectUrl`.
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
 *   `${routePrefix}/init`, else `${projectUrl}/init`.
 * - `manifest({ resolve: 'browser' })`: the browser resolver, loaded on
 *   first init, reading `${routePrefix}/manifest`, else
 *   `${projectUrl}/manifest`.
 * - `hosted()`: the hosted backend's transport, loaded on first init.
 * - `testing()` from `@inth/nextjs/testing`: the transport that
 *   resolves the recommended pack in the browser, loaded on first init.
 *   The loaded chunk throws in production builds.
 *
 * @param selected - The mode as data, a transport factory, used as is, or
 *   `undefined` for `manifest()`.
 * @param options - Backend URL, route prefix and `proxy`.
 * @returns A provider transport factory.
 * @throws {Error} When the hosted backend or `manifest()` has no backend
 *   URL.
 * @internal
 */
export const createClientMode = function createClientMode(
	selected: ConsentMode | ProviderTransportFactory | undefined,
	options: NextClientModeOptions
): ProviderTransportFactory {
	const mode = selected ?? { type: 'manifest' as const };
	if (typeof mode === 'function') {
		if (process.env.NODE_ENV !== 'production' && !warnedImplementation) {
			warnedImplementation = true;
			console.warn(
				`[c15t] ConsentRoot \`mode\` is the ${mode.kind}() transport itself, so its code ships in the first-load bundle. Use ${mode.kind}() from @inth/nextjs instead: it is plain data, and the root loads the code only when it runs.`
			);
		}
		return mode;
	}
	// `defineConsentConfig` trimmed the prefix and checked that the mode
	// has a backend URL. Without a config there may be none: say so rather
	// than run a mode the app never chose.
	const { routePrefix } = options;
	if (mode?.type === 'testing') {
		return lazyTesting('@inth/nextjs/testing', testingOptionsOf(mode));
	}
	// Saves never fall back to `routePrefix`: the route takes writes only
	// with `proxy`.
	const projectUrl = options.proxy ? routePrefix : options.projectUrl;
	if (!projectUrl) {
		// Production builds drop the setup hint and its variable names.
		throw new Error(
			`@inth/nextjs: \`projectUrl\` is required.${
				process.env.NODE_ENV === 'production'
					? ''
					: ' Set NEXT_PUBLIC_C15T_BACKEND_URL (or NEXT_PUBLIC_INTH_PROJECT_URL), or `projectUrl` in c15t.config.ts.'
			}`
		);
	}
	if (mode.type === 'hosted') {
		return lazyHosted({ projectUrl });
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
				manifestUrl:
					data.manifestUrl ??
					(routePrefix === undefined ? undefined : `${routePrefix}/manifest`),
				projectUrl,
			} as LazyBrowserManifestOptions),
			data
		);
	}
	return Object.assign(
		lazyHosted({
			initUrl: routePrefix === undefined ? undefined : `${routePrefix}/init`,
			kind: 'manifest',
			projectUrl,
		}),
		data
	);
};
