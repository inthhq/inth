/**
 * The browser manifest mode for ES module builds. The resolver lives in
 * `@inth/sdk/transports/manifest-browser`, shared with every adapter that
 * resolves a manifest in the browser; this wrapper adds the policy and
 * backend URL the build integration downloaded as defaults.
 */
import {
	projectUrl as builtProjectUrl,
	snapshot,
} from '@inth/sdk-core/generated';
import {
	manifest as browserManifest,
	withBuildDefaults,
} from '@inth/sdk-core/transports/manifest-browser';
import type {
	BrowserManifestModeFactory,
	BrowserManifestOptions,
} from '@inth/sdk-core/transports/manifest-browser';

/**
 * Resolve the policy in the browser from the backend's consent manifest.
 *
 * Without options it uses what `consentManifest()` from `@inth/sdk/build`
 * downloaded: the snapshot and the backend URL from
 * `VITE_INTH_PROJECT_URL`, both served as
 * `@inth/sdk/generated`. Without a
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
 * import { init, manifest } from '@inth/sdk';
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

// oxlint-disable-next-line oxc/no-barrel-file -- Part of the public `manifest` export of @inth/sdk.
export { manifestNeedsLocation } from '@inth/sdk-core/transports/manifest-location';
export type {
	BrowserManifestModeFactory,
	BrowserManifestOptions as ManifestModeOptions,
} from '@inth/sdk-core/transports/manifest-browser';
