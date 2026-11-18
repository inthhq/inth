// #region docs:rn-singular-integration title="singular-consent.ts"
import { connectSingular } from '@inth/react-native/integrations';
import type {
	SingularClient,
	ConsentIntegration,
} from '@inth/react-native/integrations';

export const connectAppSingular = (
	singular: SingularClient,
	onError: (error: unknown) => void
): ConsentIntegration => connectSingular(singular, { onError });
// #endregion docs:rn-singular-integration
