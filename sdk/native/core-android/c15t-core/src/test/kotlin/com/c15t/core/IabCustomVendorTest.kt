package com.c15t.core

import com.c15t.core.iab.*
import com.c15t.core.model.*
import com.c15t.core.store.*
import com.c15t.core.tc.*
import com.c15t.core.transport.*
import java.io.File
import kotlin.test.*
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.*

/**
 * Custom (non-IAB) vendors: read from `/init`, listed with their own choices, kept beside the TC
 * String and never in it, and counted where the web counts them.
 */
class IabCustomVendorTest {
	@Serializable data class Vector(val now: Long, val configuration: IabConfiguration, val gvl: GlobalVendorList)

	/**
	 * The Additional Consent fixture's list: purposes 1, 2, 3, 4 and 7; vendor 1 asks consent for 1
	 * and 2, vendor 2 claims legitimate interest for 2 and 7; nobody declares special feature 1.
	 */
	private fun protocol(name: String) = generateSequence(File(System.getProperty("user.dir"))) { it.parentFile }
		.map { File(it, "native/protocol/iab/$name") }.first { it.exists() }
	private val v = Json { ignoreUnknownKeys = true }.decodeFromString<Vector>(protocol("additional-consent-cases.json").readText())
	private val config = NativeConfig("https://cmp.example.test", iab = v.configuration)

	private val served = Json.parseToJsonElement(
		"""
		[
		  {"id":"internal-ads","name":"Internal ads","privacyPolicyUrl":"https://example.com/ads-privacy",
		   "purposes":[3,4],"legIntPurposes":[7],"specialFeatures":[1],"usesCookies":true,"cookieMaxAgeSeconds":86400},
		  {"id":1000482,"name":"Fraud checks","privacyPolicyUrl":"https://example.com/fraud","purposes":[],"legIntPurposes":[2]},
		  {"id":"chat","name":"Live chat","privacyPolicyUrl":"https://example.com/chat","purposes":[10],"description":"Support chat"}
		]
		""".trimIndent()
	).jsonArray

	private fun response(customVendors: JsonElement?): TransportOutcome {
		val base = Json.parseToJsonElement(initBody(model = "\"iab\"", gvl = GlobalVendorListJson.toJson(v.gvl))).jsonObject
		return initSuccess(body = JsonObject(if (customVendors == null) base else base + ("customVendors" to customVendors)).toString())
	}

	private fun boot(
		store: C15tStore = C15tStore(InMemoryKeyValueStore()),
		http: RecordingTransport = RecordingTransport(),
		customVendors: JsonElement? = served,
	): ConsentCore {
		http.respondInit(response(customVendors)).respondSave(SaveOutcome.Unavailable("offline"))
		return testKernel(config = config, store = store, transport = http, clock = FixedClock(v.now)).also { it.bootstrap() }
	}

	@Test fun `reads the served list with the schema rules`() {
		val vendors = assertNotNull(IabCustomVendor.list(served))
		assertEquals(listOf("internal-ads", "1000482", "chat"), vendors.map { it.id })
		assertEquals(listOf(1), vendors[0].specialFeatures)
		assertEquals(86_400, vendors[0].cookieMaxAgeSeconds)
		assertEquals("Support chat", vendors[2].description)
		fun one(change: MutableMap<String, JsonElement>.() -> Unit): List<IabCustomVendor>? =
			IabCustomVendor.list(JsonArray(listOf(JsonObject(served[0].jsonObject.toMutableMap().apply(change)))))
		assertNotNull(one { })
		assertNull(one { remove("purposes") }, "purposes is required")
		assertNull(one { put("purposes", JsonArray(listOf(JsonPrimitive(12)))) }, "purposes are 1 to 11")
		assertNull(one { put("specialFeatures", JsonArray(listOf(JsonPrimitive(3)))) })
		assertNull(one { put("privacyPolicyUrl", JsonPrimitive("not a url")) })
		assertNull(one { put("id", JsonPrimitive(1.5)) })
		assertNull(one { put("cookieMaxAgeSeconds", JsonPrimitive(0)) })
		assertNull(one { put("purposes", JsonArray(listOf(JsonPrimitive("3")))) }, "ids are numbers")
		assertNull(IabCustomVendor.list(JsonArray(listOf(served[0], served[0]))), "duplicate ids")
		assertNull(IabCustomVendor.list(JsonPrimitive("invalid")))
		assertEquals(emptyList(), IabCustomVendor.list(JsonArray(emptyList())))
	}

