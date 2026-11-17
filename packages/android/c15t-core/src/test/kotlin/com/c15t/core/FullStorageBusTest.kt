package com.c15t.core

import com.c15t.core.iab.*
import com.c15t.core.model.*
import com.c15t.core.policy.*
import com.c15t.core.store.*
import kotlinx.serialization.json.*
import java.io.File
import java.util.concurrent.*
import com.c15t.core.spi.TaskExecutor
import com.c15t.core.transport.*
import kotlin.test.*

class FullStorageBusTest {
	// TCF-CHECK: T3
	// TCF-CHECK: T4
	@Test fun `independent oracle matches every typed projection row`() {
		val file = generateSequence(File(System.getProperty("user.dir"))) { it.parentFile }
			.map { File(it, "packages/native-protocol/iab/storage-bus-cases.json") }.first { it.exists() }
		for (row in Json.parseToJsonElement(file.readText()).jsonObject["cases"]!!.jsonArray) {
			val r = row.jsonObject
			val saved = IabCommittedConsent(IabConfiguration(53, 7, "GB"), IabChoices(), "sub_test", null,
				"f", 42, 5, 1, 0, 0, r["tcString"]!!.jsonPrimitive.content)
			val policy = EvaluationPolicy("de-1", ConsentModel.IAB, PolicyPrompt.CHOICE,
				listOf(ConsentCategory.MARKETING), ScopeMode.PERMISSIVE, 1000, 1000, choiceFingerprint = "f", noticeFingerprint = "n", policyFingerprint = "p")
			val envelope = SnapshotEnvelope(ConsentSnapshot.denyAll(ConsentSubject("sub_test"), 0).copy(
				policyPending = false, resolution = PolicyResolution(PolicyResolution.STATUS_MATCHED)),
				evaluationPolicy = policy, iabConsent = saved)
			val actual = TcStorageBusProjection.values(envelope)
			assertEquals(r["values"]!!.jsonObject.keys + TcStorageBusKeys.GDPR_APPLIES, actual.keys)
			for ((key, expected) in r["values"]!!.jsonObject) {
				val p = expected.jsonPrimitive
				val typed = if (p.isString) TcBusValue.TextValue(p.content) else TcBusValue.NumberValue(p.int)
				assertEquals(typed, actual[key], "${r["id"]}: $key")
			}
		}
	}
}

class StorageBusLifecycleTest {
	@Test fun `initialization restoration rejected commit expiry and raw repair stay safe`() {
		val config = NativeConfig("https://cmp.example.test", iab = IabConfiguration(53, 7, "GB"))
		val bus = RecordingTcStorageBus()
		val backend = RejectingBusBackend()
		val store = C15tStore(backend, tcStorageBus = bus)
		val clock = FixedClock()
		val http = RecordingTransport().respondInit(initSuccess(body = initBody(model = "\"iab\"", gvl = iabGvl())))
			.respondSave(com.c15t.core.transport.SaveOutcome.Unavailable("offline"))
		val core = testKernel(config = config, store = store, clock = clock, transport = http, executor = com.c15t.core.spi.TaskExecutor { })
		core.bootstrap()
		assertEquals(TcBusValue.NumberValue(53), bus.live[TcStorageBusKeys.CMP_SDK_ID])
		assertNull(bus.live[TcStorageBusKeys.TC_STRING])
		core.refresh()
		// This executor deliberately schedules nothing; use a settled core for committed rows.
		val settled = testKernel(config = config, store = store, clock = clock, transport = http)
		settled.bootstrap()
		assertTrue(settled.save(CommitIntent.All).ok)
		val before = bus.live
		backend.reject = true
		assertFalse(settled.save(CommitIntent.Necessary).ok)
		assertEquals(before, bus.live)
		backend.reject = false
		bus.simulateWipedExternally()
		val cold = testKernel(config = config, store = C15tStore(backend, tcStorageBus = bus), clock = clock,
			executor = com.c15t.core.spi.TaskExecutor { })
		cold.bootstrap()
		assertEquals(before, bus.live)
		bus.simulateWipedExternally()
		cold.rebuildTcStorageBus()
		assertEquals(before, bus.live)
		clock.advance(8 * 86_400_000L)
		cold.rebuildTcStorageBus()
		assertNull(bus.live[TcStorageBusKeys.TC_STRING])
		// Raw-store repair must not bypass the core's current clock and identity checks.
		store.rebuildTcStorageBus()
		assertNull(bus.live[TcStorageBusKeys.TC_STRING])
		backend.reject = true
		val expired = testKernel(config = config, store = C15tStore(backend, tcStorageBus = bus), clock = clock,
			executor = com.c15t.core.spi.TaskExecutor { })
		expired.bootstrap()
		assertNull(bus.live[TcStorageBusKeys.TC_STRING])
		assertNull(expired.iabConsent)
		backend.reject = false
		expired.reset()
		assertEquals(TcBusValue.NumberValue(53), bus.live[TcStorageBusKeys.CMP_SDK_ID])
		assertNull(bus.live[TcStorageBusKeys.TC_STRING])
	}

