import userConfig from '@inth/nextjs/user-config';
import {
	projectUrl as generatedProjectUrl,
	snapshot as generatedSnapshot,
} from '@inth/sdk/generated';
/**
 * Where the server helpers resolve consent from, read from
 * `inth.config.ts` and the build-time snapshot.
 *
 * @internal
 */
import type { ConsentMode, ManifestMode } from '@inth/sdk/modes';
import type { ConsentManifest } from '@inth/sdk/schema/types';
import { resolveServerMode } from '@inth/sdk/server';
import type { ServerMode } from '@inth/sdk/server';

import type { ConsentConfig } from './config';
import { checkRoutePrefix, readProjectUrlFromEnv } from './config';

/** Options every server helper takes to override `inth.config.ts`. */
export interface ConsentSourceOptions {
	/**
	 * The config to use instead of `inth.config.ts`.
	 */
	config?: ConsentConfig;

	/**
	 * Backend base URL. Defaults to the config's, then
	 * `NEXT_PUBLIC_INTH_PROJECT_URL` (or `NEXT_PUBLIC_C15T_BACKEND_URL`).
	 */
	projectUrl?: string;

	/**
	 * Absolute `GET /manifest` URL. Defaults to the mode's absolute
	 * `manifestUrl`, then `${projectUrl}/manifest`. Setting it resolves
	 * from the manifest whatever the mode.
	 */
	manifestUrl?: string;

	/**
	 * A manifest to resolve from, in place of the snapshot
	 * `withConsentManifest` downloaded. Setting it resolves from the
	 * manifest whatever the mode.
	 */
	snapshot?: ConsentManifest;
}

/** What the server resolves from. */
export interface ConsentSource {
	config: ConsentConfig | undefined;
	routePrefix: string | undefined;
	/** The mode as the render, the consent route and the browser read it. */
	server: ServerMode;
}

/**
 * The config's route prefix, checked as `defineConsentConfig` checks it: a
 * config passed straight to a helper skips that function.
 *
 * @returns The prefix without a trailing slash, or `undefined`.
 * @throws {TypeError} When the prefix is `/`, or neither a `/`-relative
 * path nor an absolute `http(s)` URL.
 * @internal
 */
export const readConfigRoutePrefix = function readConfigRoutePrefix(
	config: ConsentConfig | undefined
): string | undefined {
	const routePrefix = config?.routePrefix;
	if (routePrefix === undefined) {
		return undefined;
	}
	return checkRoutePrefix(routePrefix);
};

/**
 * The config's mode, unless the helper names a manifest itself: an explicit
 * `manifestUrl` or `snapshot` resolves from the manifest whatever the mode.
 */
const modeFor = function modeFor(
	options: ConsentSourceOptions,
	config: ConsentConfig | undefined
): ConsentMode | undefined {
	const mode = config?.mode;
	if (options.manifestUrl === undefined && options.snapshot === undefined) {
		return mode;
	}
	const {
		resolve: _resolve,
		source: _source,
		...base
	}: ManifestMode = mode?.type === 'manifest' ? mode : { type: 'manifest' };
	const forced: ManifestMode = { ...base };
	if (options.manifestUrl !== undefined) {
		forced.manifestUrl = options.manifestUrl;
	}
	if (options.snapshot !== undefined) {
		forced.snapshot = options.snapshot;
	}
	return forced;
};

/**
 * The config, mode and manifest source for a server helper call, by the
 * rule `resolveServerMode` in `@inth/sdk/server` applies in every adapter.
 * The backend URL is the option's, then the config's, then
 * `NEXT_PUBLIC_INTH_PROJECT_URL` (or `NEXT_PUBLIC_C15T_BACKEND_URL`), then
 * the one the build read.
 *
 * @internal
 */
export const resolveConsentSource = function resolveConsentSource(
	options: ConsentSourceOptions = {}
): ConsentSource {
	const config = options.config ?? userConfig;
	const routePrefix = readConfigRoutePrefix(config);
	const server = resolveServerMode({
		adapter: '@inth/nextjs',
		buildSnapshot: generatedSnapshot,
		mode: modeFor(options, config),
		projectUrl:
			options.projectUrl ??
			config?.projectUrl ??
			readProjectUrlFromEnv() ??
			generatedProjectUrl,
		routePrefix,
		serverResolvesBrowserMode: true,
	});
	return { config, routePrefix, server };
};
