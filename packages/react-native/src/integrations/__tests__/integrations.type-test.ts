import type {
	AnalyticsIntegrationOptions,
	FirebaseAnalyticsConsent,
	FirebaseAnalyticsOptions,
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

export const rejectFirebaseCategory: FirebaseAnalyticsOptions = {
	// @ts-expect-error Firebase follows the Consent Mode mapping, not one category.
	category: 'measurement',
	onError: (_error) => {},
};
