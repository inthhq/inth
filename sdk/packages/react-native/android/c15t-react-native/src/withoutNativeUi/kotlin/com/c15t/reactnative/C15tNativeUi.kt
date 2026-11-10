package com.c15t.reactnative

import android.app.Activity
import com.c15t.core.ConsentCore

/**
 * A build without the stock consent screens: the `c15t.nativeUI` Gradle property is
 * `false`, so `c15t-consent-ui` is not a dependency and this file replaces
 * `src/nativeUi`. The module rejects presenter calls before reaching [present].
 */
internal object C15tNativeUi {
	/** Whether this build links the stock consent screens. */
	const val AVAILABLE = false

	fun present(
		activity: Activity,
		core: ConsentCore,
		preferences: Boolean,
		privacyPolicyUrl: String,
		owner: Any,
		outcome: (String) -> Unit,
	): String = throw UnsupportedOperationException(C15tPayload.MESSAGE_NATIVE_UI_EXCLUDED)

	fun close(sessionId: String) = Unit

	fun detach(owner: Any) = Unit
}
