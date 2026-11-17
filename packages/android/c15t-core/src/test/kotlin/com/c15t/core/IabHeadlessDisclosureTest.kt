package com.c15t.core

import com.c15t.core.iab.*
import com.c15t.core.store.*
import com.c15t.core.transport.*
import java.io.File
import kotlin.test.*
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.*

/**
 * What a React Native screen drawing its own TCF UI is given and what its commit writes, under
 * publisher restrictions and Google Additional Consent providers.
 *
 * `packages/native-protocol/iab/headless-disclosure-cases.json` is generated from the web code
 * (`packages/sdk/iab/src/__tests__/native-headless-disclosure.test.ts`). Swift's
 * `IABHeadlessDisclosureTests` asserts the same values.
 */
class IabHeadlessDisclosureTest {
	@Serializable
	data class VendorBases(
		val consentPurposes: List<Int>,
		val consentRequiredPurposes: List<Int>,
		val legitimateInterestPurposes: List<Int>,
		val legitimateInterestRequiredPurposes: List<Int>,
		val notAllowedPurposes: List<Int>,
	)

	@Serializable
	data class Counts(val consentPartnerCount: Int, val legitimateInterestPartnerCount: Int)

	@Serializable
	data class Summary(val vendorCount: Int, val displayItems: List<String>, val remainingCount: Int)

	@Serializable
	data class Disclosure(
		val adTechProviderPurposeIds: List<Int>,
		val adTechProviders: List<AdTechProvider>,
		val bannerSummary: Summary,
		val declaredPurposeIds: List<Int>,
		val declaredSpecialFeatureIds: List<Int>,
		val language: String,
		val purposes: Map<String, Counts>,
		val vendors: Map<String, VendorBases>,
	)

	@Serializable
	data class Case(val id: String, val choices: IabChoices, val tcString: String, val addtlConsent: String?)

	@Serializable
	data class Conflict(val id: String, val choices: IabChoices, val conflicts: List<String>)

	@Serializable
	data class Vector(
		val vendorList: String,
		val now: Long,
		val configuration: IabConfiguration,
		val disclosure: Disclosure,
		val acceptAll: IabChoices,
		val cases: List<Case>,
		val conflicts: List<Conflict>,
		val customVendors: JsonArray,
	)

	@Serializable
	data class VendorList(val gvl: JsonObject, val adTechProviders: JsonArray)

	private val json = Json { ignoreUnknownKeys = true }
	private val directory =
		generateSequence(File(System.getProperty("user.dir"))) { it.parentFile }
			.map { File(it, "packages/native-protocol/iab") }
			.first { File(it, "headless-disclosure-cases.json").exists() }
	private val vector = json.decodeFromString<Vector>(File(directory, "headless-disclosure-cases.json").readText())
	private val list = json.decodeFromString<VendorList>(File(directory, vector.vendorList).readText())

	private fun boot(): ConsentCore {
		val base = Json.parseToJsonElement(initBody(model = "\"iab\"", gvl = list.gvl.toString())).jsonObject
		val http =
			RecordingTransport()
				.respondInit(initSuccess(body = JsonObject(base + mapOf(
					"adTechProviders" to list.adTechProviders,
					"customVendors" to vector.customVendors,
				)).toString()))
				.respondSave(SaveOutcome.Unavailable("offline"))
		return testKernel(
			config = NativeConfig("https://cmp.example.test", iab = vector.configuration),
			store = C15tStore(InMemoryKeyValueStore()),
			clock = FixedClock(vector.now),
			transport = http,
		).also { it.bootstrap() }
	}

	@Test
	fun `the presentation carries the disclosure a custom screen must show`() {
		val core = boot()
		val presentation = assertNotNull(core.iabPresentation())
		val expected = vector.disclosure

		assertTrue(presentation.canEdit)
		assertEquals(expected.vendors.keys, presentation.vendors.keys.map { it.toString() }.toSet())
		for ((id, disclosure) in presentation.vendors) {
			assertEquals(
				expected.vendors[id.toString()],
				VendorBases(
					disclosure.consentPurposes,
					disclosure.consentRequiredPurposes,
					disclosure.legitimateInterestPurposes,
					disclosure.legitimateInterestRequiredPurposes,
					disclosure.notAllowedPurposes,
				),
				"vendor $id",
			)
		}
		assertEquals(expected.declaredPurposeIds, presentation.declaredPurposeIds)
		assertEquals(expected.declaredSpecialFeatureIds, presentation.declaredSpecialFeatureIds)
		for (id in presentation.declaredPurposeIds) {
			val counts = presentation.partnerCounts(id)
			assertEquals(expected.purposes[id.toString()], Counts(counts.consent, counts.legitimateInterest), "purpose $id")
		}
		assertEquals(expected.adTechProviders, presentation.adTechProviders)
		assertEquals(expected.adTechProviderPurposeIds, presentation.adTechProviderPurposeIds)
		val summary = presentation.bannerSummary
		assertEquals(expected.bannerSummary, Summary(summary.vendorCount, summary.displayItems, summary.remainingCount))
		assertEquals(expected.language, presentation.language)
		assertEquals(
			vector.customVendors.map { it.jsonObject.getValue("id").jsonPrimitive.content },
			presentation.customVendors.map { it.id },
		)
		assertEquals(vector.acceptAll, core.iabAcceptAllChoices())
	}

	@Test
	fun `the stock save writes the fixture strings`() {
		for (row in vector.cases) {
			val core = boot()
			val draft = assertNotNull(core.openIabDraft(), row.id)
			assertTrue(core.saveIab(IabDraft(draft.revision, row.choices), emptyMap()).ok, row.id)
			val saved = assertNotNull(core.iabConsent, row.id)
			assertEquals(row.choices.customVendorConsents, saved.choices.customVendorConsents, row.id)
			assertEquals(row.tcString, saved.tcString, row.id)
			assertEquals(row.addtlConsent, saved.addtlConsent, row.id)
			assertEquals(emptyList(), core.iabPresentation()?.restrictionConflicts(row.choices), row.id)
		}
	}

	@Test
	fun `restriction conflicts name the vendor signals a restriction rules out`() {
		val presentation = assertNotNull(boot().iabPresentation())
		for (row in vector.conflicts) {
			assertEquals(row.conflicts, presentation.restrictionConflicts(row.choices), row.id)
		}
	}
}
