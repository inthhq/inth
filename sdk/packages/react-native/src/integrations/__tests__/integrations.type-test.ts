import type {
	AnalyticsIntegrationOptions,
	FirebaseAnalyticsConsent,
} from '../index';

// RNFirebase accepts a dictionary of boolean consent settings.
export const firebaseSettings = (
	consent: FirebaseAnalyticsConsent
): Readonly<Record<string, boolean>> => consent;

export const rejectNecessary: AnalyticsIntegrationOptions = {
	// @ts-expect-error An always-allowed category cannot gate optional analytics.
	category: 'necessary',
	onError: (_error) => {},
};

export const rejectAdvertisingGrant: FirebaseAnalyticsConsent = {
	ad_personalization: false,
	// @ts-expect-error This helper grants analytics permission only.
	ad_storage: true,
	ad_user_data: false,
	analytics_storage: true,
};
