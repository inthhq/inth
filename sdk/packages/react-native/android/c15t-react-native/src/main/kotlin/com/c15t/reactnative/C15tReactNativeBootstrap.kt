package com.c15t.reactnative

import android.content.Context
import android.content.pm.PackageManager
import com.c15t.android.C15tAndroid
import com.c15t.android.C15tManifestValue
import com.c15t.core.C15t
import com.c15t.core.NativeConfig
import com.c15t.core.model.KernelOverrides
import com.c15t.core.transport.C15tProtocol
import java.util.Locale

/**
 * Starts the consent core, once, ahead of the React host.
 *
 * Hydration is the reason this exists as its own step: the core's bootstrap reads the
 * stored envelope synchronously before it puts anything on a worker thread, so a
 * launch hook that runs here means the first JavaScript frame already resolves
 * `getBootstrap()` and `getSnapshot()` against real stored consent instead of an
 * empty deny-all.
 *
 * An app that installs the core itself sets `com.c15t.reactnative.AUTO_BOOTSTRAP` to
 * `false`, and this then stays out of the way: the reads answer deny-all until that
 * app calls [C15tAndroid.install], and the module keeps working against whatever core is
 * installed.
 */
object C15tReactNativeBootstrap {
	/** Manifest switch for apps that own their own bootstrap. */
	const val META_AUTO_BOOTSTRAP = "com.c15t.reactnative.AUTO_BOOTSTRAP"

	private val lock = Any()

	/**
	 * Install the core if it is not already running.
	 *
	 * @return `true` when a core is installed after the call.
	 */
	fun ensure(context: Context): Boolean {
		if (C15t.current != null) {
			return true
		}
		if (!autoBootstrapEnabled(context)) {
			return false
		}
		// `configFrom` applies the start-time rules: a retired key, a URL that is not an Inth
		// project URL, or dryRun in a release build is logged there and reads as nothing
		// declared. JavaScript then hears `C15tPayload.MESSAGE_NOT_BOOTSTRAPPED`.
		val config = C15tAndroid.configFrom(context)?.withDeviceLanguage()?.forReactNative() ?: return false
		synchronized(lock) {
			if (C15t.current != null) {
				return true
			}
			// Installs the encrypted store, the transport, and the foreground observer
			// that replays the offline queue, then starts the core.
			C15tAndroid.install(context, config)
		}
		return C15t.current != null
	}

	/** Whether the launch hook should bootstrap, honouring the host's opt-out. */
	fun autoBootstrapEnabled(context: Context): Boolean = readFlag(context) != false

	// The same reader the core uses for its own keys: the plugin writes `false`, a
	// hand-edited manifest may write `"false"` or `0`, and an unreadable value must
	// read as absent rather than as an opt-out nobody declared.
	private fun readFlag(context: Context): Boolean? = try {
		C15tManifestValue.boolean(
			C15tManifestValue.raw(
				context.packageManager
					.getApplicationInfo(context.packageName, PackageManager.GET_META_DATA)
					.metaData,
				META_AUTO_BOOTSTRAP,
			)
		)
	} catch (error: PackageManager.NameNotFoundException) {
		null
	}

	/**
	 * Pin the device language unless the app declared one.
	 *
	 * The protocol resolves translations to exactly one language, so the native side
	 * supplies the locale rather than leaving it for JavaScript to guess. The backend
	 * serves IAB disclosures in that language, so the TC String and the screens
	 * declare it too.
	 */
	internal fun NativeConfig.withDeviceLanguage(deviceLanguage: String = Locale.getDefault().language): NativeConfig {
		val language = overrides.language?.takeIf { it.isNotBlank() }
			?: deviceLanguage.takeIf { it.isNotBlank() } ?: C15tPayload.DEFAULT_LANGUAGE
		return copy(
			overrides = KernelOverrides(
				country = overrides.country,
				region = overrides.region,
				language = language,
				gpc = overrides.gpc,
			),
			iab = iab?.let { declared -> iabConsentLanguage(language)?.let { declared.copy(consentLanguage = it) } ?: declared },
		)
	}

	/**
	 * Report React Native as the host platform in `x-c15t-platform`.
	 *
	 * The core defaults to `android`, which is right for a Kotlin app. A core this binding
	 * installs answers for a React Native app, so the backend attributes it to `rn`. An app
	 * that turns `AUTO_BOOTSTRAP` off and installs its own core chooses its own platform.
	 */
	internal fun NativeConfig.forReactNative(): NativeConfig = copy(platform = C15tProtocol.PLATFORM_REACT_NATIVE)

	/** A language tag as a TCF consent language: two uppercase letters, or null when it has none. */
	internal fun iabConsentLanguage(tag: String): String? =
		tag.split('-', '_').first().takeIf { it.length == 2 && it.all { c -> c in 'a'..'z' || c in 'A'..'Z' } }?.uppercase()
}
