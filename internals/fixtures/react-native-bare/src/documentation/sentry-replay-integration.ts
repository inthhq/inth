// #region docs:rn-sentry-replay-integration title="sentry-replay-consent.ts"
import { connectSentryReplay } from '@inth/react-native/integrations';
import type {
	ConsentIntegration,
	SentryReplayClient,
} from '@inth/react-native/integrations';

export const connectAppSentryReplay = (
	replay: SentryReplayClient,
	onError: (error: unknown) => void
): ConsentIntegration => connectSentryReplay(replay, { onError });
// #endregion docs:rn-sentry-replay-integration
