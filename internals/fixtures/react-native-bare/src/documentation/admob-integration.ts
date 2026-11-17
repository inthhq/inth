// #region docs:rn-admob-integration title="admob-consent.ts"
import { connectAdMob } from '@inth/react-native/integrations';
import type {
	AdMobClient,
	ConsentIntegration,
} from '@inth/react-native/integrations';

export const connectAppAdMob = (
	admob: AdMobClient,
	onError: (error: unknown) => void
): ConsentIntegration => connectAdMob(admob, { onError });
// #endregion docs:rn-admob-integration
