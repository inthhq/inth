package com.c15t.demo

import android.content.Context
import com.c15t.core.ConsentCore

/** Release builds of the demo carry no vendor SDKs. See src/debug for the real wiring. */
@Suppress("UNUSED_PARAMETER")
internal fun connectVendorSdks(context: Context, core: ConsentCore, request: VendorSdkRequest, onError: (Exception) -> Unit): VendorProbe? = null
