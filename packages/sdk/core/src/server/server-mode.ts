/**
 * How a server-rendering adapter turns its configured mode into what the
 * render, the consent route and the browser each use. Written once, so the
 * adapters (Next.js, TanStack Start, SvelteKit, Angular SSR, Astro, Nuxt)
 * agree on every mode:
 *
 * - `manifest()`, and no mode at all: the server resolves from the mode's
 *   `snapshot`, else the build's snapshot, else the manifest read at
 *   runtime from `manifestUrl` or `${projectUrl}/manifest`.
 *   `source: 'runtime'` and an absolute `manifestUrl` both mean "read it at
 *   runtime", so neither uses the build's snapshot, and the build makes
 *   none for them ({@link needsBuildSnapshot}). A `/`-relative
 *   `manifestUrl` is on this app's origin: the build still downloads
 *   `${projectUrl}/manifest`, and without that snapshot the server reads
 *   the relative URL. One on the app's own consent route is the browser's
 *   way to that route, which reads `${projectUrl}/manifest`, so the server
 *   and the route read that instead of calling themselves.
 *   `resolve: 'browser'` resolves nothing on the server, and its
 *   `manifestUrl` is what the browser reads in place of the route.
 * - `hosted()`: the server asks the mode's `initUrl`, else
 *   `${projectUrl}/init`, with the mode's `headers`.
 * - `testing()`: the server resolves the test policy offline when the
 *   adapter knows the provider's IAB setting, so it picks the pack the
 *   browser would; otherwise it leaves the policy to the browser. Never in
 *   production.
 *
 * Every render guards the app's own consent route (`routePrefix`, else the
 * default `/api/inth`) against a fetch of itself, and points deferred
 * vendor lists at the route's `/init` when there is one.
 */
import { recommendedPolicyRules } from '@inth/sdk-schema/types';
import type { ConsentManifest, PolicyRule } from '@inth/sdk-schema/types';

import type { ConsentMode, TestingMode } from '../modes';
import { assertNotProduction } from '../transports/testing';
import type { ConsentRouteHandlerOptions } from './consent-route';
import type { ResolveRequestConsentOptions } from './request-consent';
import { DEFAULT_CONSENT_ROUTE_PREFIX } from './shared';

const MODE_TYPES: ReadonlySet<string> = new Set([
	'manifest',
	'hosted',
	'testing',
]);

/**
 * A mode as an adapter receives it: the data from `manifest()`, `hosted()`
 * or `testing()`, or a transport factory that carries the same data as
 * properties. A hosted factory can also carry its own backend.
 */
export type ServerModeInput =
	| ConsentMode
	| ((...args: never[]) => unknown)
	| undefined;

/** The hosted mode's own backend, when its factory carries one. */
interface HostedModeData {
	type: 'hosted';
	projectUrl?: string;
	initUrl?: string;
	headers?: Record<string, string>;
}

/** Options for {@link resolveServerMode}. */
export interface ServerModeOptions {
	/** Package name of the adapter, such as `@inth/nextjs`. Prefixes errors. */
	adapter: string;
	/** The configured mode. `undefined` is `manifest()`. */
	mode: ServerModeInput;
	/** Backend base URL, absolute or `/`-relative. */
	projectUrl?: string;
	/**
	 * Where the app mounts its consent route, already checked, or
	 * `undefined` when it has none.
	 */
	routePrefix?: string;
	/** The browser sends saves through the consent route. */
	proxy?: boolean;
	/**
	 * The snapshot the build downloaded (`@inth/sdk/generated`, or the
	 * adapter's own build output). `undefined` when it made none.
	 */
	buildSnapshot?: ConsentManifest;
	/**
	 * The provider's IAB setting, when the server knows it. `testing()` then
	 * resolves on the server with the same pack the browser picks.
	 */
	iab?: boolean;
	/**
	 * Throw when `manifest()` or `hosted()` has no backend URL. An adapter
	 * that reads its config at setup (a build integration, a config file)
	 * passes `true`, so the mistake stops the build. A render-time caller
	 * leaves it off, and a render without a backend gets the request-only
	 * state.
	 *
	 * @default false
	 */
	checkBackend?: boolean;
	/**
	 * Appended to the missing-backend error: how to set the backend URL in
	 * this framework, such as the environment variable it reads.
	 */
	backendHint?: string;
}

/** What {@link resolveServerMode} returns. */
export interface ServerMode {
	/** The mode as data, `manifest()` when none was configured. */
	mode: ConsentMode;
	/** Options for `resolveRequestConsent`, merged into the adapter's own. */
	consent: Pick<
		ResolveRequestConsentOptions,
		| 'gvlRoute'
		| 'initHeaders'
		| 'initUrl'
		| 'manifest'
		| 'manifestUrl'
		| 'mode'
		| 'offline'
		| 'ownRoutes'
		| 'projectUrl'
	>;
	/** Where the consent route reads the manifest. */
	route: Pick<
		ConsentRouteHandlerOptions,
		'manifest' | 'manifestUrl' | 'projectUrl'
	>;
	/** What the browser receives. */
	browser: {
		/**
		 * The mode without what only the server reads: `snapshot` and
		 * `source` stay on the server unless the browser resolves the
		 * policy itself.
		 */
		mode: ConsentMode;
		/** Where the browser saves: the route prefix when proxied. */
		projectUrl: string | undefined;
	};
}

