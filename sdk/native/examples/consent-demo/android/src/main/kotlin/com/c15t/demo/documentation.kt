// #region docs:android-install title="install-consent.kt"
package com.c15t.demo

import android.content.Context
import com.c15t.android.C15tAndroid
import com.c15t.core.C15t
import com.c15t.core.NativeConfig
import com.c15t.core.model.ConsentCategory

fun installConsent(context: Context) {
    C15tAndroid.install(context, NativeConfig(
        portalUrl = "https://example-inth.inth.app/",
        consentCategories = listOf(ConsentCategory.NECESSARY, ConsentCategory.MEASUREMENT, ConsentCategory.MARKETING),
    ))
}

fun measurementMayStart(): Boolean = C15t.isAllowed(ConsentCategory.MEASUREMENT)
// #endregion docs:android-install
