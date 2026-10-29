package com.c15t.core

import com.c15t.core.model.*
import com.c15t.core.store.C15tStore
import com.c15t.core.transport.*
import java.io.File
import java.security.MessageDigest
import kotlin.test.*
import kotlinx.serialization.json.*

class BundledPolicyTest {
	private val vector = Json.parseToJsonElement(generateSequence(File(System.getProperty("user.dir"))) { it.parentFile }.map { File(it, "native/protocol/bundled-policy/parity.json") }.first { it.exists() }.readText()).jsonObject
	private val now = vector.getValue("now").jsonPrimitive.long
	private val endpoint = vector.getValue("endpoint").jsonPrimitive.content
	private fun resource(change: (MutableMap<String, JsonElement>) -> Unit = {}): String {
		val body = Json.parseToJsonElement(vector.getValue("resource").jsonObject.getValue("payload").jsonPrimitive.content).jsonObject.toMutableMap()
		change(body)
		val payload = JsonObject(body).toString()
		return buildJsonObject { put("payload", payload); put("sha256", MessageDigest.getInstance("SHA-256").digest(payload.toByteArray()).joinToString("") { "%02x".format(it) }) }.toString()
	}
	@Test fun `shared TypeScript policy matching and language fallback`() {
		for (row in vector.getValue("cases").jsonArray) {
			val input = row.jsonObject.getValue("inputs").jsonObject
			val selected = assertNotNull(BundledPolicy.resolve(resource(), endpoint, KernelOverrides(country = input["country"]?.jsonPrimitive?.contentOrNull, region = input["region"]?.jsonPrimitive?.contentOrNull, language = input["language"]?.jsonPrimitive?.content), now))
			assertEquals(row.jsonObject.getValue("expected").jsonObject.getValue("policyId").jsonPrimitive.content, selected.mapped.resolution.policyId)
			assertEquals(row.jsonObject.getValue("expected").jsonObject.getValue("fingerprints").jsonObject.getValue("policy").jsonPrimitive.content, selected.mapped.resolution.fingerprint)
			assertEquals(row.jsonObject.getValue("expectedLanguage").jsonPrimitive.content, selected.mapped.translationsLanguage)
			assertNull(selected.mapped.subjectId); assertNull(selected.mapped.policySnapshotToken)
		}
	}
	@Test fun `invalid build authority never bootstraps`() {
		val variants: List<(MutableMap<String, JsonElement>) -> Unit> = listOf(
			{ it["endpoint"] = JsonPrimitive("https://wrong.example.test") },
			{ it["schemaVersion"] = JsonPrimitive(2) },
			{ it["expiresAt"] = JsonPrimitive(now) },
			{ it["issuedAt"] = JsonPrimitive(now + 1) },
			{ it["policyPacks"] = JsonArray(emptyList()) },
		)
		for (change in variants) assertNull(BundledPolicy.resolve(resource(change), endpoint, KernelOverrides(), now))
		assertNull(BundledPolicy.resolve("corrupt", endpoint, KernelOverrides(), now))
	}
	@Test fun `expired bundle reads retain snapshot identity between publications`() {
		val clock = FixedClock(now)
		val core = testKernel(NativeConfig(endpoint, bundledPolicy = resource()), C15tStore(InMemoryKeyValueStore()), clock).also { it.bootstrap() }
		val current = core.snapshot()
		assertSame(current, core.snapshot())
		clock.advance(604800000)
		val expired = core.snapshot()
		assertTrue(expired.policyPending)
		assertEquals("bundled-policy-expired", expired.error?.code)
		ConsentCategory.OPTIONAL.forEach { assertFalse(core.isAllowed(it)) }
		repeat(100) { assertSame(expired, core.snapshot()) }
	}
	@Test fun `cold offline decision survives launch cache preference withdrawal and expiry`() {
		val store = C15tStore(InMemoryKeyValueStore()); val clock = FixedClock(now)
		fun boot(raw: String = resource()) = testKernel(NativeConfig(endpoint, bundledPolicy = raw, consentCategories = ConsentCategory.entries), store, clock, RecordingTransport()).also { it.bootstrap() }
		val core = boot()
		assertTrue(core.snapshot().ready); assertFalse(core.snapshot().policyPending)
		assertTrue(core.snapshot().promptRequirement.acknowledge)
		ConsentCategory.OPTIONAL.forEach { assertFalse(core.isAllowed(it)) }
		assertTrue(core.save(CommitIntent.All).ok)
		assertTrue(core.isAllowed(ConsentCategory.MEASUREMENT))
		val choice = core.snapshot().explicitChoice
		val older = resource { body -> body["policyPacks"] = JsonArray(body.getValue("policyPacks").jsonArray.map { pack ->
			val wire = pack.jsonObject.getValue("policyResolution").jsonObject
			JsonObject(pack.jsonObject + ("policyResolution" to JsonObject(wire + ("fingerprints" to JsonObject(wire.getValue("fingerprints").jsonObject + ("choice" to JsonPrimitive("a".repeat(64))))))))
		}) }
		val restored = boot(older)
		assertEquals(choice, restored.snapshot().explicitChoice); assertTrue(restored.isAllowed(ConsentCategory.MEASUREMENT))
		assertTrue(restored.save(CommitIntent.Necessary).ok)
		assertFalse(boot().isAllowed(ConsentCategory.MEASUREMENT))
		clock.advance(604800000)
		assertFalse(restored.isAllowed(ConsentCategory.MEASUREMENT)); assertTrue(restored.snapshot().policyPending)
		assertFalse(restored.save(CommitIntent.All).ok); assertTrue(boot().snapshot().policyPending)
	}
	@Test fun `expired category and IAB bundles allow durable withdrawal without restoring grants`() {
		for ((name, restartBeforeWithdrawal) in listOf("parity" to false, "parity" to true, "iab" to false, "iab" to true)) {
			val source = Json.parseToJsonElement(generateSequence(File(System.getProperty("user.dir"))) { it.parentFile }
				.map { File(it, "native/protocol/bundled-policy/$name.json") }.first { it.exists() }.readText()).jsonObject
			val startedAt = source.getValue("now").jsonPrimitive.long
			val endpoint = source.getValue("endpoint").jsonPrimitive.content
			val body = Json.parseToJsonElement(source.getValue("resource").jsonObject.getValue("payload").jsonPrimitive.content).jsonObject.toMutableMap()
			body["expiresAt"] = JsonPrimitive(startedAt + 60_000)
			val payload = JsonObject(body).toString()
			val raw = buildJsonObject { put("payload", payload); put("sha256", MessageDigest.getInstance("SHA-256").digest(payload.toByteArray()).joinToString("") { "%02x".format(it) }) }.toString()
			val configuration = source["configuration"]?.let { Json { ignoreUnknownKeys = true }.decodeFromJsonElement<com.c15t.core.iab.IabConfiguration>(it) }
			val config = NativeConfig(endpoint, bundledPolicy = raw, iab = configuration, consentCategories = ConsentCategory.entries)
			val selected = assertNotNull(BundledPolicy.resolve(raw, endpoint, KernelOverrides(), startedAt))
			val wire = body.getValue("policyPacks").jsonArray.first { it.jsonObject.getValue("policyResolution").jsonObject.getValue("policyId").jsonPrimitive.content == selected.mapped.resolution.policyId }.jsonObject.getValue("policyResolution")
			val store = C15tStore(InMemoryKeyValueStore())
			val clock = FixedClock(startedAt)
			val transport = RecordingTransport().respondSave(SaveOutcome.Unavailable("offline"))
			fun boot() = testKernel(config, store, clock, transport).also { it.bootstrap() }
			val first = boot()
			assertTrue(first.save(CommitIntent.All).ok, name)
			val grant = store.readPending().single()
			assertFalse(grant.isWithdrawal())
			assertTrue(first.isAllowed(ConsentCategory.MEASUREMENT))
			clock.advance(60_001)
			val expired = if (restartBeforeWithdrawal) boot() else first
			assertTrue(expired.snapshot().policyPending)
			assertFalse(expired.save(CommitIntent.All).ok)
			assertFalse(expired.save(CommitIntent.Explicit(mapOf(ConsentCategory.MEASUREMENT to true))).ok)
			val revision = expired.snapshot().revision
			assertEquals("concurrent-change", expired.save(CommitIntent.Necessary, revision - 1).error?.code)
			assertTrue(expired.save(CommitIntent.Necessary, revision).ok, name)
			val withdrawal = store.readPending().single()
			assertTrue(withdrawal.isWithdrawal(), name)
			assertNotEquals(grant.body, withdrawal.body)
			assertEquals(clock.nowMillis(), withdrawal.payload.confirmed.actionAt)
			assertTrue(expired.snapshot().policyPending)
			ConsentCategory.OPTIONAL.forEach { assertFalse(expired.isAllowed(it)) }
			val restored = boot()
			assertEquals(withdrawal.body, store.readPending().single().body)
			ConsentCategory.OPTIONAL.forEach { assertFalse(restored.isAllowed(it)) }
			transport.saveRequests.clear()
			transport.respondSave(SaveOutcome.Delivered)
			assertEquals(1, restored.flushPending().delivered)
			assertEquals(listOf(withdrawal.body), transport.saveRequests.map { it.body })
			transport.respondInit(TransportOutcome.Success(buildJsonObject {
				put("policyResolution", wire)
				val disclosures = body["disclosures"]?.jsonObject
				disclosures?.get("gvl")?.jsonObject?.get("data")?.let { put("gvl", it) }
				disclosures?.get("atp")?.jsonObject?.get("providers")?.let { put("adTechProviders", it) }
			}, emptyMap()))
			restored.refresh()
			assertNull(restored.bundledPolicyInfo)
			assertFalse(restored.snapshot().policyPending)
			ConsentCategory.OPTIONAL.forEach { assertFalse(restored.isAllowed(it), name) }
		}
	}
	@Test fun `offline IAB preserves source dates and refuses absent stale or future disclosures`() {
		val v = Json.parseToJsonElement(generateSequence(File(System.getProperty("user.dir"))) { it.parentFile }.map { File(it, "native/protocol/bundled-policy/iab.json") }.first { it.exists() }.readText()).jsonObject
		val configuration = Json { ignoreUnknownKeys = true }.decodeFromJsonElement<com.c15t.core.iab.IabConfiguration>(v.getValue("configuration"))
		for (fault in listOf("valid", "missing-gvl", "stale-gvl", "future-gvl", "missing-atp", "stale-atp", "future-atp")) {
			val body = Json.parseToJsonElement(v.getValue("resource").jsonObject.getValue("payload").jsonPrimitive.content).jsonObject.toMutableMap()
			val disclosures = body.getValue("disclosures").jsonObject.toMutableMap()
			val key = if (fault.endsWith("gvl")) "gvl" else "atp"
			if (fault.startsWith("missing")) disclosures.remove(key)
			if (fault.startsWith("stale") || fault.startsWith("future")) disclosures[key] = JsonObject(disclosures.getValue(key).jsonObject + ("fetchedAt" to JsonPrimitive(if (fault.startsWith("stale")) now - 604800000 else now + 1)))
			body["disclosures"] = JsonObject(disclosures)
			val payload = JsonObject(body).toString()
			val raw = buildJsonObject { put("payload", payload); put("sha256", MessageDigest.getInstance("SHA-256").digest(payload.toByteArray()).joinToString("") { "%02x".format(it) }) }.toString()
			val store = C15tStore(InMemoryKeyValueStore())
			val config = NativeConfig(endpoint, bundledPolicy = raw, iab = configuration)
			val core = testKernel(config, store, FixedClock(now), RecordingTransport()).also { it.bootstrap() }
			if (fault == "valid") {
				assertNotNull(core.openIabDraft()); assertTrue(core.save(CommitIntent.All).ok)
				assertEquals(now - 1000, store.readEnvelope()?.iabListFetchedAt)
				assertEquals(now - 2000, store.readEnvelope()?.additionalConsentList?.fetchedAt)
				val restored = testKernel(config, store, FixedClock(now + 5000), RecordingTransport()).also { it.bootstrap() }
				assertNotNull(restored.iabConsent); assertEquals(listOf(1L,2L), restored.adTechProviderDisclosures()?.map { it.id })
			} else {
				assertNull(core.openIabDraft(), fault); assertFalse(core.save(CommitIntent.All).ok, fault)
				assertFalse(core.isAllowed(ConsentCategory.MARKETING), fault)
				if (fault == "stale-atp") assertNotNull(core.adTechProviderDisclosures())
				if (fault == "stale-gvl") assertNotNull(core.vendorList)
			}
		}
	}

