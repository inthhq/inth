// #region docs:rn-appsflyer-integration title="appsflyer-consent.ts"
import { connectAppsFlyer } from '@c15t/react-native/integrations';
import type {
	AppsFlyerClient,
	ConsentIntegration,
} from '@c15t/react-native/integrations';

export const connectAppAppsFlyer = (
	appsFlyer: AppsFlyerClient,
	onError: (error: unknown) => void
): ConsentIntegration => connectAppsFlyer(appsFlyer, { onError });
// #endregion docs:rn-appsflyer-integration
