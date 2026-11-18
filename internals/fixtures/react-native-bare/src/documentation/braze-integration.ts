// #region docs:rn-braze-integration title="braze-consent.ts"
import { connectBraze } from '@inth/react-native/integrations';
import type {
	BrazeClient,
	ConsentIntegration,
} from '@inth/react-native/integrations';

export const connectAppBraze = (
	braze: BrazeClient,
	onError: (error: unknown) => void
): ConsentIntegration => connectBraze(braze, { onError });
// #endregion docs:rn-braze-integration
