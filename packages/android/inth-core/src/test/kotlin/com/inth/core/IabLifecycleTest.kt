package com.inth.core

import com.inth.core.iab.IabConfiguration
import com.inth.core.iab.IabListAvailability
import com.inth.core.model.ConsentCategory
import com.inth.core.model.ConsentDecision
import com.inth.core.model.KernelError
import com.inth.core.spi.Clock
import com.inth.core.spi.TaskExecutor
import com.inth.core.store.InthStore
import com.inth.core.transport.SaveOutcome
import com.inth.core.transport.TransportOutcome
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.test.*
import kotlinx.serialization.json.*

class IabLifecycleTest {
	private val vector = Json.parseToJsonElement(
		generateSequence(File(System.getProperty("user.dir"))) { it.parentFile }
			.map { File(it, "packages/native-protocol/iab/commit-cases.json") }
			.first { it.exists() }.readText()
	).jsonObject
	private val now = vector.getValue("now").jsonPrimitive.long
	private val config = NativeConfig("https://cmp.example.test", iab = Json { ignoreUnknownKeys = true }.decodeFromJsonElement<IabConfiguration>(
		vector.getValue("cases").jsonArray.first().jsonObject.getValue("configuration")))
	private val gvl = vector.getValue("gvl").toString()

	private fun http() = RecordingTransport()
		.respondInit(initSuccess(body = initBody(model = "\"iab\"", gvl = gvl)))
		.respondSave(SaveOutcome.Unavailable("offline"))

	@Test
	fun `reset followed by listless init cannot open an IAB draft`() {
		val transport = http()
		val core = testKernel(config, InthStore(InMemoryKeyValueStore()), FixedClock(now), transport)
		core.bootstrap()
		assertNotNull(core.openIabDraft())
		transport.respondInit(initSuccess(body = initBody(model = "\"iab\"")))
		core.reset()
		assertEquals(IabListAvailability.MISSING, core.iabStatus().availability)
		assertNull(core.openIabDraft())
	}

