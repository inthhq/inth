package com.inth.core

import com.inth.core.model.*
import com.inth.core.spi.*
import com.inth.core.store.*
import com.inth.core.tc.*
import com.inth.core.transport.*
import java.io.File
import kotlin.test.*
import kotlinx.serialization.json.*

/** Delivery regressions for native authority. */
class IabDeliveryTest {
	private val fixture =
		generateSequence(File(System.getProperty("user.dir"))) { it.parentFile }
			.map { File(it, "packages/native-protocol/iab/commit-cases.json") }
			.first { it.exists() }
	private val raw = Json.parseToJsonElement(fixture.readText()).jsonObject
	private val vector =
		Json { ignoreUnknownKeys = true }.decodeFromString<IabCommitTest.Vector>(fixture.readText())
	private val config = NativeConfig("https://cmp.example.test", iab = vector.cases[0].configuration)

	private fun gvl(listVersion: Int? = null): String {
		val gvl = raw["gvl"]!!.jsonObject.toMutableMap()
		if (listVersion != null) gvl["vendorListVersion"] = JsonPrimitive(listVersion)
		return JsonObject(gvl).toString()
	}

	private fun init(listVersion: Int? = null) =
		initSuccess(body = initBody(model = "\"iab\"", gvl = gvl(listVersion)))

	@Test
	fun `repro A identify with the unchanged external id wipes IAB consent`() {
		val transport = RecordingTransport().respondInit(init()).respondSave(SaveOutcome.Unavailable("offline"))
		val store = InthStore(InMemoryKeyValueStore())
		val core =
			testKernel(config = config, store = store, transport = transport, clock = FixedClock(vector.now))
				.also { it.bootstrap() }
		core.identify(KernelUser(externalId = "u1"))
		assertTrue(core.save(CommitIntent.All).ok)
		assertNotNull(core.iabConsent, "precondition: committed")
		val pending = store.readPending()
		core.identify(KernelUser(externalId = "u1"))
		assertNotNull(core.iabConsent, "identify with the unchanged external id should not erase consent")
		assertEquals(pending, store.readPending())
	}

	@Test
	fun `repro B an undelivered withdrawal is deleted when the list version changes`() {
		val store = InthStore(InMemoryKeyValueStore())
		val transport =
			RecordingTransport()
				.respondInit(init())
				.respondSave(SaveOutcome.Delivered())
				.respondSave(SaveOutcome.Unavailable("offline"))
		val core =
			testKernel(config = config, store = store, transport = transport, clock = FixedClock(vector.now))
				.also { it.bootstrap() }
		assertTrue(core.save(CommitIntent.All).ok)
		assertTrue(core.save(CommitIntent.Necessary).ok)
		assertEquals(1, store.readPending().size)
		transport.respondInit(init(listVersion = 43)).respondSave(SaveOutcome.Delivered())
		core.refresh()
		val before = transport.saveRequests.size
		core.flushPending()
		val sent = transport.saveRequests.drop(before).any { it.payload.tcString == vector.cases[1].tcString }
		assertTrue(sent, "the committed withdrawal must still reach the backend")
	}
	@Test fun `withdrawal survives invalidation restart and reconnect`() {
		for (change in listOf("list", "expiry", "clock", "config", "model", "fingerprint", "identify", "logout", "reset")) {
			val backend = InMemoryKeyValueStore()
			val store = InthStore(backend)
			val transport = RecordingTransport().respondInit(init()).respondSave(SaveOutcome.Delivered())
			val core = testKernel(config = config, store = store, transport = transport, clock = FixedClock(vector.now))
			core.bootstrap()
			core.identify(KernelUser("u1"))
			assertTrue(core.save(CommitIntent.All).ok)
			transport.respondSave(SaveOutcome.Unavailable("offline"))
			assertTrue(core.save(CommitIntent.Necessary).ok)
			val frozen = assertNotNull(store.readPending().last().body)
			var nextConfig = config
			var now = vector.now
			when (change) {
				"list" -> { transport.respondInit(init(43)); core.refresh() }
				"expiry" -> now += 400 * 86_400_000L
				"clock" -> now -= 600_001
				"config" -> nextConfig = config.copy(iab = config.iab!!.copy(cmpVersion = 8))
				"model" -> { transport.respondInit(initSuccess(body = initBody(model = "\"opt-out\""))); core.refresh() }
				"fingerprint" -> { transport.respondInit(initSuccess(body = initBody(model = "\"iab\"", gvl = gvl()).replace("a".repeat(64), "d".repeat(64)))); core.refresh() }
				"identify" -> core.identify(KernelUser("u2"))
				"logout" -> core.logout()
				"reset" -> core.reset()
			}
			assertTrue(store.readPending().any { it.body == frozen }, change)
			val offline = RecordingTransport().respondSave(SaveOutcome.Unavailable("offline"))
			val cold = testKernel(config = nextConfig, store = InthStore(backend), transport = offline, clock = FixedClock(now))
			cold.bootstrap()
			cold.flushPending()
			assertEquals(1, store.readPending().size, change)
			offline.respondSave(SaveOutcome.Delivered())
			val before = offline.saveRequests.size
			cold.flushPending()
			assertEquals(listOf(frozen), offline.saveRequests.drop(before).map { it.body }, change)
			assertTrue(store.readPending().isEmpty(), change)
		}
	}

	@Test fun `anonymous logout is idempotent`() {
		val store = InthStore(InMemoryKeyValueStore())
		val core = testKernel(config = config, store = store, transport = RecordingTransport().respondInit(init()).respondSave(SaveOutcome.Unavailable("offline")), clock = FixedClock(vector.now))
		core.bootstrap()
		assertTrue(core.save(CommitIntent.All).ok)
		val saved = core.iabConsent
		val pending = store.readPending()
		core.logout()
		assertEquals(saved, core.iabConsent)
		assertEquals(pending, store.readPending())
	}

}
