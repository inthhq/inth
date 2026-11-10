package com.c15t.android.integrations

import android.util.Log
import com.c15t.core.ConsentCore
import com.c15t.core.Subscription
import com.c15t.core.model.ConsentCategory

/**
 * The four Consent Mode v2 types Firebase Analytics takes, as sent by
 * [FirebaseAnalyticsIntegration]. Measurement grants [analyticsStorage]; marketing
 * grants [adStorage], [adUserData] and [adPersonalization]. See [GoogleConsentMode].
 *
 * @property analyticsStorage Firebase `ANALYTICS_STORAGE`.
 * @property adStorage Firebase `AD_STORAGE`.
 * @property adUserData Firebase `AD_USER_DATA`.
 * @property adPersonalization Firebase `AD_PERSONALIZATION`.
 */
data class FirebaseAnalyticsConsent(
	val analyticsStorage: Boolean,
	val adStorage: Boolean,
	val adUserData: Boolean,
	val adPersonalization: Boolean,
) {
	companion object {
		/** Pick Firebase's four types out of a full Consent Mode state. */
		fun from(consent: Map<GoogleConsentType, Boolean>) = FirebaseAnalyticsConsent(
			analyticsStorage = consent[GoogleConsentType.ANALYTICS_STORAGE] == true,
			adStorage = consent[GoogleConsentType.AD_STORAGE] == true,
			adUserData = consent[GoogleConsentType.AD_USER_DATA] == true,
			adPersonalization = consent[GoogleConsentType.AD_PERSONALIZATION] == true,
		)
	}
}

/**
 * Keep Firebase Analytics consent and collection in sync with native consent.
 *
 * Sends all four Consent Mode v2 types Firebase takes, with the web's mapping:
 * measurement grants `ANALYTICS_STORAGE`, marketing grants `AD_STORAGE`,
 * `AD_USER_DATA` and `AD_PERSONALIZATION`. Collection is on only while analytics
 * storage is granted. Pending authority denies every type and keeps collection off.
 *
 * Pass the installed core and synchronous calls to the vendor's consent and
 * collection APIs. The helper adds no Firebase dependency. It immediately applies
 * current authority, disables collection before updating consent and enables it
 * only while analytics storage is still granted.
 *
 * Callbacks run on the thread publishing the native change, serialized per helper.
 * Do not dispatch the callbacks asynchronously, because that can reorder grants and
 * withdrawals. Set Firebase's `google_analytics_default_allow_*` manifest keys to
 * `false` and disable collection before constructing this helper. Firebase persists
 * consent and its collection setting across launches, so a manifest default alone
 * cannot override an earlier runtime grant.
 *
 * Retain one helper for the vendor's lifetime. [close] detaches, denies every type
 * and disables collection. It does not provide IAB or ATT authorization.
 *
 * @param core The same installed native core used by the consent UI.
 * @param setConsent Apply every field to Firebase's consent API.
 * @param setCollectionEnabled Enable or disable Firebase Analytics collection.
 * @param onError Report automatic vendor-update failures without throwing. Explicit
 * construction, sync and close failures still throw to their caller.
 */
class FirebaseAnalyticsIntegration(
	core: ConsentCore,
	setConsent: (FirebaseAnalyticsConsent) -> Unit,
	setCollectionEnabled: (Boolean) -> Unit,
	onError: (Exception) -> Unit,
) : AutoCloseable {
	private val binding = ConsentBinding(
		core,
		ConsentCategory.MEASUREMENT,
		onError,
		read = { isAllowed -> FirebaseAnalyticsConsent.from(GoogleConsentMode.consent(isAllowed)) },
	) { _, _, current ->
		// Both run even if disabling collection throws, so denied types still reach
		// Firebase. Consent is read when sent, so a call that returns late sends current.
		runAll({ setCollectionEnabled(false) }, { setConsent(current()) })
		if (current().analyticsStorage) setCollectionEnabled(true)
	}

	/** Reapply current authority after vendor reset or configuration. No-op after close. */
	fun sync() = binding.sync()

	/** Stop observing, deny every type and disable collection. Safe to call more than once. */
	override fun close() = binding.close()
}

