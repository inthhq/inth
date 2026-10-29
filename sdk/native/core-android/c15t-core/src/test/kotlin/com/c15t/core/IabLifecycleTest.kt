package com.c15t.core

import com.c15t.core.iab.IabConfiguration
import com.c15t.core.iab.IabListAvailability
import com.c15t.core.model.ConsentCategory
import com.c15t.core.model.ConsentDecision
import com.c15t.core.spi.Clock
import com.c15t.core.spi.TaskExecutor
import com.c15t.core.store.C15tStore
import com.c15t.core.transport.SaveOutcome
import com.c15t.core.transport.TransportOutcome
import java.io.File
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.test.*
import kotlinx.serialization.json.*

class IabLifecycleTest {
	private val vector = Json.parseToJsonElement(
		generateSequence(File(System.getProperty("user.dir"))) { it.parentFile }
			.map { File(it, "native/protocol/iab/commit-cases.json") }
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
		val core = testKernel(config, C15tStore(InMemoryKeyValueStore()), FixedClock(now), transport)
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
		val core = testKernel(config.copy(iabListMaxAgeMs = 60_000), C15tStore(InMemoryKeyValueStore()), clock, http())
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
		val core = testKernel(config.copy(iabListMaxAgeMs = 500), C15tStore(InMemoryKeyValueStore()), clock, http())
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
	fun `invalid backward clock does not turn expiry scheduling into polling`() {
		val repeatedReads = CountDownLatch(100)
		val clock = object : Clock {
			@Volatile var value = now
			override fun nowMillis(): Long {
				if (Thread.currentThread().name == "c15t-deadline") repeatedReads.countDown()
				return value
			}
		}
		val transport = http()
		val core = C15tKernel(config, C15tStore(InMemoryKeyValueStore()), clock, transport, TaskExecutor.DIRECT)
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
	fun `failed retry with unchanged usable disclosure does not invalidate an open draft`() {
		val transport = http()
		val core = testKernel(config, C15tStore(InMemoryKeyValueStore()), FixedClock(now), transport)
		core.bootstrap()
		val draft = assertNotNull(core.openIabDraft())
		transport.respondInit(TransportOutcome.NetworkFailure("offline"))
		core.refresh()
		assertEquals(draft.revision, core.snapshot().revision)
		assertNotNull(core.snapshot().error)
		assertTrue(core.saveIab(draft, emptyMap()).ok)
	}
}
