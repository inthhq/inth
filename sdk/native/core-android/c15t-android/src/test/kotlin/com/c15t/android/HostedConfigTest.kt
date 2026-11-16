package com.c15t.android

import android.content.ContextWrapper
import android.content.pm.ApplicationInfo
import com.c15t.android.C15tAndroid.DeclaredConfig
import com.c15t.core.C15t
import com.c15t.core.InthProjectUrlException
import com.c15t.core.NativeConfig
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

/** The one mode: an Inth project URL, plus `dryRun` in a debuggable app. */
class HostedConfigTest {
	private val url = "https://acme.inth.app"
	private val rules = """{"rules":[{"id":"default","match":{"fallback":true,"isDefault":true},"model":"opt-in","prompt":"choice"}]}"""

	private fun config(values: Map<String, Any>, assets: Map<String, String> = emptyMap()) =
		C15tAndroid.configFrom(read = { values[it] }, readAsset = { assets[it] })

	private fun required(values: Map<String, Any>, assets: Map<String, String> = emptyMap()) =
		config(values, assets).also(::assertNotNull)!!

	private fun checked(values: Map<String, Any>, debuggable: Boolean, assets: Map<String, String> = emptyMap()) =
		C15tAndroid.checkedDeclaration(read = { values[it] }, readAsset = { assets[it] }, debuggable = debuggable)

	private fun refusal(values: Map<String, Any>, debuggable: Boolean = false): String =
		(checked(values, debuggable) as DeclaredConfig.Refused).reason

	/** An app whose only answer is whether it is debuggable. */
	private fun app(debuggable: Boolean) = object : ContextWrapper(null) {
		override fun getApplicationInfo() = ApplicationInfo().apply {
			flags = if (debuggable) ApplicationInfo.FLAG_DEBUGGABLE else 0
		}
	}

	@Test
	fun `nothing starts without a backend URL`() {
		assertNull(config(emptyMap()))
		assertNull(config(mapOf(C15tAndroid.META_CATEGORIES to "necessary")))
		assertEquals(DeclaredConfig.None, checked(mapOf(C15tAndroid.META_DRY_RUN to true), debuggable = true))
	}

	@Test
	fun `the manifest declares the project URL and a bundled manifest`() {
		val config = required(
			mapOf(C15tAndroid.META_BACKEND_URL to url, C15tAndroid.META_BUNDLED_POLICY to "c15t-policy.json"),
			assets = mapOf("c15t-policy.json" to "bundled"),
		)
		assertEquals(url, config.backendUrl)
		assertEquals("bundled", config.bundledPolicy)
		assertEquals(false, config.dryRun)
	}

	@Test
	fun `the in-code policy asset is read alongside a backend URL`() {
		val asset = "c15t-policy-rules.json"
		val declared = mapOf(C15tAndroid.META_BACKEND_URL to url, C15tAndroid.META_POLICY_RULES to asset)
		val config = required(declared, assets = mapOf(asset to rules))
		assertEquals("default", config.policy?.rules?.single()?.id)
		assertEquals(url, config.backendUrl)

		val broken = required(declared, assets = mapOf(asset to """{"rules":[]}"""))
		assertNull(broken.policy)
		assertNotNull(broken.policyError)
		val partial = required(
			declared,
			assets = mapOf(asset to """{"rules":[{"id":"x","match":{"fallback":true},"model":"opt-in","prompt":"choice","categories":["measurement"]}]}"""),
		)
		assertNull(partial.policy)
		assertTrue(partial.policyError!!.contains("scopeMode"))
		assertNotNull(required(declared).policyError)
	}

	@Test
	fun `an in-code policy and a bundled manifest together are refused`() {
		val reason = refusal(
			mapOf(
				C15tAndroid.META_BACKEND_URL to url,
				C15tAndroid.META_POLICY_RULES to "rules.json",
				C15tAndroid.META_BUNDLED_POLICY to "c15t-policy.json",
			),
		)
		assertTrue(reason, reason.contains(C15tAndroid.META_POLICY_RULES) && reason.contains(C15tAndroid.META_BUNDLED_POLICY))
	}

	@Test
	fun `the retired mode key names dryRun as its replacement`() {
		val reason = refusal(mapOf("com.c15t.MODE" to "offline", C15tAndroid.META_BACKEND_URL to url))
		assertTrue(reason, reason.contains("com.c15t.MODE is no longer read"))
		assertTrue(reason, reason.contains(C15tAndroid.META_DRY_RUN))
		assertTrue(reason, reason.contains(C15tAndroid.META_BACKEND_URL))
		// The old no-backend declaration is refused too, not read as "nothing declared".
		assertTrue(refusal(mapOf("com.c15t.MODE" to "offline")).contains(C15tAndroid.META_DRY_RUN))
		assertNull(config(mapOf("com.c15t.MODE" to "offline", C15tAndroid.META_BACKEND_URL to url)))
	}

