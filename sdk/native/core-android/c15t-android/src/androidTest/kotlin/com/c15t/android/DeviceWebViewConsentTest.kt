package com.c15t.android

import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.c15t.core.C15t
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * What only a real WebView can show: the document-start script reaches a listed origin's
 * main frame before the page's own script, and an unlisted origin gets nothing.
 *
 * The JVM tests in `:c15t-core` cover the payload; `@c15t/core` and `@c15t/browser` run
 * the same script in a browser against web c15t.
 */
@RunWith(AndroidJUnit4::class)
class DeviceWebViewConsentTest {
	private val instrumentation = InstrumentationRegistry.getInstrumentation()

	/** What the page's first inline script saw, as JSON, before any other page code ran. */
	private val page = """
		<!doctype html><html><head><script>
		var api = window.__c15tNativeConsent;
		window.seenAtStart = api ? JSON.stringify(api.getState()) : 'none';
		</script></head><body></body></html>
	""".trimIndent()

	private fun load(baseUrl: String, origins: List<String>): String {
		awaitLaunchSettled()
		val core = C15t.current
		assertNotNull("the launch core", core)
		val loaded = CountDownLatch(1)
		val seen = CountDownLatch(1)
		var result = ""
		lateinit var webView: WebView
		var sync: ConsentWebView? = null
		instrumentation.runOnMainSync {
			webView = WebView(appContext())
			webView.settings.javaScriptEnabled = true
			webView.webViewClient = object : WebViewClient() {
				override fun onPageFinished(view: WebView, url: String?) = loaded.countDown()
			}
			sync = ConsentWebView.attach(webView, core!!, origins)
			webView.loadDataWithBaseURL(baseUrl, page, "text/html", "utf-8", null)
		}
		assertEquals(true, loaded.await(30, TimeUnit.SECONDS))
		instrumentation.runOnMainSync {
			webView.evaluateJavascript("window.seenAtStart") { value ->
				result = value
				seen.countDown()
			}
		}
		assertEquals(true, seen.await(10, TimeUnit.SECONDS))
		instrumentation.runOnMainSync {
			sync?.close()
			webView.destroy()
		}
		return result
	}

	@Test
	fun testListedOriginReadsStateBeforePageScripts() {
		assumeTrue("WebView without document-start scripts", ConsentWebView.isSupported())
		val seen = load("https://app.example/", listOf("https://app.example"))
		// evaluateJavascript returns the string JSON-encoded.
		assertEquals(true, seen.contains("\\\"version\\\":1"))
		assertEquals(true, seen.contains("\\\"permissions\\\""))
		assertEquals(false, seen.contains("sub_"))
	}

	@Test
	fun testUnlistedOriginGetsNothing() {
		assumeTrue("WebView without document-start scripts", ConsentWebView.isSupported())
		assertEquals("\"none\"", load("https://elsewhere.example/", listOf("https://app.example")))
	}
}
