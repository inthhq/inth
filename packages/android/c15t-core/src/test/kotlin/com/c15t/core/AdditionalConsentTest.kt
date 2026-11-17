package com.c15t.core

import com.c15t.core.iab.*
import com.c15t.core.model.*
import com.c15t.core.spi.*
import com.c15t.core.store.*
import com.c15t.core.tc.*
import com.c15t.core.transport.*
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.test.*
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.*

class AdditionalConsentTest {
	@Serializable data class Case(val id: String, val consented: List<Long>, val purposeConsents: List<Int>, val expected: String)
	@Serializable data class Vector(val now: Long, val configuration: IabConfiguration, val gvl: GlobalVendorList,
		val providers: List<AdTechProvider>, val cases: List<Case>)
	private val file = generateSequence(File(System.getProperty("user.dir"))) { it.parentFile }
		.map { File(it, "packages/native-protocol/iab/additional-consent-cases.json") }.first { it.exists() }
	private val v = Json { ignoreUnknownKeys = true }.decodeFromString<Vector>(file.readText())
	private val config = NativeConfig("https://cmp.example.test", iab = v.configuration)
	private fun response(providers: JsonElement = Json.encodeToJsonElement(v.providers)): TransportOutcome {
		val base = Json.parseToJsonElement(initBody(model = "\"iab\"", gvl = GlobalVendorListJson.toJson(v.gvl))).jsonObject
		return initSuccess(body = JsonObject(base + ("adTechProviders" to providers)).toString())
	}
	private fun boot(store: C15tStore = C15tStore(InMemoryKeyValueStore()), http: RecordingTransport = RecordingTransport()): ConsentCore {
		http.respondInit(response()).respondSave(SaveOutcome.Unavailable("offline"))
		return testKernel(config = config, store = store, transport = http, clock = FixedClock(v.now)).also { it.bootstrap() }
	}

	@Test fun `Google conformance vectors reach actual native outgoing bodies`() {
		for (row in v.cases) {
			assertEquals(row.expected, AdditionalConsent.encode(row.consented, v.providers.map { it.id }, row.purposeConsents))
			val store = C15tStore(InMemoryKeyValueStore())
			val http = RecordingTransport()
			val core = boot(store, http)
			val draft = assertNotNull(core.openIabDraft())
			val choices = draft.choices.copy(purposeConsents = row.purposeConsents, adTechProviderConsents = row.consented)
			assertTrue(core.saveIab(draft.copy(choices = choices), mapOf(ConsentCategory.MARKETING to true)).ok)
			val saved = assertNotNull(core.iabConsent)
			assertEquals(row.expected, saved.addtlConsent, row.id)
			val entry = store.readPending().single()
			val body = assertNotNull(entry.body)
			assertEquals(row.expected, Json.parseToJsonElement(body).jsonObject["addtlConsent"]?.jsonPrimitive?.content)
			assertEquals(body, http.saveRequests.first().body)
			System.getenv("C15T_AC_SAVE_EVIDENCE_DIR")?.let { path ->
				File(path).mkdirs(); File(path, "kotlin-${row.id}.json").writeText(body)
			}
		}
		assertFailsWith<IllegalArgumentException> { AdditionalConsent.encode(listOf(99), listOf(1), listOf(1,3,4)) }
		assertFailsWith<IllegalArgumentException> { AdditionalConsent.encode(listOf(1,1), listOf(1), listOf(1,3,4)) }
		assertFailsWith<IllegalArgumentException> { AdditionalConsent.encode(emptyList(), listOf(0), emptyList()) }
	}

	@Test fun `cold restoration withdrawal rejected write and identity keep AC atomic`() {
		val backend = ACBackend()
		val store = C15tStore(backend)
		val first = boot(store)
		assertTrue(first.save(CommitIntent.All).ok)
		val saved = assertNotNull(first.iabConsent)
		val bytes = backend.read(C15tStoreKeys.SNAPSHOT)
		backend.reject = true
		assertFalse(first.save(CommitIntent.Necessary).ok)
		assertEquals(saved, first.iabConsent)
		assertEquals(bytes, backend.read(C15tStoreKeys.SNAPSHOT))
		backend.reject = false
		val cold = testKernel(config = config, store = C15tStore(backend), clock = FixedClock(v.now), executor = TaskExecutor { })
		cold.bootstrap()
		assertEquals(saved, cold.iabConsent)
		assertTrue(cold.save(CommitIntent.Necessary).ok)
		assertEquals("2~~dv.1.2.3.4.10", cold.iabConsent?.addtlConsent)
		assertEquals("2~~dv.1.2.3.4.10", store.readPending().single().payload.addtlConsent)
		cold.identify(KernelUser("new-user"))
		assertNull(cold.iabConsent)
		assertEquals(1, store.readPending().size)
		cold.reset()
		assertNull(cold.iabConsent)
	}

