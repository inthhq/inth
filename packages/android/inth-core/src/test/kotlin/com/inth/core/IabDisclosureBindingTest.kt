package com.inth.core

import com.inth.core.iab.*
import com.inth.core.model.*
import com.inth.core.spi.*
import com.inth.core.store.*
import com.inth.core.tc.*
import com.inth.core.transport.*
import java.io.File
import kotlin.test.*
import kotlinx.serialization.json.*

class IabDisclosureBindingTest {
	private val fixture = generateSequence(File(System.getProperty("user.dir"))) { it.parentFile }
		.map { File(it, "packages/native-protocol/iab/commit-cases.json") }.first { it.exists() }
	private val vector = Json { ignoreUnknownKeys = true }.decodeFromString<IabCommitTest.Vector>(fixture.readText())
	private val config = NativeConfig("https://cmp.example.test", iab = vector.cases[0].configuration)

	@Test
	fun `known disclosure normalization retains its digest`() {
		assertEquals("gvl-v2:734163a21dcabc7405318b9eb9c2fed3c798a48581367d4e362b56ac4b7602ee", IabAuthority.disclosureID(vector.gvl.copy(additionalFields = null)))
	}

	@Test
	fun `legacy projected disclosure binding cannot restore authority`() {
		val document = GlobalVendorListJson.toJsonElement(vector.gvl.copy(additionalFields = null))
		val store = InthStore(InMemoryKeyValueStore())
		val http = RecordingTransport().respondInit(initSuccess(body = initBody(model = "\"iab\"", gvl = document.toString())))
			.respondSave(SaveOutcome.Unavailable("offline"))
		val first = testKernel(config = config, store = store, transport = http, clock = FixedClock(vector.now))
		first.bootstrap()
		assertTrue(first.save(CommitIntent.All).ok)
		val envelope = assertNotNull(store.readEnvelope())
		val consent = assertNotNull(envelope.iabConsent)
		store.writeEnvelope(envelope.copy(iabConsent = consent.copy(disclosureID = "734163a21dcabc7405318b9eb9c2fed3c798a48581367d4e362b56ac4b7602ee")))
		val cold = testKernel(config = config, store = store, clock = FixedClock(vector.now), executor = TaskExecutor { })
		cold.bootstrap()
		assertNull(cold.iabConsent)
		assertFalse(cold.isIabAllowed(1, 1, IabLegalBasis.CONSENT))
		assertFalse(cold.isAllowed(ConsentCategory.MARKETING))
	}

	@Test
	fun `unknown field change cannot retain an existing grant`() {
		val document = GlobalVendorListJson.toJsonElement(vector.gvl)
		for (path in listOf(listOf("futureField"), listOf("vendors", "1", "futureField"))) {
			val before = replace(document, path, value(path, "before"))
			val after = replace(document, path, value(path, "after"))
			val store = InthStore(InMemoryKeyValueStore())
			val http = RecordingTransport().respondInit(initSuccess(body = initBody(model = "\"iab\"", gvl = before.toString())))
				.respondSave(SaveOutcome.Unavailable("offline"))
			val core = testKernel(config = config, store = store, transport = http, clock = FixedClock(vector.now))
			core.bootstrap()
			assertTrue(core.save(CommitIntent.All).ok)
			http.respondInit(initSuccess(body = initBody(model = "\"iab\"", gvl = after.toString())))
			core.refresh()
			assertNull(core.iabConsent, path.toString())
			assertFalse(core.isIabAllowed(1, 1, IabLegalBasis.CONSENT))
		}
	}

	@Test
	fun `unknown disclosure changes invalidate grants after cold launch`() {
		val document = GlobalVendorListJson.toJsonElement(vector.gvl)
		for (path in listOf(listOf("futureField"), listOf("vendors", "1", "futureField"),
			listOf("purposes", "1", "futureField"), listOf("vendors", "1", "urls"), listOf("vendors", "1", "dataRetention"),
			listOf("vendors", "1", "overflow"), listOf("standardTexts"))) {
			val before = replace(document, path, value(path, "before"))
			val after = replace(document, path, value(path, "after"))
			val store = InthStore(InMemoryKeyValueStore())
			val http = RecordingTransport().respondInit(initSuccess(body = initBody(model = "\"iab\"", gvl = before.toString())))
				.respondSave(SaveOutcome.Unavailable("offline"))
			val first = testKernel(config = config, store = store, transport = http, clock = FixedClock(vector.now))
			first.bootstrap()
			assertTrue(first.save(CommitIntent.All).ok, path.toString())
			val saved = assertNotNull(first.iabConsent)
			val cold = testKernel(config = config, store = store, clock = FixedClock(vector.now), executor = TaskExecutor { })
			cold.bootstrap()
			assertEquals(saved, cold.iabConsent)
			val restored = assertNotNull(cold.vendorList)
			assertEquals(value(path, "before"), at(GlobalVendorListJson.toJsonElement(restored), path))
			assertEquals(IabAuthority.disclosureID(assertNotNull(GlobalVendorListJson.read(before))), IabAuthority.disclosureID(restored))
			http.respondInit(initSuccess(body = initBody(model = "\"iab\"", gvl = after.toString())))
			first.refresh()
			assertNull(first.iabConsent, path.toString())
			assertFalse(first.isIabAllowed(1, 1, IabLegalBasis.CONSENT))
			assertEquals(0, store.readPending().size)
		}
	}

