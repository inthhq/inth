package com.c15t.reactnative

import android.app.Activity
import android.app.Application
import com.c15t.consentui.ConsentHost
import com.c15t.consentui.ConsentHostOutcome
import com.c15t.consentui.ConsentHostPresentation
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
	): String {
		val session = ConsentHost.present(activity, core, preferences, privacyPolicyUrl, owner = owner) {
			outcome(C15tHostPayload.consentHostOutcome(it))
		}
		return C15tHostPayload.consentHostSession(session)
	}

	/**
	 * Hand the native prompt the provider's settings. The prompt decides when one is owed;
	 * [emit] carries what it shows to JavaScript.
	 *
	 * @throws IllegalArgumentException When auto-present is on and the URL is not HTTPS.
	 */
	fun configure(
		application: Application,
		activity: Activity?,
		core: ConsentCore,
		autoPresent: Boolean,
		privacyPolicyUrl: String?,
		owner: Any,
		emit: (event: String, payload: String) -> Unit,
	) = ConsentHost.configure(application, activity, core, autoPresent, privacyPolicyUrl, owner, object : ConsentHost.Listener {
		override fun presented(sessionId: String, presentation: ConsentHostPresentation, automatic: Boolean) =
			emit(C15tPayload.EVENT_PRESENTER_PRESENTED, C15tHostPayload.consentHostPresented(sessionId, presentation, automatic))

		override fun unavailable(code: String, message: String) =
			emit(C15tPayload.EVENT_PRESENTER_UNAVAILABLE, C15tPayload.presenterUnavailable(code, message))

		override fun outcome(outcome: ConsentHostOutcome) =
			emit(C15tPayload.EVENT_PRESENTER_OUTCOME, C15tHostPayload.consentHostOutcome(outcome))
	})

	/** Move to [core]'s prompt after an uninstall and a new install. */
	fun follow(core: ConsentCore) = ConsentHost.follow(core)

	fun close(sessionId: String) = ConsentHost.close(sessionId)

	fun detach(owner: Any) = ConsentHost.detach(owner)
}
