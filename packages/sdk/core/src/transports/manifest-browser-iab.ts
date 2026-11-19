/**
 * The IAB part of the browser manifest resolver: the Global Vendor List an
 * IAB policy needs. IAB is opt-in, so the resolver loads this module only
 * for a manifest with IAB enabled.
 *
 * @internal
 */
import { primaryLanguage } from '@inth/sdk-schema/types';
import type { ConsentManifest, InitOutput } from '@inth/sdk-schema/types';

import {
	fetchCachedAdTechProviders,
	loadManifestAdTechProviders,
} from './ad-tech-provider-cache';
import { fetchCachedGvl } from './gvl-cache';

/**
 * Add the vendor list, and any Google Additional Consent providers the
 * manifest lists, to an init output that resolved to an IAB policy.
 *
 * @param output - The init output, changed in place.
 * @param manifest - The manifest it resolved from.
 * @internal
 */
export const attachVendorList = async function attachVendorList(
	output: InitOutput,
	manifest: ConsentManifest,
	fetchImpl: typeof globalThis.fetch
): Promise<void> {
	// No Inth headers: a plain GET stays a CORS simple request, so a provider
	// list on another origin needs no preflight.
	const providers = loadManifestAdTechProviders(manifest, output, (reference) =>
		fetchCachedAdTechProviders({ fetch: fetchImpl, reference })
	);
	if (
		manifest.iab?.gvl &&
		output.policyResolution?.status === 'matched' &&
		output.policyResolution.policy.model === 'iab'
	) {
		// No Inth headers: a plain GET stays a CORS simple request, so the
		// vendor list host needs no preflight.
		output.gvl = await fetchCachedGvl({
			fetch: fetchImpl,
			label: 'inth manifest transport',
			language: primaryLanguage(output.translations.language) ?? 'en',
			url: manifest.iab.gvl.url,
		});
	}
	const adTechProviders = await providers;
	if (adTechProviders) {
		output.adTechProviders = adTechProviders;
	}
};
