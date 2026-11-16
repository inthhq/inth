package com.c15t.core

import com.c15t.core.model.*
import com.c15t.core.spi.*
import com.c15t.core.store.*
import com.c15t.core.transport.*
import java.io.File
import kotlin.test.*
import kotlinx.serialization.json.*

/** Cold-launch, queue liveness and policy-transition regressions. */
class FoundationRepairTest {
	private val fixture =
		generateSequence(File(System.getProperty("user.dir"))) { it.parentFile }
			.map { File(it, "native/protocol/iab/commit-cases.json") }
			.first { it.exists() }
	private val raw = Json.parseToJsonElement(fixture.readText()).jsonObject
	private val vector =
		Json { ignoreUnknownKeys = true }.decodeFromString<IabCommitTest.Vector>(fixture.readText())
	private val config = NativeConfig("https://cmp.example.test", iab = vector.cases[0].configuration)
	private fun init() = initSuccess(body = initBody(model = "\"iab\"", gvl = raw["gvl"]!!.jsonObject.toString()))

	@Test
	fun `relaunch then identify same id keeps consent`() {
		val backend = InMemoryKeyValueStore()
		val first = testKernel(config = config, store = C15tStore(backend), transport = RecordingTransport().respondInit(init()), clock = FixedClock(vector.now))
		first.bootstrap()
		first.identify(KernelUser("u1"))
		assertTrue(first.save(CommitIntent.All).ok)
		assertNotNull(first.iabConsent)
		val relaunch = testKernel(config = config, store = C15tStore(backend), transport = RecordingTransport().respondInit(init()), clock = FixedClock(vector.now))
		relaunch.bootstrap()
		val afterHydrate = relaunch.iabConsent
		relaunch.identify(KernelUser("u1"))
		assertNotNull(afterHydrate)
		assertNotNull(relaunch.iabConsent)
	}

	@Test
	fun `repeated refused withdrawals leave room for later actions`() {
		val transport = RecordingTransport().respondInit(init()).respondSave(SaveOutcome.Rejected(400))
		val store = C15tStore(InMemoryKeyValueStore()); val core = testKernel(config = config, store = store, transport = transport, clock = FixedClock(vector.now))
		core.bootstrap()
		repeat(64) {
			assertTrue(core.save(CommitIntent.Necessary).ok)
			assertEquals(1, store.readPending().size)
		}
		transport.respondSave(SaveOutcome.Unavailable("offline"))
		assertTrue(core.save(CommitIntent.All).ok)
		assertEquals(2, store.readPending().size, "a grant cannot cancel an owed denial")
		assertTrue(core.save(CommitIntent.Necessary).ok)
		assertEquals(1, store.readPending().size)
	}

	@Test
	fun `category withdrawal survives switch to IAB`() {
		val store = C15tStore(InMemoryKeyValueStore())
		val transport = RecordingTransport().respondInit(initSuccess(body = initBody(model = "\"opt-in\""))).respondSave(SaveOutcome.Delivered)
		val core = testKernel(config = config, store = store, transport = transport, clock = FixedClock(vector.now))
		core.bootstrap()
		assertTrue(core.save(CommitIntent.All).ok)
		transport.respondSave(SaveOutcome.Unavailable("offline"))
		assertTrue(core.save(CommitIntent.Necessary).ok)
		val queued = store.readPending().single()
		val frozen = assertNotNull(queued.body)
		val client = RecordingHttpClient { HttpResponse(503, emptyMap(), "{}") }
		HostedTransport(client, config.copy(domain = "changed.example.test")).save(queued)
		assertEquals(frozen, client.requests.single().body)
		transport.respondInit(init())
		core.refresh()
		assertEquals(listOf(frozen), store.readPending().map { it.body })
		val online = RecordingTransport().respondSave(SaveOutcome.Delivered)
		val cold = testKernel(config = config, store = store, transport = online, clock = FixedClock(vector.now))
		cold.bootstrap()
		assertEquals(listOf(frozen), online.saveRequests.map { it.body })
	}

