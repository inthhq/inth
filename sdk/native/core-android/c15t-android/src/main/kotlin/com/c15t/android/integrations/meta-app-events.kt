package com.c15t.android.integrations

import com.c15t.core.ConsentCore
import com.c15t.core.model.ConsentCategory

/**
 * Keep the Meta (Facebook) SDK's automatic App Events, advertiser ID collection
 * and Limited Data Use in sync with one native category.
 *
 * While [category] is denied or pending, the helper turns off automatic App
 * Events and advertiser ID collection and turns on Limited Data Use. When it is
 * granted, it turns Limited Data Use off and both settings on. Pass
 * `FacebookSdk.setAutoLogAppEventsEnabled` and
 * `FacebookSdk.setAdvertiserIDCollectionEnabled`. For [setLimitedDataUse], call
 * `FacebookSdk.setDataProcessingOptions(arrayOf("LDU"), 0, 0)` when it is `true`,
 * so Meta applies it by location, and `setDataProcessingOptions(arrayOf())` when
 * it is `false`. Marketing is the default, as for the web's Meta Pixel. The helper
 * adds no Meta dependency.
 *
 * Set `com.facebook.sdk.AutoLogAppEventsEnabled` and
 * `com.facebook.sdk.AdvertiserIDCollectionEnabled` to `false` in the manifest so
 * nothing runs before the helper connects. Events the app logs itself need their
 * own consent check. Callbacks run synchronously on the publishing thread,
 * serialized per helper. Retain the helper and [close] it during teardown.
 *
 * @param core The same installed native core used by the consent UI.
 * @param category Optional category controlling Meta. Defaults to marketing.
 * @param setAutoLogAppEventsEnabled Turn automatic App Events on or off.
 * @param setAdvertiserIDCollectionEnabled Turn advertiser ID collection on or off.
 * @param setLimitedDataUse Turn Limited Data Use on or off.
 * @param onError Report automatic vendor-update failures without throwing. Explicit
 * construction, sync and close failures still throw to their caller.
 * @throws IllegalArgumentException If category is necessary.
 */
class MetaAppEventsIntegration(
	core: ConsentCore,
	category: ConsentCategory = ConsentCategory.MARKETING,
	setAutoLogAppEventsEnabled: (Boolean) -> Unit,
	setAdvertiserIDCollectionEnabled: (Boolean) -> Unit,
	setLimitedDataUse: (Boolean) -> Unit,
	onError: (Exception) -> Unit,
) : AutoCloseable {
	private val binding = AnalyticsConsentBinding(core, category, onError) { allowed, stillAllowed ->
		if (allowed && stillAllowed()) {
			setLimitedDataUse(false)
			setAdvertiserIDCollectionEnabled(true)
			setAutoLogAppEventsEnabled(true)
		} else {
			setAutoLogAppEventsEnabled(false)
			setAdvertiserIDCollectionEnabled(false)
			setLimitedDataUse(true)
		}
	}

	/** Reapply current consent after the app changes these settings. No-op after close. */
	fun sync() = binding.sync()

	/** Stop observing and turn collection off. Safe to call more than once. */
	override fun close() = binding.close()
}
