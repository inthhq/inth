package com.c15t.demo

import java.net.URI

/**
 * Real vendor SDKs bound to the c15t integration helpers, for the consent
 * journeys in `RealVendorSdkTest`. Debug builds wire them (`src/debug`); release
 * builds of the demo carry no vendor SDK and never return a probe.
 */
interface VendorProbe : AutoCloseable {
	/** Vendors wired in this launch, in probe order. */
	val vendors: List<String>

	/** Send one probe event through every SDK, then flush. Blocks, so call it off the main thread. */
	fun probe(label: String)
}

/**
 * What a debug launch asked for.
 *
 * @property captureBase Loopback capture server for PostHog, Mixpanel and Sentry,
 * such as `http://localhost:39874`. Null leaves those SDKs out.
 * @property firebase Whether to start Firebase Analytics with fake options.
 */
data class VendorSdkRequest(val captureBase: String?, val firebase: Boolean) {
	init {
		captureBase?.let {
			val host = URI(it).host
			require(host == "localhost" || host == "127.0.0.1") { "Vendor capture must be loopback, not $host" }
		}
	}

	val requested: Boolean get() = captureBase != null || firebase

	companion object {
		const val CAPTURE_EXTRA = "C15T_VENDOR_CAPTURE"
		const val FIREBASE_EXTRA = "C15T_VENDOR_FIREBASE"
	}
}
