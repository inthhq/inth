// #region docs:rn-adjust-integration title="adjust-consent.ts"
import { connectAdjust } from '@inth/react-native/integrations';
import type {
	AdjustClient,
	ConsentIntegration,
} from '@inth/react-native/integrations';

export const connectAppAdjust = (
	adjust: AdjustClient,
	onError: (error: unknown) => void
): ConsentIntegration => connectAdjust(adjust, { onError });
// #endregion docs:rn-adjust-integration
