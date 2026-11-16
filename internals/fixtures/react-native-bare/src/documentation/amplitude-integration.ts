// #region docs:rn-amplitude-integration title="amplitude-consent.ts"
import { connectAmplitude } from '@c15t/react-native/integrations';
import type {
	AmplitudeClient,
	ConsentIntegration,
} from '@c15t/react-native/integrations';

export const connectAppAmplitude = (
	amplitude: AmplitudeClient,
	onError: (error: unknown) => void
): ConsentIntegration => connectAmplitude(amplitude, { onError });
// #endregion docs:rn-amplitude-integration
