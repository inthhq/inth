import { connectTrackingAndAds } from './connect-consent-integration';
import type {
	AnalyticsIntegrationOptions,
	ConsentIntegration,
} from './connect-consent-integration';
import type { GoogleAdsConsent } from './google-consent-mode.model';

/** The Braze functions supplied by the app. No vendor dependency is loaded. */
export interface BrazeClient {
	/** Call `Braze.enableSDK`. */
	enableSDK: () => void | Promise<void>;
	/** Call `Braze.disableSDK`. */
	disableSDK: () => void | Promise<void>;
	/** Set `$google_ad_user_data` and `$google_ad_personalization` on the user. */
	setGoogleAdsConsent: (consent: GoogleAdsConsent) => void | Promise<void>;
}

/**
 * Keep the Braze SDK enabled only while one category allows it, and record
 * Google's DMA consent on the Braze user.
 *
 * While the category is denied or pending, the helper calls `disableSDK`. When
 * it is granted, it calls `enableSDK` and then `setGoogleAdsConsent`. Set the
 * `$google_ad_user_data` and `$google_ad_personalization` custom attributes
 * there, as Booleans, from `adUserData` and `adPersonalization`. Marketing
 * grants both and is the default category.
 *
 * When the category is withdrawn, the helper only calls `disableSDK`. It does
 * not write denied attributes first: Braze drops pending data when disabled
 * and the wrapper offers no acknowledged flush, so the write could not be
 * confirmed. Braze's servers keep the last values sent. A marketing change
 * while the category stays granted is written normally. Call `sync()` after
 * `changeUser`.
 *
 * @param braze - App-owned wrapper around `@braze/react-native-sdk`.
 * @param options - Category, error handler and optional native client.
 * @returns An app-lifetime connection.
 * @example
 * ```ts
 * const consent = connectBraze(brazeClient, { onError: reportError });
 * await consent.ready;
 * ```
 */
export const connectBraze = (
	braze: BrazeClient,
	options: AnalyticsIntegrationOptions
): ConsentIntegration =>
	connectTrackingAndAds(options, async (current, previous) => {
		const state = current();
		if (!state.tracking) {
			await braze.disableSDK();
			return state;
		}
		if (previous?.tracking !== true) {
			await braze.enableSDK();
		}
		// A withdrawal during enable queues the next apply, which disables.
		const now = current();
		if (now.tracking) {
			await braze.setGoogleAdsConsent(now.ads);
		}
		return now.tracking ? now : state;
	});
