package com.c15t.android

import android.os.Handler
import android.os.Looper
import android.webkit.WebView
import androidx.annotation.MainThread
import androidx.webkit.ScriptHandler
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import com.c15t.core.ConsentCore
import com.c15t.core.Subscription
import com.c15t.core.model.ConsentSnapshot
import com.c15t.core.webview.WebViewConsentScript
import com.c15t.core.webview.WebViewConsentState

/**
 * Keeps the pages a [WebView] loads in step with native consent, so a site that
 * runs web c15t with `consentSource: webViewConsentSource()` shows no second
 * banner and follows the app's choice.
 *
 * Only pages whose origin is in the list receive anything, and only in the main
 * frame. The state carries permissions, the model, the IAB TC string and a GPP
 * slot; it never carries the subject id. Consent flows one way, from the app to
 * the page. The page can only ask the app to open its preferences, through
 * `onPreferencesRequested`.
 *
 * ```kotlin
 * val sync = ConsentWebView.attach(webView, core, listOf("https://www.example.com")) {
 *     showPreferences()
 * }
 * webView.loadUrl("https://www.example.com/")
 * // When the screen goes away:
 * sync?.close()
 * ```
 *
 * Attach before the first `loadUrl`. Keep the returned handle for as long as the
 * WebView lives; it holds the consent observer.
 */
class ConsentWebView private constructor(
	private val webView: WebView,
	private val core: ConsentCore,
	private val script: WebViewConsentScript,
	private val onPreferencesRequested: (() -> Unit)?,
) : AutoCloseable {
	private val main = Handler(Looper.getMainLooper())
	private var handler: ScriptHandler? = null
	private var listening = false
	private var subscription: Subscription? = null
	private var published: WebViewConsentState? = null
	private var closed = false

	// Held here: the core keeps observers weakly.
	private val observer: (ConsentSnapshot) -> Unit = { main.post { publish() } }

	private fun start() {
		publish()
		subscription = core.onChange(observer)
		if (onPreferencesRequested != null && WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
			WebViewCompat.addWebMessageListener(
				webView,
				WebViewConsentScript.CHANNEL,
				script.origins.toSet(),
			) { _, message, sourceOrigin, isMainFrame, _ ->
				if (!closed && isMainFrame && script.isAllowed(sourceOrigin.toString()) &&
					WebViewConsentScript.isOpenPreferencesMessage(message.data)
				) {
					onPreferencesRequested.invoke()
				}
			}
			listening = true
		}
	}

	/** Re-register the document-start script and push the state into the loaded page. */
	@MainThread
	private fun publish() {
		if (closed || !WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) return
		val state = WebViewConsentState.from(core)
		if (state == published) return
		published = state
		handler?.remove()
		handler = WebViewCompat.addDocumentStartJavaScript(webView, script.documentStart(state), script.origins.toSet())
		// The update script checks the page origin itself, so a page that
		// navigated off the list gets nothing.
		webView.evaluateJavascript(script.update(state), null)
	}

	/** Stop syncing. Pages loaded afterwards get no state. Safe to call more than once. */
	@MainThread
	override fun close() {
		if (closed) return
		closed = true
		subscription?.close()
		subscription = null
		if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
			handler?.remove()
		}
		handler = null
		if (listening && WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
			WebViewCompat.removeWebMessageListener(webView, WebViewConsentScript.CHANNEL)
			listening = false
		}
	}

	companion object {
		/** Whether this device's WebView can run a script at document start, which the helper needs. */
		@JvmStatic
		fun isSupported(): Boolean = WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)

		/**
		 * Start syncing [core] into [webView] for [allowedOrigins].
		 *
		 * @param allowedOrigins `https://host[:port]` origins, or `http://` on
		 *   `localhost`, `127.0.0.1` or `[::1]`. No paths or wildcards.
		 * @param onPreferencesRequested Called on the main thread when a listed page
		 *   asks for preferences, such as from a "Cookie settings" link.
		 * @return The handle to [close], or `null` when the device's WebView cannot
		 *   run document-start scripts. Then nothing is injected and the page shows
		 *   its own banner.
		 * @throws IllegalArgumentException when an origin is not accepted or the list is empty.
		 */
		@JvmStatic
		@JvmOverloads
		@MainThread
		fun attach(
			webView: WebView,
			core: ConsentCore,
			allowedOrigins: Collection<String>,
			onPreferencesRequested: (() -> Unit)? = null,
		): ConsentWebView? {
			val script = WebViewConsentScript(allowedOrigins)
			if (!isSupported()) return null
			return ConsentWebView(webView, core, script, onPreferencesRequested).also { it.start() }
		}
	}
}
