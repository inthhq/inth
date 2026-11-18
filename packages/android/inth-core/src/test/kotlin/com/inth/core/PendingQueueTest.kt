package com.inth.core

import com.inth.core.model.ConsentAction
import com.inth.core.model.ConsentCategory
import com.inth.core.model.ConsentSnapshot
import com.inth.core.model.ConsentSubject
import com.inth.core.model.ConfirmedCoverage
import com.inth.core.model.SavePayload
import com.inth.core.store.InthStore
import com.inth.core.store.InthStoreKeys
import com.inth.core.store.PendingSaveQueue
import com.inth.core.transport.InthProtocol
import com.inth.core.transport.HostedTransport
import com.inth.core.transport.SaveOutcome
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * The write queue: persist first, replay unchanged, cap at the newest 20.
 */
class PendingQueueTest {
	private val json = Json { ignoreUnknownKeys = true }

	@Test
	fun `save persists the payload before the network call`() {
		val timeline = mutableListOf<String>()
		val backend = InMemoryKeyValueStore(eventLog = timeline)
		val transport = RecordingTransport(timeline).respondSave(SaveOutcome.Unavailable("offline"))
		val kernel = testKernel(store = InthStore(backend), transport = transport)
		kernel.bootstrap()
		val writesBeforeSave = timeline.size

		val result = kernel.save(CommitIntent.All)

		assertTrue(result.ok)
		assertFalse(result.delivered, "an unreachable backend must not fail the commit")
		assertTrue(result.queued)

		val events = timeline.drop(writesBeforeSave)
		val snapshotWrite = events.indexOf("write:${InthStoreKeys.SNAPSHOT}")
		val networkCall = events.indexOf("network:save")
		assertTrue(snapshotWrite >= 0, "the decision and payload must reach disk, got: $events")
		assertTrue(networkCall >= 0, "the transport must be consulted")
		assertTrue(snapshotWrite < networkCall, "the atomic write must precede the request, got: $events")

		val queued = transport.saveRequests.single().payload
		assertEquals(4, queued.confirmed.categories.size)
		assertTrue(queued.confirmed.categories.values.all { it })
		assertEquals(queued.givenAt, queued.confirmed.actionAt, "one action time, reused everywhere")
	}

	@Test
	fun `a payload is replayed unchanged after a simulated failure`() {
		val transport = RecordingTransport().respondSave(SaveOutcome.Unavailable("offline"))
		val kernel = testKernel(store = InthStore(InMemoryKeyValueStore()), transport = transport)
		kernel.bootstrap()
		kernel.save(CommitIntent.Custom(mapOf(ConsentCategory.MEASUREMENT to true)))

		val attempted = transport.saveRequests.single()
		// Compared on the payload, not the queue row: the row carries how many times these
		// bytes have already been tried, which is bookkeeping this build writes and the
		// backend never sees.
		val before = json.encodeToString(attempted.payload)

		transport.respondSave(SaveOutcome.Delivered())
		val flushed = kernel.flushPending()

		assertEquals(1, flushed.delivered)
		assertEquals(0, flushed.remaining)
		val replayed = transport.saveRequests.last()
		assertEquals(
			before,
			json.encodeToString(replayed.payload),
			"a replay resubmits identical receipts, including the original action time",
		)
		assertEquals(attempted.id, replayed.id, "the same queue entry, not a rebuilt one")
		assertTrue(kernel.snapshot().explicitChoice?.consents?.get("measurement") == true)
	}

	@Test
	fun `two payloads queued back to back fly oldest first, unchanged`() {
		// A device that commits twice with no network is the common case -- accept on
		// the banner, then tune purposes -- and it is where a queue goes wrong: sending
		// only the newest, or rebuilding a payload from the state of the moment, both
		// leave the audit trail describing a choice nobody made.
		val transport = RecordingTransport().respondSave(SaveOutcome.Unavailable("offline"))
		val kernel = testKernel(store = InthStore(InMemoryKeyValueStore()), transport = transport)
		kernel.bootstrap()

		kernel.save(CommitIntent.Custom(mapOf(ConsentCategory.MEASUREMENT to true)))
		kernel.save(CommitIntent.Custom(mapOf(ConsentCategory.MEASUREMENT to false, ConsentCategory.MARKETING to true)))

		assertEquals(2, transport.saveRequests.size, "both commits must be queued, not superseded")
		val attempted = transport.saveRequests.map { json.encodeToString(it.payload) }

		transport.respondSave(SaveOutcome.Delivered())
		val flushed = kernel.flushPending()

		assertEquals(2, flushed.delivered)
		assertEquals(0, flushed.remaining)
		assertEquals(
			attempted,
			transport.saveRequests.drop(2).map { json.encodeToString(it.payload) },
			"both arrive, in the order they were made, with the receipts they were queued with",
		)
		assertFalse(
			kernel.snapshot().explicitChoice?.consents?.get("measurement") == true,
			"the newer commit still wins locally",
		)
	}

