import { projectUrl as builtProjectUrl, snapshot } from '@inth/sdk/generated';
/**
 * Manifest mode for the React provider: core's browser resolver, with the
 * policy and backend URL the build integration downloaded as defaults.
 */
import type { ConsentManifest } from '@inth/sdk/schema/types';
import {
	manifest as browserManifest,
	withEarlyInit,
} from '@inth/sdk/transports/manifest-browser';
import type {
	BrowserManifestModeFactory,
	BrowserManifestOptions,
} from '@inth/sdk/transports/manifest-browser';

/** What a build integration downloaded, as `@inth/sdk/generated` exports it. */
export interface BuildOutput {
	projectUrl?: string;
	snapshot?: ConsentManifest;
}

/**
 * Fill the options the page left out from the build: the backend URL that
 * saves go to, and the snapshot unless the page passed one, a
 * `manifestUrl`, or `source: 'runtime'`.
 *
 * @param options - The page's options.
 * @param build - What the build downloaded.
 * @returns The options `manifest()` resolves with.
 * @internal
 */
export const withBuildDefaults = function withBuildDefaults(
	options: BrowserManifestOptions,
	build: BuildOutput
): BrowserManifestOptions {
	const settings: BrowserManifestOptions = { ...options };
	// Saves go to the build's backend even when `manifestUrl` names where
	// the policy comes from, such as a CDN.
	if (build.projectUrl !== undefined && settings.projectUrl === undefined) {
		settings.projectUrl = build.projectUrl;
	}
	if (settings.manifestUrl !== undefined) {
		return settings;
	}
	if (
		build.snapshot &&
		settings.snapshot === undefined &&
		settings.source !== 'runtime'
	) {
		(settings as { snapshot?: ConsentManifest }).snapshot = build.snapshot;
	}
	return settings;
};

/**
 * Resolve the policy in the browser from the backend's consent manifest.
 *
 * Without options it uses what `consentManifest()` from `@inth/sdk/build`
 * downloaded: the snapshot and the backend URL from
 * `VITE_INTH_PROJECT_URL` or `VITE_INTH_PROJECT_URL`, both served as
 * `@inth/sdk/generated`. Without a
 * snapshot, such as in dev after a failed fetch, it fetches
 * `${projectUrl}/manifest` at runtime. Saves go to the backend either way.
 * With `manifestUrl` or `source: 'runtime'`, also pass `source: 'runtime'`
 * to `consentManifest()`, so the build downloads no snapshot.
 *
 * @param options - Overrides: your own `snapshot`, `source: 'runtime'`, a
 * `manifestUrl`, a `projectUrl`, or the visitor's location as `inputs`.
 * @returns A transport factory for the provider's `mode`, carrying its
 * options.
 * @throws {Error} When no snapshot, manifest URL or backend URL is known.
 * @example
 * ```tsx
 * import { ConsentProvider, manifest } from '@inth/react';
 *
 * <ConsentProvider options={{ mode: manifest() }}>{children}</ConsentProvider>;
 * ```
 */
export const manifest = function manifest(
	options: BrowserManifestOptions = {}
): BrowserManifestModeFactory {
	// `ConsentProvider` may send the first `/init` during its first render
	// when the snapshot can't answer for an unknown location.
	return withEarlyInit(
		browserManifest(
			withBuildDefaults(options, { projectUrl: builtProjectUrl, snapshot })
		)
	);
};

export type {
	BrowserManifestModeFactory,
	BrowserManifestOptions as ManifestModeOptions,
} from '@inth/sdk/transports/manifest-browser';
