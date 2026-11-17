// #region docs:android-sentry-replay-integration title="SentryReplayConsent.kt"
package com.inth.demo

import com.inth.android.integrations.SentryReplayIntegration
import com.inth.core.Inth

// Retain the returned helper beside the initialized Sentry SDK in the app owner.
// Set Sentry's sessionSampleRate and onErrorSampleRate to 0.0 before setup.
fun connectAppSentryReplay(
	start: () -> Unit,
	stop: () -> Unit,
	onError: (Exception) -> Unit,
): SentryReplayIntegration {
	return SentryReplayIntegration(
		core = checkNotNull(Inth.current) { "Install Inth before connecting replay" },
		start = start, // { Sentry.replay().start() }
		stop = stop, // { Sentry.replay().stop() }
		onError = onError,
	)
}
// Call helper.sync() after Sentry has started a new session or reinitialized.
// Zero sampling keeps replay off until this reapplies the native decision.
// Call helper.close() only when tearing down the app-owned integration.
// #endregion docs:android-sentry-replay-integration
