import { connectConsentIntegration } from './consent-integration';
import type {
	AnalyticsIntegrationOptions,
	ConsentIntegration,
} from './consent-integration';

/** App-owned Sentry Replay controls. Error monitoring remains app-configured. */
export interface SentryReplayClient {
	/** Start a permitted replay session. Sentry's RN method returns void. */
	start: () => void | Promise<void>;
	/** Stop recording. Sentry can upload earlier permitted session data. */
	stop: () => void | Promise<void>;
}

/**
 * Keep Sentry Session Replay recording in sync with one native category.
 *
 * Requires Sentry RN 8.27 or later. Configure both replaysSessionSampleRate and
 * replaysOnErrorSampleRate as zero before Sentry initialization, then pass its
 * configured Replay instance. Keep avoidForegroundResumeHang disabled. Do not
 * enable automatic buffering or separately start recording. Call sync after a
 * Sentry session reset. The helper does not change error reporting, profiling or
 * user identifiers. Configure those products separately.
 *
 * Sentry's start returns void and reports native failures through Sentry's own
 * logger. Ready confirms the supplied call returned, not native startup. Stop
 * can upload replay recorded before withdrawal; this is not a discard API or a
 * guarantee that no network requests remain.
 *
 * @param replay - Sentry's configured Replay instance.
 * @param options - Category, error handler and optional native consent client.
 * @returns An app-lifetime connection controlling replay recording only.
 * @example
 * ```ts
 * const consent = connectSentryReplay(replay, { onError: reportError });
 * await consent.ready;
 * ```
 */
export const connectSentryReplay = (
	replay: SentryReplayClient,
	options: AnalyticsIntegrationOptions
): ConsentIntegration =>
	connectConsentIntegration(options, async (isAllowed) => {
		if (!isAllowed()) {
			await replay.stop();
			return false;
		}
		await replay.start();
		if (!isAllowed()) {
			await replay.stop();
			return false;
		}
		return true;
	});