	@Test fun `list changes invalidate grants drafts and pending bodies`() {
		for (change in listOf("added", "removed", "empty", "invalid")) {
			val store = C15tStore(InMemoryKeyValueStore())
			val http = RecordingTransport()
			val core = boot(store, http)
			assertTrue(core.save(CommitIntent.All).ok)
			val draft = assertNotNull(core.openIabDraft())
			val providers = when (change) {
				"added" -> v.providers + AdTechProvider(99, "New", "https://new.example/privacy")
				"removed" -> v.providers.drop(1)
				"empty" -> emptyList()
				else -> v.providers
			}
			http.respondInit(response(if (change == "invalid") JsonPrimitive("invalid") else Json.encodeToJsonElement(providers)))
			core.refresh()
			assertNull(core.iabConsent, change)
			assertTrue(store.readPending().isEmpty())
			assertEquals("concurrent-change", core.saveIab(draft, emptyMap()).error?.code)
			if (change == "added") {
				assertTrue(core.save(CommitIntent.All).ok)
				assertTrue(core.iabConsent?.addtlConsent?.contains("99") == true)
			}
		}
	}

	@Test fun `stale ATP list cannot restore or replay an AC grant`() {
		val store = C15tStore(InMemoryKeyValueStore())
		val first = boot(store)
		assertTrue(first.save(CommitIntent.All).ok)
		val cold = testKernel(config = config.copy(iabListMaxAgeMs = 1000), store = store, clock = FixedClock(v.now + 1000), executor = TaskExecutor { })
		cold.bootstrap()
		assertNull(cold.iabConsent)
		assertTrue(store.readPending().isEmpty())
		assertEquals(IabListAvailability.STALE, cold.additionalConsentStatus())
	}

	@Test fun `ATP expiry denies hot reads before a refreshed GVL expires`() {
		val clock = FixedClock(v.now)
		val store = C15tStore(InMemoryKeyValueStore())
		val http = RecordingTransport().respondInit(response()).respondSave(SaveOutcome.Unavailable("offline"))
		val core = testKernel(config.copy(iabListMaxAgeMs = 60_000), store, clock, http)
		core.bootstrap()
		assertTrue(core.save(CommitIntent.All).ok)
		clock.advance(30_000)
		http.respondInit(initSuccess(body = initBody(model = "\"iab\"", gvl = GlobalVendorListJson.toJson(v.gvl))))
		core.refresh()
		assertTrue(core.isAllowed(ConsentCategory.MARKETING))
		clock.advance(30_000)
		assertEquals(IabListAvailability.FRESH, core.iabStatus().availability)
		assertEquals(IabListAvailability.STALE, core.additionalConsentStatus())
		assertNull(core.iabConsent)
		assertFalse(core.isAdTechProviderAllowed(v.providers.first().id))
		val denied = core.snapshot()
		assertFalse(denied.effectivePermissions.marketing)
		repeat(100) { assertSame(denied, core.snapshot()) }
		assertFalse(core.isAllowed(ConsentCategory.MARKETING))
		assertEquals(ConsentDecision.DENIED, core.decision(ConsentCategory.MARKETING))
		val permissions = mutableListOf<Boolean>()
		val decisions = mutableListOf<ConsentDecision>()
		val gate = core.gate(ConsentCategory.MARKETING) { permissions += it }
		val decisionGate = core.gateDecision(ConsentCategory.MARKETING) { decisions += it }
		assertEquals(listOf(false), permissions)
		assertEquals(listOf(ConsentDecision.DENIED), decisions)
		gate.close(); decisionGate.close()
	}

