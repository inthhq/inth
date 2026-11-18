package com.inth.reactnative

import com.inth.core.Inth
import com.inth.core.Subscription
import com.inth.core.model.ConsentSnapshot
import com.inth.core.model.KernelError
import com.inth.core.model.KernelUser
import com.inth.core.webview.WebViewConsentScript
import com.inth.core.webview.WebViewConsentState
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.util.Locale

/**
 * The `Inth` TurboModule: the JavaScript surface in
 * `src/specs/NativeInth.ts`, forwarding call for call to the Kotlin core.
 *
 * Nothing in here decides anything about consent. It reads state the core already
 * holds, forwards the actions the user took, and reports the results as the JSON the
 * JavaScript protocol expects. That is deliberate: there is one consent kernel, and a
 * rule duplicated here would be a second one to keep honest.
 *
 * Threading. [getBootstrap] and [getSnapshot] are synchronous methods and do no disk
 * or network work at all: the core keeps one immutable snapshot in an atomic
 * reference, so a read is a volatile load plus an encode. They never post to the
 * core's worker and wait, which is the deadlock the New Architecture rules warn about
 * for a synchronous module method. Everything that could block returns a promise, and
 * the core's own calls return as soon as the local commit is durable, with delivery
 * left to the core's dispatcher, so the promises resolve on the calling thread
 * without an extra hop that could queue behind the very work being awaited.
 */
class InthReactNativeModule(appContext: ReactApplicationContext) : NativeInthSpec(appContext) {
	private val context: ReactApplicationContext = appContext
	private val pump = InthChangePump(sink = this::publish)

	// The subscriptions own these lambdas until invalidate() closes them.
	private val snapshotObserver: (ConsentSnapshot) -> Unit = pump::onSnapshot

	private val errorObserver: (KernelError) -> Unit = pump::onError

	private var snapshotSubscription: Subscription? = null

	private var errorSubscription: Subscription? = null

	@Volatile
	private var listenerCount = 0

	init {
		subscribeToCore()
	}

	/** Handshake payload: the cached snapshot, never a network wait. */
	override fun getBootstrap(): String {
		ensureCore()
		return InthPayload.bootstrap(
			snapshot = Inth.snapshot(),
			hasStoredSnapshot = Inth.hasStoredSnapshot,
		)
	}

	/** The current snapshot, encoded for the wire. */
	override fun getSnapshot(): String {
		ensureCore()
		val core = Inth.current
		val (snapshot, additions) = InthPayload.consistently({ Inth.snapshot() }) {
			Triple(
				core?.iabConsent to core?.iabCustomVendors().orEmpty(),
				core?.iabAcceptAllChoices(),
				core?.iabPresentation(),
			)
		}
		return InthPayload.snapshot(snapshot, fallbackLanguage = deviceLanguage(), iabConsent = additions.first.first,
			iabAcceptAll = additions.second, iabPresentation = additions.third, iabCustomVendors = additions.first.second)
	}

	/** WebView consent: the state a page reads, and a fresh token and request key for one WebView. */
	override fun getWebViewConsent(): String {
		ensureCore()
		val core = Inth.current
		val state = if (core != null) WebViewConsentState.from(core) else WebViewConsentState.from(Inth.snapshot(), null)
		return "{\"state\":${state.toJson()},\"token\":\"${WebViewConsentScript.newToken()}\"," +
			"\"key\":\"${WebViewConsentScript.newToken()}\"}"
	}

	/**
	 * The platform tracking answer.
	 *
	 * No [ensureCore] here, unlike every other read: this reports what the operating
	 * system thinks about tracking, which is not consent state and does not depend on a
	 * core existing. Starting one to answer it would be a side effect nobody asked for.
	 */
	override fun getTrackingAuthorization(): String =
		InthPayload.trackingAuthorization(InthTracking.status)

