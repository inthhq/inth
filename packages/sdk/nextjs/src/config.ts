/**
 * `defineConsentConfig` — the app's consent setup, declared once in
 * `inth.config.ts` at the project root.
 *
 * `withConsentManifest` finds that file and hands it to `ConsentRoot`,
 * `resolveConsent`, `createConsentRoute` and the Pages Router helpers, so
 * the app never imports its own config. The module has no `next` or React
 * runtime imports, so the same config is safe on the server and in the
 * browser.
 */

import type { ConsentJourneyOption } from '@inth/sdk/engine';
import type { ConsentMode } from '@inth/sdk/modes';
import { normalizeRoutePrefix, resolveServerMode } from '@inth/sdk/server';

import type { ConsentClientOptions } from './types';

/**
 * Next.js replaces this exact expression with the variable's build-time
 * value in server and browser bundles, so it must stay written out in full.
 * Outside Next.js there may be no `process` at all.
 */
declare const process: { env: Record<string, string | undefined> };

/** Environment variable `projectUrl` defaults to. */
export const BACKEND_URL_ENV = 'NEXT_PUBLIC_INTH_PROJECT_URL';

/**
 * `NEXT_PUBLIC_INTH_PROJECT_URL`, or `undefined` when it is unset or the
 * runtime has no `process`. Only the Inth name is read here, so browser
 * bundles carry one value: `withConsentManifest` sets it from the c15t name
 * when only that is set.
 *
 * @internal
 */
export const readProjectUrlFromEnv = function readProjectUrlFromEnv():
	| string
	| undefined {
	try {
		return process.env.NEXT_PUBLIC_INTH_PROJECT_URL || undefined;
	} catch {
		return undefined;
	}
};

/**
 * The consent setup of a Next.js app: where the backend is, how the
 * visitor's policy is resolved, and the browser options `ConsentRoot`
 * reads.
 *
 * `inth.config.ts` is bundled into the browser as well as the server, so
 * it must hold no secrets. Read server-only values (an API token for
 * `forwardHeaders`, say) in server code instead.
 */
export interface ConsentConfig extends ConsentClientOptions {
	/**
	 * Backend base URL: your Inth project URL. The server reads its
	 * consent manifest (or asks its `/init` with `mode: hosted()`), and
	 * consent saves (`/subjects`) go here. Required unless `mode` is
	 * `testing()`; the environment variables below supply it when unset.
	 *
	 * @default process.env.NEXT_PUBLIC_INTH_PROJECT_URL
	 */
	projectUrl?: string;

	/**
	 * How the visitor's policy is resolved. Plain data, so the browser only
	 * loads the code it runs.
	 *
	 * - Omitted, or `manifest()` from `@inth/nextjs`: resolve from the
	 *   backend's consent manifest, which the build downloads. When it is
	 *   unavailable, the server and the consent route ask the backend's
	 *   `/init` instead and log a warning.
	 * - `hosted()` from `@inth/nextjs`: ask the backend's `/init` for every
	 *   visitor.
	 * - `testing()` from `@inth/nextjs/testing`: the browser resolves a policy
	 *   with no network, for tests. Needs no `projectUrl`, and throws in
	 *   production builds.
	 *
	 * To keep consent out of the way in an app's own tests instead, set
	 * `enabled: false`.
	 *
	 * @default manifest()
	 */
	mode?: ConsentMode;

	/**
	 * Where the app's catch-all consent route from `createConsentRoute` or
	 * `createPagesConsentRoute` is mounted, such as `/api/inth` for
	 * `pages/api/inth/[...inth].ts`. With it, a browser that resolves
	 * consent itself asks `${routePrefix}/init`, which resolves the cached
	 * manifest with the request's geo, instead of the backend's `/init`.
	 * The server never fetches its own route.
	 *
	 * No default: without it there is no route to serve. Leave it unset
	 * when every page resolves consent on the server. `/` is rejected: a
	 * catch-all route at the site root would catch every page.
	 */
	routePrefix?: string;

	/**
	 * The route at {@link routePrefix} was created with
	 * `createConsentRoute({ proxy: true })` (or `createPagesConsentRoute`),
	 * so the browser sends saves through it instead of straight to
	 * `projectUrl`. The server helpers
	 * keep using those URLs, so keep them absolute. Needs `routePrefix`.
	 * Same option as TanStack Start's `createConsentStateHandler({ proxy })`.
	 *
	 * @default false
	 */
	proxy?: boolean;

	/**
	 * The consent journey scope, read by both `resolveConsent` and
	 * `ConsentRoot` so they agree.
	 */
	journey?: ConsentJourneyOption;
}

/**
 * Accepts `/`-relative paths (`/api/consent`) and absolute `http(s)` URLs.
 * Protocol-relative `//host` and bare `api/consent` are rejected: the
 * server helpers resolve relative values against the request host, and
 * both would resolve somewhere the author did not intend.
 */
