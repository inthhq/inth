// #region docs:rn-admob-integration title="admob-consent.ts"
import { connectAdMob } from '@c15t/react-native/integrations';
import type {
	AdMobClient,
	ConsentIntegration,
} from '@c15t/react-native/integrations';

export const connectAppAdMob = (
	admob: AdMobClient,
	onError: (error: unknown) => void
): ConsentIntegration => connectAdMob(admob, { onError });
// #endregion docs:rn-admob-integration
