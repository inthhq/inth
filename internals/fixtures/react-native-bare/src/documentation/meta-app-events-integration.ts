// #region docs:rn-meta-app-events-integration title="meta-app-events-consent.ts"
import { connectMetaAppEvents } from '@c15t/react-native/integrations';
import type {
	MetaAppEventsClient,
	ConsentIntegration,
} from '@c15t/react-native/integrations';

export const connectAppMetaAppEvents = (
	meta: MetaAppEventsClient,
	onError: (error: unknown) => void
): ConsentIntegration => connectMetaAppEvents(meta, { onError });
// #endregion docs:rn-meta-app-events-integration
