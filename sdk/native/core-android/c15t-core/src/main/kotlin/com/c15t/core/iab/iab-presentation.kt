package com.c15t.core.iab

import com.c15t.core.tc.GlobalVendorList
import com.c15t.core.tc.GvlVendorEntry
import com.c15t.core.tc.TcVendorList

/** A read-only disclosure captured with the native draft's revision. */
data class IabPresentation(
    val draft: IabDraft,
    /** The served list, already narrowed to the publisher's vendor scope. */
    val list: GlobalVendorList,
    /** Active (non-deleted) vendors in [list], keyed by id. */
    val vendors: Map<Int, IabVendorDisclosure>,
    val adTechProviders: List<AdTechProvider>?,
    /** Retained disclosure stays readable when authority no longer permits grants. */
    val canEdit: Boolean,
    /**
     * The longest a saved decision, and the TC String published from it, stays in use on this
     * device, in whole days rounded up. It comes from the policy's choice validity. After it
     * passes, the core stops publishing the string and asks again. Null only when no limit applies.
     */
    val consentStorageMaxDays: Int? = null,
    /**
     * The language of the list's names and descriptions, as a two-letter upper-case code. The
     * served list is English today, so this is "EN". Use it to pick the UI copy around the list.
     */
    val language: String = TcVendorList.DEFAULT_LANGUAGE,
    /** Partners the publisher declares outside the Global Vendor List, in the order served. */
    val customVendors: List<IabCustomVendor> = emptyList(),
) {
    /**
     * The first layer's vendor count and purpose, stack and special-feature names. It counts custom
     * vendors but names only what registered vendors declare, as `resolveIABBannerSummary` does.
     */
    val bannerSummary: IabBannerSummary by lazy {
        IabBannerSummary.resolve(list, adTechProviders?.size ?: 0, customVendors.size)
    }

    /**
     * Purposes some active or custom vendor declares for consent or legitimate interest, plus
     * purposes 1, 3 and 4 when ad tech providers are listed. Ascending. The preference centre lists
     * every one, as the web's `processPurposes` does.
     */
    val declaredPurposeIds: List<Int> by lazy {
        val custom = customVendors.flatMap { it.purposes + it.legIntPurposes }.filter { it in list.purposes.keys }
        (list.declaredPurposeIds(adTechProviders?.size ?: 0) + custom).toSortedSet().toList()
    }

    /** Special features some active or custom vendor declares. Ascending. */
    val declaredSpecialFeatureIds: List<Int> by lazy { list.declaredSpecialFeatureIds(customVendors) }

    internal companion object {
        /** Whole days, rounded up, for a validity in milliseconds. Null for no positive limit. */
        fun days(ms: Long?): Int? {
            if (ms == null || ms <= 0) return null
            val days = ms / 86_400_000L + if (ms % 86_400_000L > 0) 1 else 0
            return days.coerceAtMost(Int.MAX_VALUE.toLong()).toInt()
        }
    }
}

/**
 * The first layer's summary of what partners do. Same algorithm as the web's
 * `resolveIABBannerSummary` (`packages/core/src/libs/iab-banner-summary.ts`); the shared fixtures
 * `native/protocol/iab-banner-summary-*.json` hold both to it.
 *
 * @property vendorCount Active registered vendors, custom vendors and Google ad tech providers.
 * @property displayItems Purpose 1, then stacks that cover two or more declared purposes, then
 * declared purposes no chosen stack covers, then special features some vendor uses. Capped.
 * @property remainingCount How many items the cap left out, for an "and N more" line.
 */
data class IabBannerSummary(
    val vendorCount: Int,
    val displayItems: List<String>,
    val remainingCount: Int,
) {
    companion object {
        /** `IAB_BANNER_MAX_DISPLAY_ITEMS` on the web. */
        const val MAX_DISPLAY_ITEMS = 5

        /**
         * Summarize [list] for the first layer.
         *
         * @param list The narrowed list. Deleted vendors are left out here.
         * @param adTechProviderCount Google ad tech providers listed with the disclosure.
         * @param customVendorCount Non-IAB vendors the banner also discloses.
         * @param maxItems How many names to list before counting the rest.
         * @return The vendor count, the names to list, and how many were left out.
         */
        fun resolve(
            list: GlobalVendorList,
            adTechProviderCount: Int = 0,
            customVendorCount: Int = 0,
            maxItems: Int = MAX_DISPLAY_ITEMS,
        ): IabBannerSummary {
            val purposeIds = list.declaredPurposeIds(adTechProviderCount)
            val others = purposeIds.filter { it != 1 }
            val otherSet = others.toSet()
            // Highest coverage first; sortedByDescending is stable, so equal scores keep the
            // list's stack order, as the web's stable sort does.
            val ranked = list.stacks.orEmpty().toSortedMap().values.mapNotNull { stack ->
                val covered = stack.purposes.orEmpty().map { it.toInt() }.filter { it in otherSet }
                if (covered.size >= 2) (stack.name ?: "") to covered else null
            }.sortedByDescending { it.second.size }
            val stacks = mutableListOf<String>()
            val assigned = mutableSetOf<Int>()
            for ((name, covered) in ranked) {
                val unassigned = covered.filter { it !in assigned }
                if (unassigned.size >= 2) {
                    stacks += name
                    assigned += unassigned
                }
            }
            val items = mutableListOf<String>()
            if (1 in purposeIds) list.purposes[1]?.name?.let { items += it }
            items += stacks
            items += others.filter { it !in assigned }.mapNotNull { list.purposes[it]?.name }
            items += list.declaredSpecialFeatureIds().mapNotNull { list.specialFeatures?.get(it)?.name }
            val cap = maxItems.coerceAtLeast(0)
            return IabBannerSummary(
                vendorCount = list.activeVendors().size + customVendorCount + adTechProviderCount,
                displayItems = items.take(cap),
                remainingCount = (items.size - cap).coerceAtLeast(0),
            )
        }
    }
}

