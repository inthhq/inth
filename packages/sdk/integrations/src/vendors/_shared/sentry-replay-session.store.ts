/** sessionStorage key where Sentry Replay keeps its session. */
const replaySessionKey = 'sentryReplaySession';

/**
 * Remove the Replay session id. Sentry clears it when it stops a recording,
 * but keeps it for a session it did not sample.
 */
export const forgetReplaySession = (): void => {
	try {
		globalThis.sessionStorage?.removeItem(replaySessionKey);
	} catch {
		// Storage can be blocked; Sentry then keeps no session either.
	}
};
