import { projectUrl as builtProjectUrl, snapshot } from '@inth/sdk/generated';
import {
	manifest as browserManifest,
	withBuildDefaults,
	withEarlyInit,
} from '@inth/sdk/transports/manifest-browser';
import type {
	BrowserManifestModeFactory,
	BrowserManifestOptions,
} from '@inth/sdk/transports/manifest-browser';

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
	// `ConsentProvider` may send the first `/v1/consent/init` during its first render
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