	@Test
	fun `GVL tolerance does not admit unknown consent authority`() {
		val document = replace(GlobalVendorListJson.toJsonElement(vector.gvl), listOf("futureField"), JsonPrimitive("legal"))
		val gvl = assertNotNull(GlobalVendorListJson.read(document))
		val consent = IabAuthority.build(vector.cases[0].configuration, IabChoices(), gvl, "subject", null, "fingerprint", vector.now, null)
		val envelope = SnapshotEnvelope(snapshot = ConsentSnapshot(), gvl = gvl, iabConsent = consent)
		val raw = InthJson.storage.encodeToJsonElement(SnapshotEnvelope.serializer(), envelope).jsonObject
		assertNotNull(InthJson.storage.decodeFromJsonElement(SnapshotEnvelope.serializer(), raw).gvl)
		val tampered = replace(raw, listOf("iabConsent", "futureAuthority"), JsonPrimitive(true))
		assertFails { InthJson.storage.decodeFromJsonElement(SnapshotEnvelope.serializer(), tampered) }
	}

	@Test
	fun `unknown disclosure keys are order independent and narrow with their vendor`() {
		var document: JsonElement = GlobalVendorListJson.toJsonElement(vector.gvl)
		document = replace(document, listOf("futureField"), buildJsonObject { put("z", 1); put("a", "legal") })
		document = replace(document, listOf("vendors", "1", "futureField"), JsonPrimitive("kept"))
		document = replace(document, listOf("vendors", "2", "futureField"), JsonPrimitive("removed"))
		val gvl = assertNotNull(GlobalVendorListJson.read(document))
		val reordered = assertNotNull(GlobalVendorListJson.read(reverse(document)))
		assertEquals(IabAuthority.disclosureID(gvl), IabAuthority.disclosureID(reordered))
		val narrowed = gvl.narrowToVendorIds(listOf(1))
		val wire = GlobalVendorListJson.toJsonElement(narrowed)
		assertEquals(document.jsonObject["futureField"], wire["futureField"])
		assertEquals(JsonPrimitive("kept"), at(wire, listOf("vendors", "1", "futureField")))
		assertNull(at(wire, listOf("vendors", "2")))
		val changedRemoved = replace(document, listOf("vendors", "2", "futureField"), JsonPrimitive("irrelevant"))
		val other = assertNotNull(GlobalVendorListJson.read(changedRemoved)).narrowToVendorIds(listOf(1))
		assertEquals(IabAuthority.disclosureID(narrowed), IabAuthority.disclosureID(other))
	}

	private fun value(path: List<String>, text: String): JsonElement = when (path.last()) {
		"urls" -> JsonArray(listOf(buildJsonObject { put("langId", "EN"); put("futureField", text) }))
		"dataRetention" -> buildJsonObject { put("stdRetention", 30); put("futureField", text) }
		"overflow" -> buildJsonObject { put("httpGetLimit", 1024); put("futureField", text) }
		"standardTexts" -> buildJsonObject { put("features", "Features"); put("futureField", text) }
		else -> buildJsonObject { put("legal", text); put("nested", JsonArray(listOf(JsonPrimitive(1), JsonNull))) }
	}
	private fun at(value: JsonElement, path: List<String>): JsonElement? =
		path.fold(value as JsonElement?) { current, key -> (current as? JsonObject)?.get(key) }
	private fun replace(value: JsonElement, path: List<String>, replacement: JsonElement): JsonElement {
		if (path.isEmpty()) return replacement
		val fields = (value as? JsonObject).orEmpty()
		return JsonObject(fields + (path.first() to replace(fields[path.first()] ?: JsonObject(emptyMap()), path.drop(1), replacement)))
	}
	private fun reverse(value: JsonElement): JsonElement = when (value) {
		is JsonObject -> JsonObject(value.entries.reversed().associate { it.key to reverse(it.value) })
		is JsonArray -> JsonArray(value.map(::reverse))
		else -> value
	}
}