	@Test fun `accept all covers them outside the TC String`() {
		val plain = boot(customVendors = null)
		assertTrue(plain.save(CommitIntent.All).ok)
		val plainConsent = assertNotNull(plain.iabConsent)
		assertEquals(listOf(1, 2), plainConsent.choices.purposeConsents)
		assertEquals(emptyList(), plainConsent.choices.customVendorConsents)

		val backend = InMemoryKeyValueStore()
		val store = C15tStore(backend)
		val core = boot(store)
		assertEquals(listOf("internal-ads", "1000482", "chat"), core.iabCustomVendors().map { it.id })
		val accepting = assertNotNull(core.iabAcceptAllChoices())
		assertEquals(listOf(1, 2, 3, 4), accepting.purposeConsents, "purpose 10 is not on the list")
		assertEquals(listOf(2, 7), accepting.purposeLegitimateInterests)
		assertEquals(listOf(1), accepting.specialFeatureOptIns)
		assertEquals(listOf("chat", "internal-ads"), accepting.customVendorConsents)
		assertEquals(listOf("1000482", "internal-ads"), accepting.customVendorLegitimateInterests)
		assertTrue(core.save(CommitIntent.All).ok)
		val consent = assertNotNull(core.iabConsent)
		assertEquals(accepting, consent.choices)
		assertTrue(core.isCustomVendorAllowed("internal-ads"))
		assertFalse(core.isCustomVendorAllowed("1000482"), "legitimate interest only")

		// The TC String carries IAB vendor ids only; custom grants change none of its vendor bits.
		val tc = TcStringDecoder.decode(consent.tcString)
		val plainTc = TcStringDecoder.decode(plainConsent.tcString)
		assertEquals(plainTc.core.vendorConsents.ids.sorted(), tc.core.vendorConsents.ids.sorted())
		assertEquals(plainTc.core.vendorLegitimateInterests.ids.sorted(), tc.core.vendorLegitimateInterests.ids.sorted())

		// The web sends no custom vendor map in a save, so native does not either.
		val body = assertNotNull(store.readPending().single().body)
		assertFalse("internal-ads" in body)
		assertFalse("customVendor" in body)

		// Restored on the next launch with no network.
		val cold = testKernel(config = config, store = C15tStore(backend), clock = FixedClock(v.now), executor = com.c15t.core.spi.TaskExecutor { })
		cold.bootstrap()
		assertEquals(listOf("internal-ads", "1000482", "chat"), cold.iabCustomVendors().map { it.id })
		assertEquals(listOf("chat", "internal-ads"), cold.iabConsent?.choices?.customVendorConsents)

		// Reject all withdraws them.
		assertTrue(cold.save(CommitIntent.Necessary).ok)
		assertEquals(emptyList(), cold.iabConsent?.choices?.customVendorConsents)
		assertEquals(emptyList(), cold.iabConsent?.choices?.customVendorLegitimateInterests)
	}

	@Test fun `a draft grants only what a vendor declares`() {
		val core = boot()
		val draft = assertNotNull(core.openIabDraft())
		fun save(consents: List<String>, interests: List<String> = emptyList()) = core.saveIab(
			draft.copy(choices = draft.choices.copy(customVendorConsents = consents, customVendorLegitimateInterests = interests)), emptyMap())
		assertEquals("invalid-iab-choices", save(listOf("1000482")).error?.code, "no consent purposes")
		assertEquals("invalid-iab-choices", save(listOf("unknown")).error?.code)
		assertEquals("invalid-iab-choices", save(listOf("chat", "chat")).error?.code)
		assertEquals("invalid-iab-choices", save(listOf("chat"), listOf("chat")).error?.code, "no legitimate interest claim")
		assertTrue(save(listOf("chat"), listOf("1000482")).ok)
		assertEquals(listOf("chat"), core.iabConsent?.choices?.customVendorConsents)
		assertEquals(listOf("1000482"), core.iabConsent?.choices?.customVendorLegitimateInterests)
	}

