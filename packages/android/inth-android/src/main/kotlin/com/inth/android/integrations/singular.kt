package com.inth.android.integrations

import com.inth.core.ConsentCore
import com.inth.core.model.ConsentCategory

/**
 * Start Singular only once one category allows it, and keep its tracking and data
 * sharing in sync with native consent.
 *
 * Singular ignores its privacy calls until `Singular.init` has run, and `init`
 * starts a session at once, so the helper owns initialization. Do not call
 * `Singular.init` yourself. On the first grant, the helper calls [start] with the
 * data-sharing limit; build the `SingularConfig` with `withLimitDataSharing` there
 * and return what `Singular.init` returns. If it returns `false` or throws, the
 * helper reports the failure, makes no tracking call, and tries [start] again on
 * the next update or [sync], including when this happens during construction. Restricting calls still follow consent while it may
 * have started. Once Singular started, the helper calls
 * [resumeAllTracking] and [trackingOptIn] once per grant. While [category] has never been granted in this process, the
 * helper makes no Singular call, because Singular is not running. After it has
 * started, withdrawal calls [stopAllTracking], which Singular keeps across
 * launches, and both withdrawal calls run even if the first throws.
 *
 * [limitDataSharing] receives `true` unless `adUserData` and `adPersonalization`
 * are both granted; Singular passes it to Google as the DMA consent signals.
 * Marketing grants both and is the default category. The helper adds no Singular
 * dependency. Callbacks run synchronously on the publishing thread. Retain the
 * helper and [close] it during teardown.
 *
 * @param core The same installed native core used by the consent UI.
 * @param category Optional category that lets Singular track. Defaults to marketing.
 * @param start Initialize Singular with the given data-sharing limit and return
 * whether it started. Called until it returns `true`.
 * @param limitDataSharing Call `Singular.limitDataSharing` with the given value.
 * @param stopAllTracking Call `Singular.stopAllTracking`.
 * @param resumeAllTracking Call `Singular.resumeAllTracking`.
 * @param trackingOptIn Call `Singular.trackingOptIn`.
 * @param onError Report vendor failures during construction and automatic updates
 * without throwing; the helper stays connected and applies consent again on the next
 * update or [sync]. Explicit sync and close failures still throw to their caller.
 * @throws IllegalArgumentException If category is necessary.
 */
class SingularIntegration(
	core: ConsentCore,
	category: ConsentCategory = ConsentCategory.MARKETING,
	start: (limitDataSharing: Boolean) -> Boolean,
	limitDataSharing: (Boolean) -> Unit,
	stopAllTracking: () -> Unit,
	resumeAllTracking: () -> Unit,
	trackingOptIn: () -> Unit,
	onError: (Exception) -> Unit,
) : AutoCloseable {
	// Set before start runs, so a withdrawal during start stops what it began.
	@Volatile private var mayHaveStarted = false

	// Set while start runs, so an update that overtakes it does not start again.
	@Volatile private var starting = false

	// Set only once start succeeded, so a failed start is tried again.
	@Volatile private var started = false

	// A failed start at launch must not drop the helper: it retries on the next update.
	private val binding = ConsentBinding(core, category, onError, trackingAndAds(category), keepAfterInitialFailure = true) { previous, (tracking, ads), current ->
		if (tracking) {
			// Restricting comes first, so a start in flight or failing cannot delay it.
			var limited = false
			if (mayHaveStarted && limits(current().second)) {
				limitDataSharing(true)
				limited = true
			}
			if (!started && !starting && current().first) {
				mayHaveStarted = true
				starting = true
				try {
					check(start(limits(ads))) { "Singular did not start" }
					started = true
				} finally {
					starting = false
				}
			}
			// Each call that follows reads current consent; a withdrawal is applied next.
			val (stillTracking, now) = current()
			if (stillTracking && started) {
				val limit = limits(now)
				if (!(limit && limited)) limitDataSharing(limit)
				if (previous?.first != true && current().first) {
					resumeAllTracking()
					if (current().first) trackingOptIn()
				}
			}
		} else if (mayHaveStarted) {
			runAll(stopAllTracking, { limitDataSharing(true) })
		}
	}

	/** Reapply current consent, opting in again if allowed. No-op after close. */
	fun sync() = binding.sync()

	/** Stop observing and, if Singular started, stop all tracking. Safe to call more than once. */
	override fun close() = binding.close()
}

/** Whether Singular must limit data sharing: unless both DMA signals are granted. */
private fun limits(ads: GoogleAdsConsent) = !(ads.adUserData && ads.adPersonalization)
