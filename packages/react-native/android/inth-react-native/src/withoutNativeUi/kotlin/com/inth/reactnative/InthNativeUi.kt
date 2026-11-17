package com.inth.reactnative

import android.app.Activity
import android.app.Application
import com.inth.core.ConsentCore

/**
 * A build without the stock consent screens: the `inth.nativeUI` Gradle property is
 * `false`, so `inth-consent-ui` is not a dependency and this file replaces
 * `src/nativeUi`. The module rejects presenter calls before reaching [present], and an
 * auto-present request before reaching [configure].
 */
internal object InthNativeUi {
	/** Whether this build links the stock consent screens. */
	const val AVAILABLE = false

	fun present(
		activity: Activity,
		core: ConsentCore,
		preferences: Boolean,
		privacyPolicyUrl: String,
		owner: Any,
		outcome: (String) -> Unit,
	): String = throw UnsupportedOperationException(InthPayload.MESSAGE_NATIVE_UI_EXCLUDED)

	fun configure(
		application: Application,
		activity: Activity?,
		core: ConsentCore,
		autoPresent: Boolean,
		privacyPolicyUrl: String?,
		owner: Any,
		emit: (event: String, payload: String) -> Unit,
	) = Unit

	fun follow(core: ConsentCore) = Unit

	fun close(sessionId: String) = Unit

	fun detach(owner: Any) = Unit
}