/**
 * Keep PostHog event capture in sync with one native category.
 *
 * Pass synchronous opt-in and opt-out calls from the installed PostHog client.
 * This helper immediately applies current authority and opts out on pending,
 * denied or closed state. It does not import or initialize PostHog.
 *
 * Configure PostHog with capture opted out before setup. Disable independent
 * feature-flag requests, session replay and other products until separately
 * authorized; this helper controls the supplied opt-in/opt-out APIs only. Persisted
 * vendor opt-in can outlive a process, so reconcile native authority on every launch.
 *
 * Callbacks run synchronously on the publishing thread, serialized per helper.
 * Retain the helper for the vendor's lifetime and [close] it during teardown.
 *
 * @param core The same installed native core used by the consent UI.
 * @param category Optional category controlling capture. Defaults to measurement.
 * @param optIn Enable capture with PostHog's supported API.
 * @param optOut Disable capture with PostHog's supported API.
 * @param onError Report automatic vendor-update failures without throwing. Explicit
 * construction, sync and close failures still throw to their caller.
 * @throws IllegalArgumentException If category is necessary.
 */
class PostHogIntegration(
	core: ConsentCore,
	category: ConsentCategory = ConsentCategory.MEASUREMENT,
	optIn: () -> Unit,
	optOut: () -> Unit,
	onError: (Exception) -> Unit,
) : AutoCloseable {
	private val binding = AnalyticsConsentBinding(core, category, onError) { allowed, stillAllowed ->
		if (allowed && stillAllowed()) optIn() else optOut()
	}

	/** Reapply current authority after vendor reset or configuration. No-op after close. */
	fun sync() = binding.sync()

	/** Stop observing and opt out of capture. Safe to call more than once. */
	override fun close() = binding.close()
}

/**
 * Keep Mixpanel tracking in sync with one native category.
 *
 * Initialize Mixpanel opted out and pass synchronous calls on that same instance.
 * Unchanged native permission does not repeat a vendor command. Explicit [sync]
 * reapplies it, which can emit another `$opt_in` event or clear local identity
 * again. Mixpanel's opt-out API clears pending events and user-related local
 * information. The helper never flushes events before a refusal and does not
 * identify the user again.
 *
 * This helper adds no Mixpanel dependency. Feature flags, session replay and other
 * independently configured products need their own authorization. Retain the
 * helper for the vendor's lifetime, call [sync] after vendor reset and [close]
 * during teardown. Callbacks run synchronously on the publishing thread and are
 * serialized per helper; do not dispatch them asynchronously.
 *
 * @param core The same installed native core used by the consent UI.
 * @param category Optional category controlling tracking. Defaults to measurement.
 * @param optInTracking Enable tracking with Mixpanel's opt-in API.
 * @param optOutTracking Disable tracking with Mixpanel's opt-out API.
 * @param onError Report automatic vendor-update failures without throwing. Explicit
 * construction, sync and close failures still throw to their caller.
 * @throws IllegalArgumentException If category is necessary.
 */
class MixpanelIntegration(
	core: ConsentCore,
	category: ConsentCategory = ConsentCategory.MEASUREMENT,
	optInTracking: () -> Unit,
	optOutTracking: () -> Unit,
	onError: (Exception) -> Unit,
) : AutoCloseable {
	private val binding = AnalyticsConsentBinding(core, category, onError) { allowed, stillAllowed ->
		if (allowed && stillAllowed()) optInTracking() else optOutTracking()
	}

	/** Reapply current authority after vendor reset. No-op after close. */
	fun sync() = binding.sync()

	/** Stop observing and opt out of tracking. Safe to call more than once. */
	override fun close() = binding.close()
}

