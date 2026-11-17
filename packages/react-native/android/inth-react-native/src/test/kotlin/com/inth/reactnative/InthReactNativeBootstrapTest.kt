package com.inth.reactnative

import com.inth.core.NativeConfig
import com.inth.core.iab.IabConfiguration
import com.inth.core.model.KernelOverrides
import com.inth.core.transport.InthProtocol
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class InthReactNativeBootstrapTest {
	private val iab = IabConfiguration(cmpId = 1234, cmpVersion = 7, publisherCountryCode = "DE")

	@Test
	fun `the IAB consent language follows the resolved language`(): Unit = with(InthReactNativeBootstrap) {
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

	@Test
	fun `a core this binding installs reports React Native as its platform`(): Unit = with(InthReactNativeBootstrap) {
		// ENG-530: the core defaults to `android` for Kotlin apps; the binding answers for an RN app.
		val config = NativeConfig("https://cmp.example.test", sdkVersion = "9.9.9")
		assertEquals("android->9.9.9", InthProtocol.protocolHeaders(config.sdkVersion, config.platform)[InthProtocol.PLATFORM_HEADER])
		val bound = config.withDeviceLanguage("de").forReactNative()
		val headers = InthProtocol.protocolHeaders(bound.sdkVersion, bound.platform)
		assertEquals("rn->9.9.9", headers[InthProtocol.PLATFORM_HEADER])
		assertEquals("9.9.9", headers[InthProtocol.VERSION_HEADER])
	}
}