	@Test
	fun `a newer init does not rewrite a queued payload`() {
		val transport = RecordingTransport().respondSave(SaveOutcome.Unavailable("offline"))
		val kernel = testKernel(store = InthStore(InMemoryKeyValueStore()), transport = transport)

		// The first policy resolves, the subject accepts, and the write cannot fly.
		transport.respondInit(
			initSuccess(
				body = initBody(
					policyId = "us-ca",
					policySnapshotToken = "token-old",
					choiceFingerprint = "choice-fp-old",
					policyFingerprint = "policy-fp-old",
				),
			)
		)
		kernel.bootstrap()
		kernel.save(CommitIntent.All)

		val queued = transport.saveRequests.single()
		val before = json.encodeToString(queued.payload)
		assertEquals("token-old", queued.payload.policySnapshotToken)
		assertEquals("choice-fp-old", assertNotNull(queued.payload.choice?.fingerprint))
		assertEquals("us-ca", queued.payload.decisionInputs?.policyId)

		// A later init replaces everything the queued payload was built against.
		transport.respondInit(
			initSuccess(
				body = initBody(
					policyId = "eu-standard",
					model = "\"opt-out\"",
					scope = """["measurement"]""",
					scopeMode = "\"strict\"",
					policySnapshotToken = "token-new",
					choiceFingerprint = "choice-fp-new",
					policyFingerprint = "policy-fp-new",
				),
			)
		)
		kernel.refresh()
		assertEquals("eu-standard", kernel.snapshot().resolution.policyId)
		assertEquals("token-new", kernel.snapshot().policySnapshotToken)

		transport.respondSave(SaveOutcome.Delivered())
		assertEquals(1, kernel.flushPending().delivered)

		val replayed = transport.saveRequests.last().payload
		assertEquals(
			before,
			json.encodeToString(transport.saveRequests.last().payload),
			"a queued payload is immutable",
		)
		assertEquals("token-old", replayed.policySnapshotToken, "the new token must not leak into the old write")
		assertEquals("choice-fp-old", replayed.choice?.fingerprint)
		assertEquals("us-ca", replayed.decisionInputs?.policyId)
	}

	@Test
	fun `the queue keeps the newest twenty payloads and drops the oldest`() {
		val store = InthStore(InMemoryKeyValueStore())
		val queue = PendingSaveQueue(store, limit = 20, idGenerator = idsFrom(1))
		repeat(25) { queue.enqueue(payloadFor(it), 1_700_000_000_000L + it) }

		val pending = queue.pending()
		assertEquals(20, pending.size)
		assertEquals("00000006-0000-4000-8000-000000000000", pending.first().id, "oldest dropped first")
		assertEquals("00000025-0000-4000-8000-000000000000", pending.last().id)
	}

	@Test
	fun `a save through the hosted transport sends the v1 body`() {
		val http = RecordingHttpClient { responseFor(it) }
		val kernel = testKernel(
			store = InthStore(InMemoryKeyValueStore()),
			transport = HostedTransport(http, NativeConfig(backendUrl = "https://test.inth.app/")),
		)
		kernel.bootstrap()
		kernel.save(CommitIntent.All)

		assertEquals(
			listOf("GET https://test.c15t.app/v1/consent/init", "POST https://test.c15t.app/v1/consent/records"),
			http.requests.map { "${it.method} ${it.url}" },
		)
		for (request in http.requests) {
			assertEquals("android->${InthProtocol.DEFAULT_SDK_VERSION}", request.headers[InthProtocol.PLATFORM_HEADER])
		}

		val save = http.requests.last()
		val body = json.parseToJsonElement(requireNotNull(save.body)).jsonObject
		assertEquals("test.c15t.app", body["property"]?.jsonPrimitive?.content, "property falls back to the host")
		assertEquals("all", body["consentAction"]?.jsonPrimitive?.content)
		assertEquals("opt-in", body["model"]?.jsonPrimitive?.content)
		assertEquals("snap-1", body["policySnapshotToken"]?.jsonPrimitive?.content)
		assertTrue(SubjectIdGenerator.isUuidV7(body["idempotencyKey"]!!.jsonPrimitive.content))
		assertEquals(
			setOf(
				"answer",
				"confirmed",
				"consentAction",
				"givenAt",
				"idempotencyKey",
				"model",
				"policySnapshotToken",
				"property",
				"subjectId",
				"uiSource",
			),
			body.keys,
		)
	}

