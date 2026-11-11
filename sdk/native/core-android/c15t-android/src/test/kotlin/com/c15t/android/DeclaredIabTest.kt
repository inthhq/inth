package com.c15t.android

import com.c15t.core.iab.IabConfiguration
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The `com.c15t.IAB_*` meta-data, from manifest values to the core's `iab` setting.
 *
 * A raw-value map stands in for the `Bundle`, which is a stub on the JVM. The values use
 * the types the manifest parser produces: an unquoted number arrives as an `Int`, text as
 * a `String`.
 */
class DeclaredIabTest {
	private val base = mapOf<String, Any>(C15tAndroid.META_BACKEND_URL to "https://consent.example.com")

	private val complete = base + mapOf(
		C15tAndroid.META_IAB_CMP_ID to 1234,
		C15tAndroid.META_IAB_CMP_VERSION to 7,
		C15tAndroid.META_IAB_PUBLISHER_COUNTRY_CODE to "de",
	)

	private fun config(values: Map<String, Any>) =
		C15tAndroid.configFrom(read = { values[it] }, readAsset = { null })

	@Test
	fun `configFrom carries the declared IAB settings into the core config`() {
		val config = config(complete + (C15tAndroid.META_IAB_CONSENT_SCREEN to "3"))
		assertNotNull(config)
		assertEquals(
			IabConfiguration(cmpId = 1234, cmpVersion = 7, publisherCountryCode = "DE", consentScreen = 3),
			config?.iab,
		)
	}

	@Test
	fun `no IAB meta-data leaves IAB off and the rest of the config unchanged`() {
		val config = config(base)
		assertEquals("https://consent.example.com", config?.backendUrl)
		assertNull(config?.iab)
		assertEquals(C15tAndroid.DeclaredIab.None, C15tAndroid.declaredIab { base[it] })
	}

	@Test
	fun `the consent screen defaults to the core default and text numbers are read`() {
		val declared = C15tAndroid.declaredIab {
			mapOf(
				C15tAndroid.META_IAB_CMP_ID to "1234",
				C15tAndroid.META_IAB_CMP_VERSION to "0",
				C15tAndroid.META_IAB_PUBLISHER_COUNTRY_CODE to "GB",
			)[it]
		}
		assertEquals(
			C15tAndroid.DeclaredIab.Valid(IabConfiguration(cmpId = 1234, cmpVersion = 0, publisherCountryCode = "GB")),
			declared,
		)
	}

	@Test
	fun `an incomplete or out-of-range declaration is refused whole and the core still starts`() {
		val cases = listOf(
			complete - C15tAndroid.META_IAB_CMP_ID,
			complete - C15tAndroid.META_IAB_CMP_VERSION,
			complete - C15tAndroid.META_IAB_PUBLISHER_COUNTRY_CODE,
			base + (C15tAndroid.META_IAB_CONSENT_SCREEN to 1),
			complete + (C15tAndroid.META_IAB_CMP_ID to 0),
			complete + (C15tAndroid.META_IAB_CMP_ID to 1),
			complete + (C15tAndroid.META_IAB_CMP_ID to 4096),
			complete + (C15tAndroid.META_IAB_CMP_ID to "abc"),
			complete + (C15tAndroid.META_IAB_CMP_ID to true),
			complete + (C15tAndroid.META_IAB_CMP_ID to 12.5f),
			complete + (C15tAndroid.META_IAB_CMP_VERSION to -1),
			complete + (C15tAndroid.META_IAB_CMP_VERSION to 4096),
			complete + (C15tAndroid.META_IAB_PUBLISHER_COUNTRY_CODE to "DEU"),
			complete + (C15tAndroid.META_IAB_PUBLISHER_COUNTRY_CODE to "D1"),
			complete + (C15tAndroid.META_IAB_CONSENT_SCREEN to 64),
		)
		for (values in cases) {
			assertTrue("$values", C15tAndroid.declaredIab { values[it] } is C15tAndroid.DeclaredIab.Invalid)
			val config = config(values)
			assertEquals("$values", "https://consent.example.com", config?.backendUrl)
			assertNull("$values", config?.iab)
		}
	}
}