	@Test fun `hosted same fingerprint preserves choice while changed fingerprint prompts again`() {
		val store = C15tStore(InMemoryKeyValueStore()); val clock = FixedClock(now)
		val raw = resource(); val config = NativeConfig(endpoint, bundledPolicy = raw)
		val offline = testKernel(config, store, clock).also { it.bootstrap() }
		assertTrue(offline.save(CommitIntent.All).ok)
		val saved = offline.snapshot().explicitChoice
		val selected = assertNotNull(BundledPolicy.resolve(raw, endpoint, KernelOverrides(), now))
		val payload = Json.parseToJsonElement(Json.parseToJsonElement(raw).jsonObject.getValue("payload").jsonPrimitive.content).jsonObject
		val wire = payload.getValue("policyPacks").jsonArray.first { it.jsonObject.getValue("policyResolution").jsonObject.getValue("policyId").jsonPrimitive.content == selected.mapped.resolution.policyId }.jsonObject.getValue("policyResolution")
		fun response(w: JsonElement) = com.c15t.core.transport.TransportOutcome.Success(buildJsonObject { put("policyResolution", w) }, emptyMap())
		val transport = RecordingTransport().respondInit(response(wire))
		val online = testKernel(config, store, clock, transport).also { it.bootstrap() }
		assertNull(online.bundledPolicyInfo)
		assertEquals(saved, online.snapshot().explicitChoice)
		assertTrue(online.isAllowed(ConsentCategory.MEASUREMENT))
		val changed = JsonObject(wire.jsonObject + ("fingerprints" to JsonObject(wire.jsonObject.getValue("fingerprints").jsonObject + ("choice" to JsonPrimitive("d".repeat(64))))))
		transport.respondInit(response(changed)); online.refresh()
		assertTrue(online.snapshot().promptRequirement.acknowledge)
		assertFalse(online.isAllowed(ConsentCategory.MEASUREMENT))
	}

