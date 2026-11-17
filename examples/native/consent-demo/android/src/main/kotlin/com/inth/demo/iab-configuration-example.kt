// #region docs:android-iab-config title="iab-configuration.kt"
package com.inth.demo

import com.inth.core.NativeConfig
import com.inth.core.iab.IabConfiguration

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
