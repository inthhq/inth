// #region docs:rn-posthog-integration title="posthog-consent.ts"
import { connectPostHog } from '@inth/react-native/integrations';
import type {
	ConsentIntegration,
	PostHogClient,
} from '@inth/react-native/integrations';

export const connectAppPostHog = (
	posthog: PostHogClient,
	onError: (error: unknown) => void
): ConsentIntegration => connectPostHog(posthog, { onError });
// #endregion docs:rn-posthog-integration
