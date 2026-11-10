package com.c15t.android

import com.c15t.core.gpp.GppMspaMode
import com.c15t.core.gpp.GppOptions
import com.c15t.core.model.ConsentCategory
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** The `com.c15t.GPP*` meta-data, from manifest values to the core's `gpp` setting. */
class DeclaredGppTest {
	private val base = mapOf<String, Any>(C15tAndroid.META_BACKEND_URL to "https://consent.example.com")

	private fun config(values: Map<String, Any>) =
		C15tAndroid.configFrom(read = { values[it] }, readAsset = { null })

	@Test
	fun `GPP stays off without the flag, even with other GPP keys`() {
		assertNull(config(base)?.gpp)
		assertNull(config(base + (C15tAndroid.META_GPP_MSPA_MODE to "opt-out-option"))?.gpp)
		assertNull(config(base + (C15tAndroid.META_GPP to false))?.gpp)
	}

	@Test
	fun `the flag alone turns GPP on with the web defaults`() {
		assertEquals(GppOptions(), config(base + (C15tAndroid.META_GPP to true))?.gpp)
		assertEquals(GppOptions(), config(base + (C15tAndroid.META_GPP to "true"))?.gpp)
	}

	@Test
	fun `every declared option reaches the core`() {
		val declared = config(
			base + mapOf(
				C15tAndroid.META_GPP to true,
				C15tAndroid.META_GPP_MSPA_MODE to "service-provider",
				C15tAndroid.META_GPP_OPT_OUT_CATEGORIES to "marketing, measurement",
				C15tAndroid.META_GPP_TCF to false,
			),
		)?.gpp
		assertEquals(
			GppOptions(GppMspaMode.SERVICE_PROVIDER, listOf(ConsentCategory.MARKETING, ConsentCategory.MEASUREMENT), tcf = false),
			declared,
		)
	}

	@Test
	fun `an unknown MSPA mode reports no coverage rather than guessing one`() {
		val declared = config(base + mapOf(C15tAndroid.META_GPP to true, C15tAndroid.META_GPP_MSPA_MODE to "signatory"))?.gpp
		assertEquals(GppOptions(), declared)
	}
}
