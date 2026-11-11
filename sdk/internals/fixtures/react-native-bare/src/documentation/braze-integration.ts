// #region docs:rn-braze-integration title="braze-consent.ts"
import { connectBraze } from '@c15t/react-native/integrations';
import type {
	BrazeClient,
	ConsentIntegration,
} from '@c15t/react-native/integrations';

export const connectAppBraze = (
	braze: BrazeClient,
	onError: (error: unknown) => void
): ConsentIntegration => connectBraze(braze, { onError });
// #endregion docs:rn-braze-integration
