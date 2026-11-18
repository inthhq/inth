// #region docs:rn-mixpanel-integration title="mixpanel-consent.ts"
import { connectMixpanel } from '@inth/react-native/integrations';
import type {
	ConsentIntegration,
	MixpanelClient,
} from '@inth/react-native/integrations';

export const connectAppMixpanel = (
	mixpanel: MixpanelClient,
	onError: (error: unknown) => void
): ConsentIntegration => connectMixpanel(mixpanel, { onError });
// #endregion docs:rn-mixpanel-integration
