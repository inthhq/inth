// #region docs:android-firebase-integration title="FirebaseConsent.kt"
package com.c15t.demo

import com.c15t.android.integrations.FirebaseAnalyticsConsent
import com.c15t.android.integrations.FirebaseAnalyticsIntegration
import com.c15t.core.C15t

fun connectAppFirebaseAnalytics(
	setConsent: (FirebaseAnalyticsConsent) -> Unit,
	setCollectionEnabled: (Boolean) -> Unit,
	onError: (Exception) -> Unit,
): FirebaseAnalyticsIntegration {
	val core = checkNotNull(C15t.current) { "Install c15t before connecting analytics" }
	return FirebaseAnalyticsIntegration(
		core = core,
		setConsent = setConsent,
		setCollectionEnabled = setCollectionEnabled,
		onError = onError,
	)
}
// #endregion docs:android-firebase-integration
