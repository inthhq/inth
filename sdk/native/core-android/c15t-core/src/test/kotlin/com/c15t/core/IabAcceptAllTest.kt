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
 * Accept All grants only what the served list declares, as `applyBlanket` in
 * `packages/iab/src/index.ts` does (TCF Policies 5(3), 5(6) and 5(8)).
 *
 * `native/protocol/iab/accept-all-declared-signals.json` holds a real served GVL (v183, vendors
 * 10, 21, 52, 91 and 755) and, per case, what the web's `acceptAll()` encodes for it.
 */
class IabAcceptAllTest {
	@Serializable
	data class Case(
		val id: String,
		val publisherRestrictions: List<IabPublisherRestriction>,
		val acceptAll: IabChoices,
	)

	@Serializable
	data class Vector(val gvl: JsonObject, val adTechProviders: JsonArray, val cases: List<Case>)

	private val vector =
		Json { ignoreUnknownKeys = true }.decodeFromString<Vector>(
			generateSequence(File(System.getProperty("user.dir"))) { it.parentFile }
				.map { File(it, "native/protocol/iab/accept-all-declared-signals.json") }
				.first { it.exists() }
				.readText(),
		)

	private fun boot(restrictions: List<IabPublisherRestriction>): ConsentCore {
		val base = Json.parseToJsonElement(initBody(model = "\"iab\"", gvl = vector.gvl.toString())).jsonObject
		val http =
			RecordingTransport()
				.respondInit(initSuccess(body = JsonObject(base + ("adTechProviders" to vector.adTechProviders)).toString()))
				.respondSave(SaveOutcome.Unavailable("offline"))
		val configuration =
			IabConfiguration(
				cmpId = 53,
				cmpVersion = 7,
				publisherCountryCode = "GB",
				numCustomPurposes = 2,
				publisherRestrictions = restrictions,
			)
		return testKernel(
				config = NativeConfig("https://cmp.example.test", iab = configuration),
				store = C15tStore(InMemoryKeyValueStore()),
				transport = http,
			)
			.also { it.bootstrap() }
	}

	@Test
	fun `Accept All grants only what some vendor declares`() {
		val checked = mutableListOf<String>()
		for (row in vector.cases) {
			val core = boot(row.publisherRestrictions)
			assertTrue(core.save(CommitIntent.All).ok, row.id)
			val saved = assertNotNull(core.iabConsent, row.id)
			// Purposes 5, 6, 8 and 11 are in the list but no vendor declares them; vendors 10 and 91
			// declare no legitimate interest; no publisher purpose is shown, so none is granted.
			assertEquals(row.acceptAll, saved.choices, row.id)

			val tc = TcStringDecoder.decode(saved.tcString)
			assertEquals(row.acceptAll.purposeConsents, tc.core.purposeConsents.sorted(), row.id)
			assertEquals(row.acceptAll.purposeLegitimateInterests, tc.core.purposeLegitimateInterests.sorted(), row.id)
			assertEquals(row.acceptAll.vendorConsents, tc.core.vendorConsents.ids.sorted(), row.id)
			assertEquals(row.acceptAll.vendorLegitimateInterests, tc.core.vendorLegitimateInterests.ids.sorted(), row.id)
			assertEquals(row.acceptAll.specialFeatureOptIns, tc.core.specialFeatureOptins.sorted(), row.id)
			assertEquals(emptyList(), tc.publisher?.publisherConsents.orEmpty(), row.id)
			assertEquals(emptyList(), tc.publisher?.publisherLegitimateInterests.orEmpty(), row.id)
			assertEquals(emptyList(), tc.publisher?.publisherCustomConsents.orEmpty(), row.id)
			checked += row.id
		}
		assertEquals(listOf("no-restrictions", "publisher-restrictions"), checked)
	}
}