	private fun iabGvl() = """{"vendorListVersion":42,"tcfPolicyVersion":5,
		"purposes":{"1":{"id":1,"name":"Storage","description":"Storage"}},
		"vendors":{"1":{"id":1,"name":"V1","purposes":[1]}},"specialFeatures":{}}"""
	private class RejectingBusBackend : com.c15t.core.spi.KeyValueStore {
		val memory = InMemoryKeyValueStore()
		var reject = false
		override fun read(key: String) = memory.read(key)
		override fun write(key: String, value: String?) = memory.write(key, value)
		override fun writeDurably(key: String, value: String?): Boolean {
			if (reject) return false
			return memory.writeDurably(key, value)
		}
	}
}


class StorageBusIntegrationTest {
	private val file = generateSequence(File(System.getProperty("user.dir"))) { it.parentFile }
		.map { File(it, "packages/native-protocol/iab/additional-consent-cases.json") }.first { it.exists() }
	private val vector = Json { ignoreUnknownKeys = true }.decodeFromString<AdditionalConsentTest.Vector>(file.readText())
	private val config = NativeConfig("https://cmp.example.test", iab = vector.configuration)
	private fun response(includeProviders: Boolean = true): TransportOutcome {
		val base = Json.parseToJsonElement(initBody(model = "\"iab\"", gvl = com.c15t.core.tc.GlobalVendorListJson.toJson(vector.gvl))).jsonObject
		return initSuccess(body = JsonObject(if (includeProviders) base + ("adTechProviders" to Json.encodeToJsonElement(vector.providers)) else base).toString())
	}

	@Test fun `blocked mirror repair keeps native reads available and orders a following save`() {
		val bus = BlockingBus()
		val store = C15tStore(InMemoryKeyValueStore(), tcStorageBus = bus)
		val core = testKernel(config, store, FixedClock(vector.now),
			RecordingTransport().respondInit(response()).respondSave(SaveOutcome.Unavailable("offline")))
		core.bootstrap()
		assertTrue(core.save(CommitIntent.All).ok)
		val pool = Executors.newCachedThreadPool()
		try {
			bus.armed = true
			val repair = pool.submit { core.rebuildTcStorageBus() }
			assertTrue(bus.entered.await(5, TimeUnit.SECONDS))
			val read = pool.submit {
				core.snapshot(); core.iabConsent; core.isAllowed(ConsentCategory.MARKETING)
				core.isIabAllowed(1, 1, IabLegalBasis.CONSENT)
				core.gate(ConsentCategory.MARKETING) { _ -> }.close()
			}
			val readable = try { read.get(1, TimeUnit.SECONDS); true } catch (_: TimeoutException) { false }
			val withdrawal = pool.submit<CommitResult> { core.save(CommitIntent.Necessary) }
			bus.resume.countDown()
			repair.get(5, TimeUnit.SECONDS)
			assertTrue(withdrawal.get(5, TimeUnit.SECONDS).ok)
			assertTrue(readable, "mirror repair held the state lock while its sink was blocked")
			assertEquals(core.iabConsent?.tcString, (bus.recorded.live[TcStorageBusKeys.TC_STRING] as? TcBusValue.TextValue)?.value)
			assertEquals("2~~dv.1.2.3.4.10", (bus.recorded.live[TcStorageBusKeys.ADDTL_CONSENT] as? TcBusValue.TextValue)?.value)
		} finally { bus.resume.countDown(); pool.shutdownNow() }
	}