const isAbsoluteUrl = (url: string | undefined): url is string =>
	url !== undefined && /^https?:\/\//iu.test(url);

/** Whether a `/`-relative URL is the consent route at `prefix` or below. */
const isOnRoute = function isOnRoute(url: string, prefix: string): boolean {
	const [path = ''] = url.split(/[?#]/u);
	return path === prefix || path.startsWith(`${prefix}/`);
};

/**
 * The `manifestUrl` the server and the consent route read, or `undefined`
 * for `${projectUrl}/manifest`.
 */
const serverManifestUrl = function serverManifestUrl(
	mode: ConsentMode,
	routePrefix: string
): string | undefined {
	if (mode.type !== 'manifest' || mode.resolve === 'browser') {
		return undefined;
	}
	const { manifestUrl } = mode;
	if (
		manifestUrl === undefined ||
		(!isAbsoluteUrl(manifestUrl) && isOnRoute(manifestUrl, routePrefix))
	) {
		return undefined;
	}
	return manifestUrl;
};

/**
 * The mode as plain data. A transport factory carrying data is copied
 * without its `kind`; anything else is rejected.
 *
 * @param adapter - Package name for the error.
 * @param mode - The configured mode.
 * @returns The mode's data, `manifest()` for `undefined`.
 * @throws {TypeError} When the mode carries no known `type`.
 */
export const readModeData = function readModeData(
	adapter: string,
	mode: ServerModeInput
): ConsentMode {
	if (mode === undefined) {
		return { type: 'manifest' };
	}
	const type = (mode as { type?: unknown } | null)?.type;
	if (
		(typeof mode !== 'object' && typeof mode !== 'function') ||
		mode === null ||
		typeof type !== 'string' ||
		!MODE_TYPES.has(type)
	) {
		throw new TypeError(
			`${adapter}: \`mode\` must be manifest() or hosted() from ${adapter}, or testing() from ${adapter}/testing. A transport without that data cannot reach the browser; pass it to the browser provider instead.`
		);
	}
	if (typeof mode === 'object') {
		return mode;
	}
	const { kind: _kind, ...data } = { ...mode } as ConsentMode & {
		kind?: unknown;
	};
	return data as ConsentMode;
};

/**
 * Why a build downloads no manifest snapshot for this mode, or `undefined`
 * when it should: `hosted()` and `testing()` read no manifest, a `snapshot`
 * is one already, and `source: 'runtime'` and an absolute `manifestUrl` are
 * read at runtime. A `/`-relative `manifestUrl` still gets the snapshot
 * from `${projectUrl}/manifest`.
 *
 * @param mode - The configured mode, `undefined` for `manifest()`.
 * @returns The reason, for a build's log, or `undefined`.
 */
export const buildSnapshotSkipReason = function buildSnapshotSkipReason(
	mode: ConsentMode | undefined
): string | undefined {
	if (mode === undefined) {
		return undefined;
	}
	switch (mode.type) {
		case 'testing':
			return 'the mode sets testing(), which needs no backend';
		case 'hosted':
			return 'the mode sets hosted(), which asks the backend for each visitor';
		default:
			if (mode.snapshot) {
				return 'the mode passes manifest({ snapshot })';
			}
			if (mode.source === 'runtime') {
				return "the mode sets manifest({ source: 'runtime' })";
			}
			if (isAbsoluteUrl(mode.manifestUrl)) {
				return 'the mode passes an absolute manifest({ manifestUrl }), which the server reads at runtime';
			}
			return undefined;
	}
};

/**
 * Whether a build should download a manifest snapshot for this mode from
 * `${projectUrl}/manifest`. See {@link buildSnapshotSkipReason}.
 *
 * @param mode - The configured mode, `undefined` for `manifest()`.
 * @returns `true` when the server would read a build snapshot.
 */
export const needsBuildSnapshot = function needsBuildSnapshot(
	mode: ConsentMode | undefined
): boolean {
	return buildSnapshotSkipReason(mode) === undefined;
};

/** The manifest the server holds: the mode's own, else the build's. */
const heldManifest = function heldManifest(
	mode: ConsentMode,
	buildSnapshot: ConsentManifest | undefined
): ConsentManifest | undefined {
	if (mode.type === 'manifest' && mode.snapshot) {
		return mode.snapshot;
	}
	const readsAtRuntime =
		mode.type === 'manifest' &&
		(mode.source === 'runtime' || isAbsoluteUrl(mode.manifestUrl));
	return readsAtRuntime ? undefined : buildSnapshot;
};

const assertBackend = function assertBackend(
	options: ServerModeOptions,
	mode: ConsentMode
): void {
	if (!options.checkBackend || mode.type === 'testing') {
		return;
	}
	const hint = options.backendHint ? ` ${options.backendHint}` : '';
	const hosted = mode as HostedModeData;
	if (mode.type === 'hosted') {
		if (
			options.projectUrl === undefined &&
			hosted.projectUrl === undefined &&
			hosted.initUrl === undefined
		) {
			throw new TypeError(
				`${options.adapter}: hosted() needs a backend URL to ask for each visitor's policy.${hint}`
			);
		}
		return;
	}
	if (options.projectUrl === undefined) {
		throw new TypeError(
			mode.snapshot
				? `${options.adapter}: manifest({ snapshot }) still needs a backend URL: the snapshot replaces the manifest download, but the browser saves consent with POST \${projectUrl}/subjects, and the consent route only answers GET.${hint}`
				: `${options.adapter}: manifest() needs a backend URL: the server reads its policy from \${projectUrl}/manifest, and the browser saves consent there with POST /subjects.${hint}`
		);
	}
	if (options.projectUrl === '' && !mode.snapshot && !mode.manifestUrl) {
		throw new TypeError(
			`${options.adapter}: \`projectUrl: ''\` saves consent on this origin but gives the server no manifest to fetch. Pass manifest({ manifestUrl }) or manifest({ snapshot }).`
		);
	}
};

const resolveTesting = function resolveTesting(
	options: ServerModeOptions,
	mode: TestingMode
): ServerMode['consent'] {
	if (options.iab === undefined) {
		// The browser resolves it, with the transport that refuses to run in
		// production.
		return {};
	}
	assertNotProduction(`${options.adapter}/testing`);
	return {
		mode: 'offline',
		offline: {
			iabEnabled: options.iab,
			policyRules:
				mode.policy === undefined
					? recommendedPolicyRules({ iab: mode.iab ?? options.iab })
					: ([] as PolicyRule[]).concat(mode.policy),
		},
	};
};

const resolvePolicy = function resolvePolicy(
	options: ServerModeOptions,
	mode: ConsentMode,
	manifest: ConsentManifest | undefined,
	manifestUrl: string | undefined
): ServerMode['consent'] {
	const { projectUrl, routePrefix } = options;
	switch (mode.type) {
		case 'testing':
			return resolveTesting(options, mode);
		case 'hosted': {
			const hosted = mode as HostedModeData;
			const backend = hosted.projectUrl ?? projectUrl;
			if (backend === undefined && hosted.initUrl === undefined) {
				return {};
			}
			return {
				initHeaders: hosted.headers,
				initUrl: hosted.initUrl,
				mode: 'hosted',
				projectUrl: backend,
			};
		}
		default: {
			if (mode.resolve === 'browser') {
				return {};
			}
			if (!(manifest || manifestUrl || projectUrl)) {
				return {};
			}
			return {
				// The catch-all serves deferred vendor lists on its init path.
				gvlRoute: routePrefix === undefined ? undefined : `${routePrefix}/init`,
				manifest,
				manifestUrl,
				mode: 'manifest',
				projectUrl,
			};
		}
	}
};

/** The browser's copy of the mode. */
const browserModeOf = function browserModeOf(mode: ConsentMode): ConsentMode {
	if (mode.type !== 'manifest' || mode.resolve === 'browser') {
		return mode;
	}
	const { snapshot: _snapshot, source: _source, ...data } = mode;
	return data;
};

/**
 * Resolves an adapter's configured mode for the server render, the consent
 * route and the browser. See the module comment for the rule per mode.
 *
 * @param options - The adapter, its mode, backend, route and build snapshot.
 * @returns The `resolveRequestConsent` options, the route's manifest
 * source, and the browser's copy of the mode and backend.
 * @throws {TypeError} When the mode is not mode data, `proxy` is set
 * without `routePrefix`, or, with `checkBackend`, when `manifest()` or
 * `hosted()` has no backend URL.
 * @example
 * ```ts
 * const server = resolveServerMode({
 *   adapter: '@inth/example',
 *   mode: manifest(),
 *   projectUrl: 'https://consent.example.com',
 *   routePrefix: '/api/inth',
 * });
 * await resolveRequestConsent({ ...server.consent, adapter, request });
 * ```
 */
export const resolveServerMode = function resolveServerMode(
	options: ServerModeOptions
): ServerMode {
	const mode = readModeData(options.adapter, options.mode);
	assertBackend(options, mode);
	if (options.proxy && options.routePrefix === undefined) {
		throw new TypeError(
			`${options.adapter}: \`proxy\` sends saves through the consent route, so it needs \`routePrefix\`.`
		);
	}
	const ownRoute = options.routePrefix ?? DEFAULT_CONSENT_ROUTE_PREFIX;
	const manifest = heldManifest(mode, options.buildSnapshot);
	const manifestUrl = serverManifestUrl(mode, ownRoute);
	return {
		browser: {
			mode: browserModeOf(mode),
			projectUrl: options.proxy ? options.routePrefix : options.projectUrl,
		},
		consent: {
			...resolvePolicy(options, mode, manifest, manifestUrl),
			// The app's own consent route: a render fetching it would call
			// itself. Without a prefix, the conventional mount is guarded.
			ownRoutes: [ownRoute],
		},
		mode,
		route: {
			manifest,
			manifestUrl,
			projectUrl: options.projectUrl,
		},
	};
};
