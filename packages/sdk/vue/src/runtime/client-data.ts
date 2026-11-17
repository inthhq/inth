import clientManifestSnapshot from '#c15t/client-manifest-snapshot';

import type { NuxtMode } from './nuxt-mode';

/**
 * The mode the browser runs: browser resolution gets the snapshot the
 * build bundled for it, and the hosted backend gets the consent headers the
 * server read from the request (a CDN's country, for example) to `/init`.
 *
 * As in every single-page app, a policy that depends on a location that
 * neither `inputs` nor `geoUrl` supplies is resolved by the backend's
 * `/init`, never as an unknown location: that could apply another
 * region's rules.
 *
 * @param mode - The mode from `nuxt.config.ts`.
 * @param headers - Consent headers the server read from the request.
 * @returns The mode for `clientMode()`.
 * @internal
 */
export const withClientData = function withClientData(
	mode: NuxtMode,
	headers: Record<string, string>
): NuxtMode {
	if (mode.type === 'manifest' && mode.resolve === 'browser') {
		return clientManifestSnapshot && !mode.snapshot
			? { ...mode, snapshot: clientManifestSnapshot, source: undefined }
			: mode;
	}
	if (mode.type === 'hosted' && Object.keys(headers).length > 0) {
		return { ...mode, headers: { ...headers, ...mode.headers } };
	}
	return mode;
};