	@Test fun `expired stored authority adopts newer resource and deadline closes gate`() {
		val store = C15tStore(InMemoryKeyValueStore()); val clock = FixedClock(now)
		val old = resource { it["expiresAt"] = JsonPrimitive(now + 100) }
		val core = testKernel(NativeConfig(endpoint, bundledPolicy = old), store, clock).also { it.bootstrap() }
		assertTrue(core.save(CommitIntent.All).ok)
		val expired = java.util.concurrent.CountDownLatch(1)
		val revision = core.snapshot().revision
		val gate = core.gate(ConsentCategory.MEASUREMENT) { if (!it) expired.countDown() }
		clock.advance(100)
		assertTrue(expired.await(3, java.util.concurrent.TimeUnit.SECONDS))
		gate.close()
		assertTrue(core.snapshot().revision > revision)
		val newer = resource { it["issuedAt"] = JsonPrimitive(clock.nowMillis()); it["expiresAt"] = JsonPrimitive(now + 100000); it["manifestRevision"] = JsonPrimitive("newer-manifest") }
		val relaunched = testKernel(NativeConfig(endpoint, bundledPolicy = newer), store, clock).also { it.bootstrap() }
		assertFalse(relaunched.snapshot().policyPending)
		assertEquals("newer-manifest", relaunched.bundledPolicyInfo?.manifestRevision)
		assertTrue(relaunched.isAllowed(ConsentCategory.MEASUREMENT))
	}

	@Test fun `permissive known policy cannot supply implicit grants from a bundle`() {
		val config = NativeConfig(endpoint, bundledPolicy = resource(), overrides = KernelOverrides(country = "US", language = "fr-CA"))
		val core = testKernel(config, C15tStore(InMemoryKeyValueStore()), FixedClock(now)).also { it.bootstrap() }
		assertFalse(core.snapshot().policyPending)
		assertEquals("us_permissive", core.snapshot().resolution.policyId)
		assertNull(core.snapshot().explicitChoice)
		ConsentCategory.OPTIONAL.forEach { assertFalse(core.isAllowed(it)) }
	}

}
