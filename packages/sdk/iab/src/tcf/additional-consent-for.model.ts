/**
 * The Google Additional Consent (AC) string a confirmed choice makes.
 *
 * @packageDocumentation
 */

import { AD_TECH_PROVIDER_PURPOSES } from '@inth/sdk-schema/types';

import {
	encodeAdditionalConsent,
	isProviderId,
} from './additional-consent-codec.model';

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
