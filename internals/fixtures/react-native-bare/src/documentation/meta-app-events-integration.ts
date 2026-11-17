// #region docs:rn-meta-app-events-integration title="meta-app-events-consent.ts"
import { connectMetaAppEvents } from '@inth/react-native/integrations';
import type {
	MetaAppEventsClient,
	ConsentIntegration,
} from '@inth/react-native/integrations';

export const connectAppMetaAppEvents = (
	meta: MetaAppEventsClient,
	onError: (error: unknown) => void
): ConsentIntegration => connectMetaAppEvents(meta, { onError });
// #endregion docs:rn-meta-app-events-integration
