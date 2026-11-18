package com.inth.consentui

import androidx.compose.ui.graphics.vector.ImageVector
import com.inth.consentui.generated.IabCopy
import com.inth.core.tc.GlobalVendorList

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

/**
 * An icon for each line of the first-layer summary, on the system page. The summary holds
 * standard names from the vendor list, so the list tells which purpose, stack or special feature
 * a line is. Icons only label the rows; the standard names stay the text.
 */
internal class SummaryIcons(list: GlobalVendorList?) {
    private val byName: Map<String, ImageVector> = buildMap {
        list?.stacks?.values?.forEach { stack -> stack.name?.let { put(it, STACK) } }
        list?.specialFeatures?.forEach { (id, feature) -> feature.name?.let { put(it, SPECIAL_FEATURES[id] ?: STACK) } }
        // Purposes last: a purpose and a stack never share a name, and the purpose is the exact match.
        list?.purposes?.forEach { (id, purpose) -> purpose.name?.let { put(it, PURPOSES[id] ?: STACK) } }
    }

    /** The icon for [line], or the stack icon for a name the list does not have. */
    fun icon(line: String): ImageVector = byName[line] ?: STACK

    companion object {
        val STACK: ImageVector = ConsentIcons.Layers
        /** The "and N more" line. */
        val MORE: ImageVector = ConsentIcons.MoreHoriz
        val PARTNERS: ImageVector = ConsentIcons.Business
        val PURPOSES: Map<Int, ImageVector> = mapOf(
            1 to ConsentIcons.Storage, 2 to ConsentIcons.Campaign, 3 to ConsentIcons.Group, 4 to ConsentIcons.AccountBox,
            5 to ConsentIcons.ContactPage, 6 to ConsentIcons.Article, 7 to ConsentIcons.BarChart,
            8 to ConsentIcons.ShowChart, 9 to ConsentIcons.PieChart, 10 to ConsentIcons.Build, 11 to ConsentIcons.Description,
        )
        val SPECIAL_FEATURES: Map<Int, ImageVector> = mapOf(1 to ConsentIcons.LocationOn, 2 to ConsentIcons.Sensors)
        private val SPECIAL_PURPOSES: Map<Int, ImageVector> = mapOf(1 to ConsentIcons.Security, 2 to ConsentIcons.Send, 3 to ConsentIcons.Verified)
        private val FEATURES: Map<Int, ImageVector> = mapOf(1 to ConsentIcons.Merge, 2 to ConsentIcons.Devices, 3 to ConsentIcons.SettingsInputAntenna)
        private val CATEGORIES: Map<String, ImageVector> = mapOf(
            "necessary" to ConsentIcons.VerifiedUser, "experience" to ConsentIcons.AutoAwesome, "functionality" to ConsentIcons.Settings,
            "marketing" to ConsentIcons.Campaign, "measurement" to ConsentIcons.BarChart,
        )
        val AD_TECH_PROVIDERS: ImageVector = ConsentIcons.AdsClick
        val CUSTOM_PARTNERS: ImageVector = ConsentIcons.Groups

        /** Icons for the rows of Privacy Settings, by the vendor list's own ids. */
        fun purpose(id: Int): ImageVector = PURPOSES[id] ?: STACK
        fun specialFeature(id: Int): ImageVector = SPECIAL_FEATURES[id] ?: STACK
        fun specialPurpose(id: Int): ImageVector = SPECIAL_PURPOSES[id] ?: STACK
        fun feature(id: Int): ImageVector = FEATURES[id] ?: STACK
        /** [id] is the category's wire name. */
        fun category(id: String): ImageVector = CATEGORIES[id] ?: ConsentIcons.Tune
    }
}
