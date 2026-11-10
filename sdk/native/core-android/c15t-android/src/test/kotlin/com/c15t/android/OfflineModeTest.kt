package com.c15t.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class OfflineModeTest {
	private fun config(values: Map<String, Any>, assets: Map<String, String> = emptyMap()) =
		C15tAndroid.configFrom(read = { values[it] }, readAsset = { assets[it] })

	private fun required(values: Map<String, Any>, assets: Map<String, String> = emptyMap()) =
		config(values, assets).also(::assertNotNull)!!

	@Test
	fun `offline mode starts a core without a backend URL`() {
		val config = required(mapOf(C15tAndroid.META_MODE to "offline", C15tAndroid.META_CATEGORIES to "necessary,measurement"))
		assertNull(config.backendUrl)
		assertNull(config.bundledPolicy)
		assertEquals(2, config.consentCategories?.size)
	}

	@Test
	fun `offline mode ignores a backend URL and bundled manifest left in the manifest`() {
		val config = required(
				mapOf(
					C15tAndroid.META_MODE to "OFFLINE",
					C15tAndroid.META_BACKEND_URL to "https://consent.example.test",
					C15tAndroid.META_BACKEND_INIT_URL to "https://consent.example.test/init",
					C15tAndroid.META_BUNDLED_POLICY to "c15t-policy.json",
				),
				assets = mapOf("c15t-policy.json" to "{}"),
		)
		assertNull(config.backendUrl)
		assertNull(config.initUrl)
		assertNull(config.bundledPolicy)
	}

	@Test
	fun `offline mode reads the in-code policy asset`() {
		val rules = """{"rules":[{"id":"default","match":{"fallback":true,"isDefault":true},"model":"opt-in","prompt":"choice"}]}"""
		val config = required(
			mapOf(C15tAndroid.META_MODE to "offline", C15tAndroid.META_POLICY_RULES to "c15t-policy-rules.json"),
			assets = mapOf("c15t-policy-rules.json" to rules),
		)
		assertEquals("default", config.policy?.rules?.single()?.id)
		val broken = required(
			mapOf(C15tAndroid.META_MODE to "offline", C15tAndroid.META_POLICY_RULES to "c15t-policy-rules.json"),
			assets = mapOf("c15t-policy-rules.json" to """{"rules":[]}"""),
		)
		assertNull(broken.policy)
		val backend = required(
			mapOf(C15tAndroid.META_BACKEND_URL to "https://consent.example.test", C15tAndroid.META_POLICY_RULES to "c15t-policy-rules.json"),
			assets = mapOf("c15t-policy-rules.json" to rules),
		)
		assertNull(backend.policy)
	}

	@Test
	fun `backend mode still needs a backend URL`() {
		assertNull(config(emptyMap()))
		assertNull(config(mapOf(C15tAndroid.META_CATEGORIES to "necessary")))
		val config = required(
				mapOf(C15tAndroid.META_BACKEND_URL to "https://consent.example.test", C15tAndroid.META_BUNDLED_POLICY to "c15t-policy.json"),
				assets = mapOf("c15t-policy.json" to "bundled"),
		)
		assertEquals("https://consent.example.test", config.backendUrl)
		assertEquals("bundled", config.bundledPolicy)
	}
}
