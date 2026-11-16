// #region docs:rn-mixpanel-integration title="mixpanel-consent.ts"
import { connectMixpanel } from '@c15t/react-native/integrations';
import type {
	ConsentIntegration,
	MixpanelClient,
} from '@c15t/react-native/integrations';

export const connectAppMixpanel = (
	mixpanel: MixpanelClient,
	onError: (error: unknown) => void
): ConsentIntegration => connectMixpanel(mixpanel, { onError });
// #endregion docs:rn-mixpanel-integration
