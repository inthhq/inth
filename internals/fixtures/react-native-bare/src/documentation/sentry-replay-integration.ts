// #region docs:rn-sentry-replay-integration title="sentry-replay-consent.ts"
import { connectSentryReplay } from '@c15t/react-native/integrations';
import type {
	ConsentIntegration,
	SentryReplayClient,
} from '@c15t/react-native/integrations';

export const connectAppSentryReplay = (
	replay: SentryReplayClient,
	onError: (error: unknown) => void
): ConsentIntegration => connectSentryReplay(replay, { onError });
// #endregion docs:rn-sentry-replay-integration
