// #region docs:rn-posthog-integration title="posthog-consent.ts"
import { connectPostHog } from '@c15t/react-native/integrations';
import type {
	ConsentIntegration,
	PostHogClient,
} from '@c15t/react-native/integrations';

export const connectAppPostHog = (
	posthog: PostHogClient,
	onError: (error: unknown) => void
): ConsentIntegration => connectPostHog(posthog, { onError });
// #endregion docs:rn-posthog-integration
