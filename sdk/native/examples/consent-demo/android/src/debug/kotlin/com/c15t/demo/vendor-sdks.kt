package com.c15t.demo

import android.content.Context
import android.os.Bundle
import android.util.Log
import com.c15t.android.integrations.FirebaseAnalyticsConsent
import com.c15t.android.integrations.FirebaseAnalyticsIntegration
import com.c15t.android.integrations.MixpanelIntegration
import com.c15t.android.integrations.PostHogIntegration
import com.c15t.android.integrations.SentryReplayIntegration
import com.c15t.core.C15tKernel
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions
import com.google.firebase.analytics.FirebaseAnalytics
import com.mixpanel.android.mpmetrics.MixpanelAPI
import com.mixpanel.android.mpmetrics.MixpanelOptions
import com.posthog.PostHog
import com.posthog.android.PostHogAndroid
import com.posthog.android.PostHogAndroidConfig
import io.sentry.Sentry
import io.sentry.android.core.SentryAndroid
import java.net.URI

/** Fake credentials. Nothing here reaches a real vendor project. */
private const val POSTHOG_KEY = "phc_c15t_consent_demo_fake_key"
private const val MIXPANEL_TOKEN = "c15t-consent-demo-fake-token"
private const val PROBE_EVENT = "c15t_probe"
/** The development machine as seen from an Android Emulator. */
private const val EMULATOR_HOST = "10.0.2.2"

/**
 * Vendor SDKs are process singletons, so each starts once per process with the
 * settings each helper's documentation asks for: capture opted out, replay
 * sampling at zero and Firebase collection off. Activities that relaunch in the
 * same process reuse them and bind fresh helpers to their own core.
 */
private object VendorSdks {
	private var captureBase: String? = null
	var mixpanel: MixpanelAPI? = null; private set
	var firebase: FirebaseAnalytics? = null; private set

	@Synchronized fun startNetworkVendors(context: Context, base: String) {
		if (captureBase != null) {
			check(captureBase == base) { "Vendor SDKs already point at $captureBase" }
			return
		}
		val appContext = context.applicationContext
		PostHogAndroid.setup(appContext, PostHogAndroidConfig(POSTHOG_KEY, "$base/vendor/posthog").apply {
			optOut = true
			captureApplicationLifecycleEvents = false
			captureDeepLinks = false
			captureScreenViews = false
			capturePushNotificationSubscriptions = false
			capturePushNotificationOpened = false
			sessionReplay = false
			preloadFeatureFlags = false
			remoteConfig = false
			debug = true
		})
		val uri = URI(base)
		// Mixpanel treats a loopback server as an ad blocker and never flushes, so it
		// reaches the same capture server through the emulator's alias for the host.
		val mixpanelBase = URI(uri.scheme, null, EMULATOR_HOST, uri.port, null, null, null).toString()
		mixpanel = MixpanelAPI.getInstance(appContext, MIXPANEL_TOKEN, false,
			MixpanelOptions.Builder().optOutTrackingDefault(true).serverURL("$mixpanelBase/vendor/mixpanel").featureFlagsEnabled(false).build())
		SentryAndroid.init(appContext) { options ->
			options.dsn = "http://public@${uri.host}:${uri.port}/vendor/sentry/1"
			options.sessionReplay.sessionSampleRate = 0.0
			options.sessionReplay.onErrorSampleRate = 0.0
			options.isDebug = true
		}
		captureBase = base
	}

	@Synchronized fun startFirebase(context: Context): FirebaseAnalytics {
		firebase?.let { return it }
		val appContext = context.applicationContext
		// Same fake project as res/values/fake-firebase.xml, which the Play services
		// measurement service reads.
		if (FirebaseApp.getApps(appContext).isEmpty()) {
			FirebaseApp.initializeApp(appContext, checkNotNull(FirebaseOptions.fromResource(appContext)))
		}
		return FirebaseAnalytics.getInstance(appContext).also { firebase = it }
	}
}

internal fun connectVendorSdks(context: Context, core: C15tKernel, request: VendorSdkRequest, onError: (Exception) -> Unit): VendorProbe? {
	if (!request.requested) return null
	val helpers = mutableListOf<AutoCloseable>()
	val vendors = mutableListOf<String>()
	try {
		request.captureBase?.let { base ->
			VendorSdks.startNetworkVendors(context, base)
			val mixpanel = checkNotNull(VendorSdks.mixpanel)
			helpers += PostHogIntegration(core = core, optIn = { PostHog.optIn() }, optOut = { PostHog.optOut() }, onError = onError)
			helpers += MixpanelIntegration(core = core, optInTracking = { mixpanel.optInTracking() }, optOutTracking = { mixpanel.optOutTracking() }, onError = onError)
			helpers += SentryReplayIntegration(core = core, start = { Sentry.replay().start() }, stop = { Sentry.replay().stop() }, onError = onError)
			vendors += listOf("posthog", "mixpanel", "sentry")
		}
		if (request.firebase) {
			val analytics = VendorSdks.startFirebase(context)
			helpers += FirebaseAnalyticsIntegration(
				core = core,
				setConsent = { consent -> analytics.setConsent(consent.toFirebase()) },
				setCollectionEnabled = analytics::setAnalyticsCollectionEnabled,
				onError = onError,
			)
			vendors += "firebase"
		}
	} catch (error: Exception) {
		helpers.forEach { runCatching { it.close() } }
		throw error
	}
	return object : VendorProbe {
		override val vendors: List<String> = vendors

		override fun probe(label: String) {
			Log.i("c15t-vendor-probe", "probe $label")
			if (request.captureBase != null) {
				PostHog.capture(PROBE_EVENT, properties = mapOf("step" to label))
				PostHog.flush()
				VendorSdks.mixpanel?.apply {
					track(PROBE_EVENT, org.json.JSONObject().put("step", label))
					flush()
				}
				// Replay has no event to send. Flushing delivers any segment recorded so far.
				Sentry.flush(5_000)
			}
			VendorSdks.firebase?.takeIf { request.firebase }?.logEvent(PROBE_EVENT, Bundle().apply { putString("step", label) })
		}

		override fun close() = helpers.asReversed().forEach { it.close() }
	}
}

private fun FirebaseAnalyticsConsent.toFirebase(): Map<FirebaseAnalytics.ConsentType, FirebaseAnalytics.ConsentStatus> {
	fun status(granted: Boolean) = if (granted) FirebaseAnalytics.ConsentStatus.GRANTED else FirebaseAnalytics.ConsentStatus.DENIED
	return mapOf(
		FirebaseAnalytics.ConsentType.ANALYTICS_STORAGE to status(analyticsStorage),
		FirebaseAnalytics.ConsentType.AD_STORAGE to status(adStorage),
		FirebaseAnalytics.ConsentType.AD_USER_DATA to status(adUserData),
		FirebaseAnalytics.ConsentType.AD_PERSONALIZATION to status(adPersonalization),
	)
}
