import {
	projectUrl as generatedProjectUrl,
	snapshot as generatedSnapshot,
} from '@inth/nextjs/generated-manifest';
import userConfig from '@inth/nextjs/user-config';
/**
 * Where the server helpers resolve consent from, read from
 * `inth.config.ts` and the build-time snapshot.
 *
 * @internal
 */
import type { ManifestMode } from '@inth/sdk/modes';
import type { ConsentManifest } from '@inth/sdk/schema/types';

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
	 * `NEXT_PUBLIC_INTH_PROJECT_URL`.
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
	projectUrl: string | undefined;
	mode: 'hosted' | 'manifest' | undefined;
	manifestUrl: string | undefined;
	snapshot: ConsentManifest | undefined;
	/** Hosted mode's `/init` headers. */
	initHeaders: Record<string, string> | undefined;
	routePrefix: string | undefined;
}

const isPath = (url: string | undefined): url is string =>
	url !== undefined && url.startsWith('/') && !url.startsWith('//');

/**
 * The config's route prefix, checked as `defineConsentConfig` checks it: a
 * config passed straight to a helper skips that function.
 *
 * @param config - The config the helper reads.
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

/** The backend URL: explicit, then the config's, the env's, the build's. */
const resolveProjectUrl = function resolveProjectUrl(
	options: ConsentSourceOptions,
	config: ConsentConfig | undefined
): string | undefined {
	return (
		options.projectUrl ??
		config?.projectUrl ??
		readProjectUrlFromEnv() ??
		generatedProjectUrl
	);
};

/** Where `manifest()` (or an explicit manifest source) resolves from. */
const resolveManifestSource = function resolveManifestSource(
	options: ConsentSourceOptions,
	mode: ManifestMode | undefined,
	projectUrl: string | undefined
): Pick<ConsentSource, 'manifestUrl' | 'mode' | 'snapshot'> {
	const manifestMode = mode;
	// A `/`-relative manifestUrl is the browser's, usually the app's route.
	const modeURL = isPath(manifestMode?.manifestUrl)
		? undefined
		: manifestMode?.manifestUrl;
	const manifestUrl = options.manifestUrl ?? modeURL;
	const buildSnapshot =
		manifestUrl === undefined && manifestMode?.source !== 'runtime'
			? generatedSnapshot
			: undefined;
	const snapshot = options.snapshot ?? manifestMode?.snapshot ?? buildSnapshot;
	const resolvable =
		snapshot !== undefined ||
		manifestUrl !== undefined ||
		projectUrl !== undefined;
	return {
		manifestUrl,
		mode: resolvable ? 'manifest' : undefined,
		snapshot,
	};
};

/**
 * The config, mode and manifest source for a server helper call.
 *
 * - `manifest()` resolves from the snapshot, unless the mode
 *   says `source: 'runtime'` or names an absolute `manifestUrl`, which the
 *   server then fetches. A `/`-relative `manifestUrl` is the browser's,
 *   usually the app's own route, so the server reads
 *   `${projectUrl}/manifest` instead.
 * - No mode means `manifest()`.
 * - `hosted()` asks the hosted backend's `${projectUrl}/init`.
 * - `testing()` resolves nothing on the server; the browser does.
 *
 * @param options - Explicit overrides of the config.
 * @returns Where to resolve from.
 * @internal
 */
export const resolveConsentSource = function resolveConsentSource(
	options: ConsentSourceOptions = {}
): ConsentSource {
	const config = options.config ?? userConfig;
	const mode = config?.mode;
	const routePrefix = readConfigRoutePrefix(config);
	const projectUrl = resolveProjectUrl(options, config);
	const forcedManifest =
		options.manifestUrl !== undefined || options.snapshot !== undefined;
	const none = {
		config,
		initHeaders: undefined,
		manifestUrl: undefined,
		routePrefix,
		snapshot: undefined,
	};
	if (mode?.type === 'testing' && !forcedManifest) {
		return { ...none, mode: undefined, projectUrl: undefined };
	}
	if (mode?.type === 'hosted' && !forcedManifest) {
		return {
			...none,
			mode: projectUrl === undefined ? undefined : 'hosted',
			projectUrl,
		};
	}
	return {
		...none,
		...resolveManifestSource(
			options,
			mode?.type === 'manifest' ? mode : undefined,
			projectUrl
		),
		projectUrl,
	};
};
