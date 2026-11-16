// #region docs:rn-singular-integration title="singular-consent.ts"
import { connectSingular } from '@c15t/react-native/integrations';
import type {
	SingularClient,
	ConsentIntegration,
} from '@c15t/react-native/integrations';

export const connectAppSingular = (
	singular: SingularClient,
	onError: (error: unknown) => void
): ConsentIntegration => connectSingular(singular, { onError });
// #endregion docs:rn-singular-integration
