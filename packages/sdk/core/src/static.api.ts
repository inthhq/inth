/**
 * The geo request `createStaticConsentResolver` sends from a statically
 * rendered page.
 *
 * @packageDocumentation
 * @internal
 */
import type { ManifestModeInputs } from './modes';
import { fetchGeoInputs } from './transports/manifest-browser-remote.model';

/**
 * Asks `geoUrl` for the visitor's location with `fetchImpl`, or the global
 * `fetch`.
 *
 * @returns The location, or `undefined` when there is no `fetch` or the
 * request fails.
 * @internal
 */
export const fetchStaticGeo = async function fetchStaticGeo(
	geoUrl: string,
	fetchImpl?: typeof globalThis.fetch
): Promise<ManifestModeInputs | undefined> {
	const resolved = fetchImpl ?? globalThis.fetch?.bind(globalThis);
	if (!resolved) {
		return undefined;
	}
	return await fetchGeoInputs(geoUrl, resolved);
};
