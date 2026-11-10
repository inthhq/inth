package com.c15t.android.integrations

import com.c15t.core.ConsentCore
import com.c15t.core.model.ConsentCategory

/**
 * Start Singular only once one category allows it, and keep its tracking and data
 * sharing in sync with native consent.
 *
 * Singular ignores its privacy calls until `Singular.init` has run, and `init`
 * starts a session at once, so the helper owns initialization. Do not call
 * `Singular.init` yourself. On the first grant, the helper calls [start] with the
 * data-sharing limit; build the `SingularConfig` with `withLimitDataSharing` there
 * and call `Singular.init`. It then calls [resumeAllTracking] and [trackingOptIn]
 * once per grant. While [category] has never been granted in this process, the
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
 * @param start Initialize Singular with the given data-sharing limit. Called once.
 * @param limitDataSharing Call `Singular.limitDataSharing` with the given value.
 * @param stopAllTracking Call `Singular.stopAllTracking`.
 * @param resumeAllTracking Call `Singular.resumeAllTracking`.
 * @param trackingOptIn Call `Singular.trackingOptIn`.
 * @param onError Report automatic vendor-update failures without throwing. Explicit
 * construction, sync and close failures still throw to their caller.
 * @throws IllegalArgumentException If category is necessary.
 */
class SingularIntegration(
	core: ConsentCore,
	category: ConsentCategory = ConsentCategory.MARKETING,
	start: (limitDataSharing: Boolean) -> Unit,
	limitDataSharing: (Boolean) -> Unit,
	stopAllTracking: () -> Unit,
	resumeAllTracking: () -> Unit,
	trackingOptIn: () -> Unit,
	onError: (Exception) -> Unit,
) : AutoCloseable {
	// Set before start runs, so a withdrawal during start stops what start began.
	@Volatile private var started = false

	private val binding = ConsentBinding(core, category, onError, trackingAndAds(category)) { previous, (tracking, ads), current ->
		if (tracking) {
			if (!started && current().first) {
				started = true
				start(!(ads.adUserData && ads.adPersonalization))
			}
			// Each call that follows reads current consent; a withdrawal is applied next.
			val (stillTracking, now) = current()
			if (stillTracking) {
				limitDataSharing(!(now.adUserData && now.adPersonalization))
				if (previous?.first != true && current().first) {
					resumeAllTracking()
					if (current().first) trackingOptIn()
				}
			}
		} else if (started) {
			runAll(stopAllTracking, { limitDataSharing(!(ads.adUserData && ads.adPersonalization)) })
		}
	}

	/** Reapply current consent, opting in again if allowed. No-op after close. */
	fun sync() = binding.sync()

	/** Stop observing and, if Singular started, stop all tracking. Safe to call more than once. */
	override fun close() = binding.close()
}
