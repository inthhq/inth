// #region docs:android-posthog-integration title="PostHogConsent.kt"
package com.inth.demo

import com.inth.android.integrations.PostHogIntegration
import com.inth.core.Inth

fun connectAppPostHog(
	optIn: () -> Unit,
	optOut: () -> Unit,
	onError: (Exception) -> Unit,
): PostHogIntegration {
	val core = checkNotNull(Inth.current) { "Install Inth before connecting analytics" }
	return PostHogIntegration(core = core, optIn = optIn, optOut = optOut, onError = onError)
}
// #endregion docs:android-posthog-integration