/** `AD_TECH_PROVIDER_PURPOSES` in `@c15t/schema`: Accept All grants these for providers. */
internal val adTechProviderPurposeIds = setOf(1, 3, 4)

internal fun GlobalVendorList.activeVendors(): List<GvlVendorEntry> =
    vendors.values.filter { it.deletedDate.isNullOrEmpty() }

/**
 * Purposes some active vendor declares for consent or legitimate interest, plus the ad tech
 * provider purposes when any provider is listed. Only purposes the list defines.
 */
internal fun GlobalVendorList.declaredPurposeIds(adTechProviderCount: Int): List<Int> {
    val active = activeVendors()
    return purposes.keys.sorted().filter { id ->
        adTechProviderCount > 0 && id in adTechProviderPurposeIds ||
            active.any { id.toLong() in it.purposes.orEmpty() || id.toLong() in it.legIntPurposes.orEmpty() }
    }
}

/** Special features some active vendor, or one of [customVendors], declares. Only features the list defines. */
internal fun GlobalVendorList.declaredSpecialFeatureIds(customVendors: List<IabCustomVendor> = emptyList()): List<Int> {
    val active = activeVendors()
    return specialFeatures.orEmpty().keys.sorted().filter { id ->
        active.any { id.toLong() in it.specialFeatures.orEmpty() } || customVendors.any { id in it.specialFeatures }
    }
}

/** Summary of the draft's permitted consent and legitimate-interest selections. */
enum class IabVendorSelectionStatus { OFF, PARTIAL, ON }

/** Declared bases after publisher restrictions, shared with the native gate. */
data class IabVendorDisclosure(
    val consentPurposes: List<Int>,
    val legitimateInterestPurposes: List<Int>,
    val notAllowedPurposes: List<Int>,
) {
    /** Describe selections using projected bases. This does not grant authority. */
    fun selectionStatus(vendorId: Int, choices: IabChoices): IabVendorSelectionStatus {
        val consent = consentPurposes.map { vendorId in choices.vendorConsents && it in choices.purposeConsents }
        val interest = legitimateInterestPurposes.map {
            vendorId in choices.vendorLegitimateInterests && it in choices.purposeLegitimateInterests &&
                vendorId !in choices.vendorObjections && it !in choices.purposeObjections
        }
        val enabled = consent + interest
        return when {
            enabled.none { it } -> IabVendorSelectionStatus.OFF
            enabled.all { it } -> IabVendorSelectionStatus.ON
            else -> IabVendorSelectionStatus.PARTIAL
        }
    }
}

/** Project a disclosed vendor without evaluating the subject's choices. */
fun IabConfiguration.disclosure(id: Int, vendor: GvlVendorEntry): IabVendorDisclosure {
    val purposes = (vendor.purposes.orEmpty() + vendor.legIntPurposes.orEmpty() + vendor.flexiblePurposes.orEmpty()).map { it.toInt() }.toSet()
    return IabVendorDisclosure(
        purposes.filter { discloses(id, vendor, it, IabLegalBasis.CONSENT) }.sorted(),
        purposes.filter { discloses(id, vendor, it, IabLegalBasis.LEGITIMATE_INTEREST) }.sorted(),
        purposes.filter { p -> publisherRestrictions.any { it.purposeId == p && id in it.vendorIds && it.type == 0 } }.sorted(),
    )
}

/** Shared by disclosure rendering and disk-free gates, without allocating a projection. */
internal fun IabConfiguration.discloses(id: Int, vendor: GvlVendorEntry, purpose: Int, basis: IabLegalBasis): Boolean {
    val rule = publisherRestrictions.firstOrNull { it.purposeId == purpose && id in it.vendorIds }?.type
    return when (basis) {
        IabLegalBasis.CONSENT -> rule != 0 && rule != 2 && (purpose.toLong() in vendor.purposes.orEmpty() || rule == 1 && purpose.toLong() in vendor.flexiblePurposes.orEmpty())
        IabLegalBasis.LEGITIMATE_INTEREST -> purpose !in IabAuthority.neverLI && rule != 0 && rule != 1 && (purpose.toLong() in vendor.legIntPurposes.orEmpty() || rule == 2 && purpose.toLong() in vendor.flexiblePurposes.orEmpty())
    }
}
