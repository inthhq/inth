import { connectTrackingAndAds } from './consent-integration';
import type {
	AnalyticsIntegrationOptions,
	ConsentIntegration,
} from './consent-integration';
import type { GoogleAdsConsent } from './google-consent-mode';

/** The Adjust functions supplied by the app. No vendor dependency is loaded. */
export interface AdjustClient {
	/** Call `Adjust.enable`. */
	enable: () => void | Promise<void>;
	/** Call `Adjust.disable`. */
	disable: () => void | Promise<void>;
	/** Build `AdjustThirdPartySharing` with `google_dma` options and send it. */
	trackThirdPartySharing: (consent: GoogleAdsConsent) => void | Promise<void>;
}

/**
 * Keep the Adjust SDK enabled only while one category allows it, and send
 * third-party sharing with Google's DMA options.
 *
 * In `trackThirdPartySharing`, build `new AdjustThirdPartySharing(adUserData)`
 * and add the `google_dma` granular options `eea` (yours to supply, since c15t's
 * policy model is not a legal jurisdiction flag), `ad_personalization` and
 * `ad_user_data`, each `'1'` or `'0'`. Marketing grants both types and is the
 * default category.
 *
 * While the category is denied or pending, the helper calls `disable`. When it
 * is granted, it calls `enable` once per grant and then sends third-party
 * sharing, because Adjust ignores calls made while disabled. Connect before
 * `Adjust.initSdk`.
 *
 * @param adjust - App-owned wrapper around `react-native-adjust`.
 * @param options - Category, error handler and optional native client.
 * @returns An app-lifetime connection.
 * @example
 * ```ts
 * const consent = connectAdjust(adjustClient, { onError: reportError });
 * await consent.ready;
 * ```
 */
export const connectAdjust = (
	adjust: AdjustClient,
	options: AnalyticsIntegrationOptions
): ConsentIntegration =>
	connectTrackingAndAds(options, async (current, previous) => {
		const state = current();
		if (!state.tracking) {
			await adjust.disable();
			return state;
		}
		if (previous?.tracking !== true) {
			await adjust.enable();
		}
		// A withdrawal during enable queues the next apply, which disables.
		const now = current();
		if (now.tracking) {
			await adjust.trackThirdPartySharing(now.ads);
		}
		return now.tracking ? now : state;
	});
