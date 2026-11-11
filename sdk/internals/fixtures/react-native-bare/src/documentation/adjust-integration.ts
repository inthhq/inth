// #region docs:rn-adjust-integration title="adjust-consent.ts"
import { connectAdjust } from '@c15t/react-native/integrations';
import type {
	AdjustClient,
	ConsentIntegration,
} from '@c15t/react-native/integrations';

export const connectAppAdjust = (
	adjust: AdjustClient,
	onError: (error: unknown) => void
): ConsentIntegration => connectAdjust(adjust, { onError });
// #endregion docs:rn-adjust-integration
