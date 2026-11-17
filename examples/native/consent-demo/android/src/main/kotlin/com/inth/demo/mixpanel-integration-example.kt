// #region docs:android-mixpanel-integration title="MixpanelConsent.kt"
package com.c15t.demo

import com.c15t.android.integrations.MixpanelIntegration
import com.c15t.core.C15t

fun connectAppMixpanel(
	optInTracking: () -> Unit,
	optOutTracking: () -> Unit,
	onError: (Exception) -> Unit,
): MixpanelIntegration {
	val core = checkNotNull(C15t.current) { "Install c15t before connecting analytics" }
	return MixpanelIntegration(
		core = core,
		optInTracking = optInTracking,
		optOutTracking = optOutTracking,
		onError = onError,
	)
}
// #endregion docs:android-mixpanel-integration
