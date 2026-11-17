/**
 * The transports a plain Vue app's `app.use(c15tVue, …)` selects:
 * `manifest()` for `mode`, and the hosted backend for `backendURL`.
 *
 * Each is the transport itself, imported statically: a single-page app has
 * one environment, so a bundler drops the code the app does not use. Both
 * read the backend URL, and `manifest()` the snapshot, from
 * `@c15t/core/generated`, which `consentManifest()` from `c15t/vue/vite`
 * fills in during the build.
 */
import type { HostedModeFactory, ProviderTransportFactory } from '@c15t/core';
import type { ConsentTesting } from '@c15t/core/testing';
import { hosted as coreHosted } from '@c15t/core/transports';
import {
	backendURL as builtBackendURL,
	snapshot as builtSnapshot,
} from '@c15t/core/generated';
import { manifest as browserManifest } from '@c15t/core/transports/manifest-browser';
import type {
	BrowserManifestModeFactory,
	BrowserManifestOptions,
} from '@c15t/core/transports/manifest-browser';

export type { HostedModeFactory, ProviderTransportFactory } from '@c15t/core';
export type { BrowserManifestModeFactory } from '@c15t/core/transports/manifest-browser';

/**
 * Bundlers replace `process.env.NODE_ENV` at build time, so production
 * bundles drop the setup hint behind it.
 */
declare const process: { env: { NODE_ENV?: string } };

/** The error for a mode with no backend URL, with the setup hint in dev. */
const missingBackendURL = function missingBackendURL(
	mode: 'hosted' | 'manifest'
): Error {
	let hint = '';
	try {
		if (process.env.NODE_ENV !== 'production') {
			hint =
				' Add consentManifest() from c15t/vue/vite to vite.config.ts and set VITE_C15T_BACKEND_URL (or VITE_INTH_PROJECT_URL), or pass `backendURL`.';
		}
	} catch {
		// No bundler and no `process`: the short message has to do.
	}
	return new Error(
		mode === 'hosted'
			? `c15t: \`backendURL\` is required.${hint}`
			: `c15t: ${mode}() has no backend URL.${hint}`
	);
};

/**
 * Resolve the visitor's policy in the browser from the backend's consent
 * manifest, the default for single-page apps.
 *
 * Without options it uses the manifest and backend URL `consentManifest()`
 * downloaded during the build. With `manifestURL` it fetches that URL when
 * the app starts and ignores the build's snapshot. With no build snapshot
 * (a dev server that could not reach the backend, or `source: 'runtime'`)
 * it fetches `${backendURL}/manifest` when the app starts. With
 * `manifestURL` or `source: 'runtime'`, also pass `source: 'runtime'` to
 * `consentManifest()`, so the build downloads no snapshot. English copy is
 * bundled; other languages load on demand.
 *
 * The browser does not know where the visitor is, so when the policy
 * depends on location, the first visit asks the backend's `/init`, as in
 * every single-page app. Pass `inputs` when the page knows the location, or
 * `geoURL` for a route that answers it. `initFallback: false` resolves as
 * for an unknown location instead, with no request.
 *
 * @param options - Overrides for the build's backend URL and snapshot.
 * @returns A transport factory for `mode`.
 * @throws {Error} When no backend URL is set or derivable.
 * @example
 * ```ts
 * import { c15tVue, manifest } from 'c15t/vue/vue-plugin';
 *
 * app.use(c15tVue, { mode: manifest() });
 * ```
 */
export const manifest = function manifest(
	options: Partial<BrowserManifestOptions> = {}
): BrowserManifestModeFactory {
	// Test the build's URL on its own: a build that baked one in folds the
	// check, and its error message, away.
	if (
		builtBackendURL === undefined &&
		options.backendURL === undefined &&
		options.manifestURL === undefined
	) {
		throw missingBackendURL('manifest');
	}
	return browserManifest({
		// A `manifestURL` is fetched at runtime, so the build's snapshot is
		// left out, as with `source: 'runtime'`. A snapshot you pass replaces
		// it.
		snapshot:
			options.manifestURL || options.source === 'runtime'
				? undefined
				: builtSnapshot,
		...options,
		backendURL: options.backendURL ?? builtBackendURL,
	} as BrowserManifestOptions);
};

/**
 * The transport the plugin's options select: the `testing` value's, then
 * `mode`, then the hosted backend at `backendURL`, which defaults to the
 * URL `consentManifest()` read from `VITE_C15T_BACKEND_URL` or
 * `VITE_INTH_PROJECT_URL`.
 *
 * @param options - The plugin's `backendURL`, `mode` and `testing`.
 * @returns A transport factory for the runtime's `mode`.
 * @throws {Error} When none of them is set and the build set no URL.
 * @internal
 */
export const selectedMode = function selectedMode(options: {
	backendURL?: string;
	mode?: ProviderTransportFactory;
	testing?: ConsentTesting;
}): ProviderTransportFactory {
	// A testing value that crossed a serialization boundary is data only;
	// the browser side builds its transport.
	if (options.testing?.transport) {
		return options.testing.transport;
	}
	if (options.mode) {
		return options.mode;
	}
	const backendURL = options.backendURL ?? builtBackendURL;
	if (backendURL === undefined) {
		throw missingBackendURL('hosted');
	}
	return coreHosted({ backendURL }) as HostedModeFactory;
};
