package com.c15t.reactnative

import android.app.Activity
import com.c15t.consentui.ConsentHost
import com.c15t.core.ConsentCore

/**
 * The stock consent screens, in a build that links them. `library.gradle` compiles this
 * file unless the `c15t.nativeUI` Gradle property is `false`, and the
 * `src/withoutNativeUi` twin otherwise.
 */
internal object C15tNativeUi {
	/** Whether this build links the stock consent screens. */
	const val AVAILABLE = true

	fun present(
		activity: Activity,
		core: ConsentCore,
		preferences: Boolean,
		privacyPolicyUrl: String,
		owner: Any,
		outcome: (String) -> Unit,
	): String = ConsentHost.present(activity, core, preferences, privacyPolicyUrl, owner = owner, outcome = outcome)

	fun close(sessionId: String) = ConsentHost.close(sessionId)

	fun detach(owner: Any) = ConsentHost.detach(owner)
}
