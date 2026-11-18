import type { ConsentState } from '@inth/sdk/engine';

/**
 * Turns Inth consent into a vendor's consent types.
 *
 * A type is `granted` when the Inth category that lists it is granted, and
 * `denied` otherwise. The Google Consent Mode v2 fixture under
 * `packages/native-protocol/google-consent-mode/` is generated from this function, so
 * the Swift, Kotlin and React Native helpers are graded against what the web
 * sends.
 *
 * @param mapping - Inth category to the vendor consent types it controls.
 * @param consents - The consent state to translate.
 * @returns Every mapped vendor type, as `granted` or `denied`.
 * @internal
 */
export const mapConsentState = function mapConsentState(
	mapping: Record<string, string[]>,
	consents: ConsentState
): Record<string, 'granted' | 'denied'> {
	const result: Record<string, 'granted' | 'denied'> = {};

	for (const [inthCategory, vendorTypes] of Object.entries(mapping)) {
		const isGranted = (consents as Record<string, boolean>)[inthCategory];
		for (const vendorType of vendorTypes) {
			result[vendorType] = isGranted ? 'granted' : 'denied';
		}
	}

	return result;
};