	@Test fun `offline repeated denials survive restart with newest exact frozen body`() {
		val backend = InMemoryKeyValueStore()
		val store = C15tStore(backend)
		val transport = RecordingTransport().respondInit(init()).respondSave(SaveOutcome.Unavailable("offline"))
		val core = testKernel(config = config, store = store, transport = transport, clock = FixedClock(vector.now))
		core.bootstrap()
		core.identify(KernelUser("u1"))
		repeat(32) { assertTrue(core.save(CommitIntent.Necessary).ok) }
		val newest = assertNotNull(store.readPending().single().body)
		val cold = testKernel(config = config, store = C15tStore(backend), transport = transport, clock = FixedClock(vector.now))
		cold.bootstrap()
		assertEquals(listOf(newest), store.readPending().map { it.body })
		cold.identify(KernelUser("u1"))
		assertNotNull(cold.iabConsent)
		cold.logout()
		val loggedOut = testKernel(config = config, store = C15tStore(backend), clock = FixedClock(vector.now))
		loggedOut.bootstrap()
		assertNull(loggedOut.snapshot().subject?.externalId)
		assertNull(loggedOut.iabConsent)
	}

	@Test fun `frozen subject owner and domain remain separate at capacity`() {
		val store = C15tStore(InMemoryKeyValueStore())
		val transport = RecordingTransport().respondInit(init()).respondSave(SaveOutcome.Unavailable("offline"))
		val core = testKernel(config = config, store = store, transport = transport, clock = FixedClock(vector.now))
		core.bootstrap()
		assertTrue(core.save(CommitIntent.Necessary).ok)
		val original = store.readPending().single()
		val envelope = store.readEnvelope()!!
		store.writePending(emptyList())
		fun entry(owner: Int, domain: Int, subject: String = original.payload.subjectId, time: Long = vector.now): QueuedSave {
			val frozen = Json.parseToJsonElement(original.body!!).jsonObject.toMutableMap()
			frozen["externalSubjectId"] = JsonPrimitive("u$owner")
			frozen["domain"] = JsonPrimitive("d$domain.example.test")
			frozen["subjectId"] = JsonPrimitive(subject)
			frozen["givenAt"] = JsonPrimitive(time)
			return original.copy(id = "$owner-$domain-$subject-$time", body = JsonObject(frozen).toString(),
				payload = original.payload.copy(subjectId = subject, givenAt = time,
					subject = original.payload.subject.copy(id = subject, externalId = "u$owner")))
		}
		val entries = (0 until 20).map { entry(it / 2, it % 2) }
		for (queued in entries) assertTrue(store.commit(envelope, queued))
		val newest = entry(0, 0, time = vector.now + 1)
		assertTrue(store.commit(envelope, newest))
		val expected = entries.drop(1) + newest
		assertEquals(expected, store.readPending())
		assertFalse(store.commit(envelope, entry(10, 0)))
		assertFalse(store.commit(envelope, entry(0, 0, subject = "sub_other")))
		assertEquals(expected, store.readPending())
	}

	@Test fun `IAB configuration or owed withdrawals do not wipe category consent on identify`() {
		for (configured in listOf(true, false)) {
			val store = C15tStore(InMemoryKeyValueStore())
			val transport = RecordingTransport().respondInit(initSuccess(body = initBody(model = "\"opt-in\"")))
				.respondSave(SaveOutcome.Unavailable("offline"))
			val core = testKernel(config = config.copy(iab = if (configured) config.iab else null, consentCategories = ConsentCategory.entries.toList()), store = store,
				transport = transport, clock = FixedClock(vector.now))
			core.bootstrap()
			assertTrue(core.save(CommitIntent.Necessary).ok)
			val withdrawal = store.readPending().single()
			assertTrue(core.save(CommitIntent.All).ok)
			core.identify(KernelUser("u1"))
			assertNotNull(core.snapshot().explicitChoice)
			assertTrue(core.isAllowed(ConsentCategory.MARKETING))
			assertTrue(store.readPending().any { it.body == withdrawal.body })
		}
	}

	@Test fun `category grant is not protected when policy becomes IAB`() {
		val store = C15tStore(InMemoryKeyValueStore())
		val transport = RecordingTransport().respondInit(initSuccess(body = initBody(model = "\"opt-in\"")))
			.respondSave(SaveOutcome.Unavailable("offline"))
		val core = testKernel(config = config.copy(consentCategories = ConsentCategory.entries.toList()),
			store = store, transport = transport, clock = FixedClock(vector.now))
		core.bootstrap()
		assertTrue(core.save(CommitIntent.All).ok)
		assertFalse(store.readPending().single().isWithdrawal())
		transport.respondInit(init())
		core.refresh()
		assertTrue(store.readPending().isEmpty())
	}
}
