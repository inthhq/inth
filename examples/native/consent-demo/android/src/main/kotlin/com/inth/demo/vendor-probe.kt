package com.inth.demo

import java.net.URI

/**
 * Real vendor SDKs bound to the Inth integration helpers, for the consent
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
 * @property posthogLive A real PostHog project for PostHog alone. Cannot be
 * combined with [captureBase], as PostHog starts once per process.
 */
data class VendorSdkRequest(val captureBase: String?, val firebase: Boolean, val posthogLive: PostHogLive? = null) {
	init {
		captureBase?.let {
			val host = URI(it).host
			require(host == "localhost" || host == "127.0.0.1") { "Vendor capture must be loopback, not $host" }
		}
		require(captureBase == null || posthogLive == null) { "PostHog goes to the capture server or to a live project, not both" }
	}

	val requested: Boolean get() = captureBase != null || firebase || posthogLive != null

	companion object {
		const val CAPTURE_EXTRA = "C15T_VENDOR_CAPTURE"
		const val FIREBASE_EXTRA = "C15T_VENDOR_FIREBASE"
		const val POSTHOG_LIVE_HOST_EXTRA = "C15T_VENDOR_POSTHOG_LIVE_HOST"
		const val POSTHOG_LIVE_KEY_EXTRA = "C15T_VENDOR_POSTHOG_LIVE_KEY"
		const val POSTHOG_LIVE_RUN_ID_EXTRA = "C15T_VENDOR_POSTHOG_LIVE_RUN_ID"
	}
}

/**
 * A real PostHog project for the manual live check in `RealVendorSdkTest`.
 * Every event the SDK sends carries [runId], so one run can be found in the
 * project afterwards.
 *
 * @property host Ingestion host, such as `https://eu.i.posthog.com`.
 * @property key Project API token (`phc_…`). Never log it.
 * @property runId Unique per run.
 */
data class PostHogLive(val host: String, val key: String, val runId: String) {
	init {
		require(URI(host).scheme == "https") { "Live PostHog host must use https" }
		require(key.startsWith("phc_")) { "Live PostHog key must be a project token" }
		require(runId.isNotBlank()) { "Live PostHog run needs a run id" }
	}

	override fun toString() = "PostHogLive(host=$host, runId=$runId)"

	companion object {
		/** The live project an intent asked for, or null when it names none. */
		fun from(host: String?, key: String?, runId: String?): PostHogLive? =
			if (host == null || key == null || runId == null) null else PostHogLive(host, key, runId)
	}
}
