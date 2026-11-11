package com.c15t.reactnative

import com.c15t.core.C15t
import com.c15t.core.Subscription
import com.c15t.core.model.ConsentSnapshot
import com.c15t.core.model.KernelError
import com.c15t.core.model.KernelUser
import com.c15t.core.webview.WebViewConsentScript
import com.c15t.core.webview.WebViewConsentState
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.util.Locale

/**
 * The `C15t` TurboModule: the JavaScript surface in
 * `src/specs/NativeC15t.ts`, forwarding call for call to the Kotlin core.
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
class C15tReactNativeModule(appContext: ReactApplicationContext) : NativeC15tSpec(appContext) {
	private val context: ReactApplicationContext = appContext
	private val pump = C15tChangePump(sink = this::publish)

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
		return C15tPayload.bootstrap(
			snapshot = C15t.snapshot(),
			hasStoredSnapshot = C15t.hasStoredSnapshot,
		)
	}

	/** The current snapshot, encoded for the wire. */
	override fun getSnapshot(): String {
		ensureCore()
		val core = C15t.current
		val (snapshot, additions) = C15tPayload.consistently({ C15t.snapshot() }) {
			Triple(
				core?.iabConsent,
				core?.iabAcceptAllChoices(),
				core?.iabPresentation(),
			)
		}
		return C15tPayload.snapshot(snapshot, fallbackLanguage = deviceLanguage(), iabConsent = additions.first,
			iabAcceptAll = additions.second, iabPresentation = additions.third)
	}

	/** WebView consent: the state a page reads, and a fresh token and request key for one WebView. */
	override fun getWebViewConsent(): String {
		ensureCore()
		val core = C15t.current
		val state = if (core != null) WebViewConsentState.from(core) else WebViewConsentState.from(C15t.snapshot(), null)
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
		C15tPayload.trackingAuthorization(C15tTracking.status)

	/**
	 * Reject, always. Android has no tracking prompt for this module to show, so a
	 * resolution would report a dialog no user ever saw.
	 *
	 * See the KDoc on [C15tTracking] for what Android can and cannot answer about the
	 * advertising identifier, and for why [C15tTrackingAuthorization.UNSUPPORTED] from
	 * [getTrackingAuthorization] is not the same statement as "not determined yet".
	 */
	override fun requestTrackingAuthorization(promise: Promise) {
		promise.reject(C15tTracking.REJECT_UNSUPPORTED, C15tTracking.MESSAGE_UNSUPPORTED)
	}

	/** The same request with JSON options. Android has nothing to ask, so it rejects the same way. */
	override fun requestTrackingAuthorizationWithOptions(
		options: String,
		promise: Promise,
	) {
		promise.reject(C15tTracking.REJECT_UNSUPPORTED, C15tTracking.MESSAGE_UNSUPPORTED)
	}

	override fun commit(
		intent: String,
		promise: Promise,
	) {
		val parsed = C15tPayload.parseCommitIntent(intent)
		if (parsed == null) {
			promise.resolve(C15tPayload.invalidIntent(intent))
			return
		}
		val core = if (ensureCore()) C15t.current else null
		if (core == null) {
			promise.resolve(C15tPayload.notBootstrapped())
			return
		}
		try {
			promise.resolve(C15tPayload.commit(intent, core))
		} catch (error: Exception) {
			promise.reject(REJECT_COMMIT, error.message, error)
		}
	}

	override fun setOverrides(
		overrides: String,
		promise: Promise,
	) {
		if (!ensureCore()) {
			promise.reject(REJECT_NOT_BOOTSTRAPPED, C15tPayload.MESSAGE_NOT_BOOTSTRAPPED)
			return
		}
		// Replaced rather than merged, because the protocol distinguishes an explicit
		// null from an omitted field and the kernel's own merge cannot. A refusal
		// leaves the live overrides exactly as they were.
		when (val read = C15tPayload.parseOverrides(overrides, C15t.snapshot().overrides)) {
			is OverridesRead.Refused -> promise.reject(read.code, read.message)
			is OverridesRead.Applied -> try {
				C15t.setOverrides(read.overrides, merge = false)
				promise.resolve(null)
			} catch (error: Exception) {
				promise.reject(REJECT_OVERRIDES, error.message, error)
			}
		}
	}

	override fun dismissNotice() {
		if (ensureCore()) {
			C15t.dismissNotice()
		}
	}

	override fun refresh(promise: Promise) {
		if (!ensureCore()) {
			promise.reject(REJECT_NOT_BOOTSTRAPPED, C15tPayload.MESSAGE_NOT_BOOTSTRAPPED)
			return
		}
		try {
			C15t.refresh()
			// The contract's refresh covers the queue too, and the core's refresh only
			// re-runs init.
			C15t.flushPending()
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
			promise.reject(REJECT_NOT_BOOTSTRAPPED, C15tPayload.MESSAGE_NOT_BOOTSTRAPPED)
			return
		}
		try {
			C15t.identify(KernelUser(externalId = externalId))
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
			promise.reject(REJECT_NOT_BOOTSTRAPPED, C15tPayload.MESSAGE_NOT_BOOTSTRAPPED)
			return
		}
		try {
			C15t.logout()
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
			promise.reject(REJECT_NOT_BOOTSTRAPPED, C15tPayload.MESSAGE_NOT_BOOTSTRAPPED)
			return
		}
		try {
			// `C15t.uninstall()` is teardown, not a wipe, so the wipe goes through the
			// installed core's own `reset()`.
			val kernel = C15t.current
			if (kernel == null) {
				promise.reject(REJECT_NOT_BOOTSTRAPPED, C15tPayload.MESSAGE_NOT_BOOTSTRAPPED)
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
		if (!C15tNativeUi.AVAILABLE) {
			promise.reject(C15tPayload.REJECT_NATIVE_UI_EXCLUDED, C15tPayload.MESSAGE_NATIVE_UI_EXCLUDED); return
		}
		if (!ensureCore()) { promise.reject(REJECT_NOT_BOOTSTRAPPED, C15tPayload.MESSAGE_NOT_BOOTSTRAPPED); return }
		context.runOnUiQueueThread {
			val activity = context.currentActivity
			val core = C15t.current
			if (activity == null || activity.isFinishing || core == null) {
				promise.reject("C15T_PRESENTER_UNAVAILABLE", "Native presenter needs an active Activity and installed core"); return@runOnUiQueueThread
			}
			try { promise.resolve(C15tNativeUi.present(activity, core, preferences, privacyPolicyURL, owner = this) { publish(C15tPayload.EVENT_PRESENTER_OUTCOME, it) }) }
			// The host refuses the URL before it touches any UI. Retrying the same URL cannot help.
			catch (error: IllegalArgumentException) { promise.reject("C15T_PRESENTER_INVALID_URL", error.message, error) }
			catch (error: Exception) { promise.reject("C15T_PRESENTER_UNAVAILABLE", error.message, error) }
		}
	}
	override fun closeConsentPresenter(sessionId: String, promise: Promise) {
		context.runOnUiQueueThread { C15tNativeUi.close(sessionId); promise.resolve(null) }
	}

	/**
	 * Hand the native prompt the provider's auto-present settings. The native `ConsentPrompt`
	 * decides when a prompt is owed and presents it; this forwards what it shows as events.
	 */
	override fun configureAutoPresent(settings: String, promise: Promise) {
		val parsed = C15tPayload.parseAutoPresentSettings(settings)
		if (parsed == null) {
			promise.reject(REJECT_SETTINGS, "configureAutoPresent needs {\"autoPresent\": boolean, \"privacyPolicyURL\": string | null}"); return
		}
		if (!C15tNativeUi.AVAILABLE) {
			// Nothing to present in this build, so turning it off is already true.
			if (parsed.autoPresent) promise.reject(C15tPayload.REJECT_NATIVE_UI_EXCLUDED, C15tPayload.MESSAGE_NATIVE_UI_EXCLUDED)
			else promise.resolve(null)
			return
		}
		if (!ensureCore()) { promise.reject(REJECT_NOT_BOOTSTRAPPED, C15tPayload.MESSAGE_NOT_BOOTSTRAPPED); return }
		context.runOnUiQueueThread {
			val core = C15t.current
			if (core == null) { promise.reject(REJECT_NOT_BOOTSTRAPPED, C15tPayload.MESSAGE_NOT_BOOTSTRAPPED); return@runOnUiQueueThread }
			val application = context.applicationContext as android.app.Application
			try {
				C15tNativeUi.configure(application, context.currentActivity, core, parsed.autoPresent, parsed.privacyPolicyUrl, owner = this, emit = ::publish)
				followed = core
				promise.resolve(null)
			}
			// Refused before anything changed. Retrying the same URL cannot help.
			catch (error: IllegalArgumentException) { promise.reject("C15T_PRESENTER_INVALID_URL", error.message, error) }
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
		context.runOnUiQueueThread { C15tNativeUi.detach(this) }
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
		val started = C15tReactNativeBootstrap.ensure(context)
		if (started) {
			subscribeToCore()
			followPrompt()
		}
		return started
	}

	/** The core the native prompt was last moved to, so a new install moves it once. */
	@Volatile
	private var followed: com.c15t.core.ConsentCore? = null

	/**
	 * After `C15t.uninstall()` and a new install, move the native prompt to the new core, so
	 * an owed prompt is presented there too. Only once auto-present was configured.
	 */
	private fun followPrompt() {
		val core = C15t.current ?: return
		val previous = followed ?: return
		if (previous === core) return
		followed = core
		context.runOnUiQueueThread { C15tNativeUi.follow(core) }
	}

	/** Subscribe once the core exists, since a subscription before it would be inert. */
	private fun subscribeToCore() {
		if (C15t.current == null || snapshotSubscription != null) {
			return
		}
		synchronized(this) {
			if (snapshotSubscription != null) {
				return
			}
			snapshotSubscription = C15t.onChange(snapshotObserver)
			errorSubscription = C15t.onError(errorObserver)
		}
		// Anything the core published between launch and this subscription is not lost:
		// JavaScript pulls the snapshot on mount.
		pump.onSnapshot(C15t.snapshot())
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
		?: C15tPayload.DEFAULT_LANGUAGE

	private companion object {
		const val REJECT_COMMIT = "C15T_COMMIT_FAILED"

		const val REJECT_OVERRIDES = C15tPayload.REJECT_OVERRIDES
		const val REJECT_REFRESH = "C15T_REFRESH_FAILED"
		const val REJECT_IDENTIFY = "C15T_IDENTIFY_FAILED"
		const val REJECT_LOGOUT = "C15T_LOGOUT_FAILED"
		const val REJECT_RESET = "C15T_RESET_FAILED"
		const val REJECT_NOT_BOOTSTRAPPED = "C15T_NOT_BOOTSTRAPPED"
		const val REJECT_SETTINGS = "C15T_INVALID_SETTINGS"
	}
}
