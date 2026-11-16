package com.c15t.consentui

import com.c15t.consentui.generated.IabCopy

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