	/**
	 * Reject, always. Android has no tracking prompt for this module to show, so a
	 * resolution would report a dialog no user ever saw.
	 *
	 * See the KDoc on [InthTracking] for what Android can and cannot answer about the
	 * advertising identifier, and for why [InthTrackingAuthorization.UNSUPPORTED] from
	 * [getTrackingAuthorization] is not the same statement as "not determined yet".
	 */
	override fun requestTrackingAuthorization(promise: Promise) {
		promise.reject(InthTracking.REJECT_UNSUPPORTED, InthTracking.MESSAGE_UNSUPPORTED)
	}

	/** The same request with JSON options. Android has nothing to ask, so it rejects the same way. */
	override fun requestTrackingAuthorizationWithOptions(
		options: String,
		promise: Promise,
	) {
		promise.reject(InthTracking.REJECT_UNSUPPORTED, InthTracking.MESSAGE_UNSUPPORTED)
	}

	override fun commit(
		intent: String,
		promise: Promise,
	) {
		val parsed = InthPayload.parseCommitIntent(intent)
		if (parsed == null) {
			promise.resolve(InthPayload.invalidIntent(intent))
			return
		}
		val core = if (ensureCore()) Inth.current else null
		if (core == null) {
			promise.resolve(InthPayload.notBootstrapped())
			return
		}
		try {
			promise.resolve(InthPayload.commit(intent, core))
		} catch (error: Exception) {
			promise.reject(REJECT_COMMIT, error.message, error)
		}
	}

	override fun setOverrides(
		overrides: String,
		promise: Promise,
	) {
		if (!ensureCore()) {
			promise.reject(REJECT_NOT_BOOTSTRAPPED, InthPayload.MESSAGE_NOT_BOOTSTRAPPED)
			return
		}
		// Replaced rather than merged, because the protocol distinguishes an explicit
		// null from an omitted field and the kernel's own merge cannot. A refusal
		// leaves the live overrides exactly as they were.
		when (val read = InthPayload.parseOverrides(overrides, Inth.snapshot().overrides)) {
			is OverridesRead.Refused -> promise.reject(read.code, read.message)
			is OverridesRead.Applied -> try {
				Inth.setOverrides(read.overrides, merge = false)
				promise.resolve(null)
			} catch (error: Exception) {
				promise.reject(REJECT_OVERRIDES, error.message, error)
			}
		}
	}

	override fun dismissNotice() {
		if (ensureCore()) {
			Inth.dismissNotice()
		}
	}

	override fun refresh(promise: Promise) {
		if (!ensureCore()) {
			promise.reject(REJECT_NOT_BOOTSTRAPPED, InthPayload.MESSAGE_NOT_BOOTSTRAPPED)
			return
		}
		try {
			Inth.refresh()
			// The contract's refresh covers the queue too, and the core's refresh only
			// re-runs init.
			Inth.flushPending()
			promise.resolve(null)
		} catch (error: Exception) {
			promise.reject(REJECT_REFRESH, error.message, error)
		}
	}

	override fun identify(
		externalId: String,
		promise: Promise,
	) {
		if (!ensureCore()) {
			promise.reject(REJECT_NOT_BOOTSTRAPPED, InthPayload.MESSAGE_NOT_BOOTSTRAPPED)
			return
		}
		try {
			Inth.identify(KernelUser(externalId = externalId))
			promise.resolve(null)
		} catch (error: Exception) {
			promise.reject(REJECT_IDENTIFY, error.message, error)
		}
	}

	override fun logout(promise: Promise) {
		if (!ensureCore()) {
			// Sign-out is not a no-op the app can be told about after the fact: with no
			// core there is no subject to detach, and resolving would report a logout
			// that did not happen.
			promise.reject(REJECT_NOT_BOOTSTRAPPED, InthPayload.MESSAGE_NOT_BOOTSTRAPPED)
			return
		}
		try {
			Inth.logout()
			promise.resolve(null)
		} catch (error: Exception) {
			promise.reject(REJECT_LOGOUT, error.message, error)
		}
	}

