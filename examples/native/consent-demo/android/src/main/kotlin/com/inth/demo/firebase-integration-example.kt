// #region docs:android-firebase-integration title="FirebaseConsent.kt"
package com.inth.demo

import com.inth.android.integrations.FirebaseAnalyticsConsent
import com.inth.android.integrations.FirebaseAnalyticsIntegration
import com.inth.core.Inth

fun connectAppFirebaseAnalytics(
	setConsent: (FirebaseAnalyticsConsent) -> Unit,
	setCollectionEnabled: (Boolean) -> Unit,
	onError: (Exception) -> Unit,
): FirebaseAnalyticsIntegration {
	val core = checkNotNull(Inth.current) { "Install Inth before connecting analytics" }
	return FirebaseAnalyticsIntegration(
		core = core,
		setConsent = setConsent,
		setCollectionEnabled = setCollectionEnabled,
		onError = onError,
	)
}
// #endregion docs:android-firebase-integration
