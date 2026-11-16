import { connectTrackingAndAds, settleAll } from './consent-integration';
import type {
	AnalyticsIntegrationOptions,
	ConsentIntegration,
} from './consent-integration';
import type { GoogleAdsConsent } from './google-consent-mode';

/** The AppsFlyer functions supplied by the app. No vendor dependency is loaded. */
export interface AppsFlyerClient {
	/** Build an `AppsFlyerConsent` and pass it to `appsFlyer.setConsentData`. */
	setConsentData: (consent: GoogleAdsConsent) => void | Promise<void>;
	/** Call `appsFlyer.stop`. */
	stop: (isStopped: boolean) => void | Promise<void>;
	/** Start AppsFlyer: `appsFlyer.startSdk()` in react-native-appsflyer 6. */
	start: () => void | Promise<void>;
}

/**
 * Keep AppsFlyer running only while one category allows it, and send Google's
 * DMA consent through AppsFlyer's consent API.
 *
 * In `setConsentData`, build `new AppsFlyerConsent(isUserSubjectToGDPR,
 * adUserData, adPersonalization, adStorage)`. `isUserSubjectToGDPR` is yours to
 * supply: c15t's policy model is not a legal jurisdiction flag. Marketing
 * grants all three types and is the default category.
 *
 * Written against `react-native-appsflyer` 6. Version 7 removed
 * `AppsFlyerConsent` and starts sessions only from its session-ready listener,
 * which this helper does not coordinate.
 *
 * Initialize AppsFlyer with `manualStart: true` and do not start it yourself.
 * While the category is denied or pending, the helper calls `stop(true)`. When
 * it is granted, it calls `stop(false)` and then `start`. On withdrawal both
 * denial calls are made even if the first fails.
 * A change that keeps the category granted sends new consent data without
 * starting again.
 *
 * @param appsFlyer - App-owned wrapper around `react-native-appsflyer`.
 * @param options - Category, error handler and optional native client.
 * @returns An app-lifetime connection.
 * @example
 * ```ts
 * const consent = connectAppsFlyer(appsFlyerClient, { onError: reportError });
 * await consent.ready;
 * ```
 */
export const connectAppsFlyer = (
	appsFlyer: AppsFlyerClient,
	options: AnalyticsIntegrationOptions
): ConsentIntegration =>
	connectTrackingAndAds(options, async (current, previous) => {
		const state = current();
		if (!state.tracking) {
			await settleAll([
				() => appsFlyer.stop(true),
				() => appsFlyer.setConsentData(state.ads),
			]);
			return state;
		}
		await appsFlyer.setConsentData(state.ads);
		// A withdrawal during these calls queues the next apply, which stops.
		if (previous?.tracking !== true && current().tracking) {
			await appsFlyer.stop(false);
			if (current().tracking) {
				await appsFlyer.start();
			}
		}
		return state;
	});