const isConsentURL = function isConsentURL(value: string): boolean {
	if (value.startsWith('/')) {
		return !value.startsWith('//');
	}
	try {
		const url = new URL(value);
		return url.protocol === 'http:' || url.protocol === 'https:';
	} catch {
		return false;
	}
};

const assertConsentURL = function assertConsentURL(
	field: string,
	value: unknown
): void {
	if (value === undefined) {
		return;
	}
	if (typeof value !== 'string' || !isConsentURL(value)) {
		throw new TypeError(
			`@inth/nextjs: defineConsentConfig \`${field}\` must be an absolute http(s) URL or a \`/\`-relative path, received ${JSON.stringify(value)}.`
		);
	}
};

/**
 * Checks a config's `routePrefix` and removes its trailing slashes. A
 * `/`-relative path goes through the shared check, which rejects `/`; an
 * absolute `http(s)` URL is kept; anything else is rejected.
 *
 * @param routePrefix - The configured prefix.
 * @returns The prefix without a trailing slash.
 * @throws {TypeError} When the prefix is `/`, or neither a path nor an
 * absolute `http(s)` URL.
 * @internal
 */
export const checkRoutePrefix = function checkRoutePrefix(
	routePrefix: string
): string {
	if (typeof routePrefix === 'string' && routePrefix.startsWith('/')) {
		return normalizeRoutePrefix('@inth/nextjs', routePrefix);
	}
	assertConsentURL('routePrefix', routePrefix);
	return routePrefix.replace(/\/+$/u, '');
};

/**
 * The checks `defineConsentConfig` runs on the server.
 *
 * @throws {TypeError} See {@link defineConsentConfig}.
 */
const assertConsentConfig = function assertConsentConfig(
	config: ConsentConfig
): void {
	if (typeof config !== 'object' || config === null) {
		throw new TypeError('@inth/nextjs: defineConsentConfig expects an object.');
	}
	const projectUrl = config.projectUrl ?? readProjectUrlFromEnv();
	const { mode } = resolveServerMode({
		adapter: '@inth/nextjs',
		backendHint: `Set ${BACKEND_URL_ENV} at build time, or \`projectUrl\` in inth.config.ts.`,
		checkBackend: true,
		mode: config.mode,
		projectUrl,
		proxy: config.proxy,
		routePrefix:
			config.routePrefix === undefined
				? undefined
				: checkRoutePrefix(config.routePrefix),
	});
	assertConsentURL('projectUrl', projectUrl);
	if (mode?.type === 'manifest') {
		assertConsentURL('mode.manifestUrl', mode.manifestUrl);
		assertConsentURL('mode.geoUrl', mode.geoUrl);
	}
	if (
		config.journey !== undefined &&
		config.journey !== false &&
		config.journey !== 'page' &&
		config.journey !== 'tab'
	) {
		throw new TypeError(
			"@inth/nextjs: defineConsentConfig `journey` must be 'page', 'tab' or false."
		);
	}
};

/**
 * Declare the app's consent setup in `inth.config.ts` at the project root.
 * `withConsentManifest` in `next.config.ts` finds the file, so
 * `ConsentRoot`, `resolveConsent()`, `createConsentRoute()` and the Pages
 * Router helpers read it without the app importing it.
 *
 * The file is bundled into the browser too, so it can hold functions (such
 * as `scripts`) but must hold no secrets.
 *
 * @param config - Backend URL (defaults to `NEXT_PUBLIC_INTH_PROJECT_URL`),
 * mode, route prefix, journey and the browser options.
 * The checks run where Next.js first evaluates the file: the build, and
 * every server render. A browser bundle skips them.
 *
 * @returns The validated, frozen config.
 * @throws {TypeError} When no backend URL is set and `mode` is not
 * `testing()`, a URL is neither an absolute `http(s)` URL nor a
 * `/`-relative path, `routePrefix` is `/`, `proxy` is set without
 * `routePrefix`, or `mode` or `journey` is not one this package knows.
 * @example
 * ```ts
 * // inth.config.ts
 * import { posthog } from '@inth/integrations/posthog';
 * import { defineConsentConfig } from '@inth/nextjs';
 *
 * export default defineConsentConfig({
 *   scripts: [posthog({ id: 'phc_your_project_key' })],
 * });
 * ```
 */
export const defineConsentConfig = function defineConsentConfig(
	config: ConsentConfig = {}
): ConsentConfig {
	// Next.js renders `inth.config.ts` on the server before any browser
	// runs it, and `withConsentManifest` reads it at build time, so the
	// checks run there. Turbopack resolves `typeof window` in browser
	// bundles, which then drop them.
	if (typeof window === 'undefined') {
		assertConsentConfig(config);
	}
	const projectUrl = config.projectUrl ?? readProjectUrlFromEnv();
	const defined: ConsentConfig = { ...config };
	if (projectUrl !== undefined) {
		defined.projectUrl = projectUrl;
	}
	if (config.routePrefix !== undefined) {
		defined.routePrefix = config.routePrefix.replace(/\/+$/u, '');
	}
	return Object.freeze(defined);
};
