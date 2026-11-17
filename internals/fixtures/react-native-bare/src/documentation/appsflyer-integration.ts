// #region docs:rn-appsflyer-integration title="appsflyer-consent.ts"
import { connectAppsFlyer } from '@inth/react-native/integrations';
import type {
	AppsFlyerClient,
	ConsentIntegration,
} from '@inth/react-native/integrations';

export const connectAppAppsFlyer = (
	appsFlyer: AppsFlyerClient,
	onError: (error: unknown) => void
): ConsentIntegration => connectAppsFlyer(appsFlyer, { onError });
// #endregion docs:rn-appsflyer-integration