	@Test fun `withdrawal replay cannot resurrect expired current-owner TC or AC rows`() {
		val bus = RecordingTcStorageBus()
		val store = C15tStore(InMemoryKeyValueStore(), tcStorageBus = bus)
		val clock = FixedClock(vector.now)
		val http = RecordingTransport().respondInit(response()).respondSave(SaveOutcome.Unavailable("offline"))
		val core = testKernel(config.copy(iabListMaxAgeMs = 60_000), store, clock, http)
		core.bootstrap()
		assertTrue(core.save(CommitIntent.All).ok)
		assertTrue(core.save(CommitIntent.Necessary).ok)
		val frozenWithdrawal = store.readPending().single().body
		core.identify(KernelUser("new-owner"))
		assertTrue(core.save(CommitIntent.All).ok)
		assertEquals(2, store.readPending().size)
		clock.advance(60_000)
		core.rebuildTcStorageBus()
		assertNull(bus.live[TcStorageBusKeys.TC_STRING])
		assertNull(bus.live[TcStorageBusKeys.ADDTL_CONSENT])
		http.respondSave(SaveOutcome.Delivered)
		val sentBefore = http.saveRequests.size
		assertEquals(1, core.flushPending().delivered)
		assertEquals(listOf(frozenWithdrawal), http.saveRequests.drop(sentBefore).map { it.body })
		assertNull(bus.live[TcStorageBusKeys.TC_STRING], "queue completion restored expired authority")
		assertNull(bus.live[TcStorageBusKeys.ADDTL_CONSENT])
	}

	@Test fun `ATP-only expiry clears every decision row without a repair call`() {
		val bus = RecordingTcStorageBus()
		val store = C15tStore(InMemoryKeyValueStore(), tcStorageBus = bus)
		val clock = FixedClock(vector.now)
		val http = RecordingTransport().respondInit(response()).respondSave(SaveOutcome.Unavailable("offline"))
		val core = testKernel(config.copy(iabListMaxAgeMs = 500), store, clock, http)
		core.bootstrap()
		assertTrue(core.save(CommitIntent.All).ok)
		assertNotNull(bus.live[TcStorageBusKeys.TC_STRING])
		assertNotNull(bus.live[TcStorageBusKeys.ADDTL_CONSENT])
		clock.advance(250)
		http.respondInit(response(includeProviders = false))
		core.refresh()
		val denied = CountDownLatch(1)
		val gate = core.gate(ConsentCategory.MARKETING) { if (!it) denied.countDown() }
		try {
			clock.advance(250)
			assertTrue(denied.await(3, TimeUnit.SECONDS))
			assertEquals(IabListAvailability.FRESH, core.iabStatus().availability)
			assertEquals(setOf(TcStorageBusKeys.CMP_SDK_ID, TcStorageBusKeys.CMP_SDK_VERSION,
				TcStorageBusKeys.POLICY_VERSION, TcStorageBusKeys.GDPR_APPLIES), bus.live.keys)
			assertTrue(store.readPending().isEmpty())
		} finally { gate.close() }
	}