	override fun reset(promise: Promise) {
		if (!ensureCore()) {
			// Wiping is not something an unstarted SDK can report as done. Resolving
			// here would tell a "delete my data" handler that the device is clean when
			// the core never ran and nothing was deleted, which is the one reply a host
			// cannot act on afterwards.
			promise.reject(REJECT_NOT_BOOTSTRAPPED, InthPayload.MESSAGE_NOT_BOOTSTRAPPED)
			return
		}
		try {
			// `Inth.uninstall()` is teardown, not a wipe, so the wipe goes through the
			// installed core's own `reset()`.
			val kernel = Inth.current
			if (kernel == null) {
				promise.reject(REJECT_NOT_BOOTSTRAPPED, InthPayload.MESSAGE_NOT_BOOTSTRAPPED)
				return
			}
			kernel.reset()
			promise.resolve(null)
		} catch (error: Exception) {
			promise.reject(REJECT_RESET, error.message, error)
		}
	}

	override fun presentConsentPrompt(privacyPolicyURL: String, promise: Promise) = presentNative(false, privacyPolicyURL, promise)
	override fun presentPreferences(privacyPolicyURL: String, promise: Promise) = presentNative(true, privacyPolicyURL, promise)
	private fun presentNative(preferences: Boolean, privacyPolicyURL: String, promise: Promise) {
		if (!InthNativeUi.AVAILABLE) {
			promise.reject(InthPayload.REJECT_NATIVE_UI_EXCLUDED, InthPayload.MESSAGE_NATIVE_UI_EXCLUDED); return
		}
		if (!ensureCore()) { promise.reject(REJECT_NOT_BOOTSTRAPPED, InthPayload.MESSAGE_NOT_BOOTSTRAPPED); return }
		context.runOnUiQueueThread {
			val activity = context.currentActivity
			val core = Inth.current
			if (activity == null || activity.isFinishing || core == null) {
				promise.reject("INTH_PRESENTER_UNAVAILABLE", "Native presenter needs an active Activity and installed core"); return@runOnUiQueueThread
			}
			try { promise.resolve(InthNativeUi.present(activity, core, preferences, privacyPolicyURL, owner = this) { publish(InthPayload.EVENT_PRESENTER_OUTCOME, it) }) }
			// The host refuses the URL before it touches any UI. Retrying the same URL cannot help.
			catch (error: IllegalArgumentException) { promise.reject("INTH_PRESENTER_INVALID_URL", error.message, error) }
			catch (error: Exception) { promise.reject("INTH_PRESENTER_UNAVAILABLE", error.message, error) }
		}
	}
	override fun closeConsentPresenter(sessionId: String, promise: Promise) {
		context.runOnUiQueueThread { InthNativeUi.close(sessionId); promise.resolve(null) }
	}

	/**
	 * Hand the native prompt the provider's auto-present settings. The native `ConsentPrompt`
	 * decides when a prompt is owed and presents it; this forwards what it shows as events.
	 */
	override fun configureAutoPresent(settings: String, promise: Promise) {
		val parsed = InthPayload.parseAutoPresentSettings(settings)
		if (parsed == null) {
			promise.reject(REJECT_SETTINGS, "configureAutoPresent needs {\"autoPresent\": boolean, \"privacyPolicyURL\": string | null}"); return
		}
		if (!InthNativeUi.AVAILABLE) {
			// Nothing to present in this build, so turning it off is already true.
			if (parsed.autoPresent) promise.reject(InthPayload.REJECT_NATIVE_UI_EXCLUDED, InthPayload.MESSAGE_NATIVE_UI_EXCLUDED)
			else promise.resolve(null)
			return
		}
		if (!ensureCore()) { promise.reject(REJECT_NOT_BOOTSTRAPPED, InthPayload.MESSAGE_NOT_BOOTSTRAPPED); return }
		context.runOnUiQueueThread {
			val core = Inth.current
			if (core == null) { promise.reject(REJECT_NOT_BOOTSTRAPPED, InthPayload.MESSAGE_NOT_BOOTSTRAPPED); return@runOnUiQueueThread }
			val application = context.applicationContext as android.app.Application
			try {
				InthNativeUi.configure(application, context.currentActivity, core, parsed.autoPresent, parsed.privacyPolicyUrl, owner = this, emit = ::publish)
				followed = core
				promise.resolve(null)
			}
			// Refused before anything changed. Retrying the same URL cannot help.
			catch (error: IllegalArgumentException) { promise.reject("INTH_PRESENTER_INVALID_URL", error.message, error) }
		}
	}