	@Test
	fun `the retired init URL key says policy comes from the backend URL`() {
		val reason = refusal(
			mapOf(C15tAndroid.META_BACKEND_URL to url, "com.c15t.BACKEND_INIT_URL" to "https://acme.inth.app/init"),
		)
		assertTrue(reason, reason.contains("com.c15t.BACKEND_INIT_URL is no longer read and has no replacement"))
		assertTrue(reason, reason.contains("Policy is fetched from ${C15tAndroid.META_BACKEND_URL}"))
	}

	@Test
	fun `a manifest URL outside Inth is refused and names the rule`() {
		val reason = refusal(mapOf(C15tAndroid.META_BACKEND_URL to "https://consent.example.com"))
		assertTrue(reason, reason.contains("backendUrl must be the project URL from your Inth dashboard"))
		assertTrue(reason, reason.contains("\"https://consent.example.com\""))
	}

	@Test
	fun `the manifest URL reaches the core in its normal form`() {
		val declared = checked(mapOf(C15tAndroid.META_BACKEND_URL to " HTTPS://Acme.Inth.App/ "), debuggable = false)
		assertEquals(url, (declared as DeclaredConfig.Valid).config.backendUrl)
	}

	@Test
	fun `install rules normalize the project URL and refuse other hosts`() {
		assertEquals(url, C15tAndroid.checkedConfig(NativeConfig("acme.inth.app/"), debuggable = false, enforceProjectUrl = true).backendUrl)
		for (debuggable in listOf(false, true)) {
			val error = assertThrows(InthProjectUrlException::class.java) {
				C15tAndroid.checkedConfig(NativeConfig("http://localhost:8787"), debuggable, enforceProjectUrl = true)
			}
			assertEquals("scheme", error.reason)
		}
		// The internal door keeps the URL as given.
		assertEquals(
			"http://127.0.0.1:8787",
			C15tAndroid.checkedConfig(NativeConfig("http://127.0.0.1:8787"), debuggable = false, enforceProjectUrl = false).backendUrl,
		)
	}

	@Test
	fun `dryRun in a debuggable app relaxes the host rule`() {
		val local = NativeConfig("http://localhost:8787/api/", dryRun = true)
		val checked = C15tAndroid.checkedConfig(local, debuggable = true, enforceProjectUrl = true)
		assertEquals("http://localhost:8787/api", checked.backendUrl)
		assertTrue(checked.dryRun)
		val declared = checked(
			mapOf(C15tAndroid.META_BACKEND_URL to "https://staging.consent.example.com", C15tAndroid.META_DRY_RUN to "true"),
			debuggable = true,
		)
		assertTrue((declared as DeclaredConfig.Valid).config.dryRun)
	}

	@Test
	fun `dryRun is refused on both doors when the app is not debuggable`() {
		val expected = "dryRun is for development and CI and cannot run in a release build. " +
			"Remove dryRun (NativeConfig.dryRun or the com.c15t.DRY_RUN meta-data) from release builds."
		for (enforce in listOf(true, false)) {
			val error = assertThrows(IllegalStateException::class.java) {
				C15tAndroid.checkedConfig(NativeConfig(url, dryRun = true), debuggable = false, enforceProjectUrl = enforce)
			}
			assertEquals(expected, error.message)
		}
		val reason = refusal(mapOf(C15tAndroid.META_BACKEND_URL to url, C15tAndroid.META_DRY_RUN to true))
		assertTrue(reason, reason.startsWith(expected))
	}

	@Test
	fun `install refuses dryRun in a release app and installs no core`() {
		C15t.uninstall()
		assertEquals(false, C15tAndroid.isDebuggable(app(debuggable = false)))
		assertEquals(true, C15tAndroid.isDebuggable(app(debuggable = true)))

		val error = assertThrows(IllegalStateException::class.java) {
			C15tAndroid.install(app(debuggable = false), NativeConfig(url, dryRun = true))
		}
		assertTrue(error.message!!.startsWith("dryRun is for development and CI and cannot run in a release build."))
		assertNull(C15t.current)

		assertThrows(IllegalStateException::class.java) {
			C15tAndroid.install(app(debuggable = false), NativeConfig(url, dryRun = true), com.c15t.core.transport.C15tTransport.NONE)
		}
		assertThrows(InthProjectUrlException::class.java) {
			C15tAndroid.install(app(debuggable = false), NativeConfig("https://consent.example.com"))
		}
		assertNull(C15t.current)
	}
}