	@Test fun `ATP expiry notifies existing gates and only removes queued grants`() {
		for (withdrawal in listOf(false, true)) {
			val clock = FixedClock(v.now)
			val store = C15tStore(InMemoryKeyValueStore())
			val http = RecordingTransport().respondInit(response()).respondSave(SaveOutcome.Unavailable("offline"))
			val core = testKernel(config.copy(iabListMaxAgeMs = 500), store, clock, http)
			core.bootstrap()
			assertTrue(core.save(CommitIntent.All).ok)
			if (withdrawal) assertTrue(core.save(CommitIntent.Necessary).ok)
			val frozen = store.readPending().single().body
			clock.advance(250)
			http.respondInit(initSuccess(body = initBody(model = "\"iab\"", gvl = GlobalVendorListJson.toJson(v.gvl))))
			core.refresh()
			val denied = CountDownLatch(if (withdrawal) 1 else 2)
			val revision = core.snapshot().revision
			val observer: (ConsentSnapshot) -> Unit = { if (it.revision > revision) denied.countDown() }
			val subscription = if (withdrawal) core.onChange(observer) else null
			val gate = if (withdrawal) null else core.gate(ConsentCategory.MARKETING) { if (!it) denied.countDown() }
			val decisionGate = if (withdrawal) null else core.gateDecision(ConsentCategory.MARKETING) { if (it == ConsentDecision.DENIED) denied.countDown() }
			try {
				clock.advance(250)
				assertTrue(denied.await(3, TimeUnit.SECONDS), "ATP expiry must publish without refresh or reads")
				assertEquals(IabListAvailability.FRESH, core.iabStatus().availability)
				assertFalse(core.snapshot().effectivePermissions.marketing)
				assertNull(core.iabConsent)
				assertEquals(if (withdrawal) listOf(frozen) else emptyList(), store.readPending().map { it.body })
			} finally {
				gate?.close(); decisionGate?.close(); subscription?.close()
			}
		}
	}

	@Test fun `failed retry preserves AC snapshot envelope and draft`() {
		val clock = FixedClock(v.now)
		val store = C15tStore(InMemoryKeyValueStore())
		val http = RecordingTransport().respondInit(response()).respondSave(SaveOutcome.Unavailable("offline"))
		val core = testKernel(config, store, clock, http)
		core.bootstrap()
		assertTrue(core.save(CommitIntent.All).ok)
		val draft = assertNotNull(core.openIabDraft())
		val before = core.snapshot()
		val stored = store.readEnvelope()
		val snapshots = mutableListOf<Long>()
		val observer: (ConsentSnapshot) -> Unit = { snapshots += it.revision }
		val subscription = core.onChange(observer)
		val failures = mutableListOf<KernelError>()
		val errorObserver: (KernelError) -> Unit = { failures += it }
		val errors = core.onError(errorObserver)
		http.respondInit(TransportOutcome.NetworkFailure("offline"))
		clock.advance(1_000)
		core.refresh()
		assertSame(before, core.snapshot())
		assertEquals(stored, store.readEnvelope())
		assertTrue(snapshots.isEmpty())
		assertEquals("offline", failures.single().message)
		subscription.close(); errors.close()
		assertTrue(core.saveIab(draft, emptyMap()).ok)
	}

	@Test fun `withdrawal keeps exact AC body across list identity reset and restart`() {
		for (change in listOf("list", "identity", "reset", "expiry")) {
			val store = C15tStore(InMemoryKeyValueStore())
			val http = RecordingTransport()
			val first = boot(store, http)
			assertTrue(first.save(CommitIntent.All).ok)
			assertTrue(first.save(CommitIntent.Necessary).ok)
			val frozen = assertNotNull(store.readPending().single().body)
			when (change) {
				"list" -> { http.respondInit(response(JsonArray(emptyList()))); first.refresh() }
				"identity" -> first.identify(KernelUser("new-owner"))
				"reset" -> first.reset()
			}
			assertEquals(listOf(frozen), store.readPending().map { it.body }, change)
			val online = RecordingTransport()
			val cold = testKernel(config = config, store = store, transport = online,
				clock = FixedClock(v.now + if (change == "expiry") 400 * 86_400_000L else 0))
			cold.bootstrap()
			cold.flushPending()
			assertEquals(listOf(frozen), online.saveRequests.map { it.body }, change)
			assertTrue(store.readPending().isEmpty(), change)
		}
	}

	private class ACBackend: KeyValueStore {
		val entries = mutableMapOf<String, String>()
		var reject = false
		override fun read(key: String) = entries[key]
		override fun write(key: String, value: String?) { if (value == null) entries.remove(key) else entries[key] = value }
		override fun writeDurably(key: String, value: String?): Boolean {
			if (reject && key == C15tStoreKeys.SNAPSHOT) return false
			write(key, value); return true
		}
	}
}