	@Test fun `cached offline retry leaves typed bus and durable envelope unchanged`() {
		val bus = RecordingTcStorageBus()
		val store = C15tStore(InMemoryKeyValueStore(), tcStorageBus = bus)
		val clock = FixedClock(vector.now)
		val http = RecordingTransport().respondInit(response()).respondSave(SaveOutcome.Unavailable("offline"))
		val core = testKernel(config, store, clock, http)
		core.bootstrap()
		assertTrue(core.save(CommitIntent.All).ok)
		val before = core.snapshot()
		val stored = store.readEnvelope()
		val rows = bus.live
		val writes = bus.writes
		http.respondInit(TransportOutcome.NetworkFailure("offline"))
		clock.advance(1_000)
		core.refresh()
		assertSame(before, core.snapshot())
		assertEquals(stored, store.readEnvelope())
		assertEquals(rows, bus.live)
		assertEquals(writes, bus.writes)
	}

	@Test fun `ATP expiry during a durable save cannot publish stale TC or AC rows`() {
		for (intent in listOf(CommitIntent.All, CommitIntent.Necessary)) assertSlowWriteExpiry(intent)
	}

	@Test fun `ATP expiry during a durable snapshot write cannot publish stale TC or AC rows`() {
		assertSlowWriteExpiry(null)
	}

	private fun assertSlowWriteExpiry(intent: CommitIntent?) {
		val bus = RecordingTcStorageBus()
		val backend = MutationSerializationTest.BlockingStore()
		val store = C15tStore(backend, tcStorageBus = bus)
		val clock = FixedClock(vector.now)
		val http = RecordingTransport().respondInit(response()).respondSave(SaveOutcome.Unavailable("offline"))
		val core = testKernel(config.copy(iabListMaxAgeMs = 60_000), store, clock, http)
		core.bootstrap()
		if (intent == null) assertTrue(core.save(CommitIntent.All).ok)
		clock.advance(30_000)
		http.respondInit(response(includeProviders = false))
		core.refresh()
		val pool = Executors.newSingleThreadExecutor()
		try {
			backend.armed = true
			val write = pool.submit<Boolean> {
				if (intent != null) core.save(intent).ok else { core.setOverrides(KernelOverrides()); true }
			}
			assertTrue(backend.entered.await(5, TimeUnit.SECONDS))
			clock.advance(30_000)
			backend.resume.countDown()
			assertTrue(write.get(5, TimeUnit.SECONDS))
			assertEquals(IabListAvailability.FRESH, core.iabStatus().availability)
			assertEquals(IabListAvailability.STALE, core.additionalConsentStatus())
			assertFalse(core.snapshot().effectivePermissions.marketing)
			assertNull(core.iabConsent)
			assertNull(bus.live[TcStorageBusKeys.TC_STRING], "write published authority that expired during its durable write")
			assertNull(bus.live[TcStorageBusKeys.ADDTL_CONSENT])
			if (intent == CommitIntent.Necessary) {
				val frozen = store.readPending().single().body
				http.respondSave(SaveOutcome.Delivered)
				val sentBefore = http.saveRequests.size
				assertEquals(1, core.flushPending().delivered)
				assertEquals(listOf(frozen), http.saveRequests.drop(sentBefore).map { it.body })
				assertNull(bus.live[TcStorageBusKeys.TC_STRING])
				assertNull(bus.live[TcStorageBusKeys.ADDTL_CONSENT])
			}
		} finally { backend.resume.countDown(); pool.shutdownNow() }
	}

	private class BlockingBus : TcStorageBusSink {
		val recorded = RecordingTcStorageBus()
		val entered = CountDownLatch(1)
		val resume = CountDownLatch(1)
		@Volatile var armed = false
		override fun write(values: Map<String, TcBusValue>) {
			if (armed) {
				armed = false
				entered.countDown()
				check(resume.await(10, TimeUnit.SECONDS))
			}
			recorded.write(values)
		}
		override fun clear() = recorded.clear()
	}
}