	@Test fun `a list change drops grants for vendors no longer listed and keeps the decision`() {
		val http = RecordingTransport()
		val core = boot(http = http)
		assertTrue(core.save(CommitIntent.All).ok)
		val before = assertNotNull(core.iabConsent)
		// Absent keeps the list held, as on the web.
		http.respondInit(response(null))
		core.refresh()
		assertEquals(3, core.iabCustomVendors().size)
		assertEquals(before, core.iabConsent)
		// A list without `chat` withdraws its grant; the TC String stands.
		http.respondInit(response(JsonArray(served.take(2))))
		core.refresh()
		val after = assertNotNull(core.iabConsent)
		assertEquals(before.tcString, after.tcString)
		assertEquals(listOf("internal-ads"), after.choices.customVendorConsents)
		// An unreadable list is none.
		http.respondInit(response(JsonPrimitive("invalid")))
		core.refresh()
		assertEquals(emptyList(), core.iabCustomVendors())
		assertEquals(emptyList(), core.iabConsent?.choices?.customVendorConsents)
		assertEquals(before.tcString, core.iabConsent?.tcString)
	}

	@Test fun `presentation and derivation count them`() {
		val core = boot()
		val presentation = assertNotNull(core.iabPresentation())
		assertEquals(3, presentation.customVendors.size)
		assertEquals(2 + 3, presentation.bannerSummary.vendorCount)
		assertEquals(listOf(1, 2, 3, 4, 7), presentation.declaredPurposeIds)
		assertEquals(listOf(1), presentation.declaredSpecialFeatureIds)
		assertNull(core.iabPurposeCategories())
		var draft = assertNotNull(core.openIabDraft())
		// Purposes 3 and 4 decide marketing only because `internal-ads` asks consent for them.
		assertTrue(core.saveIab(draft.copy(choices = draft.choices.copy(purposeConsents = listOf(1, 2))), emptyMap()).ok)
		assertEquals(false, core.iabPurposeCategories()?.get(ConsentCategory.MARKETING))
		draft = assertNotNull(core.openIabDraft())
		assertTrue(core.saveIab(draft.copy(choices = draft.choices.copy(purposeConsents = listOf(1, 2, 3, 4))), emptyMap()).ok)
		assertEquals(true, core.iabPurposeCategories()?.get(ConsentCategory.MARKETING))
	}

	@Serializable data class DerivationCase(
		val name: String,
		val purposeConsents: List<Int>,
		val vendors: Map<String, List<Int>>,
		val customVendors: Map<String, List<Int>>,
		val adTechProvidersListed: Boolean,
		val expected: Map<String, Boolean>,
	)
	@Serializable data class DerivationFixture(val cases: List<DerivationCase>)

	@Test fun `the shared derivation fixture`() {
		val fixture = Json { ignoreUnknownKeys = true }.decodeFromString<DerivationFixture>(protocol("purpose-categories.json").readText())
		assertTrue(fixture.cases.isNotEmpty())
		for (item in fixture.cases) {
			val basis = IabPurposeCategories.consentBasis(
				item.vendors.values,
				item.customVendors.map { (id, purposes) -> IabCustomVendor(id, id, "https://example.com", purposes) },
				item.adTechProvidersListed,
			)
			val categories = IabPurposeCategories.categories(item.purposeConsents.toSet(), basis)
			assertEquals(item.expected, categories.mapKeys { it.key.wireName }, item.name)
		}
	}

	@Test fun `choices stored before custom vendors still decode`() {
		val json = """{"purposeConsents":[1],"purposeLegitimateInterests":[],"purposeObjections":[],"vendorConsents":[],
			"vendorLegitimateInterests":[],"vendorObjections":[],"specialFeatureOptIns":[],"publisherConsents":[],
			"publisherLegitimateInterests":[],"publisherCustomConsents":[],"publisherCustomLegitimateInterests":[]}"""
		val choices = C15tJson.storage.decodeFromString(IabChoices.serializer(), json)
		assertEquals(emptyList(), choices.customVendorConsents)
		assertEquals(listOf(1), choices.purposeConsents)
	}
}
