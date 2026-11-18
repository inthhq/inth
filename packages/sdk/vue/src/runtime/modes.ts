/**
 * The transports a plain Vue app's `app.use(inthVue, …)` selects:
 * `manifest()` for `mode`, and the hosted backend for `projectUrl`.
 *
 * Each is the transport itself, imported statically: a single-page app has
 * one environment, so a bundler drops the code the app does not use. Both
 * read the backend URL, and `manifest()` the snapshot, from
 * `@inth/sdk/generated`, which `consentManifest()` from `@inth/vue/vite`
 * fills in during the build.
 */
import type {
	HostedModeFactory,
	ProviderTransportFactory,
} from '@inth/sdk/engine';
import {
	projectUrl as builtProjectUrl,
	snapshot as builtSnapshot,
} from '@inth/sdk/generated';
import type { HostedMode } from '@inth/sdk/modes';
import type { ConsentTesting } from '@inth/sdk/testing';
import { hosted as coreHosted } from '@inth/sdk/transports';
import { manifest as browserManifest } from '@inth/sdk/transports/manifest-browser';
import type {
	BrowserManifestModeFactory,
	BrowserManifestOptions,
} from '@inth/sdk/transports/manifest-browser';

import { VITE_PROJECT_URL_ENV } from './env-names';

export type {
	HostedModeFactory,
	ProviderTransportFactory,
} from '@inth/sdk/engine';
export type { BrowserManifestModeFactory } from '@inth/sdk/transports/manifest-browser';

/**
 * Bundlers replace `process.env.NODE_ENV` at build time, so production
 * bundles drop the setup hint behind it.
 */
declare const process: { env: { NODE_ENV?: string } };

/** The error for a mode with no backend URL, with the setup hint in dev. */
const missingProjectUrl = function missingProjectUrl(
	mode: 'hosted' | 'manifest'
): Error {
	let hint = '';
	try {
		if (process.env.NODE_ENV !== 'production') {
			hint = ` Add consentManifest() from @inth/vue/vite to vite.config.ts and set ${VITE_PROJECT_URL_ENV}, or pass \`projectUrl\`.`;
		}
	} catch {
		// No bundler and no `process`: the short message has to do.
	}
	return new Error(
		mode === 'hosted'
			? `inth: \`projectUrl\` is required.${hint}`
			: `inth: ${mode}() has no backend URL.${hint}`
	);
};

/**
 * Resolve the visitor's policy in the browser from the backend's consent
 * manifest, the default for single-page apps.
 *
 * Without options it uses the manifest and backend URL `consentManifest()`
 * downloaded during the build. With `manifestUrl` it fetches that URL when
 * the app starts and ignores the build's snapshot. With no build snapshot
 * (a dev server that could not reach the backend, or `source: 'runtime'`)
 * it fetches `${projectUrl}/manifest` when the app starts. With
 * `manifestUrl` or `source: 'runtime'`, also pass `source: 'runtime'` to
 * `consentManifest()`, so the build downloads no snapshot. English copy is
 * bundled; other languages load on demand.
 *
 * The browser does not know where the visitor is, so when the policy
 * depends on location, the first visit asks the backend's `/init`, as in
 * every single-page app. Pass `inputs` when the page knows the location, or
 * `geoUrl` for a route that answers it. `initFallback: false` resolves as
 * for an unknown location instead, with no request.
 *
 * @param options - Overrides for the build's backend URL and snapshot.
 * @returns A transport factory for `mode`.
 * @throws {Error} When no backend URL is set or derivable.
 * @example
 * ```ts
 * import { inthVue, manifest } from '@inth/vue/vue-plugin';
 *
 * app.use(inthVue, { mode: manifest() });
 * ```
 */
export const manifest = function manifest(
	options: Partial<BrowserManifestOptions> = {}
): BrowserManifestModeFactory {
	// Test the build's URL on its own: a build that baked one in folds the
	// check, and its error message, away.
	if (
		builtProjectUrl === undefined &&
		options.projectUrl === undefined &&
		options.manifestUrl === undefined
	) {
		throw missingProjectUrl('manifest');
	}
	return browserManifest({
		// A `manifestUrl` is fetched at runtime, so the build's snapshot is
		// left out, as with `source: 'runtime'`. A snapshot you pass replaces
		// it.
		snapshot:
			options.manifestUrl || options.source === 'runtime'
				? undefined
				: builtSnapshot,
		...options,
		projectUrl: options.projectUrl ?? builtProjectUrl,
	} as BrowserManifestOptions);
};

/**
 * The transport the plugin's options select: `mode` when it is a factory
 * or a `testing()` value, else the hosted backend at `projectUrl`, which
 * defaults to the URL `consentManifest()` read from
 * `VITE_INTH_PROJECT_URL`.
 *
 * @param options - The plugin's `projectUrl` and `mode`.
 * @returns A transport factory for the runtime's `mode`.
 * @throws {Error} When none of them is set and the build set no URL.
 * @internal
 */
export const selectedMode = function selectedMode(options: {
	projectUrl?: string;
	mode?: ProviderTransportFactory | HostedMode | ConsentTesting;
}): ProviderTransportFactory {
	const { mode } = options;
	if (typeof mode === 'function') {
		return mode;
	}
	// A `testing()` value carries its transport, not enumerable.
	if (mode && 'transport' in mode && mode.transport) {
		return mode.transport;
	}
	const projectUrl = options.projectUrl ?? builtProjectUrl;
	if (projectUrl === undefined) {
		throw missingProjectUrl('hosted');
	}
	return coreHosted({ projectUrl }) as HostedModeFactory;
};
