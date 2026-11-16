// #region docs:android-posthog-integration title="PostHogConsent.kt"
package com.c15t.demo

import com.c15t.android.integrations.PostHogIntegration
import com.c15t.core.C15t

fun connectAppPostHog(
	optIn: () -> Unit,
	optOut: () -> Unit,
	onError: (Exception) -> Unit,
): PostHogIntegration {
	val core = checkNotNull(C15t.current) { "Install c15t before connecting analytics" }
	return PostHogIntegration(core = core, optIn = optIn, optOut = optOut, onError = onError)
}
// #endregion docs:android-posthog-integration
