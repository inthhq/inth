package com.inth.android

import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.inth.core.Inth
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith

/**
 * What only a real WebView can show: the document-start script reaches a listed origin's
 * main frame before the page's own script, and an unlisted origin gets nothing.
 *
 * The JVM tests in `:inth-core` cover the payload; `@inth/sdk-core` and `@inth/sdk-browser` run
 * the same script in a browser against web Inth.
 */
@RunWith(AndroidJUnit4::class)
class DeviceWebViewConsentTest {
	private val instrumentation = InstrumentationRegistry.getInstrumentation()

	/** What the page's first inline script saw, as JSON, before any other page code ran. */
	private val page = """
		<!doctype html><html><head><script>
		var api = window.__inthNativeConsent;
		window.seenAtStart = api ? JSON.stringify(api.getState()) : 'none';
		</script></head><body></body></html>
	""".trimIndent()

	@Before
	fun installAnOfflineCore() {
		awaitLaunchSettled()
		uninstallCore()
		InthAndroid.install(appContext(), deviceConfig(), transport = DeviceBackend())
	}

	@After
	fun leaveNoCoreInstalled() {
		uninstallCore()
	}

	private fun load(baseUrl: String, origins: List<String>): String {
		val core = Inth.current
		assertNotNull("the installed core", core)
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

	/**
	 * The iOS shared-controller leak cannot happen here: Android injects per WebView.
	 * Helper A allows a.example on one WebView and helper B only b.example on
	 * another, both alive at once. a.example loaded in B's WebView gets nothing, and
	 * in A's WebView it gets A's state.
	 */
	@Test
	fun testHelpersOnTwoWebViewsKeepTheirOwnScopes() {
		assumeTrue("WebView without document-start scripts", ConsentWebView.isSupported())
		val core = Inth.current
		assertNotNull("the installed core", core)
		lateinit var first: WebView
		lateinit var second: WebView
		val helpers = mutableListOf<ConsentWebView?>()
		instrumentation.runOnMainSync {
			first = WebView(appContext()).apply { settings.javaScriptEnabled = true }
			second = WebView(appContext()).apply { settings.javaScriptEnabled = true }
			helpers += ConsentWebView.attach(first, core!!, listOf("https://a.example"))
			helpers += ConsentWebView.attach(second, core, listOf("https://b.example"))
		}

		fun seenIn(webView: WebView, baseUrl: String): String {
			val loaded = CountDownLatch(1)
			val seen = CountDownLatch(1)
			var result = ""
			instrumentation.runOnMainSync {
				webView.webViewClient = object : WebViewClient() {
					override fun onPageFinished(view: WebView, url: String?) = loaded.countDown()
				}
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
			return result
		}

		assertEquals("\"none\"", seenIn(second, "https://a.example/"))
		assertEquals(true, seenIn(first, "https://a.example/").contains("\\\"version\\\":1"))
		instrumentation.runOnMainSync {
			helpers.forEach { it?.close() }
			first.destroy()
			second.destroy()
		}
	}
}
