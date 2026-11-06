package com.c15t.consentui

import com.c15t.consentui.generated.IabCopy
import com.c15t.core.iab.IabBannerSummary

/**
 * The IAB text of the first layer, the same sentences the web prompt shows. It comes from the
 * generated translations only: host theme copy sits above it and never replaces it.
 *
 * @property description What partners store, access and process, with the partner count.
 * @property partnersLink Where the partner count sits in [description]. Tapping it opens the partner list.
 * @property summary Purpose, stack and special-feature names, then "And N more" when the list was cut.
 */
internal data class IabFirstLayerText(
    val description: String,
    val partnersLink: IntRange,
    val summary: List<String>,
    val legitimateInterest: String,
    val scope: String,
    val withdraw: String,
) {
    /** The tappable words, such as "5 partners". */
    val partnersLabel: String get() = description.substring(partnersLink)

    companion object {
        fun resolve(copy: IabCopy, banner: IabBannerSummary): IabFirstLayerText {
            val count = banner.vendorCount.toString()
            val description = copy.format(copy.appDescription, mapOf("partnerCount" to count))
            // "5 partners" when the language's link text appears in its own sentence; the
            // number alone when it does not (a plural form, or a different word order).
            val label = copy.format(copy.bannerPartnersLink, mapOf("count" to count))
            val start = description.indexOf(label)
            val link = if (start >= 0) start until start + label.length else {
                val at = description.indexOf(count).coerceAtLeast(0)
                at until at + count.length
            }
            val more = if (banner.remainingCount > 0) listOf(copy.format(copy.bannerAndMore, mapOf("count" to banner.remainingCount.toString()))) else emptyList()
            return IabFirstLayerText(
                description = description,
                partnersLink = link,
                summary = banner.displayItems + more,
                legitimateInterest = copy.bannerLegitimateInterestNotice,
                scope = copy.appScopeServiceSpecific,
                withdraw = copy.appWithdraw,
            )
        }
    }
}

/**
 * A vendor's longest device-storage duration from the list's `cookieMaxAgeSeconds`, in whole days
 * rounded up, so an hour reads as 1 day and never as 0. Zero or less is session-only storage.
 */
internal fun storageDuration(seconds: Long, copy: IabCopy): String {
    if (seconds <= 0) return copy.appSessionOnly
    return dayCount(seconds / 86_400 + if (seconds % 86_400 > 0) 1 else 0, copy)
}

/** A whole number of days in the shared IAB copy. */
internal fun dayCount(days: Long, copy: IabCopy): String =
    if (days == 1L) copy.appDayCountOne else copy.format(copy.appDayCount, mapOf("count" to "$days"))
