import { connectConsentState } from './consent-integration';
import type {
	AnalyticsIntegrationOptions,
	ConsentIntegration,
} from './consent-integration';
import { resolveGoogleConsentMode } from './google-consent-mode';

/**
 * The four Consent Mode v2 types Firebase Analytics takes, each driven by
 * consent: `analytics_storage` by measurement, and `ad_storage`, `ad_user_data`
 * and `ad_personalization` by marketing.
 */
// oxlint-disable-next-line typescript/consistent-type-definitions -- RNFirebase's dictionary parameter requires an anonymous object type.
export type FirebaseAnalyticsConsent = {
	readonly analytics_storage: boolean;
	readonly ad_storage: boolean;
	readonly ad_user_data: boolean;
	readonly ad_personalization: boolean;
};

/** The Firebase functions supplied by the app. No Firebase dependency is loaded. */
export interface FirebaseAnalyticsClient {
	/** Apply analytics and advertising consent through Firebase's native SDK. */
	setConsent: (consent: FirebaseAnalyticsConsent) => void | Promise<void>;
	/** Enable or disable collection through Firebase's native SDK. */
	setAnalyticsCollectionEnabled: (enabled: boolean) => void | Promise<void>;
}

/** Options for {@link connectFirebaseAnalytics}. */
export type FirebaseAnalyticsOptions = Pick<
	AnalyticsIntegrationOptions,
	'client' | 'onError'
>;

const firebaseConsent = (
	isAllowed: Parameters<typeof resolveGoogleConsentMode>[0]
): FirebaseAnalyticsConsent => {
	const consent = resolveGoogleConsentMode(isAllowed);
	return {
		ad_personalization: consent.ad_personalization,
		ad_storage: consent.ad_storage,
		ad_user_data: consent.ad_user_data,
		analytics_storage: consent.analytics_storage,
	};
};

/**
 * Keep Firebase Analytics consent and collection in sync with native consent.
 *
 * Sends all four Consent Mode v2 types Firebase takes, with the same mapping
 * as the web: measurement grants `analytics_storage`, marketing grants
 * `ad_storage`, `ad_user_data` and `ad_personalization`. Collection is on only
 * while `analytics_storage` is granted. A pending policy denies every type.
 * This does not configure Firebase or prevent its native auto-start; set the
 * denied-by-default keys in `firebase.json` or the native projects.
 *
 * @param analytics - App-owned wrappers around the Firebase modular functions.
 * @param options - Error handler and optional native client.
 * @returns An app-lifetime subscription. Await `ready` before using analytics.
 * @example
 * ```ts
 * const integration = connectFirebaseAnalytics({
 *   setConsent: (settings) => setConsent(analytics, settings),
 *   setAnalyticsCollectionEnabled: (enabled) =>
 *     setAnalyticsCollectionEnabled(analytics, enabled),
 * }, { onError: reportError });
 * await integration.ready;
 * ```
 */
export const connectFirebaseAnalytics = (
	analytics: FirebaseAnalyticsClient,
	options: FirebaseAnalyticsOptions
): ConsentIntegration =>
	connectConsentState(options, firebaseConsent, async (current) => {
		await analytics.setAnalyticsCollectionEnabled(false);
		const consent = current();
		await analytics.setConsent(consent);
		if (!consent.analytics_storage) {
			return consent;
		}
		const latest = current();
		if (!latest.analytics_storage) {
			await analytics.setConsent(latest);
			return latest;
		}
		await analytics.setAnalyticsCollectionEnabled(true);
		const after = current();
		if (!after.analytics_storage) {
			await analytics.setAnalyticsCollectionEnabled(false);
			await analytics.setConsent(after);
			return after;
		}
		return consent;
	});
