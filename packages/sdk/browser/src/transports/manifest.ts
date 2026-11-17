/**
 * The browser manifest mode for ES module builds. The resolver lives in
 * `@c15t/core/transports/manifest-browser`, shared with every adapter that
 * resolves a manifest in the browser; this wrapper adds the policy and
 * backend URL the build integration downloaded as defaults.
 */
import { projectUrl as builtProjectUrl, snapshot } from '@c15t/core/generated';
import { manifest as browserManifest } from '@c15t/core/transports/manifest-browser';
import type {
	BrowserManifestModeFactory,
	BrowserManifestOptions,
} from '@c15t/core/transports/manifest-browser';
import type { ConsentManifest } from '@c15t/schema/types';

/** What a build integration downloaded, as `@c15t/core/generated` exports it. */
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
 * Without options it uses what `consentManifest()` from `c15t/build`
 * downloaded: the snapshot and the backend URL from
 * `VITE_C15T_BACKEND_URL` or `VITE_INTH_PROJECT_URL`, both served as
 * `c15t/generated`. Without a
 * snapshot, such as in dev after a failed fetch, it fetches
 * `${projectUrl}/manifest` at runtime. Saves go to the backend either way.
 * With `manifestUrl` or `source: 'runtime'`, also pass `source: 'runtime'`
 * to `consentManifest()`, so the build downloads no snapshot.
 *
 * @param options - Overrides: your own `snapshot`, `source: 'runtime'`, a
 * `manifestUrl`, a `projectUrl`, or the visitor's location as `inputs`.
 * @returns A transport factory for `mode`, carrying its options.
 * @throws {Error} When no snapshot, manifest URL or backend URL is known.
 * @example
 * ```ts
 * import { init, manifest } from '@c15t/browser';
 *
 * init({ mode: manifest() });
 * ```
 */
export const manifest = function manifest(
	options: BrowserManifestOptions = {}
): BrowserManifestModeFactory {
	return browserManifest(
		withBuildDefaults(options, { projectUrl: builtProjectUrl, snapshot })
	);
};

// oxlint-disable-next-line oxc/no-barrel-file -- Part of the public `manifest` export of @c15t/browser.
export { manifestNeedsLocation } from '@c15t/core/transports/manifest-location';
export type {
	BrowserManifestModeFactory,
	BrowserManifestOptions as ManifestModeOptions,
} from '@c15t/core/transports/manifest-browser';
