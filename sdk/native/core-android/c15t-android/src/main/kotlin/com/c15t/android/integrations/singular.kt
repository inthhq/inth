package com.c15t.android.integrations

import com.c15t.core.ConsentCore
import com.c15t.core.model.ConsentCategory

/**
 * Keep Singular tracking and data sharing in sync with native consent.
 *
 * While [category] is denied or pending, the helper calls [stopAllTracking],
 * which Singular keeps across launches. When it is granted, it calls
 * [resumeAllTracking] and [trackingOptIn] once per grant. [limitDataSharing]
 * receives `true` unless `adUserData` and `adPersonalization` are both granted;
 * Singular passes it to Google as the DMA consent signals. Marketing grants both
 * and is the default category. The helper adds no Singular dependency.
 *
 * Connect before `Singular.init` so the first session carries the limit, as
 * Singular recommends. Callbacks run synchronously on the publishing thread,
 * serialized per helper. Retain the helper and [close] it during teardown. On
 * withdrawal both calls run even if the first throws, and the failure is reported.
 *
 * @param core The same installed native core used by the consent UI.
 * @param category Optional category that lets Singular track. Defaults to marketing.
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
	limitDataSharing: (Boolean) -> Unit,
	stopAllTracking: () -> Unit,
	resumeAllTracking: () -> Unit,
	trackingOptIn: () -> Unit,
	onError: (Exception) -> Unit,
) : AutoCloseable {
	private val binding = ConsentBinding(core, category, onError, trackingAndAds(category)) { previous, (tracking, ads), current ->
		val limit = !(ads.adUserData && ads.adPersonalization)
		if (tracking) {
			limitDataSharing(limit)
			if (previous?.first != true && current().first) {
				resumeAllTracking()
				trackingOptIn()
			}
		} else {
			runAll(stopAllTracking, { limitDataSharing(limit) })
		}
	}

	/** Reapply current consent, opting in again if allowed. No-op after close. */
	fun sync() = binding.sync()

	/** Stop observing and stop all tracking. Safe to call more than once. */
	override fun close() = binding.close()
}
