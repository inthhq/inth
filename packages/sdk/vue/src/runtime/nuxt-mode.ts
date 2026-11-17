/**
 * How the Nuxt module's `mode` and `routePrefix` options read on the
 * server and in the browser. Both come from `nuxt.config.ts` only, so the
 * build and every runtime agree on them.
 */
import type {
	ConsentMode,
	WithoutNetworkTestingData,
} from '@c15t/core/modes';

/** Where the module serves its consent route unless `routePrefix` says otherwise. */
export const DEFAULT_NUXT_ROUTE_PREFIX = '/api/c15t';

/** The Nuxt module options that choose where the policy comes from. */
export interface NuxtConsentModeConfig {
	/**
	 * Backend URL. Defaults to `NUXT_PUBLIC_C15T_BACKEND_URL`, then
	 * `NUXT_PUBLIC_INTH_PROJECT_URL`, read when the build starts and again
	 * by the server at runtime.
	 */
	backendURL?: string;
	/**
	 * Resolve the visitor's policy from the backend's consent manifest:
	 * `manifest()` from `c15t/vue`. Plain data, read from `nuxt.config.ts`
	 * only. Omit it to ask the hosted backend's `/init` at `backendURL`.
	 */
	mode?: ConsentMode;
	/**
	 * Replace the backend in a test: `withoutNetwork()` from
	 * `c15t/vue/testing`. The browser resolves the recommended policy pack
	 * with no network, and its transport throws in production builds. Wins
	 * over `mode` and needs no `backendURL`.
	 */
	testing?: WithoutNetworkTestingData;
	/**
	 * Path of the one consent route the module adds in `manifest()` mode. It
	 * answers `${routePrefix}/init` and `${routePrefix}/manifest`. `false`
	 * adds no route: the server render resolves from the manifest itself,
	 * and the browser asks the backend. `/` is rejected when the module
	 * sets up: a catch-all route at the site root would catch every page.
	 *
	 * @default '/api/c15t'
	 */
	routePrefix?: string | false;
}

const trimTrailingSlashes = function trimTrailingSlashes(path: string): string {
	return path.replace(/\/+$/u, '');
};

/** The hosted backend, which a config with no `mode` uses. @internal */
export interface NuxtHostedMode {
	type: 'hosted';
	/** Consent headers forwarded to `/init`. */
	headers?: Record<string, string>;
}

/** What a config resolves to: `manifest()`, hosted, or a testing value. @internal */
export type NuxtMode = ConsentMode | NuxtHostedMode | WithoutNetworkTestingData;

/** A mode config holding the mode the build resolved. @internal */
export type NuxtResolvedModeConfig = Omit<NuxtConsentModeConfig, 'mode'> & {
	mode?: NuxtMode;
};

/**
 * The mode a config names: its testing value, then its `mode`, then the
 * hosted backend.
 *
 * @param config - The module options or the public runtime config.
 * @returns The mode as data.
 * @internal
 */
export const readNuxtMode = function readNuxtMode(
	config: Pick<NuxtResolvedModeConfig, 'mode' | 'testing'>
): NuxtMode {
	if (config.testing) {
		return { ...config.testing, type: 'without-network' };
	}
	return config.mode ?? { type: 'hosted' };
};

/**
 * The consent route's path prefix, or `undefined` when the app has no
 * consent route: `routePrefix: false`, or a mode other than `manifest()`.
 * The module checked the prefix at setup (it rejects `/`), so this runs in
 * the browser without the check.
 *
 * @param config - The module options or the public runtime config.
 * @returns The prefix without a trailing slash.
 * @internal
 */
export const readNuxtRoutePrefix = function readNuxtRoutePrefix(
	config: NuxtResolvedModeConfig
): string | undefined {
	if (
		config.routePrefix === false ||
		readNuxtMode(config).type !== 'manifest'
	) {
		return undefined;
	}
	return trimTrailingSlashes(config.routePrefix ?? DEFAULT_NUXT_ROUTE_PREFIX);
};

/**
 * Whether the server render resolves the visitor's policy: `hosted()` and
 * `manifest()`. `manifest({ resolve: 'browser' })` is for pages the server
 * does not render per visitor, and `local()` resolves in the browser,
 * where its rules and copy load on demand.
 *
 * @param mode - The mode.
 * @returns `true` when the browser receives a resolved policy.
 * @internal
 */
export const resolvesOnServer = function resolvesOnServer(
	mode: NuxtMode
): boolean {
	if (mode.type === 'manifest') {
		return mode.resolve !== 'browser';
	}
	return mode.type === 'hosted';
};