	@Test
	fun `a replay sends the idempotency key the action made`() {
		val backend = InMemoryKeyValueStore()
		val first = testKernel(
			store = InthStore(backend),
			transport = RecordingTransport().respondInit(initSuccess()).respondSave(SaveOutcome.Unavailable("offline")),
		)
		first.bootstrap()
		assertTrue(first.save(CommitIntent.Custom(mapOf(ConsentCategory.MARKETING to true))).ok)
		assertTrue(first.save(CommitIntent.All).ok)
		val queued = InthStore(backend).readPending()
		val keys = queued.map { assertNotNull(it.payload.idempotencyKey) }
		assertEquals(2, keys.distinct().size, "one key per action")
		for (entry in queued) {
			assertTrue(SubjectIdGenerator.isUuidV7(entry.payload.idempotencyKey!!))
			val frozen = json.parseToJsonElement(assertNotNull(entry.body)).jsonObject
			assertEquals(entry.payload.idempotencyKey, frozen["idempotencyKey"]?.jsonPrimitive?.content)
		}

		val http = RecordingHttpClient { request -> responseFor(request) }
		testKernel(store = InthStore(backend), transport = HostedTransport(http, TEST_CONFIG)).bootstrap()
		val sent = http.requests.filter { it.url.endsWith("/v1/consent/records") }
		assertEquals(queued.map { it.body }, sent.map { it.body }, "replays send the frozen bytes, key included")
	}

	@Test
	fun `requests report the platform the config names`() {
		fun platformHeaders(platform: String?): List<String?> {
			val http = RecordingHttpClient { responseFor(it) }
			val kernel = testKernel(
				store = InthStore(InMemoryKeyValueStore()),
				transport = HostedTransport(
					http,
					NativeConfig(backendUrl = "https://test.inth.app", sdkVersion = "9.9.9", platform = platform),
				),
			)
			kernel.bootstrap()
			kernel.save(CommitIntent.All)
			assertTrue(http.requests.size >= 2, "an init and a save were sent")
			return http.requests.map { it.headers[InthProtocol.PLATFORM_HEADER] }.distinct()
		}

		// ENG-530: a React Native host reports `rn`, a Kotlin host `android`.
		assertEquals(listOf("rn->9.9.9"), platformHeaders(InthProtocol.PLATFORM_REACT_NATIVE))
		assertEquals(listOf("android->9.9.9"), platformHeaders(InthProtocol.PLATFORM_ANDROID))
		assertEquals(listOf<String?>(null), platformHeaders(null))
	}

	private fun payloadFor(index: Int) = SavePayload(
		subjectId = "subject-1",
		subject = ConsentSubject(id = "subject-1"),
		choice = null,
		confirmed = ConfirmedCoverage(mapOf("measurement" to true), 1_700_000_000_000L + index),
		consents = ConsentSnapshot().effectivePermissions,
		overrides = ConsentSnapshot().overrides,
		user = null,
		model = ConsentSnapshot().model,
		uiSource = ConsentSnapshot().activeUI,
		consentAction = ConsentAction.CUSTOM,
		policySnapshotToken = null,
		givenAt = 1_700_000_000_000L + index,
	)

	private fun idsFrom(start: Int): () -> String {
		var next = start - 1
		return {
			next += 1
			"%08d-0000-4000-8000-000000000000".format(next)
		}
	}

	private fun responseFor(request: com.inth.core.spi.HttpRequest) = when {
		request.url.endsWith("/v1/consent/init") -> com.inth.core.spi.HttpResponse(status = 200, body = initBody())

		else -> com.inth.core.spi.HttpResponse(status = 200, body = "{}")
	}
}
