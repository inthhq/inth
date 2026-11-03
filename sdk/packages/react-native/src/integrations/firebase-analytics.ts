import { connectConsentIntegration } from './consent-integration';
import type {
	AnalyticsIntegrationOptions,
	ConsentIntegration,
} from './consent-integration';

/** Firebase consent settings for analytics without advertising permissions. */
// oxlint-disable-next-line typescript/consistent-type-definitions -- RNFirebase's dictionary parameter requires an anonymous object type.
export type FirebaseAnalyticsConsent = {
	readonly analytics_storage: boolean;
	readonly ad_storage: false;
	readonly ad_user_data: false;
	readonly ad_personalization: false;
};

/** The Firebase functions supplied by the app. No Firebase dependency is loaded. */
export interface FirebaseAnalyticsClient {
	/** Apply analytics and advertising consent through Firebase's native SDK. */
	setConsent: (consent: FirebaseAnalyticsConsent) => void | Promise<void>;
	/** Enable or disable collection through Firebase's native SDK. */
	setAnalyticsCollectionEnabled: (enabled: boolean) => void | Promise<void>;
}

const consent = (allowed: boolean): FirebaseAnalyticsConsent => ({
	ad_personalization: false,
	ad_storage: false,
	ad_user_data: false,
	analytics_storage: allowed,
});

/**
 * Keep Firebase Analytics collection and consent in sync with native permission.
 * Advertising permissions remain denied. This does not configure Firebase,
 * prevent its native auto-start, or implement an IAB advertising integration.
 *
 * @param analytics - App-owned wrappers around the Firebase modular functions.
 * @param options - Category, error handler and optional native client.
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
	options: AnalyticsIntegrationOptions
): ConsentIntegration =>
	connectConsentIntegration(options, async (isAllowed) => {
		await analytics.setAnalyticsCollectionEnabled(false);
		const allowed = isAllowed();
		await analytics.setConsent(consent(allowed));
		if (!allowed) {
			return false;
		}
		if (!isAllowed()) {
			await analytics.setConsent(consent(false));
			return false;
		}
		await analytics.setAnalyticsCollectionEnabled(true);
		if (!isAllowed()) {
			await analytics.setAnalyticsCollectionEnabled(false);
			await analytics.setConsent(consent(false));
			return false;
		}
		return true;
	});
