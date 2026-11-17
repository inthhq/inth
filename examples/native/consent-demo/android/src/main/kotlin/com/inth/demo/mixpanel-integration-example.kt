// #region docs:android-mixpanel-integration title="MixpanelConsent.kt"
package com.inth.demo

import com.inth.android.integrations.MixpanelIntegration
import com.inth.core.Inth

fun connectAppMixpanel(
	optInTracking: () -> Unit,
	optOutTracking: () -> Unit,
	onError: (Exception) -> Unit,
): MixpanelIntegration {
	val core = checkNotNull(Inth.current) { "Install Inth before connecting analytics" }
	return MixpanelIntegration(
		core = core,
		optInTracking = optInTracking,
		optOutTracking = optOutTracking,
		onError = onError,
	)
}
// #endregion docs:android-mixpanel-integration