/**
 * Keep Sentry Session Replay capture in sync with one native category.
 *
 * Before Sentry initialization, set both replay sample rates to zero. Pass direct
 * calls to `Sentry.replay().start()` and `Sentry.replay().stop()` from Sentry Android
 * 8.54 or later. Manual replay requires Android API 26 or later. Keep masking
 * enabled. This helper adds no Sentry dependency and does not change crash
 * reporting, profiling, breadcrumbs or user-data configuration.
 *
 * Pending, denied and closed states stop replay. Sentry queues these commands on
 * its main thread, so return from a callback or [close] does not confirm that the
 * recorder has stopped. Stop can upload the final segment captured while replay
 * was allowed. The helper never flushes replay or deletes recorded data.
 *
 * Retain the helper for Sentry's lifetime. Call [sync] after Sentry reinitializes
 * or starts a new app session. With both sample rates zero, a new Sentry session
 * stops manual replay until it is explicitly started again. Native consent may
 * be unchanged, so the helper cannot detect that reset itself. Call the supplied
 * APIs directly, without adding an asynchronous dispatch that could reorder them.
 *
 * @param core The same installed native core used by the consent UI.
 * @param category Optional category controlling replay. Defaults to measurement.
 * @param start Start full-session recording with Sentry's manual replay API.
 * @param stop Stop recording with Sentry's manual replay API.
 * @param onError Report automatic vendor-update failures without throwing. Explicit
 * construction, sync and close failures still throw to their caller.
 * @throws IllegalArgumentException If category is necessary.
 */
class SentryReplayIntegration(
	core: ConsentCore,
	category: ConsentCategory = ConsentCategory.MEASUREMENT,
	start: () -> Unit,
	stop: () -> Unit,
	onError: (Exception) -> Unit,
) : AutoCloseable {
	private val binding = AnalyticsConsentBinding(core, category, onError) { allowed, stillAllowed ->
		if (allowed && stillAllowed()) start() else stop()
	}

	/** Reapply authority after Sentry starts a new app session or reinitializes. No-op after close. */
	fun sync() = binding.sync()

	/** Stop observing and request replay stop. Safe to call more than once. */
	override fun close() = binding.close()
}

/**
 * Run every call, even when an earlier one throws, then rethrow the first failure
 * with the others suppressed. Withdrawal paths use this so a failing vendor call
 * cannot stop a later call from turning collection off.
 */
internal fun runAll(vararg calls: () -> Unit) {
	var failure: Exception? = null
	for (call in calls) {
		try {
			call()
		} catch (error: Exception) {
			failure?.addSuppressed(error) ?: run { failure = error }
		}
	}
	failure?.let { throw it }
}

/** Bind one optional category to a vendor's on/off calls. */
@Suppress("FunctionName")
internal fun AnalyticsConsentBinding(
	core: ConsentCore,
	category: ConsentCategory,
	onError: (Exception) -> Unit,
	apply: (Boolean, () -> Boolean) -> Unit,
): ConsentBinding<Boolean> {
	require(category.optional) { "Analytics integrations require an optional consent category." }
	return ConsentBinding(core, category, onError, read = { isAllowed -> isAllowed(category) }) { _, allowed, current ->
		apply(allowed, current)
	}
}

/**
 * The core retains this binding until close; every update re-reads current authority.
 *
 * [read] derives the vendor state from category permission, through a reader that
 * denies every category once closed, so it may read categories other than [category].
 * The boolean gate on [category] is only the wake-up: it fires on every published
 * snapshot, whichever category moved, and [reconcile] skips unchanged state. One
 * registration therefore sees every publication once, which keeps a failing vendor
 * call to one retry and one reported error per publication. [apply] receives the
 * state it last applied, the state read before the call and a way to read it again.
 * The last state is `null` on the first call, after [sync] or [close], and after a
 * failed call, so a vendor whose start call must run once per grant can tell a new
 * grant from an unrelated change.
 *
 * One update holds the turn at a time, on the thread that publishes it, and vendor
 * calls run outside the lock. A withdrawal never waits for them: when a category the
 * update holding the turn grants is withdrawn on another thread, that thread takes
 * the turn and applies the withdrawal at once, even while the overtaken update is
 * blocked inside a vendor call. Other changes, including a regrant, are picked up by
 * whichever update holds the turn when its call returns, so they apply after the
 * withdrawal. An overtaken update records nothing when it returns; it asks for
 * current authority to be reapplied, so a grant that completes late cannot leave the
 * vendor enabled.
 */
