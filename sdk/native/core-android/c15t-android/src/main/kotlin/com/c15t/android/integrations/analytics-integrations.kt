package com.c15t.android.integrations

import android.util.Log
import com.c15t.core.C15tKernel
import com.c15t.core.Subscription
import com.c15t.core.model.ConsentCategory

/**
 * Consent sent by [FirebaseAnalyticsIntegration]. Advertising permissions remain
 * denied. An analytics category does not authorize advertising or IAB vendors.
 *
 * @property analyticsStorage Whether the configured analytics category is allowed.
 */
data class FirebaseAnalyticsConsent(val analyticsStorage: Boolean) {
	val adStorage: Boolean = false
	val adUserData: Boolean = false
	val adPersonalization: Boolean = false
}

/**
 * Keep Firebase Analytics collection and consent in sync with one native category.
 *
 * Pass the installed core and synchronous calls to the vendor's consent and
 * collection APIs. The helper adds no Firebase dependency. It immediately applies
 * current authority, disables collection before updating consent and enables it
 * only while the category is still allowed. Pending authority keeps collection off.
 *
 * Callbacks run on the thread publishing the native change, serialized per helper.
 * Do not dispatch the callbacks asynchronously, because that can reorder grants and
 * withdrawals. Disable vendor automatic startup before constructing this helper.
 * Firebase persists its collection setting across launches, so a manifest default
 * alone cannot override an earlier runtime grant.
 *
 * Retain one helper for the vendor's lifetime. [close] detaches and disables
 * collection. This analytics-only helper always denies all advertising consent
 * types. It does not provide IAB, Google Mobile Ads or ATT authorization.
 *
 * @param core The same installed native core used by the consent UI.
 * @param category Optional category controlling analytics. Defaults to measurement.
 * @param setConsent Apply every field to Firebase's consent API.
 * @param setCollectionEnabled Enable or disable Firebase Analytics collection.
 * @param onError Report automatic vendor-update failures without throwing. Explicit
 * construction, sync and close failures still throw to their caller.
 * @throws IllegalArgumentException If category is necessary.
 */
class FirebaseAnalyticsIntegration(
	core: C15tKernel,
	category: ConsentCategory = ConsentCategory.MEASUREMENT,
	setConsent: (FirebaseAnalyticsConsent) -> Unit,
	setCollectionEnabled: (Boolean) -> Unit,
	onError: (Exception) -> Unit,
) : AutoCloseable {
	private val binding = AnalyticsConsentBinding(core, category, onError) { allowed, stillAllowed ->
		setCollectionEnabled(false)
		val grant = allowed && stillAllowed()
		setConsent(FirebaseAnalyticsConsent(grant))
		if (grant && stillAllowed()) setCollectionEnabled(true)
	}

	/** Reapply current authority after vendor reset or configuration. No-op after close. */
	fun sync() = binding.sync()

	/** Stop observing and disable collection. Safe to call more than once. */
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
	core: C15tKernel,
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
	core: C15tKernel,
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
	core: C15tKernel,
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

/** The core retains this binding until close; every update re-reads current authority. */
private class AnalyticsConsentBinding(
	private val core: C15tKernel,
	private val category: ConsentCategory,
	private val onError: (Exception) -> Unit,
	private val apply: (Boolean, () -> Boolean) -> Unit,
) : AutoCloseable {
	init {
		require(category.optional) { "Analytics integrations require an optional consent category." }
	}

	private val lock = Any()
	private var closed = false
	private var updating = false
	private var needsSync = false
	private var applied: Boolean? = null
	private var subscription: Subscription? = null
	private val observer: (Boolean) -> Unit = {
		synchronized(lock) {
			// gate delivers synchronously before returning its handle. Initial vendor
			// failures must reach the constructor's cleanup and caller below.
			if (subscription != null) {
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
	}

	init {
		synchronized(lock) {
			subscription = core.gate(category, observer)
			try {
				reconcile()
			} catch (error: Throwable) {
				closed = true
				subscription?.close()
				subscription = null
				// An enable can take effect before its vendor call reports failure.
				try {
					needsSync = true
					reconcile()
				} catch (cleanupError: Throwable) {
					if (cleanupError !== error) error.addSuppressed(cleanupError)
				}
				throw error
			}
		}
	}

	private fun allowed(): Boolean = !closed && core.isAllowed(category)

	fun sync() = synchronized(lock) {
		if (closed) return@synchronized
		needsSync = true
		reconcile()
	}

	private fun reconcile() = synchronized(lock) {
		if (updating) return@synchronized
		updating = true
		try {
			while (true) {
				val current = allowed()
				if (applied == current && !needsSync) break
				needsSync = false
				applied = null
				apply(current, ::allowed)
				applied = current
			}
		} finally {
			updating = false
		}
	}

	override fun close() = synchronized(lock) {
		if (!closed) {
			closed = true
			// A vendor reset may have changed capture since the last consent update.
			needsSync = true
			subscription?.close()
			subscription = null
		}
		reconcile()
	}
}
