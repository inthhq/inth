package com.inth.core

import com.inth.core.model.*
import com.inth.core.store.InthStore
import com.inth.core.transport.*
import java.io.File
import java.security.MessageDigest
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit
import kotlin.test.*
import kotlinx.serialization.json.*

class BundledPolicyTest {
	private val vector = Json.parseToJsonElement(generateSequence(File(System.getProperty("user.dir"))) { it.parentFile }.map { File(it, "packages/native-protocol/bundled-policy/parity.json") }.first { it.exists() }.readText()).jsonObject
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
			assertNull(selected.mapped.policySnapshotToken)
		}
	}
	@Test fun `every malformed shared resource is refused or carries no usable vendor list`() {
		val fixture = Json.parseToJsonElement(generateSequence(File(System.getProperty("user.dir"))) { it.parentFile }
			.map { File(it, "packages/native-protocol/bundled-policy/invalid-resources.json") }.first { it.exists() }.readText()).jsonObject
		val problems = fixture.getValue("cases").jsonArray.mapNotNull { case ->
			val row = case.jsonObject
			val name = row.getValue("name").jsonPrimitive.content
			val selection = BundledPolicy.resolve(row.getValue("resource").toString(), row.getValue("endpoint").jsonPrimitive.content,
				KernelOverrides(), row.getValue("now").jsonPrimitive.long)
			when (row.getValue("expect").jsonPrimitive.content) {
				"refused" -> name.takeIf { selection != null }?.let { "$it: accepted" }
				else -> name.takeIf { selection == null || selection.mapped.gvl != null && selection.gvlFetchedAt != null }?.let { "$it: ${if (selection == null) "refused" else "usable list"}" }
			}
		}
		assertEquals(emptyList(), problems)
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
	@Test fun `reset publishes the cleared baseline before the bundled manifest`() {
		val core = testKernel(NativeConfig(endpoint, bundledPolicy = resource(), consentCategories = ConsentCategory.entries), InthStore(InMemoryKeyValueStore()), FixedClock(now), RecordingTransport()).also { it.bootstrap() }
		assertFalse(core.snapshot().policyPending)
		core.save(CommitIntent.All)
		val before = core.snapshot().revision
		val published = mutableListOf<ConsentSnapshot>()
		val observer: (ConsentSnapshot) -> Unit = { published += it }
		val subscription = core.onChange(observer)
		published.clear()
		core.reset()
		subscription.close()
		val baseline = published.first()
		assertEquals(before + 1, baseline.revision)
		assertTrue(baseline.policyPending)
		assertNull(baseline.explicitChoice)
		assertFalse(published.last().policyPending, "the bundled manifest applies after the baseline")
		assertEquals(published.map { it.revision }.distinct(), published.map { it.revision })
	}
	@Test fun `manifest expiring in use keeps prompting and emits policyStale once`() {
		val clock = FixedClock(now)
		val raw = resource { it["expiresAt"] = JsonPrimitive(now + 100) }
		val core = testKernel(NativeConfig(endpoint, bundledPolicy = raw, consentCategories = ConsentCategory.entries), InthStore(InMemoryKeyValueStore()), clock).also { it.bootstrap() }
		val announced = LinkedBlockingQueue<BundledPolicyAuthority>()
		val listener: (BundledPolicyAuthority) -> Unit = { announced.add(it) }
		val subscription = core.onPolicyStale(listener)
		assertFalse(core.isPolicyStale)
		assertTrue(announced.isEmpty())
		clock.advance(100)
		assertEquals(now + 100, announced.poll(3, TimeUnit.SECONDS)?.expiresAt)
		assertTrue(core.isPolicyStale)
		val stale = core.snapshot()
		assertFalse(stale.policyPending)
		assertNotEquals("bundled-policy-unusable", stale.error?.code)
		assertTrue(core.isReady())
		repeat(100) { assertSame(stale, core.snapshot()) }
		ConsentCategory.OPTIONAL.forEach { assertFalse(core.isAllowed(it)) }
		assertTrue(core.save(CommitIntent.All).ok)
		assertTrue(core.isAllowed(ConsentCategory.MEASUREMENT))
		assertNull(announced.poll(200, TimeUnit.MILLISECONDS))
		subscription.close()
	}

	@Test fun `a subscriber added while the expiry is being published hears policyStale once`() {
		val clock = FixedClock(now)
		val backing = InMemoryKeyValueStore()
		val armed = java.util.concurrent.atomic.AtomicBoolean(false)
		val entered = java.util.concurrent.CountDownLatch(1)
		val release = java.util.concurrent.CountDownLatch(1)
		// Holds the deadline task between installing the stale snapshot and announcing it.
		val blocking = object : com.inth.core.spi.KeyValueStore by backing {
			override fun writeDurably(key: String, value: String?): Boolean {
				if (armed.compareAndSet(true, false)) {
					entered.countDown()
					release.await(3, TimeUnit.SECONDS)
				}
				return backing.writeDurably(key, value)
			}
		}
		val core = testKernel(NativeConfig(endpoint, bundledPolicy = resource { it["expiresAt"] = JsonPrimitive(now + 100) }),
			InthStore(blocking), clock).also { it.bootstrap() }
		armed.set(true)
		clock.advance(100)
		assertTrue(entered.await(3, TimeUnit.SECONDS))
		val heard = LinkedBlockingQueue<BundledPolicyAuthority>()
		val listener: (BundledPolicyAuthority) -> Unit = { heard.add(it) }
		val subscription = core.onPolicyStale(listener)
		release.countDown()
		assertNotNull(heard.poll(3, TimeUnit.SECONDS))
		assertNull(heard.poll(300, TimeUnit.MILLISECONDS))
		subscription.close()
	}

	@Test fun `first offline launch with an expired manifest prompts records choices and replays policyStale`() {
		val clock = FixedClock(now + 604800000)
		val store = InthStore(InMemoryKeyValueStore())
		val config = NativeConfig(endpoint, bundledPolicy = resource(), consentCategories = ConsentCategory.entries)
		val transport = RecordingTransport()
		val core = testKernel(config, store, clock, transport).also { it.bootstrap() }
		assertTrue(core.isPolicyStale)
		var heard: BundledPolicyAuthority? = null
		val listener: (BundledPolicyAuthority) -> Unit = { heard = it }
		val subscription = core.onPolicyStale(listener)
		assertEquals(core.bundledPolicyInfo, heard)
		assertFalse(core.snapshot().policyPending)
		assertTrue(core.snapshot().promptRequirement.acknowledge)
		ConsentCategory.OPTIONAL.forEach { assertFalse(core.isAllowed(it)) }
		assertTrue(core.save(CommitIntent.Custom(mapOf(ConsentCategory.MEASUREMENT to true))).ok)
		assertTrue(core.isAllowed(ConsentCategory.MEASUREMENT))
		assertFalse(core.isAllowed(ConsentCategory.MARKETING))
		assertEquals(1, transport.saveRequests.size)
		subscription.close()
	}

	@Test fun `rejecting after the manifest expires withdraws at once and replaces the queued grant`() {
		val clock = FixedClock(now)
		val store = InthStore(InMemoryKeyValueStore())
		val transport = RecordingTransport().respondSave(SaveOutcome.Unavailable("offline"))
		val config = NativeConfig(endpoint, bundledPolicy = resource { it["expiresAt"] = JsonPrimitive(now + 100) },
			consentCategories = ConsentCategory.entries)
		val core = testKernel(config, store, clock, transport).also { it.bootstrap() }
		assertTrue(core.save(CommitIntent.All).ok)
		assertTrue(core.isAllowed(ConsentCategory.MARKETING))
		clock.advance(100)
		assertTrue(core.isPolicyStale)
		assertTrue(core.save(CommitIntent.Necessary).ok)
		ConsentCategory.OPTIONAL.forEach { assertFalse(core.isAllowed(it)) }
		val queued = store.readPending().single()
		assertTrue(queued.isWithdrawal())
		ConsentCategory.OPTIONAL.forEach { assertFalse(testKernel(config, store, clock, transport).also { k -> k.bootstrap() }.isAllowed(it)) }
		transport.saveRequests.clear()
		transport.respondSave(SaveOutcome.Delivered())
		core.flushPending()
		assertEquals(listOf(queued.body), transport.saveRequests.map { it.body })
	}

	@Test fun `a live no-match answer drops the earlier rule and its grants, as the web kernel does`() {
		val transport = RecordingTransport().respondInit(liveResponse(resource()))
		val core = testKernel(NativeConfig(endpoint, consentCategories = ConsentCategory.entries), InthStore(InMemoryKeyValueStore()), FixedClock(now), transport)
			.also { it.bootstrap() }
		assertTrue(core.save(CommitIntent.All).ok)
		assertTrue(core.isAllowed(ConsentCategory.MEASUREMENT))
		transport.respondInit(TransportOutcome.Success(buildJsonObject {
			put("policyResolution", buildJsonObject { put("policy", JsonNull); put("status", "no-match"); put("version", 1) })
		}, emptyMap()))
		core.refresh()
		assertEquals("no-match", core.snapshot().resolution.status)
		assertFalse(core.snapshot().policyPending)
		ConsentCategory.OPTIONAL.forEach { assertFalse(core.isAllowed(it)) }
		assertTrue(core.snapshot().promptRequirement.acknowledge)
	}

	@Test fun `precedence is live then cached then bundled`() {
		val clock = FixedClock(now)
		val raw = resource()
		val config = NativeConfig(endpoint, bundledPolicy = raw)
		val airplane = testKernel(config, InthStore(InMemoryKeyValueStore()), clock, RecordingTransport()).also { it.bootstrap() }
		assertNotNull(airplane.bundledPolicyInfo)
		assertFalse(airplane.snapshot().policyPending)
		val store = InthStore(InMemoryKeyValueStore())
		val online = testKernel(config, store, clock, RecordingTransport().respondInit(liveResponse(raw))).also { it.bootstrap() }
		assertNull(online.bundledPolicyInfo)
		assertFalse(online.snapshot().policyPending)
		val offline = testKernel(config, store, clock, RecordingTransport()).also { it.bootstrap() }
		assertNull(offline.bundledPolicyInfo)
		assertFalse(offline.snapshot().policyPending)
		clock.advance(604800000)
		val later = testKernel(config, store, clock, RecordingTransport()).also { it.bootstrap() }
		assertNull(later.bundledPolicyInfo)
		assertFalse(later.isPolicyStale)
		assertFalse(later.snapshot().policyPending)
	}

	@Test fun `an in-code policy refuses a bundled manifest`() {
		assertFailsWith<IllegalArgumentException> { NativeConfig(endpoint, bundledPolicy = resource(), policyError = "refused") }
	}

	private fun liveResponse(raw: String): TransportOutcome {
		val selected = assertNotNull(BundledPolicy.resolve(raw, endpoint, KernelOverrides(), now))
		val payload = Json.parseToJsonElement(Json.parseToJsonElement(raw).jsonObject.getValue("payload").jsonPrimitive.content).jsonObject
		val wire = payload.getValue("policyPacks").jsonArray.first { it.jsonObject.getValue("policyResolution").jsonObject.getValue("policyId").jsonPrimitive.content == selected.mapped.resolution.policyId }.jsonObject.getValue("policyResolution")
		return TransportOutcome.Success(buildJsonObject { put("policyResolution", wire) }, emptyMap())
	}
	@Test fun `cold offline decision survives launch cache preference withdrawal and expiry`() {
		val store = InthStore(InMemoryKeyValueStore()); val clock = FixedClock(now)
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
		assertFalse(restored.isAllowed(ConsentCategory.MEASUREMENT)); assertFalse(restored.snapshot().policyPending)
		assertTrue(restored.isPolicyStale)
		assertTrue(restored.save(CommitIntent.All).ok); assertTrue(boot().isAllowed(ConsentCategory.MEASUREMENT))
	}
	@Test fun `notice dismissal survives an offline restart past manifest expiry`() {
		val clock = FixedClock(now)
		val raw = resource { body ->
			body["expiresAt"] = JsonPrimitive(now + 60_000)
			body["policyPacks"] = JsonArray(body.getValue("policyPacks").jsonArray.map { pack ->
				val wire = pack.jsonObject.getValue("policyResolution").jsonObject
				if (wire.getValue("policyId").jsonPrimitive.content != "us_permissive") pack else {
					val policy = JsonObject(wire.getValue("policy").jsonObject + mapOf(
						"prompt" to JsonPrimitive("notice"),
						"actions" to buildJsonObject {
							put("allowed", buildJsonArray { add("dismiss") })
							put("required", buildJsonArray {})
							put("equivalent", buildJsonArray {})
						},
					))
					JsonObject(pack.jsonObject + ("policyResolution" to JsonObject(wire + ("policy" to policy))))
				}
			})
		}
		val store = InthStore(InMemoryKeyValueStore())
		val config = NativeConfig(endpoint, bundledPolicy = raw, consentCategories = ConsentCategory.entries,
			overrides = KernelOverrides(country = "US", language = "en"))
		fun boot() = testKernel(config, store, clock, RecordingTransport()).also { it.bootstrap() }
		val first = boot()
		assertTrue(first.snapshot().promptRequirement.notice)
		assertTrue(first.dismissNotice())
		assertNull(first.snapshot().explicitChoice)
		ConsentCategory.OPTIONAL.forEach { assertFalse(first.isAllowed(it)) }
		clock.advance(60_001)
		val restored = boot()
		assertFalse(restored.snapshot().policyPending)
		assertTrue(restored.isPolicyStale)
		assertNull(restored.snapshot().explicitChoice)
		ConsentCategory.OPTIONAL.forEach { assertFalse(restored.isAllowed(it)) }
		assertTrue(restored.save(CommitIntent.All).ok)
	}

	@Test fun `expired category and IAB bundles keep recording grants and withdrawals`() {
		for ((name, restartBeforeWithdrawal, country) in listOf(Triple("parity", false, null), Triple("parity", true, null), Triple("iab", false, null), Triple("iab", true, null))) {
			val source = Json.parseToJsonElement(generateSequence(File(System.getProperty("user.dir"))) { it.parentFile }
				.map { File(it, "packages/native-protocol/bundled-policy/$name.json") }.first { it.exists() }.readText()).jsonObject
			val startedAt = source.getValue("now").jsonPrimitive.long
			val endpoint = source.getValue("endpoint").jsonPrimitive.content
			val body = Json.parseToJsonElement(source.getValue("resource").jsonObject.getValue("payload").jsonPrimitive.content).jsonObject.toMutableMap()
			body["expiresAt"] = JsonPrimitive(startedAt + 60_000)
			val payload = JsonObject(body).toString()
			val raw = buildJsonObject { put("payload", payload); put("sha256", MessageDigest.getInstance("SHA-256").digest(payload.toByteArray()).joinToString("") { "%02x".format(it) }) }.toString()
			val configuration = source["configuration"]?.let { Json { ignoreUnknownKeys = true }.decodeFromJsonElement<com.inth.core.iab.IabConfiguration>(it) }
			val config = NativeConfig(endpoint, bundledPolicy = raw, iab = configuration, consentCategories = ConsentCategory.entries, overrides = KernelOverrides(country = country))
			val selected = assertNotNull(BundledPolicy.resolve(raw, endpoint, config.overrides, startedAt))
			val wire = body.getValue("policyPacks").jsonArray.first { it.jsonObject.getValue("policyResolution").jsonObject.getValue("policyId").jsonPrimitive.content == selected.mapped.resolution.policyId }.jsonObject.getValue("policyResolution")
			val store = InthStore(InMemoryKeyValueStore())
			val clock = FixedClock(startedAt)
			val transport = RecordingTransport().respondSave(SaveOutcome.Unavailable("offline"))
			fun boot(categories: List<ConsentCategory>? = ConsentCategory.entries) = testKernel(config.copy(consentCategories = categories), store, clock, transport).also { it.bootstrap() }
			val first = boot()
			assertTrue(first.save(CommitIntent.All).ok, name)
			val grant = store.readPending().single()
			assertFalse(grant.isWithdrawal())
			assertTrue(first.isAllowed(ConsentCategory.MEASUREMENT))
			clock.advance(60_001)
			val narrowed = listOf(ConsentCategory.NECESSARY, ConsentCategory.MEASUREMENT)
			val expired = if (restartBeforeWithdrawal) boot(narrowed) else first
			assertFalse(expired.snapshot().policyPending, name)
			assertTrue(expired.isPolicyStale, name)
			val revision = expired.snapshot().revision
			assertEquals("concurrent-change", expired.save(CommitIntent.Necessary, revision - 1).error?.code)
			assertTrue(expired.save(CommitIntent.Necessary, revision).ok, name)
			val withdrawal = store.readPending().last()
			assertFalse(withdrawal.payload.consents[ConsentCategory.MEASUREMENT], name)
			assertNotEquals(grant.body, withdrawal.body)
			assertEquals(clock.nowMillis(), withdrawal.payload.confirmed.actionAt)
			assertFalse(expired.isAllowed(ConsentCategory.MEASUREMENT), name)
			val restored = boot(narrowed)
			val queued = store.readPending().map { it.body }
			assertEquals(withdrawal.body, queued.last(), name)
			assertFalse(restored.isAllowed(ConsentCategory.MEASUREMENT), name)
			transport.respondInit(TransportOutcome.Success(buildJsonObject {
				put("policyResolution", wire)
				val disclosures = body["disclosures"]?.jsonObject
				disclosures?.get("gvl")?.jsonObject?.get("data")?.let { put("gvl", it) }
				disclosures?.get("atp")?.jsonObject?.get("providers")?.let { put("adTechProviders", it) }
			}, emptyMap()))
			restored.refresh()
			assertNull(restored.bundledPolicyInfo)
			assertFalse(restored.snapshot().policyPending)
			assertFalse(restored.isAllowed(ConsentCategory.MEASUREMENT), name)
		}
	}
	@Test fun `offline IAB preserves source dates and refuses absent stale or future disclosures`() {
		val v = Json.parseToJsonElement(generateSequence(File(System.getProperty("user.dir"))) { it.parentFile }.map { File(it, "packages/native-protocol/bundled-policy/iab.json") }.first { it.exists() }.readText()).jsonObject
		val configuration = Json { ignoreUnknownKeys = true }.decodeFromJsonElement<com.inth.core.iab.IabConfiguration>(v.getValue("configuration"))
		// An older CLI wrote no `customVendors`; an unreadable list still loads the bundle, with none.
		for (fault in listOf("valid", "missing-gvl", "stale-gvl", "future-gvl", "missing-atp", "stale-atp", "future-atp", "no-custom-vendors", "invalid-custom-vendors")) {
			val body = Json.parseToJsonElement(v.getValue("resource").jsonObject.getValue("payload").jsonPrimitive.content).jsonObject.toMutableMap()
			val disclosures = body.getValue("disclosures").jsonObject.toMutableMap()
			val key = if (fault.endsWith("gvl")) "gvl" else "atp"
			if (fault.startsWith("missing")) disclosures.remove(key)
			if (fault == "no-custom-vendors") disclosures.remove("customVendors")
			if (fault == "invalid-custom-vendors") disclosures["customVendors"] = JsonPrimitive("invalid")
			if (fault.startsWith("stale") || fault.startsWith("future")) disclosures[key] = JsonObject(disclosures.getValue(key).jsonObject + ("fetchedAt" to JsonPrimitive(if (fault.startsWith("stale")) now - 604800000 else now + 1)))
			body["disclosures"] = JsonObject(disclosures)
			val payload = JsonObject(body).toString()
			val raw = buildJsonObject { put("payload", payload); put("sha256", MessageDigest.getInstance("SHA-256").digest(payload.toByteArray()).joinToString("") { "%02x".format(it) }) }.toString()
			val store = InthStore(InMemoryKeyValueStore())
			val config = NativeConfig(endpoint, bundledPolicy = raw, iab = configuration)
			val core = testKernel(config, store, FixedClock(now), RecordingTransport()).also { it.bootstrap() }
			if (fault == "valid" || fault.endsWith("custom-vendors")) {
				assertNotNull(core.openIabDraft(), fault)
				// A launch served only by the bundle lists its custom vendors, and Accept all grants them.
				val listed = if (fault == "valid") listOf("internal-ads") else emptyList()
				assertEquals(listed, core.iabCustomVendors().map { it.id }, fault)
				assertTrue(core.save(CommitIntent.All).ok, fault)
				assertEquals(listed, core.iabConsent?.choices?.customVendorConsents, fault)
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

	/**
	 * A bundle from an older CLI has no `customVendors` key. Adopted over a held list, it keeps the
	 * list and its grants: unlike a live `/init`, its silence says nothing about the publisher.
	 */
	@Test fun `a newer bundle without custom vendors keeps the held list`() {
		val v = Json.parseToJsonElement(generateSequence(File(System.getProperty("user.dir"))) { it.parentFile }.map { File(it, "packages/native-protocol/bundled-policy/iab.json") }.first { it.exists() }.readText()).jsonObject
		val configuration = Json { ignoreUnknownKeys = true }.decodeFromJsonElement<com.inth.core.iab.IabConfiguration>(v.getValue("configuration"))
		val original = Json.parseToJsonElement(v.getValue("resource").jsonObject.getValue("payload").jsonPrimitive.content).jsonObject
		fun raw(body: JsonObject): String {
			val payload = body.toString()
			return buildJsonObject { put("payload", payload); put("sha256", MessageDigest.getInstance("SHA-256").digest(payload.toByteArray()).joinToString("") { "%02x".format(it) }) }.toString()
		}
		val store = InthStore(InMemoryKeyValueStore())
		val first = testKernel(NativeConfig(endpoint, bundledPolicy = raw(original), iab = configuration), store, FixedClock(now)).also { it.bootstrap() }
		assertTrue(first.save(CommitIntent.All).ok)
		assertEquals(listOf("internal-ads"), first.iabConsent?.choices?.customVendorConsents)

		val newer = JsonObject(original + mapOf(
			"issuedAt" to JsonPrimitive(now + 1000),
			"disclosures" to JsonObject(original.getValue("disclosures").jsonObject - "customVendors"),
		))
		val second = testKernel(NativeConfig(endpoint, bundledPolicy = raw(newer), iab = configuration), store, FixedClock(now + 5000)).also { it.bootstrap() }
		assertEquals(listOf("internal-ads"), second.iabCustomVendors().map { it.id })
		assertEquals(listOf("internal-ads"), second.iabConsent?.choices?.customVendorConsents)
	}

	/**
	 * A newer bundle that lists none withdraws the vendor and its grant, and the withdrawal is
	 * stored: a relaunch with the older bundle, which is not adopted again, must not bring it back.
	 */
	@Test fun `a newer bundle listing none withdraws them across a relaunch`() {
		val v = Json.parseToJsonElement(generateSequence(File(System.getProperty("user.dir"))) { it.parentFile }.map { File(it, "packages/native-protocol/bundled-policy/iab.json") }.first { it.exists() }.readText()).jsonObject
		val configuration = Json { ignoreUnknownKeys = true }.decodeFromJsonElement<com.inth.core.iab.IabConfiguration>(v.getValue("configuration"))
		val original = Json.parseToJsonElement(v.getValue("resource").jsonObject.getValue("payload").jsonPrimitive.content).jsonObject
		fun raw(body: JsonObject): String {
			val payload = body.toString()
			return buildJsonObject { put("payload", payload); put("sha256", MessageDigest.getInstance("SHA-256").digest(payload.toByteArray()).joinToString("") { "%02x".format(it) }) }.toString()
		}
		fun launch(store: InthStore, body: JsonObject, at: Long) =
			testKernel(NativeConfig(endpoint, bundledPolicy = raw(body), iab = configuration), store, FixedClock(at)).also { it.bootstrap() }
		val store = InthStore(InMemoryKeyValueStore())
		assertTrue(launch(store, original, now).save(CommitIntent.All).ok)

		val withdrawn = JsonObject(original + mapOf(
			"issuedAt" to JsonPrimitive(now + 1000),
			"disclosures" to JsonObject(original.getValue("disclosures").jsonObject + ("customVendors" to JsonArray(emptyList()))),
		))
		val second = launch(store, withdrawn, now + 5000)
		assertEquals(emptyList(), second.iabCustomVendors())
		assertEquals(emptyList(), store.readEnvelope()?.iabConsent?.choices?.customVendorConsents)

		val third = launch(store, original, now + 6000)
		assertEquals(emptyList(), third.iabCustomVendors())
		assertFalse(third.isCustomVendorAllowed("internal-ads"))
	}

	@Test fun `hosted same fingerprint preserves choice while changed fingerprint prompts again`() {
		val store = InthStore(InMemoryKeyValueStore()); val clock = FixedClock(now)
		val raw = resource(); val config = NativeConfig(endpoint, bundledPolicy = raw)
		val offline = testKernel(config, store, clock).also { it.bootstrap() }
		assertTrue(offline.save(CommitIntent.All).ok)
		val saved = offline.snapshot().explicitChoice
		val selected = assertNotNull(BundledPolicy.resolve(raw, endpoint, KernelOverrides(), now))
		val payload = Json.parseToJsonElement(Json.parseToJsonElement(raw).jsonObject.getValue("payload").jsonPrimitive.content).jsonObject
		val wire = payload.getValue("policyPacks").jsonArray.first { it.jsonObject.getValue("policyResolution").jsonObject.getValue("policyId").jsonPrimitive.content == selected.mapped.resolution.policyId }.jsonObject.getValue("policyResolution")
		fun response(w: JsonElement) = com.inth.core.transport.TransportOutcome.Success(buildJsonObject { put("policyResolution", w) }, emptyMap())
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

	@Test fun `stale or older stored manifest gives way to a newer bundled one`() {
		val store = InthStore(InMemoryKeyValueStore()); val clock = FixedClock(now)
		val old = resource { it["expiresAt"] = JsonPrimitive(now + 100) }
		val core = testKernel(NativeConfig(endpoint, bundledPolicy = old), store, clock).also { it.bootstrap() }
		assertTrue(core.save(CommitIntent.All).ok)
		clock.advance(100)
		assertTrue(core.isPolicyStale)
		assertTrue(core.isAllowed(ConsentCategory.MEASUREMENT))
		val newer = resource { it["issuedAt"] = JsonPrimitive(clock.nowMillis()); it["expiresAt"] = JsonPrimitive(now + 100000); it["manifestRevision"] = JsonPrimitive("newer-manifest") }
		val relaunched = testKernel(NativeConfig(endpoint, bundledPolicy = newer), store, clock).also { it.bootstrap() }
		assertFalse(relaunched.snapshot().policyPending)
		assertFalse(relaunched.isPolicyStale)
		assertEquals("newer-manifest", relaunched.bundledPolicyInfo?.manifestRevision)
		assertTrue(relaunched.isAllowed(ConsentCategory.MEASUREMENT))
		clock.advance(1)
		val newest = resource { it["issuedAt"] = JsonPrimitive(clock.nowMillis()); it["expiresAt"] = JsonPrimitive(now + 200000); it["manifestRevision"] = JsonPrimitive("newest-manifest") }
		val upgraded = testKernel(NativeConfig(endpoint, bundledPolicy = newest), store, clock).also { it.bootstrap() }
		assertEquals("newest-manifest", upgraded.bundledPolicyInfo?.manifestRevision)
		val downgraded = testKernel(NativeConfig(endpoint, bundledPolicy = newer), store, clock).also { it.bootstrap() }
		assertEquals("newest-manifest", downgraded.bundledPolicyInfo?.manifestRevision)
	}

	@Test fun `permissive known policy cannot supply implicit grants from a bundle`() {
		val config = NativeConfig(endpoint, bundledPolicy = resource(), overrides = KernelOverrides(country = "US", language = "fr-CA"))
		val core = testKernel(config, InthStore(InMemoryKeyValueStore()), FixedClock(now)).also { it.bootstrap() }
		assertFalse(core.snapshot().policyPending)
		assertEquals("us_permissive", core.snapshot().resolution.policyId)
		assertNull(core.snapshot().explicitChoice)
		ConsentCategory.OPTIONAL.forEach { assertFalse(core.isAllowed(it)) }
	}

}
