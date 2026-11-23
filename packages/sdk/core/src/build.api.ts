/**
 * Node-only: the manifest request framework build integrations send.
 *
 * @packageDocumentation
 * @internal
 */
import type { ConsentManifest } from '@inth/sdk-schema/types';

import { loadStaticManifest } from './server/static-manifest.api';
import { V1_ROUTES } from './transports/v1/v1-routes';

/**
 * The manifest URL a build reads: `manifestUrl`, or the backend URL's
 * `/v1/consent/manifest`.
 * @throws {Error} When the source is not an absolute http(s) URL.
 * @internal
 */
export const resolveBuildManifestUrl = (
	options: {
		projectUrl?: string;
		manifestUrl?: string;
	},
	label: string
): string => {
	const source = options.manifestUrl ?? options.projectUrl;
	let url: URL;
	try {
		url = new URL(source ?? '');
	} catch {
		throw new Error(
			`${label}: build-time manifests require an absolute upstream URL.`
		);
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') {
		throw new Error(
			`${label}: build-time manifests require an http(s) upstream URL.`
		);
	}
	if (options.manifestUrl === undefined) {
		url.pathname = `${url.pathname.replace(/\/+$/u, '')}${V1_ROUTES.manifest}`;
	}
	return url.href;
};

/**
 * Loads a snapshot from an absolute upstream URL during framework setup.
 * @param options - Manifest URL, or backend URL whose `/v1/consent/manifest` is read.
 * @param label - Framework name for errors.
 * @throws {Error} When the source is relative, missing or cannot be fetched.
 * @internal
 */
export const loadBuildManifest = (
	options: {
		projectUrl?: string;
		manifestUrl?: string;
		fetch?: typeof globalThis.fetch;
	},
	label: string
): Promise<ConsentManifest> =>
	loadStaticManifest(
		{
			fetch: options.fetch,
			manifestUrl: resolveBuildManifestUrl(options, label),
		},
		label
	);

/**
 * Longest a build or dev server waits for the manifest, in milliseconds.
 * A backend that never answers then counts as a failed fetch instead of
 * holding the command.
 */
export const BUILD_MANIFEST_TIMEOUT_MS = 10_000;

/**
 * {@link loadBuildManifest} with the given or global `fetch`, waiting at
 * most {@link BUILD_MANIFEST_TIMEOUT_MS} for the backend.
 * @param source - Manifest URL, or backend URL whose `/v1/consent/manifest` is read.
 * @param label - Framework name for errors.
 * @internal
 */
export const loadBuildManifestWithTimeout = (
	source: {
		projectUrl?: string;
		manifestUrl?: string;
		fetch?: typeof globalThis.fetch;
	},
	label: string
): Promise<ConsentManifest> => {
	const fetchImpl = source.fetch ?? globalThis.fetch?.bind(globalThis);
	return loadBuildManifest(
		{
			...source,
			fetch:
				fetchImpl &&
				((input, init) =>
					fetchImpl(input, {
						...init,
						signal: AbortSignal.timeout(BUILD_MANIFEST_TIMEOUT_MS),
					})),
		},
		label
	);
};
