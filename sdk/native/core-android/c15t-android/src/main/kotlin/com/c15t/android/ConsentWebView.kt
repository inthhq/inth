package com.c15t.android

import android.os.Handler
import android.os.Looper
import android.webkit.WebView
import androidx.annotation.MainThread
import androidx.webkit.ScriptHandler
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import com.c15t.core.ConsentCore
import com.c15t.core.webview.WebViewConsentScript
import com.c15t.core.webview.WebViewConsentSync
import java.lang.ref.WeakReference
import java.util.WeakHashMap

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
 * Attach before the first `loadUrl`. The helper lives as long as the WebView, so a
 * page never keeps a state the app has since changed. Call [close] to stop sooner.
 * Attaching again to the same WebView closes the earlier helper and keeps its
 * secrets, so a page that is already loaded keeps receiving changes.
 *
 * The ordering and replacement rules live in [WebViewConsentSync], which runs
 * on a plain JVM; this class only connects it to `androidx.webkit`.
 */
class ConsentWebView private constructor(
	webView: WebView,
	private val onPreferencesRequested: (() -> Unit)?,
) : AutoCloseable {
	// Weak: the registry below keys on the WebView, and a strong reference here
	// would keep it alive through its own map entry.
	private val webViewRef = WeakReference(webView)
	private val main = Handler(Looper.getMainLooper())
	private var handler: ScriptHandler? = null
	private var listening = false
	private var closed = false
	private var origins: Set<String> = emptySet()
	private lateinit var sync: WebViewConsentSync

	private val target = object : WebViewConsentSync.Target {
		override fun install(script: String) {
			val webView = webViewRef.get() ?: return
			if (!WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) return
			handler?.remove()
			handler = WebViewCompat.addDocumentStartJavaScript(webView, script, origins)
		}

		override fun evaluate(script: String) {
			webViewRef.get()?.evaluateJavascript(script, null)
		}

		override fun uninstall() {
			if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
				handler?.remove()
			}
			handler = null
		}
	}

	private fun start(webView: WebView, core: ConsentCore, allowedOrigins: Collection<String>, replacing: ConsentWebView?) {
		// Set before the sync starts: its first publish installs a script.
		origins = WebViewConsentScript.normalizeAll(allowedOrigins).toSet()
		replacing?.closeListener()
		sync = WebViewConsentSync.start(core, allowedOrigins, target, replacing?.sync) { block -> main.post(block) }
		replacing?.closed = true
		if (onPreferencesRequested != null && WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
			WebViewCompat.addWebMessageListener(
				webView,
				WebViewConsentScript.CHANNEL,
				origins,
			) { _, message, sourceOrigin, isMainFrame, _ ->
				if (!closed && isMainFrame && sync.script.isAllowed(sourceOrigin.toString()) &&
					sync.script.isPreferencesRequest(message.data)
				) {
					onPreferencesRequested.invoke()
				}
			}
			listening = true
		}
	}

	private fun closeListener() {
		val webView = webViewRef.get()
		if (webView != null && listening && WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
			WebViewCompat.removeWebMessageListener(webView, WebViewConsentScript.CHANNEL)
		}
		listening = false
	}

	/** Stop syncing. Pages loaded afterwards get no state. Safe to call more than once. */
	@MainThread
	override fun close() {
		if (closed) return
		closed = true
		val webView = webViewRef.get()
		if (webView != null && attached[webView] === this) attached.remove(webView)
		sync.close()
		closeListener()
	}

	companion object {
		/** One helper per WebView, alive as long as the WebView. Main thread only. */
		private val attached = WeakHashMap<WebView, ConsentWebView>()

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
			WebViewConsentScript.normalizeAll(allowedOrigins)
			if (!isSupported()) return null
			val previous = attached[webView]
			val helper = ConsentWebView(webView, onPreferencesRequested)
			helper.start(webView, core, allowedOrigins, previous)
			attached[webView] = helper
			return helper
		}
	}
}
