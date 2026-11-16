// #region docs:rn-firebase-integration title="firebase-consent.ts"
import { connectFirebaseAnalytics } from '@c15t/react-native/integrations';
import type {
	ConsentIntegration,
	FirebaseAnalyticsClient,
} from '@c15t/react-native/integrations';

export const connectAppFirebaseAnalytics = (
	analytics: FirebaseAnalyticsClient,
	onError: (error: unknown) => void
): ConsentIntegration => connectFirebaseAnalytics(analytics, { onError });
// #endregion docs:rn-firebase-integration