	override fun addListener(eventName: String) {
		listenerCount += 1
	}

	override fun removeListeners(count: Double) {
		listenerCount = (listenerCount - count.toInt()).coerceAtLeast(0)
	}

	/** Drop the core subscriptions when React tears this module down. */
	override fun invalidate() {
		context.runOnUiQueueThread { InthNativeUi.detach(this) }
		snapshotSubscription?.close()
		errorSubscription?.close()
		snapshotSubscription = null
		errorSubscription = null
		super.invalidate()
	}

	/**
	 * Start the core when a launch hook did not.
	 *
	 * @return `true` when a core is installed and reads can mean something.
	 */
	private fun ensureCore(): Boolean {
		val started = InthReactNativeBootstrap.ensure(context)
		if (started) {
			subscribeToCore()
			followPrompt()
		}
		return started
	}

	/** The core the native prompt was last moved to, so a new install moves it once. */
	@Volatile
	private var followed: com.inth.core.ConsentCore? = null

	/**
	 * After `Inth.uninstall()` and a new install, move the native prompt to the new core, so
	 * an owed prompt is presented there too. Only once auto-present was configured.
	 */
	private fun followPrompt() {
		val core = Inth.current ?: return
		val previous = followed ?: return
		if (previous === core) return
		followed = core
		context.runOnUiQueueThread { InthNativeUi.follow(core) }
	}

	/** Subscribe once the core exists, since a subscription before it would be inert. */
	private fun subscribeToCore() {
		if (Inth.current == null || snapshotSubscription != null) {
			return
		}
		synchronized(this) {
			if (snapshotSubscription != null) {
				return
			}
			snapshotSubscription = Inth.onChange(snapshotObserver)
			errorSubscription = Inth.onError(errorObserver)
		}
		// Anything the core published between launch and this subscription is not lost:
		// JavaScript pulls the snapshot on mount.
		pump.onSnapshot(Inth.snapshot())
	}

	private fun publish(
		event: String,
		payload: String,
	) {
		if (listenerCount == 0) {
			// No subscriber, and a snapshot event is only ever a hint to go and read.
			return
		}
		try {
			context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
				?.emit(event, payload)
		} catch (error: Exception) {
			// React is going away. The next mount pulls the snapshot anyway.
		}
	}

	private fun deviceLanguage(): String = Locale.getDefault().language
		.takeIf { it.isNotBlank() }
		?: InthPayload.DEFAULT_LANGUAGE

	private companion object {
		const val REJECT_COMMIT = "INTH_COMMIT_FAILED"

		const val REJECT_OVERRIDES = InthPayload.REJECT_OVERRIDES
		const val REJECT_REFRESH = "INTH_REFRESH_FAILED"
		const val REJECT_IDENTIFY = "INTH_IDENTIFY_FAILED"
		const val REJECT_LOGOUT = "INTH_LOGOUT_FAILED"
		const val REJECT_RESET = "INTH_RESET_FAILED"
		const val REJECT_NOT_BOOTSTRAPPED = "INTH_NOT_BOOTSTRAPPED"
		const val REJECT_SETTINGS = "INTH_INVALID_SETTINGS"
	}
}
