import { connectConsentState } from './connect-consent-integration';
import type {
	AnalyticsIntegrationOptions,
	ConsentIntegration,
} from './connect-consent-integration';
import { resolveGoogleAdsConsent } from './google-consent-mode.model';
import type { GoogleAdsConsent } from './google-consent-mode.model';

/** The AdMob function supplied by the app. No vendor dependency is loaded. */
export interface AdMobClient {
	/** Apply the advertising types to Google Mobile Ads. */
	setConsent: (consent: GoogleAdsConsent) => void | Promise<void>;
}

/** Options for {@link connectAdMob}. AdMob follows the Consent Mode mapping. */
export type AdMobOptions = Pick<
	AnalyticsIntegrationOptions,
	'client' | 'onError'
>;

/**
 * Keep Google Mobile Ads (AdMob) privacy settings in sync with native consent.
 *
 * Sends the three Consent Mode advertising types, which marketing grants, as on
 * the web. In `setConsent`, pass `publisherPrivacyPersonalizationState:
 * 'disabled'` to `mobileAds().setRequestConfiguration` unless `adUserData` and
 * `adPersonalization` are both granted, and `'enabled'` when they are. Set
 * `requestNonPersonalizedAdsOnly` on ad requests from the same state.
 * `react-native-google-mobile-ads` cannot write the limited-ads key that
 * `adStorage` maps to on Swift and Kotlin.
 *
 * In the EEA, UK and Switzerland, Google serves personalized or
 * non-personalized ads only with a TC string from a Google-certified CMP. These
 * settings do not replace that.
 *
 * @param admob - App-owned wrapper around the Google Mobile Ads module.
 * @param options - Error handler and optional native client.
 * @returns An app-lifetime connection. Await `ready` before requesting ads.
 * @example
 * ```ts
 * const consent = connectAdMob({ setConsent: applyAdMobConsent }, { onError });
 * await consent.ready;
 * ```
 */
export const connectAdMob = (
	admob: AdMobClient,
	options: AdMobOptions
): ConsentIntegration =>
	connectConsentState(options, resolveGoogleAdsConsent, async (current) => {
		const consent = current();
		await admob.setConsent(consent);
		return consent;
	});