	@Test
	fun `expired list hot reads keep snapshot identity and every initial gate denies`() {
		val clock = FixedClock(now)
		val core = testKernel(config.copy(iabListMaxAgeMs = 60_000), InthStore(InMemoryKeyValueStore()), clock, http())
		core.bootstrap()
		assertTrue(core.save(CommitIntent.All).ok)
		clock.advance(60_000)
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

	@Test
	fun `existing gates receive list expiry without a host mutation`() {
		val clock = FixedClock(now)
		val core = testKernel(config.copy(iabListMaxAgeMs = 500), InthStore(InMemoryKeyValueStore()), clock, http())
		core.bootstrap()
		assertTrue(core.save(CommitIntent.All).ok)
		val denied = CountDownLatch(2)
		val gate = core.gate(ConsentCategory.MARKETING) { if (!it) denied.countDown() }
		val decisionGate = core.gateDecision(ConsentCategory.MARKETING) { if (it == ConsentDecision.DENIED) denied.countDown() }
		clock.advance(500)
		assertTrue(denied.await(3, TimeUnit.SECONDS), "Existing gates must receive expiry without refresh or reads")
		assertFalse(core.snapshot().effectivePermissions.marketing)
		gate.close(); decisionGate.close()
	}

	@Test
	fun `list expiry keeps consent dormant until an identical disclosure refreshes`() {
		val clock = FixedClock(now)
		val store = InthStore(InMemoryKeyValueStore())
		val transport = http()
		val core = testKernel(config.copy(iabListMaxAgeMs = 100), store, clock, transport)
		core.bootstrap()
		assertTrue(core.save(CommitIntent.All).ok)
		val saved = assertNotNull(core.iabConsent)
		val choice = assertNotNull(core.snapshot().explicitChoice)
		val queued = store.readPending().single()
		val expired = CountDownLatch(1)
		val values = mutableListOf<Boolean>()
		val gate = core.gate(ConsentCategory.MARKETING) {
			values += it
			if (!it) expired.countDown()
		}
		clock.advance(100)
		assertTrue(expired.await(3, TimeUnit.SECONDS))
		assertNull(core.iabConsent)
		assertNull(core.openIabDraft())
		assertFalse(core.isAllowed(ConsentCategory.MARKETING))
		assertEquals(saved, store.readEnvelope()?.iabConsent)
		assertEquals(choice, core.snapshot().explicitChoice)
		val sends = transport.saveRequests.size
		assertEquals(0, core.flushPending().delivered)
		assertEquals(sends, transport.saveRequests.size)
		assertEquals(queued, store.readPending().single())
		core.refresh()
		assertEquals(saved, core.iabConsent)
		assertEquals(choice, core.snapshot().explicitChoice)
		assertTrue(core.isAllowed(ConsentCategory.MARKETING))
		assertEquals(listOf(true, false, true), values)
		assertEquals(queued.body, store.readPending().single().body)
		transport.respondSave(SaveOutcome.Delivered())
		assertEquals(1, core.flushPending().delivered)
		assertEquals(queued.body, transport.saveRequests.last().body)
		assertTrue(store.readPending().isEmpty())
		gate.close()
	}

	@Test
	fun `stale cold launch keeps source consent and resumes only after a matching refresh`() {
		for (changed in listOf(false, true)) {
			val clock = FixedClock(now)
			val store = InthStore(InMemoryKeyValueStore())
			val first = testKernel(config, store, clock, http())
			first.bootstrap()
			assertTrue(first.save(CommitIntent.All).ok)
			val saved = assertNotNull(first.iabConsent)
			val queued = store.readPending().single()
			clock.advance(1_000)
			val transport = RecordingTransport().respondInit(TransportOutcome.NetworkFailure("offline"))
				.respondSave(SaveOutcome.Unavailable("offline"))
			val cold = testKernel(config.copy(iabListMaxAgeMs = 1_000), store, clock, transport)
			cold.bootstrap()
			assertEquals(IabListAvailability.STALE, cold.iabStatus().availability)
			assertFalse(cold.isAllowed(ConsentCategory.MARKETING))
			assertEquals(saved, store.readEnvelope()?.iabConsent)
			assertEquals(queued, store.readPending().single())
			assertTrue(transport.saveRequests.isEmpty())
			val refreshed = if (changed) JsonObject(vector.getValue("gvl").jsonObject +
				("vendorListVersion" to JsonPrimitive(43))).toString() else gvl
			transport.respondInit(initSuccess(body = initBody(model = "\"iab\"", gvl = refreshed)))
			cold.refresh()
			if (changed) {
				assertNull(cold.iabConsent)
				assertNull(cold.snapshot().explicitChoice)
				assertTrue(store.readPending().isEmpty())
				assertFalse(cold.isAllowed(ConsentCategory.MARKETING))
			} else {
				assertEquals(saved, cold.iabConsent)
				assertTrue(cold.isAllowed(ConsentCategory.MARKETING))
				assertEquals(queued.body, store.readPending().single().body)
			}
		}
	}

	@Test
	fun `choice expiry while the list is stale cannot be revived by an identical refresh`() {
		val clock = FixedClock(now)
		val store = InthStore(InMemoryKeyValueStore())
		val transport = RecordingTransport().respondInit(
			initSuccess(body = initBody(model = "\"iab\"", choiceMs = 1_000, gvl = gvl)))
			.respondSave(SaveOutcome.Unavailable("offline"))
		val core = testKernel(config.copy(iabListMaxAgeMs = 100), store, clock, transport)
		core.bootstrap()
		assertTrue(core.save(CommitIntent.All).ok)
		clock.advance(1_000)
		core.refresh()
		assertEquals(IabListAvailability.FRESH, core.iabStatus().availability)
		assertNull(core.iabConsent)
		assertNull(core.snapshot().explicitChoice)
		assertFalse(core.isAllowed(ConsentCategory.MARKETING))
		assertTrue(store.readPending().isEmpty())
	}

	@Test
	fun `invalid backward clock does not turn expiry scheduling into polling`() {
		val repeatedReads = CountDownLatch(100)
		val clock = object : Clock {
			@Volatile var value = now
			override fun nowMillis(): Long {
				if (Thread.currentThread().name == "inth-deadline") repeatedReads.countDown()
				return value
			}
		}
		val transport = http()
		val core = ConsentCore(config, InthStore(InMemoryKeyValueStore()), clock, transport, TaskExecutor.DIRECT)
		core.bootstrap()
		assertTrue(core.save(CommitIntent.All).ok)
		transport.respondInit(TransportOutcome.NetworkFailure("offline"))
		clock.value = Long.MIN_VALUE
		try {
			core.refresh()
			assertFalse(core.isAllowed(ConsentCategory.MARKETING))
			assertFalse(repeatedReads.await(200, TimeUnit.MILLISECONDS), "Invalid time must not spin the deadline worker")
		} finally {
			clock.value = now
			core.refresh()
		}
	}

	@Test
	fun `failed retry preserves snapshot and draft while reporting transport error`() {
		val transport = http()
		val clock = FixedClock(now)
		val store = InthStore(InMemoryKeyValueStore())
		val core = testKernel(config, store, clock, transport)
		core.bootstrap()
		val draft = assertNotNull(core.openIabDraft())
		val before = core.snapshot()
		val stored = store.readEnvelope()
		val snapshots = mutableListOf<Long>()
		val snapshotObserver: (com.inth.core.model.ConsentSnapshot) -> Unit = { snapshots += it.revision }
		val snapshotSubscription = core.onChange(snapshotObserver)
		val failures = mutableListOf<KernelError>()
		val errorObserver: (KernelError) -> Unit = { failures += it }
		val errorSubscription = core.onError(errorObserver)
		transport.respondInit(TransportOutcome.NetworkFailure("offline"))
		clock.advance(1_000)
		core.refresh()
		assertSame(before, core.snapshot())
		assertEquals(stored, store.readEnvelope())
		assertTrue(snapshots.isEmpty(), "Unchanged authority must not publish an unchanged revision")
		assertEquals(1, failures.size)
		assertEquals("offline", failures.single().message)
		snapshotSubscription.close()
		errorSubscription.close()
		assertTrue(core.saveIab(draft, emptyMap()).ok)
	}
}
