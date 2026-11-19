/**
 * Google Additional Consent (AC) string, version 2.
 *
 * Carries consent and disclosure for Google ad tech providers (ATPs) that
 * are not on the IAB Global Vendor List. Google reads it beside the TC
 * string and discards it when no TC string comes with it.
 *
 * @see https://support.google.com/admanager/answer/9681920
 * @packageDocumentation
 */

import type { AdTechProvider } from '@inth/sdk-core';
import {
	AD_TECH_PROVIDER_PURPOSES,
	AD_TECH_PROVIDERS_URL,
	adTechProviderFetchSignal,
	adTechProviderListUrl,
	normalizeAdTechProviderIds,
	parseAdTechProviderList,
} from '@inth/sdk-schema/types';

import {
	encodeAdditionalConsent,
	isProviderId,
} from './additional-consent-codec';

export {
	decodeAdditionalConsent,
	encodeAdditionalConsent,
	type AdditionalConsentSignal,
} from './additional-consent-codec';

/**
 * Builds the AC string for a confirmed choice.
 *
 * Every provider in `choices` was shown to the visitor, so it is disclosed.
 * It is consented when its switch is on and the TC string consents to every
 * purpose in {@link AD_TECH_PROVIDER_PURPOSES}. Returns `undefined` when no
 * provider was shown.
 *
 * @internal
 */
export const additionalConsentFor = function additionalConsentFor(
	choices: Readonly<Record<string, boolean>>,
	purposeConsents: Readonly<Record<number, boolean>>
): string | undefined {
	const disclosed = Object.keys(choices).map(Number).filter(isProviderId);
	if (disclosed.length === 0) {
		return undefined;
	}
	const purposesGranted = AD_TECH_PROVIDER_PURPOSES.every(
		(purpose) => purposeConsents[purpose] === true
	);
	return encodeAdditionalConsent({
		consented: purposesGranted
			? disclosed.filter((id) => choices[String(id)] === true)
			: [],
		disclosed,
	});
};

const inflight = new Map<string, Promise<AdTechProvider[]>>();

/**
 * Fetches names and privacy policy links for Google ad tech providers.
 *
 * Providers Google no longer lists are left out: the AC string may only
 * carry IDs from Google's current file. `endpoint` defaults to
 * {@link AD_TECH_PROVIDERS_URL}.
 *
 * @throws {Error} When the request fails or the response has no provider map.
 */
export const fetchAdTechProviders = function fetchAdTechProviders(
	providerIds: readonly number[],
	endpoint: string = AD_TECH_PROVIDERS_URL
): Promise<AdTechProvider[]> {
	const ids = normalizeAdTechProviderIds(providerIds);
	if (ids.length === 0) {
		return Promise.resolve([]);
	}
	const base = new URL(
		endpoint,
		typeof window === 'undefined' ? undefined : window.location.href
	).toString();
	const requestUrl = adTechProviderListUrl(base, ids);
	// Keyed on the IDs too: past the query cap the URL alone no longer names them.
	const key = `${requestUrl}|${ids.join(',')}`;
	const existing = inflight.get(key);
	if (existing) {
		return existing;
	}
	const request = (async () => {
		try {
			const response = await fetch(requestUrl, {
				signal: adTechProviderFetchSignal(),
			});
			if (!response.ok) {
				throw new Error(
					`Failed to fetch ad tech providers: ${response.status} ${response.statusText}`
				);
			}
			const providers = parseAdTechProviderList(await response.json(), ids);
			if (!providers) {
				throw new Error('Invalid ad tech provider list: missing providers');
			}
			return providers;
		} finally {
			inflight.delete(key);
		}
	})();
	inflight.set(key, request);
	return request;
};