internal class ConsentBinding<State>(
	private val core: ConsentCore,
	category: ConsentCategory,
	private val onError: (Exception) -> Unit,
	private val read: ((ConsentCategory) -> Boolean) -> State,
	private val apply: (previous: State?, state: State, current: () -> State) -> Unit,
) : AutoCloseable {
	private val lock = Any()
	@Volatile private var closed = false
	private var attached = false
	private var needsSync = false
	private var applied: State? = null
	private var hasApplied = false
	private var subscription: Subscription? = null
	private var applier: Thread? = null
	private var target: State? = null
	private var targetGranted: Set<ConsentCategory> = emptySet()
	// Declared before init, which runs the first update. What the update holding the
	// turn reads, it may enable, so its categories join the turn's granted set even
	// before the publication that granted them reaches this binding.
	private val readCurrent: () -> State = {
		synchronized(lock) {
			val (state, granted) = readGranted()
			if (applier === Thread.currentThread()) targetGranted = targetGranted + granted
			state
		}
	}
	private val observer: (Boolean) -> Unit = {
		// gate delivers synchronously before returning its handle. Initial vendor
		// failures must reach the constructor's cleanup and caller below.
		if (synchronized(lock) { attached }) {
			try {
				reconcile()
			} catch (error: Exception) {
				// A vendor failure must not prevent other observers receiving withdrawal.
				try {
					onError(error)
				} catch (reporterError: Exception) {
					Log.e("c15t", "Analytics integration error reporter failed", reporterError)
				}
			}
		}
	}

	init {
		synchronized(lock) {
			subscription = core.gate(category, observer)
			attached = true
		}
		try {
			reconcile()
		} catch (error: Throwable) {
			synchronized(lock) { closed = true }
			detach()
			// An enable can take effect before its vendor call reports failure.
			try {
				synchronized(lock) { needsSync = true }
				reconcile()
			} catch (cleanupError: Throwable) {
				if (cleanupError !== error) error.addSuppressed(cleanupError)
			}
			throw error
		}
	}

	private fun current(): State = read { category -> !closed && core.isAllowed(category) }

	/** Read current state and the categories it grants. Call with [lock] held. */
	private fun readGranted(): Pair<State, Set<ConsentCategory>> {
		val granted = HashSet<ConsentCategory>()
		val state = read { category -> (!closed && core.isAllowed(category)).also { if (it) granted += category } }
		return state to granted
	}

	private fun detach() {
		val previous = synchronized(lock) {
			attached = false
			subscription.also { subscription = null }
		}
		previous?.close()
	}

	fun sync() {
		synchronized(lock) {
			if (closed) return
			needsSync = true
		}
		reconcile()
	}

	private fun reconcile() {
		val me = Thread.currentThread()
		while (true) {
			val previous: State?
			val state: State
			synchronized(lock) {
				val (next, granted) = readGranted()
				val running = applier
				// Reentrant: this thread's own pass re-reads when its vendor call returns.
				if (running === me) return
				if (running != null) {
					// Nothing the update holding the turn may have enabled was withdrawn:
					// it picks this change up when its vendor call returns. It reads
					// current authority before each enabling call, so it may enable
					// anything granted while it holds the turn.
					if (granted.containsAll(targetGranted)) {
						targetGranted = targetGranted + granted
						return
					}
					// A withdrawal takes the turn at once.
					previous = target
				} else {
					if (hasApplied && applied == next && !needsSync) return
					previous = if (hasApplied && !needsSync) applied else null
					needsSync = false
				}
				hasApplied = false
				applier = me
				state = next
				target = next
				targetGranted = granted
			}
			val failure = try {
				apply(previous, state, readCurrent)
				null
			} catch (error: Throwable) {
				error
			}
			val again = synchronized(lock) {
				if (applier === me) {
					applier = null
					if (failure == null) {
						applied = state
						hasApplied = true
					}
					// Pick up changes made while the call ran, unless it failed.
					failure == null
				} else {
					// A withdrawal overtook this update while its call ran, so its result
					// is stale. Reapply current authority once the turn is free.
					needsSync = true
					applier == null
				}
			}
			if (failure != null) {
				if (again) {
					try {
						reconcile()
					} catch (retryError: Throwable) {
						if (retryError !== failure) failure.addSuppressed(retryError)
					}
				}
				throw failure
			}
			if (!again) return
		}
	}

	override fun close() {
		val first = synchronized(lock) {
			val first = !closed
			if (first) {
				closed = true
				// A vendor reset may have changed capture since the last consent update.
				needsSync = true
			}
			first
		}
		if (first) detach()
		reconcile()
	}
}
