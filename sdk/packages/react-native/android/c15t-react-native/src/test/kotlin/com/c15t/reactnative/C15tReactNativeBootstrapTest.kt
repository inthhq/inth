package com.c15t.reactnative

import com.c15t.core.NativeConfig
import com.c15t.core.iab.IabConfiguration
import com.c15t.core.model.KernelOverrides
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class C15tReactNativeBootstrapTest {
	private val iab = IabConfiguration(cmpId = 1234, cmpVersion = 7, publisherCountryCode = "DE")

	@Test
	fun `the IAB consent language follows the resolved language`(): Unit = with(C15tReactNativeBootstrap) {
		// The backend serves disclosures in this language, so the TC String declares it too.
		val device = NativeConfig("https://cmp.example.test", iab = iab).withDeviceLanguage("de")
		assertEquals("de", device.overrides.language)
		assertEquals("DE", device.iab?.consentLanguage)
		// An app-declared language wins over the device's.
		val declared = NativeConfig("https://cmp.example.test", overrides = KernelOverrides(language = "pt-BR"), iab = iab).withDeviceLanguage("de")
		assertEquals("PT", declared.iab?.consentLanguage)
		// TCF carries two letters only, so a longer code keeps the default.
		assertEquals("EN", NativeConfig("https://cmp.example.test", iab = iab).withDeviceLanguage("fil").iab?.consentLanguage)
		assertNull(NativeConfig("https://cmp.example.test").withDeviceLanguage("de").iab)
	}
}
