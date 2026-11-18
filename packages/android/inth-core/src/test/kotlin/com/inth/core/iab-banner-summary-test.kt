package com.inth.core

import com.inth.core.iab.*
import com.inth.core.store.*
import com.inth.core.tc.*
import java.io.File
import kotlin.test.*
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.*

/**
 * The first-layer summary against the web's `resolveIABBannerSummary`, through
 * `packages/native-protocol/iab/banner-summary-*.json`. Regenerate the fixtures with
 * `bun scripts/generate-iab-banner-summary-fixtures.ts`.
 */
class IabBannerSummaryTest {
	@Serializable data class Input(val gvl: GlobalVendorList, val vendorIds: List<Int>? = null,
		val adTechProviderCount: Int, val customVendorCount: Int)
	@Serializable data class Expected(val vendorCount: Int, val displayItems: List<String>, val remainingCount: Int,
		val declaredPurposeIds: List<Int>, val declaredSpecialFeatureIds: List<Int>)
	@Serializable data class Fixture(val id: String, val input: Input, val expected: Expected)

	private fun root(path: String) = generateSequence(File(System.getProperty("user.dir"))) { it.parentFile }
		.map { File(it, path) }.first { it.exists() }

	private fun fixtures(): List<Fixture> {
		val json = Json { ignoreUnknownKeys = true }
		return root("packages/native-protocol/iab").listFiles { file -> file.name.startsWith("banner-summary-") && file.name.endsWith(".json") }!!
			.sortedBy { it.name }.map { json.decodeFromString<Fixture>(it.readText()) }
	}

	// TCF-CHECK: P7
	// TCF-CHECK: P12
	@Test fun `summary matches the web on every shared fixture`() {
		val fixtures = fixtures()
		assertEquals(7, fixtures.size, "every banner-summary fixture is read")
		for (fixture in fixtures) {
			val list = fixture.input.gvl.narrowToVendorIds(fixture.input.vendorIds)
			val summary = IabBannerSummary.resolve(list, fixture.input.adTechProviderCount, fixture.input.customVendorCount)
			assertEquals(
				IabBannerSummary(fixture.expected.vendorCount, fixture.expected.displayItems, fixture.expected.remainingCount),
				summary, fixture.id)
			assertEquals(fixture.expected.declaredPurposeIds, list.declaredPurposeIds(fixture.input.adTechProviderCount), fixture.id)
			assertEquals(fixture.expected.declaredSpecialFeatureIds, list.declaredSpecialFeatureIds(), fixture.id)
		}
	}

	// TCF-CHECK: P7
	// TCF-CHECK: P12
	@Test fun `presentation carries the summary storage limit and language`() {
		val config = TEST_CONFIG.copy(iab = IabConfiguration(cmpId = 53, cmpVersion = 7, publisherCountryCode = "GB"))
		val body = root("examples/native/consent-demo/fixtures/iab-init.json").readText()
		val core = testKernel(config = config, store = InthStore(InMemoryKeyValueStore()),
			transport = RecordingTransport().respondInit(initSuccess(body = body)))
		core.bootstrap()
		val presentation = assertNotNull(core.iabPresentation())
		val providers = presentation.adTechProviders?.size ?: 0
		assertEquals(IabBannerSummary.resolve(presentation.list, providers), presentation.bannerSummary)
		assertEquals(presentation.vendors.size + providers, presentation.bannerSummary.vendorCount)
		assertEquals(presentation.list.declaredPurposeIds(providers), presentation.declaredPurposeIds)
		assertEquals(presentation.list.declaredSpecialFeatureIds(), presentation.declaredSpecialFeatureIds)
		// The demo IAB policy keeps a choice for 31_536_000_000 ms.
		assertEquals(365, presentation.consentStorageMaxDays)
		assertEquals("EN", presentation.language)
	}

	@Test fun `storage days round up and only a missing limit is null`() {
		assertEquals(365, IabPresentation.days(31_536_000_000))
		assertEquals(1, IabPresentation.days(3_600_000))
		assertEquals(2, IabPresentation.days(86_400_001))
		assertNull(IabPresentation.days(null))
		assertNull(IabPresentation.days(0))
	}
}
