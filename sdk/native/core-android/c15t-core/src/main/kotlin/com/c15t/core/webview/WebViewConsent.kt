package com.c15t.core.webview

import com.c15t.core.ConsentCore
import com.c15t.core.model.ConsentSnapshot
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.security.SecureRandom

/**
 * What a page inside a WebView reads as `window.__c15tNativeConsent.getState()`.
 *
 * Consent state only: no subject id, no policy token, no location. The shape is
 * "WebView consent" in `native/CONTRACT.md`, and `webViewConsentSource()` in
 * `@c15t/core` reads it.
 */
data class WebViewConsentState(
	/** `true` once stored consent hydrated and a policy resolved. */
	val ready: Boolean,
	val revision: Long,
	/** Wire name of the model, such as `opt-in` or `iab`. */
	val model: String,
	val functionality: Boolean,
	val experience: Boolean,
	val measurement: Boolean,
	val marketing: Boolean,
	/** The committed TC string, when the app runs IAB TCF natively. */
	val tcString: String?,
	/** Always `null` until the native cores produce GPP strings. */
	val gppString: String? = null,
) {
	/** The state as the JSON object the scripts take. Optional categories are denied until [ready]. */
	fun toJson(): String = buildJsonObject {
		put("version", 1)
		put("ready", ready)
		put("revision", revision)
		put("model", model)
		put("permissions", buildJsonObject {
			put("necessary", true)
			put("functionality", ready && functionality)
			put("experience", ready && experience)
			put("measurement", ready && measurement)
			put("marketing", ready && marketing)
		})
		put("tcString", tcString?.let(::JsonPrimitive) ?: JsonNull)
		put("gppString", gppString?.let(::JsonPrimitive) ?: JsonNull)
	}.toString()

	companion object {
		/** The state for [snapshot], with the TC string the core committed for it. */
		fun from(snapshot: ConsentSnapshot, tcString: String?, gppString: String? = null): WebViewConsentState {
			val ready = snapshot.ready && !snapshot.policyPending
			val granted = snapshot.effectivePermissions
			return WebViewConsentState(
				ready = ready,
				revision = snapshot.revision,
				model = snapshot.model.wireName,
				functionality = granted.functionality,
				experience = granted.experience,
				measurement = granted.measurement,
				marketing = granted.marketing,
				tcString = tcString,
				gppString = gppString,
			)
		}

		/** The current state of [core]. */
		fun from(core: ConsentCore): WebViewConsentState = from(core.snapshot(), core.iabConsent?.tcString)
	}
}

/**
 * Builds the scripts a WebView helper injects, for one list of origins and one token.
 *
 * Platform glue (the Android `ConsentWebView`, or a host's own) adds
 * [documentStart] as a document-start script and runs [update] in the main
 * frame when consent changes. Both scripts check the page origin themselves, so
 * a page outside [origins] gets nothing even when the glue cannot filter.
 *
 * The token is the only thing that lets [update] change the page's state. A new
 * one is drawn for every instance; keep one instance per WebView.
 *
 * @throws IllegalArgumentException when an origin is not a valid origin, or the list is empty.
 */
class WebViewConsentScript(allowedOrigins: Collection<String>, private val token: String = newToken()) {
	/** The normalized origins, in the order given, without duplicates. */
	val origins: List<String> = normalizeAll(allowedOrigins)

	private val originsJson = JsonArray(origins.map(::JsonPrimitive)).toString()
	private val tokenJson = JsonPrimitive(token).toString()

	/** The script to run at document start, carrying [state]. */
	fun documentStart(state: WebViewConsentState): String =
		"${WebViewConsentScripts.DOCUMENT_START}($originsJson,$tokenJson,${state.toJson()});"

	/** The script that pushes [state] into an already loaded page. */
	fun update(state: WebViewConsentState): String =
		"${WebViewConsentScripts.UPDATE}($originsJson,$tokenJson,${state.toJson()});"

	/** Whether [origin], as a WebView reports it, is one of [origins]. */
	fun isAllowed(origin: String?): Boolean = origin != null && normalize(origin.removeSuffix("/")) in origins

	companion object {
		/** The message-channel name pages post to. */
		const val CHANNEL: String = "c15tConsent"

		/** The only message the page sends: a request to open preferences. */
		const val OPEN_PREFERENCES_MESSAGE: String = """{"type":"c15t:open-preferences"}"""

		private val ORIGIN = Regex("""^(https?)://([a-z0-9-]+(?:\.[a-z0-9-]+)*|\[[0-9a-f:]+\])(?::([0-9]{1,5}))?/?$""", RegexOption.IGNORE_CASE)
		private val LOOPBACK = setOf("localhost", "127.0.0.1", "[::1]")
		private val random = SecureRandom()

		/**
		 * The canonical form of [input], or `null` when it is not an origin a helper accepts:
		 * `https`, or `http` on a loopback host, with no path, query, fragment, credentials or wildcard.
		 */
		fun normalize(input: String): String? {
			val match = ORIGIN.matchEntire(input) ?: return null
			val scheme = match.groupValues[1].lowercase()
			val host = match.groupValues[2].lowercase()
			val portText = match.groupValues[3]
			if (scheme == "http" && host !in LOOPBACK) return null
			var port = ""
			if (portText.isNotEmpty()) {
				val number = portText.toInt()
				if (number !in 1..65535) return null
				val default = (scheme == "https" && number == 443) || (scheme == "http" && number == 80)
				if (!default) port = ":$number"
			}
			return "$scheme://$host$port"
		}

		/** Every entry normalized; throws on the first one that is not accepted. */
		fun normalizeAll(inputs: Collection<String>): List<String> {
			require(inputs.isNotEmpty()) { "List at least one origin the WebView may receive consent on." }
			return inputs.map { input ->
				normalize(input) ?: throw IllegalArgumentException(
					"\"$input\" is not an allowed WebView origin. Use https://host[:port], or http:// on localhost."
				)
			}.distinct()
		}

		/** Whether [message] is the page's request to open preferences. */
		fun isOpenPreferencesMessage(message: String?): Boolean = message == OPEN_PREFERENCES_MESSAGE

		/** 128 random bits as hex. */
		fun newToken(): String {
			val bytes = ByteArray(16)
			random.nextBytes(bytes)
			return bytes.joinToString("") { "%02x".format(it) }
		}
	}
}
