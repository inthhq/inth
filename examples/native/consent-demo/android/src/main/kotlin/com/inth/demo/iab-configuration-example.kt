// #region docs:android-iab-config title="iab-configuration.kt"
package com.c15t.demo

import com.c15t.core.NativeConfig
import com.c15t.core.iab.IabConfiguration

fun iabConfig(
    projectUrl: String,
    cmpId: Int,
    cmpVersion: Int,
    publisherCountryCode: String,
): NativeConfig = NativeConfig(
    backendUrl = projectUrl,
    iab = IabConfiguration(
        cmpId = cmpId,
        cmpVersion = cmpVersion,
        publisherCountryCode = publisherCountryCode,
    ),
)
// #endregion docs:android-iab-config
