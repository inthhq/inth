package com.inth.core

import com.inth.core.model.ActiveUI
import com.inth.core.model.ConsentCategory
import com.inth.core.model.ConsentSnapshot
import com.inth.core.model.ConsentSubject
import com.inth.core.model.KernelError
import com.inth.core.model.KernelOverrides
import com.inth.core.model.KernelUser
import com.inth.core.model.LiftOptOutPayload
import com.inth.core.model.OptOutActKind
import com.inth.core.model.OptOutHolder
import com.inth.core.model.OptOutMethod
import com.inth.core.model.OptOutPayload
import com.inth.core.model.OptOutRecord
import com.inth.core.model.OptOutRight
import com.inth.core.spi.HttpResponse
import com.inth.core.spi.TaskExecutor
import com.inth.core.store.InthJson
import com.inth.core.store.InthStore
import com.inth.core.store.InthStoreKeys
import com.inth.core.store.SnapshotEnvelope
import com.inth.core.transport.HostedTransport
import com.inth.core.transport.InthProtocol
import com.inth.core.transport.LiftOptOutOutcome
import com.inth.core.transport.LinkOutcome
import com.inth.core.transport.OptOutOutcome
import com.inth.core.transport.SaveOutcome
import com.inth.core.transport.TransportOutcome
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Network sync, offline queue, failure classification, answer fencing and wire parsing
 * for durable opt-out records. Mirrors `opt-out-sync.test.ts` and the opt-out cases in
 * `transports/v1/__tests__/records.test.ts` in `packages/sdk/core`.
 */
class OptOutSyncTest {
	private val json = Json { ignoreUnknownKeys = true; explicitNulls = true }

	private fun optOutInit(
		scope: String = """["experience","functionality","marketing","measurement"]""",
		prompt: String = "\"none\"",
		gpcDenyCategories: String = """["marketing","measurement"]""",
		policySnapshotToken: String? = "snapshot-token",
		country: String = "US",
		region: String = "CA",
		model: String = "\"opt-out\"",
	): TransportOutcome {
		val base = json.parseToJsonElement(
			initBody(
				policyId = "us-ca-opt-out",
				model = model,
				prompt = prompt,
				scope = scope,
				scopeMode = "\"permissive\"",
				gpcDenyCategories = gpcDenyCategories,
				policySnapshotToken = policySnapshotToken,
			),
		).jsonObject
		val withLocation = JsonObject(
			base + ("location" to JsonObject(
				mapOf(
					"countryCode" to JsonPrimitive(country),
					"regionCode" to JsonPrimitive(region),
				),
			)),
		)
		return TransportOutcome.Success(withLocation, emptyMap())
	}

	private fun optOutInitBodyJson(
		policySnapshotToken: String? = "snapshot-token",
		gpcDenyCategories: String = """["marketing","measurement"]""",
	): String = (optOutInit(
		policySnapshotToken = policySnapshotToken,
		gpcDenyCategories = gpcDenyCategories,
	) as TransportOutcome.Success).body.toString()

	private fun seedSubject(backend: InMemoryKeyValueStore, subjectId: String = SUBJECT) {
		backend.putSilently(
			InthStoreKeys.SUBJECT,
			InthJson.storage.encodeToString(ConsentSubject.serializer(), ConsentSubject(id = subjectId)),
		)
	}

	private fun seedOptOut(
		backend: InMemoryKeyValueStore,
		record: OptOutRecord,
		subjectId: String = SUBJECT,
	) {
		seedSubject(backend, subjectId)
		backend.putSilently(
			InthStoreKeys.SNAPSHOT,
			InthJson.storage.encodeToString(
				SnapshotEnvelope.serializer(),
				SnapshotEnvelope(
					snapshot = ConsentSnapshot(
						subject = ConsentSubject(id = subjectId),
						optOut = record,
					),
				),
			),
		)
	}

	// -- Queueing, replay and wire body --------------------------------------

	@Test
	fun `optOut sends one request with a UUID key and no rights, queues on failure, and replays across a restart with the same key`() {
		val backend = InMemoryKeyValueStore()
		seedSubject(backend)
		val clock = FixedClock(NOW)
		val firstHttp = RecordingHttpClient { request ->
			if (request.url.endsWith(InthProtocol.INIT_PATH)) {
				HttpResponse(200, emptyMap(), optOutInitBodyJson())
			} else {
				throw java.io.IOException("offline")
			}
		}
		val firstConfig = TEST_CONFIG.copy(property = "com.example.app")
		val first = testKernel(
			config = firstConfig,
			store = InthStore(backend),
			clock = clock,
			transport = HostedTransport(firstHttp, firstConfig, clock),
		)
		first.bootstrap()

		val result = first.optOut()
		assertTrue(result.ok)
		assertTrue(result.changed)
		assertEquals(
			OptOutRecord(emptyList(), OptOutMethod.BUTTON, NOW, OptOutHolder.DEVICE),
			first.snapshot().optOut,
		)
		assertFalse(first.isAllowed(ConsentCategory.MARKETING))
		assertFalse(first.isAllowed(ConsentCategory.MEASUREMENT))

		val optOutPosts = firstHttp.requests.filter { it.url.endsWith(InthProtocol.OPT_OUTS_PATH) }
		assertEquals(1, optOutPosts.size)
		val firstBody = json.parseToJsonElement(requireNotNull(optOutPosts.single().body)).jsonObject
		val key = requireNotNull(firstBody["idempotencyKey"]?.jsonPrimitive?.content)
		assertTrue(SubjectIdGenerator.isUuidV7(key), "idempotencyKey must be a UUID: $key")
		assertFalse("rights" in firstBody, "rights must never be sent: $firstBody")
		assertEquals("button", firstBody["method"]?.jsonPrimitive?.content)
		assertEquals(SUBJECT, firstBody["subjectId"]?.jsonPrimitive?.content)
		assertEquals("com.example.app", firstBody["property"]?.jsonPrimitive?.content)
		assertEquals("snapshot-token", firstBody["policySnapshotToken"]?.jsonPrimitive?.content)
		assertEquals(NOW, firstBody["givenAt"]?.jsonPrimitive?.long)

		val queued = InthStore(backend).readPendingOptOuts()
		assertEquals(1, queued.size)
		assertEquals(key, queued.single().idempotencyKey)
		assertEquals(OptOutActKind.RECORD, queued.single().kind)

		// Process restart over the same store replays with the exact same key and applies the answer.
		val replayHttp = RecordingHttpClient { request ->
			when {
				request.url.endsWith(InthProtocol.INIT_PATH) ->
					HttpResponse(200, emptyMap(), optOutInitBodyJson())

				request.url.endsWith(InthProtocol.OPT_OUTS_PATH) ->
					HttpResponse(
						200,
						emptyMap(),
						"""{"recordId":"$RECORD","subjectId":"$SUBJECT","optOut":{"rights":["sale","share"],"method":"button","recordedAt":${NOW + 5_000},"heldBy":"device"}}""",
					)

				else -> HttpResponse(200, emptyMap(), "{}")
			}
		}
		val restarted = testKernel(
			config = firstConfig,
			store = InthStore(backend),
			clock = clock,
			transport = HostedTransport(replayHttp, firstConfig, clock),
		)
		restarted.bootstrap()

		val replayedPosts = replayHttp.requests.filter { it.url.endsWith(InthProtocol.OPT_OUTS_PATH) }
		assertEquals(1, replayedPosts.size)
		val replayedBody = json.parseToJsonElement(requireNotNull(replayedPosts.single().body)).jsonObject
		assertEquals(key, replayedBody["idempotencyKey"]?.jsonPrimitive?.content)
		assertFalse("rights" in replayedBody)
		assertTrue(InthStore(backend).readPendingOptOuts().isEmpty())
		assertEquals(
			OptOutRecord(
				rights = listOf(OptOutRight.SALE, OptOutRight.SHARE),
				method = OptOutMethod.BUTTON,
				recordedAt = NOW + 5_000,
				heldBy = OptOutHolder.DEVICE,
			),
			restarted.snapshot().optOut,
		)
	}

	@Test
	fun `opt-out is sent with a stale policy snapshot token and never dropped for a policy snapshot code or policy change`() {
		val backend = InMemoryKeyValueStore()
		seedSubject(backend)
		val clock = FixedClock(NOW)
		var optOutAttempts = 0
		val http = RecordingHttpClient { request ->
			when {
				request.url.endsWith(InthProtocol.INIT_PATH) ->
					HttpResponse(200, emptyMap(), optOutInitBodyJson(policySnapshotToken = "stale-token"))

				request.url.endsWith(InthProtocol.OPT_OUTS_PATH) -> {
					optOutAttempts += 1
					if (optOutAttempts == 1) {
						HttpResponse(
							409,
							emptyMap(),
							"""{"error":{"code":"policy_snapshot_expired","message":"expired"},"requestId":"req_1"}""",
						)
					} else {
						HttpResponse(
							200,
							emptyMap(),
							"""{"recordId":"$RECORD","subjectId":"$SUBJECT","optOut":{"rights":["sale","share"],"method":"button","recordedAt":${NOW + 2_000},"heldBy":"device"}}""",
						)
					}
				}

				else -> HttpResponse(200, emptyMap(), "{}")
			}
		}
		val store = InthStore(backend)
		val kernel = testKernel(
			store = store,
			clock = clock,
			transport = HostedTransport(http, TEST_CONFIG, clock),
		)
		kernel.bootstrap()

		kernel.optOut()
		val firstPost = http.requests.single { it.url.endsWith(InthProtocol.OPT_OUTS_PATH) }
		val firstBody = json.parseToJsonElement(requireNotNull(firstPost.body)).jsonObject
		assertEquals("stale-token", firstBody["policySnapshotToken"]?.jsonPrimitive?.content)
		assertFalse("rights" in firstBody)
		assertEquals(1, store.readPendingOptOuts().size, "409 policy_snapshot_expired must stay queued")

		// Even after policy overrides change, flushing still delivers the queued act.
		kernel.setOverrides(KernelOverrides(country = "US", region = "CO"))
		val flushed = kernel.flushPending()
		assertEquals(1, flushed.delivered)
		assertEquals(0, flushed.remaining)
		assertTrue(store.readPendingOptOuts().isEmpty())
		assertEquals(NOW + 2_000, kernel.snapshot().optOut?.recordedAt)
		assertEquals(listOf(OptOutRight.SALE, OptOutRight.SHARE), kernel.snapshot().optOut?.rights)
	}

	@Test
	fun `server answer replaces local empty rights and server recordedAt different from givenAt and persists`() {
		for (serverTime in listOf(NOW + 7L * 86_400_000L, NOW - 60_000L)) {
			val backend = InMemoryKeyValueStore()
			seedSubject(backend)
			val clock = FixedClock(NOW)
			val serverOptOut = OptOutRecord(
				rights = listOf(OptOutRight.SALE, OptOutRight.SHARE),
				method = OptOutMethod.BUTTON,
				recordedAt = serverTime,
				heldBy = OptOutHolder.BOTH,
			)
			val transport = RecordingTransport()
				.respondInit(optOutInit())
				.respondOptOut(OptOutOutcome.Delivered(subjectId = SUBJECT, optOut = serverOptOut))
			val kernel = testKernel(store = InthStore(backend), clock = clock, transport = transport)
			kernel.bootstrap()

			val result = kernel.optOut()
			assertTrue(result.ok)
			assertEquals(serverOptOut, result.optOut)
			assertEquals(serverOptOut, kernel.snapshot().optOut)
			assertEquals(serverOptOut, assertNotNull(InthStore(backend).readEnvelope()).snapshot.optOut)

			// Survives a restart with no network.
			val relaunched = testKernel(store = InthStore(backend), clock = clock)
			relaunched.bootstrap()
			assertEquals(serverOptOut, relaunched.snapshot().optOut)
		}
	}

	@Test
	fun `automatic GPC record sends method gpc once without rights and applies server rights`() {
		val backend = InMemoryKeyValueStore()
		seedSubject(backend)
		val clock = FixedClock(NOW)
		val serverGpc = OptOutRecord(
			rights = listOf(OptOutRight.SALE, OptOutRight.TARGETED_ADS),
			method = OptOutMethod.GPC,
			recordedAt = NOW + 100,
			heldBy = OptOutHolder.DEVICE,
		)
		val transport = RecordingTransport()
			.respondInit(optOutInit(country = "US", region = "CO"))
			.respondOptOut(OptOutOutcome.Delivered(subjectId = SUBJECT, optOut = serverGpc))
		val kernel = testKernel(
			config = TEST_CONFIG.copy(detectedGpc = true),
			store = InthStore(backend),
			clock = clock,
			transport = transport,
		)

		kernel.bootstrap()

		assertEquals(1, transport.optOutRequests.size)
		val (sent, _) = transport.optOutRequests.single()
		assertEquals(OptOutMethod.GPC, sent.method)
		assertEquals("US", sent.country)
		assertEquals("CO", sent.region)
		assertEquals(SUBJECT, sent.subjectId)
		assertNull(sent.uiSource)
		assertEquals(serverGpc, kernel.snapshot().optOut)

		// Refreshing or changing unrelated overrides does not send a second opt-out.
		kernel.refresh()
		kernel.setOverrides(KernelOverrides(language = "fr"))
		assertEquals(1, transport.optOutRequests.size)
		assertTrue(assertNotNull(InthStore(backend).readEnvelope()).optOutGpcReported)

		// Turning GPC off clears the mark; turning it back on sends one new gpc request.
		kernel.setOverrides(KernelOverrides(gpc = false))
		assertEquals(1, transport.optOutRequests.size)
		assertFalse(assertNotNull(InthStore(backend).readEnvelope()).optOutGpcReported)

		kernel.setOverrides(KernelOverrides(gpc = true))
		assertEquals(2, transport.optOutRequests.size)
		assertEquals(OptOutMethod.GPC, transport.optOutRequests[1].first.method)
		assertTrue(assertNotNull(InthStore(backend).readEnvelope()).optOutGpcReported)
	}

	@Test
	fun `click then signal sends one gpc opt-out without changing local optOut, and restart sends none`() {
		val backend = InMemoryKeyValueStore()
		seedSubject(backend)
		val clock = FixedClock(NOW)
		val buttonAnswer = OptOutRecord(
			rights = listOf(OptOutRight.SALE, OptOutRight.SHARE),
			method = OptOutMethod.BUTTON,
			recordedAt = NOW,
			heldBy = OptOutHolder.DEVICE,
		)
		val gpcAnswer = OptOutRecord(
			rights = listOf(OptOutRight.SALE, OptOutRight.SHARE),
			method = OptOutMethod.GPC,
			recordedAt = NOW + 100,
			heldBy = OptOutHolder.DEVICE,
		)
		val tasks = ArrayDeque<() -> Unit>()
		val transport = RecordingTransport()
			.respondInit(optOutInit())
			.respondOptOut(OptOutOutcome.Delivered(subjectId = SUBJECT, optOut = buttonAnswer))
			.respondOptOut(OptOutOutcome.Delivered(subjectId = SUBJECT, optOut = gpcAnswer))
		val first = testKernel(
			store = InthStore(backend),
			clock = clock,
			transport = transport,
			executor = TaskExecutor { tasks.addLast(it) },
		)
		first.bootstrap()
		while (tasks.isNotEmpty()) tasks.removeFirst()()

		assertTrue(first.optOut().ok)
		while (tasks.isNotEmpty()) tasks.removeFirst()()
		assertEquals(1, transport.optOutRequests.size)
		assertEquals(OptOutMethod.BUTTON, transport.optOutRequests[0].first.method)
		assertEquals(buttonAnswer, first.snapshot().optOut)
		assertFalse(assertNotNull(InthStore(backend).readEnvelope()).optOutGpcReported)

		// Turning GPC on queues one gpc request without mutating snapshot.optOut before delivery.
		first.setOverrides(KernelOverrides(gpc = true))
		assertEquals(buttonAnswer, first.snapshot().optOut)
		assertTrue(assertNotNull(InthStore(backend).readEnvelope()).optOutGpcReported)
		while (tasks.isNotEmpty()) tasks.removeFirst()()

		assertEquals(2, transport.optOutRequests.size)
		val gpcSent = transport.optOutRequests[1].first
		assertEquals(OptOutMethod.GPC, gpcSent.method)
		assertEquals("snapshot-token", gpcSent.policySnapshotToken)
		assertEquals(SUBJECT, gpcSent.subjectId)
		assertNotEquals(transport.optOutRequests[0].first.idempotencyKey, gpcSent.idempotencyKey)
		assertEquals(gpcAnswer, first.snapshot().optOut)
		assertTrue(assertNotNull(InthStore(backend).readEnvelope()).optOutGpcReported)

		// Refreshing or changing unrelated state does not send again.
		first.refresh()
		first.setOverrides(KernelOverrides(language = "fr"))
		while (tasks.isNotEmpty()) tasks.removeFirst()()
		assertEquals(2, transport.optOutRequests.size)

		// Restart over the same store with GPC still on sends nothing.
		val restartTransport = RecordingTransport().respondInit(optOutInit())
		val restarted = testKernel(
			config = TEST_CONFIG.copy(detectedGpc = true),
			store = InthStore(backend),
			clock = clock,
			transport = restartTransport,
		)
		restarted.bootstrap()
		restarted.refresh()
		assertTrue(restartTransport.optOutRequests.isEmpty())
	}

	@Test
	fun `account-held propagated opt-out with GPC on sends one gpc request, keeps mark across propagated and both answer, and restart sends none`() {
		val backend = InMemoryKeyValueStore()
		val personOptOut = OptOutRecord(
			rights = listOf(OptOutRight.SALE, OptOutRight.SHARE),
			method = OptOutMethod.PROPAGATED,
			recordedAt = NOW - 5_000,
			heldBy = OptOutHolder.PERSON,
		)
		val bothOptOut = OptOutRecord(
			rights = listOf(OptOutRight.SALE, OptOutRight.SHARE),
			method = OptOutMethod.PROPAGATED,
			recordedAt = NOW - 5_000,
			heldBy = OptOutHolder.BOTH,
		)
		seedOptOut(backend, personOptOut)
		val clock = FixedClock(NOW)
		val transport = RecordingTransport()
			.respondInit(optOutInit())
			.respondOptOut(OptOutOutcome.Delivered(subjectId = SUBJECT, optOut = bothOptOut))
		val first = testKernel(
			config = TEST_CONFIG.copy(detectedGpc = true),
			store = InthStore(backend),
			clock = clock,
			transport = transport,
		)

		first.bootstrap()

		assertEquals(1, transport.optOutRequests.size)
		assertEquals(OptOutMethod.GPC, transport.optOutRequests.single().first.method)
		assertEquals(bothOptOut, first.snapshot().optOut)
		assertTrue(assertNotNull(InthStore(backend).readEnvelope()).optOutGpcReported)

		// Restart sees method=propagated, heldBy=both, and the stored mark stops a second send.
		val restartTransport = RecordingTransport().respondInit(optOutInit())
		val restarted = testKernel(
			config = TEST_CONFIG.copy(detectedGpc = true),
			store = InthStore(backend),
			clock = clock,
			transport = restartTransport,
		)
		restarted.bootstrap()
		restarted.refresh()
		assertEquals(bothOptOut, restarted.snapshot().optOut)
		assertTrue(restartTransport.optOutRequests.isEmpty())
	}

	@Test
	fun `held record with GPC off sends nothing on bootstrap, refresh or restart`() {
		val backend = InMemoryKeyValueStore()
		val held = OptOutRecord(
			rights = listOf(OptOutRight.SALE, OptOutRight.SHARE),
			method = OptOutMethod.PROPAGATED,
			recordedAt = NOW - 5_000,
			heldBy = OptOutHolder.PERSON,
		)
		seedOptOut(backend, held)
		val clock = FixedClock(NOW)
		val transport = RecordingTransport().respondInit(optOutInit())
		val kernel = testKernel(store = InthStore(backend), clock = clock, transport = transport)

		kernel.bootstrap()
		kernel.refresh()
		assertTrue(transport.optOutRequests.isEmpty())
		assertEquals(held, kernel.snapshot().optOut)
		assertFalse(assertNotNull(InthStore(backend).readEnvelope()).optOutGpcReported)
	}

	@Test
	fun `after GPC goes off and comes back on for a held record, one new gpc request is sent`() {
		val backend = InMemoryKeyValueStore()
		val held = OptOutRecord(
			rights = listOf(OptOutRight.SALE, OptOutRight.SHARE),
			method = OptOutMethod.BUTTON,
			recordedAt = NOW - 5_000,
			heldBy = OptOutHolder.DEVICE,
		)
		seedOptOut(backend, held)
		val clock = FixedClock(NOW)
		val transport = RecordingTransport()
			.respondInit(optOutInit())
			.respondOptOut(OptOutOutcome.Delivered(subjectId = SUBJECT, optOut = held))
			.respondOptOut(OptOutOutcome.Delivered(subjectId = SUBJECT, optOut = held))
		val kernel = testKernel(store = InthStore(backend), clock = clock, transport = transport)
		kernel.bootstrap()
		assertTrue(transport.optOutRequests.isEmpty())

		// Turn on -> one gpc request.
		kernel.setOverrides(KernelOverrides(gpc = true))
		assertEquals(1, transport.optOutRequests.size)
		val firstKey = transport.optOutRequests[0].first.idempotencyKey
		assertTrue(assertNotNull(InthStore(backend).readEnvelope()).optOutGpcReported)

		// Turn off -> no request, stored mark cleared.
		kernel.setOverrides(KernelOverrides(gpc = false))
		assertEquals(1, transport.optOutRequests.size)
		assertFalse(assertNotNull(InthStore(backend).readEnvelope()).optOutGpcReported)

		// Turn back on -> one new gpc request with a new key.
		kernel.setOverrides(KernelOverrides(gpc = true))
		assertEquals(2, transport.optOutRequests.size)
		assertEquals(OptOutMethod.GPC, transport.optOutRequests[1].first.method)
		assertNotEquals(firstKey, transport.optOutRequests[1].first.idempotencyKey)
		assertTrue(assertNotNull(InthStore(backend).readEnvelope()).optOutGpcReported)

		// Clear override (GPC is now off because detectedGpc is false) and restart with detectedGpc = true.
		kernel.setOverrides(KernelOverrides(), merge = false)
		assertFalse(assertNotNull(InthStore(backend).readEnvelope()).optOutGpcReported)

		val restartTransport = RecordingTransport()
			.respondInit(optOutInit())
			.respondOptOut(OptOutOutcome.Delivered(subjectId = SUBJECT, optOut = held))
		val restarted = testKernel(
			config = TEST_CONFIG.copy(detectedGpc = true),
			store = InthStore(backend),
			clock = clock,
			transport = restartTransport,
		)
		restarted.bootstrap()
		assertEquals(1, restartTransport.optOutRequests.size)
		assertEquals(OptOutMethod.GPC, restartTransport.optOutRequests.single().first.method)
	}

	@Test
	fun `older stored envelope without optOutGpcReported reads as unmarked, sends once on upgrade, and restart sends none`() {
		val backend = InMemoryKeyValueStore()
		val held = OptOutRecord(
			rights = listOf(OptOutRight.SALE, OptOutRight.SHARE),
			method = OptOutMethod.GPC,
			recordedAt = NOW - 5_000,
			heldBy = OptOutHolder.DEVICE,
		)
		seedOptOut(backend, held)
		// Strip optOutGpcReported to simulate an envelope persisted by an older build.
		val raw = json.parseToJsonElement(assertNotNull(backend.read(InthStoreKeys.SNAPSHOT))).jsonObject
		val older = JsonObject(raw.filterKeys { it != "optOutGpcReported" })
		backend.putSilently(InthStoreKeys.SNAPSHOT, older.toString())

		val decoded = assertNotNull(InthStore(backend).readEnvelope())
		assertFalse(decoded.optOutGpcReported)

		val clock = FixedClock(NOW)
		val transport = RecordingTransport()
			.respondInit(optOutInit())
			.respondOptOut(OptOutOutcome.Delivered(subjectId = SUBJECT, optOut = held))
		val upgraded = testKernel(
			config = TEST_CONFIG.copy(detectedGpc = true),
			store = InthStore(backend),
			clock = clock,
			transport = transport,
		)
		upgraded.bootstrap()
		assertEquals(1, transport.optOutRequests.size)
		assertEquals(OptOutMethod.GPC, transport.optOutRequests.single().first.method)
		assertTrue(assertNotNull(InthStore(backend).readEnvelope()).optOutGpcReported)

		val restartTransport = RecordingTransport().respondInit(optOutInit())
		val restarted = testKernel(
			config = TEST_CONFIG.copy(detectedGpc = true),
			store = InthStore(backend),
			clock = clock,
			transport = restartTransport,
		)
		restarted.bootstrap()
		assertTrue(restartTransport.optOutRequests.isEmpty())
	}

	@Test
	fun `a refusing save sends both the records save and the opt-out without rights`() {
		val backend = InMemoryKeyValueStore()
		seedSubject(backend)
		val clock = FixedClock(NOW)
		val http = RecordingHttpClient { request ->
			when {
				request.url.endsWith(InthProtocol.INIT_PATH) ->
					HttpResponse(200, emptyMap(), optOutInitBodyJson())

				request.url.endsWith(InthProtocol.RECORDS_PATH) ->
					HttpResponse(200, emptyMap(), """{"recordId":"$RECORD","subjectId":"$SUBJECT"}""")

				request.url.endsWith(InthProtocol.OPT_OUTS_PATH) ->
					HttpResponse(
						200,
						emptyMap(),
						"""{"recordId":"$RECORD","subjectId":"$SUBJECT","optOut":{"rights":["sale","share"],"method":"button","recordedAt":${NOW + 250},"heldBy":"device"}}""",
					)

				else -> HttpResponse(200, emptyMap(), "{}")
			}
		}
		val kernel = testKernel(
			store = InthStore(backend),
			clock = clock,
			transport = HostedTransport(http, TEST_CONFIG, clock),
		)
		kernel.bootstrap()

		val saved = kernel.save(CommitIntent.Necessary)
		assertTrue(saved.ok)
		assertTrue(saved.delivered)

		val recordPosts = http.requests.filter { it.url.endsWith(InthProtocol.RECORDS_PATH) }
		val optOutPosts = http.requests.filter { it.url.endsWith(InthProtocol.OPT_OUTS_PATH) }
		assertEquals(1, recordPosts.size)
		assertEquals(1, optOutPosts.size)
		val recordBody = json.parseToJsonElement(requireNotNull(recordPosts.single().body)).jsonObject
		val optOutBody = json.parseToJsonElement(requireNotNull(optOutPosts.single().body)).jsonObject
		assertFalse("rights" in optOutBody)
		assertEquals("button", optOutBody["method"]?.jsonPrimitive?.content)
		assertEquals(SUBJECT, optOutBody["subjectId"]?.jsonPrimitive?.content)
		assertNotEquals(
			recordBody["idempotencyKey"]?.jsonPrimitive?.content,
			optOutBody["idempotencyKey"]?.jsonPrimitive?.content,
			"each act must carry its own idempotency key",
		)
		assertEquals(listOf(OptOutRight.SALE, OptOutRight.SHARE), kernel.snapshot().optOut?.rights)
		assertEquals(NOW + 250, kernel.snapshot().optOut?.recordedAt)
	}

	// -- Identity link, account-held optIn and granting save ------------------

	@Test
	fun `identify applies a returned person opt-out, persists across restart, optIn without token leaves it and with null answer clears it`() {
		val backend = InMemoryKeyValueStore()
		seedSubject(backend)
		val clock = FixedClock(NOW)
		val accountOptOut = OptOutRecord(
			rights = listOf(OptOutRight.SALE, OptOutRight.SHARE),
			method = OptOutMethod.PROPAGATED,
			recordedAt = NOW - 1_000,
			heldBy = OptOutHolder.PERSON,
		)
		val firstTransport = RecordingTransport()
			.respondInit(optOutInit())
			.respondLink(LinkOutcome.Linked(subjectId = SUBJECT, optOut = accountOptOut))
		val first = testKernel(store = InthStore(backend), clock = clock, transport = firstTransport)
		first.bootstrap()

		first.identify(KernelUser("user_123", identityProvider = "clerk"), identityToken = "tok_1")

		assertEquals(accountOptOut, first.snapshot().optOut)
		assertFalse(first.isAllowed(ConsentCategory.MARKETING))
		assertFalse(first.isAllowed(ConsentCategory.MEASUREMENT))
		// Applying the link answer must not send any opt-out or lift requests.
		assertTrue(firstTransport.optOutRequests.isEmpty())
		assertTrue(firstTransport.liftOptOutRequests.isEmpty())

		// Restart: persisted opt-out survives and keeps denying; token is not persisted.
		val secondTransport = RecordingTransport()
			.respondInit(optOutInit())
			.respondLink(LinkOutcome.Linked(subjectId = SUBJECT, optOut = accountOptOut))
			.respondLiftOptOut(LiftOptOutOutcome.Delivered(subjectId = SUBJECT, optOut = accountOptOut))
		val restarted = testKernel(store = InthStore(backend), clock = clock, transport = secondTransport)
		restarted.bootstrap()
		assertEquals(accountOptOut, restarted.snapshot().optOut)
		assertFalse(restarted.isAllowed(ConsentCategory.MARKETING))

		// Without a token, lift answers with the person opt-out -> held-by-account, record stays.
		val blocked = restarted.optIn()
		assertFalse(blocked.ok)
		assertEquals(OptInRefusalReason.HELD_BY_ACCOUNT, blocked.reason)
		assertEquals(accountOptOut, restarted.snapshot().optOut)
		assertEquals(1, secondTransport.liftOptOutRequests.size)
		assertNull(secondTransport.liftOptOutRequests.single().second, "no token after restart")
		assertTrue(InthStore(backend).readPendingOptOuts().isEmpty(), "account lift is never queued")

		// A failed account lift keeps the record, reports held-by-account, and queues nothing.
		secondTransport.respondLiftOptOut(LiftOptOutOutcome.Unavailable("offline"))
		val failed = restarted.optIn()
		assertFalse(failed.ok)
		assertEquals(OptInRefusalReason.HELD_BY_ACCOUNT, failed.reason)
		assertEquals(accountOptOut, restarted.snapshot().optOut)
		assertTrue(InthStore(backend).readPendingOptOuts().isEmpty())

		// Identify with a fresh token, then lift answered with null -> clears and persists.
		secondTransport.respondLiftOptOut(LiftOptOutOutcome.Delivered(subjectId = SUBJECT, optOut = null))
		restarted.identify(KernelUser("user_123", identityProvider = "clerk"), identityToken = "tok_fresh")
		val cleared = restarted.optIn()
		assertTrue(cleared.ok)
		assertNull(cleared.reason)
		assertNull(restarted.snapshot().optOut)
		assertTrue(restarted.isAllowed(ConsentCategory.MARKETING))
		assertEquals(3, secondTransport.liftOptOutRequests.size)
		assertEquals("tok_fresh", secondTransport.liftOptOutRequests.last().second)
		assertNull(assertNotNull(InthStore(backend).readEnvelope()).snapshot.optOut)
	}

	@Test
	fun `granting save while account holds opt-out records the choice and sends a lift after it`() {
		val backend = InMemoryKeyValueStore()
		val accountOptOut = OptOutRecord(
			rights = listOf(OptOutRight.SALE, OptOutRight.SHARE),
			method = OptOutMethod.API,
			recordedAt = NOW - 1_000,
			heldBy = OptOutHolder.PERSON,
		)
		seedOptOut(backend, accountOptOut)
		val clock = FixedClock(NOW)
		val tasks = ArrayDeque<() -> Unit>()
		fun drain() {
			while (tasks.isNotEmpty()) tasks.removeFirst()()
		}
		val transport = RecordingTransport()
			.respondInit(optOutInit())
			.respondLink(LinkOutcome.Linked(subjectId = SUBJECT))
			.respondSave(SaveOutcome.Delivered(subjectId = SUBJECT))
			.respondLiftOptOut(LiftOptOutOutcome.Delivered(subjectId = SUBJECT, optOut = null))
		val kernel = testKernel(
			store = InthStore(backend),
			clock = clock,
			transport = transport,
			executor = TaskExecutor { tasks.addLast(it) },
		)
		kernel.bootstrap()
		drain()
		kernel.identify(KernelUser("user_123"), identityToken = "tok_1")
		drain()

		val saved = kernel.save(CommitIntent.Custom(mapOf(ConsentCategory.MARKETING to true)))
		assertTrue(saved.ok)
		// Save returned before the background lift ran; account opt-out still stands until lift settles.
		assertEquals(accountOptOut, kernel.snapshot().optOut)

		drain()
		assertEquals(1, transport.saveRequests.size)
		assertEquals(1, transport.liftOptOutRequests.size)
		assertEquals("tok_1", transport.liftOptOutRequests.single().second)
		assertNull(kernel.snapshot().optOut)
		assertTrue(kernel.isAllowed(ConsentCategory.MARKETING))
	}

	@Test
	fun `a records save answer carrying optOut is applied and one without changes nothing`() {
		val backend = InMemoryKeyValueStore()
		seedSubject(backend)
		val clock = FixedClock(NOW)
		val accountOptOut = OptOutRecord(
			rights = listOf(OptOutRight.SALE, OptOutRight.SHARE),
			method = OptOutMethod.API,
			recordedAt = NOW + 100,
			heldBy = OptOutHolder.PERSON,
		)
		val transport = RecordingTransport()
			.respondInit(optOutInit())
			.respondSave(SaveOutcome.Delivered(subjectId = SUBJECT, optOut = accountOptOut))
			.respondSave(SaveOutcome.Delivered(subjectId = SUBJECT, optOut = null))
		val kernel = testKernel(store = InthStore(backend), clock = clock, transport = transport)
		kernel.bootstrap()

		kernel.save(CommitIntent.Custom(mapOf(ConsentCategory.FUNCTIONALITY to true)))
		assertEquals(accountOptOut, kernel.snapshot().optOut)
		assertTrue(transport.optOutRequests.isEmpty(), "applying an answer sends nothing")

		kernel.save(CommitIntent.Custom(mapOf(ConsentCategory.EXPERIENCE to true)))
		assertEquals(accountOptOut, kernel.snapshot().optOut)
	}

	// -- Fencing, offline ordering, retry after lift and reset ----------------

	@Test
	fun `an answer arriving after a newer local act is ignored`() {
		val backend = InMemoryKeyValueStore()
		seedSubject(backend)
		val clock = FixedClock(NOW)
		val tasks = ArrayDeque<() -> Unit>()
		val transport = RecordingTransport()
			.respondInit(optOutInit())
			.respondOptOut(
				OptOutOutcome.Delivered(
					subjectId = SUBJECT,
					optOut = OptOutRecord(
						rights = listOf(OptOutRight.SALE, OptOutRight.SHARE),
						method = OptOutMethod.BUTTON,
						recordedAt = NOW + 9_999,
						heldBy = OptOutHolder.DEVICE,
					),
				),
			)
			.respondLiftOptOut(LiftOptOutOutcome.Delivered(subjectId = SUBJECT, optOut = null))
		val kernel = testKernel(
			store = InthStore(backend),
			clock = clock,
			transport = transport,
			executor = TaskExecutor { tasks.addLast(it) },
		)
		kernel.bootstrap()
		while (tasks.isNotEmpty()) tasks.removeFirst()()

		// Record opt-out, holding its delivery task back while the user immediately opts back in.
		assertTrue(kernel.optOut().ok)
		assertNotNull(kernel.snapshot().optOut)
		assertEquals(1, tasks.size)

		assertTrue(kernel.optIn().ok)
		assertNull(kernel.snapshot().optOut)

		// Now run both queued tasks (first the stale opt-out send, then the lift).
		while (tasks.isNotEmpty()) tasks.removeFirst()()

		assertEquals(1, transport.optOutRequests.size)
		assertEquals(1, transport.liftOptOutRequests.size)
		assertNull(kernel.snapshot().optOut, "stale opt-out answer must not overwrite the newer lift")
		assertTrue(kernel.isAllowed(ConsentCategory.MARKETING))
	}

	@Test
	fun `opt-out then lift queued offline replay in order, never store identity tokens, and apply only the last answer`() {
		val backend = InMemoryKeyValueStore()
		seedSubject(backend)
		val clock = FixedClock(NOW)
		val offline = RecordingTransport()
			.respondInit(optOutInit())
			.respondLink(LinkOutcome.Linked(subjectId = SUBJECT))
			.respondOptOut(OptOutOutcome.Unavailable("offline"))
			.respondLiftOptOut(LiftOptOutOutcome.Unavailable("offline"))
		val first = testKernel(store = InthStore(backend), clock = clock, transport = offline)
		first.bootstrap()
		first.identify(KernelUser("user_123", identityProvider = "clerk"), identityToken = "secret-token-1")

		assertTrue(first.optOut().ok)
		assertTrue(first.optIn().ok)

		val rawSnapshot = assertNotNull(backend.read(InthStoreKeys.SNAPSHOT))
		assertFalse("secret-token-1" in rawSnapshot, "identity token must never be stored on disk")
		val queued = InthStore(backend).readPendingOptOuts()
		assertEquals(listOf(OptOutActKind.RECORD, OptOutActKind.LIFT), queued.map { it.kind })

		// Restart with a fresh token: replay sends [record, lift] in order, uses the fresh token,
		// and applies only the last answer (lift -> null), never restoring the record's answer.
		val order = mutableListOf<String>()
		val seenTokens = mutableListOf<String?>()
		val onlineTransport = object : com.inth.core.transport.InthTransport {
			override fun init(context: com.inth.core.transport.InitContext) = optOutInit()
			override fun save(entry: com.inth.core.model.QueuedSave) = SaveOutcome.Delivered()
			override fun link(subject: ConsentSubject, user: KernelUser, identityToken: String) =
				LinkOutcome.Linked(subjectId = SUBJECT)

			override fun optOut(payload: OptOutPayload, identityToken: String?): OptOutOutcome {
				order += "record"
				seenTokens += identityToken
				return OptOutOutcome.Delivered(
					subjectId = payload.subjectId,
					optOut = OptOutRecord(
						rights = listOf(OptOutRight.SALE, OptOutRight.SHARE),
						method = OptOutMethod.BUTTON,
						recordedAt = NOW + 1_000,
						heldBy = OptOutHolder.DEVICE,
					),
				)
			}

			override fun liftOptOut(payload: LiftOptOutPayload, identityToken: String?): LiftOptOutOutcome {
				order += "lift"
				seenTokens += identityToken
				return LiftOptOutOutcome.Delivered(subjectId = payload.subjectId, optOut = null)
			}
		}
		val tasks = ArrayDeque<() -> Unit>()
		val restarted = testKernel(
			store = InthStore(backend),
			clock = clock,
			transport = onlineTransport,
			executor = TaskExecutor { tasks.addLast(it) },
		)
		restarted.bootstrap()
		// Identify with a fresh token before the deferred launch flush runs.
		restarted.identify(KernelUser("user_123", identityProvider = "clerk"), identityToken = "fresh-token-2")
		while (tasks.isNotEmpty()) tasks.removeFirst()()

		assertEquals(listOf("record", "lift"), order)
		assertEquals(listOf<String?>("fresh-token-2", "fresh-token-2"), seenTokens)
		assertTrue(InthStore(backend).readPendingOptOuts().isEmpty())
		assertNull(restarted.snapshot().optOut, "only the last queued act's answer may apply")
		assertTrue(restarted.isAllowed(ConsentCategory.MARKETING))
	}

	@Test
	fun `a queued opt-out whose retry is answered with optOut null after a lift restores nothing`() {
		val backend = InMemoryKeyValueStore()
		seedSubject(backend)
		val clock = FixedClock(NOW)
		val transport = RecordingTransport()
			.respondInit(optOutInit())
			.respondOptOut(OptOutOutcome.Unavailable("offline"))
			.respondOptOut(OptOutOutcome.Delivered(subjectId = SUBJECT, optOut = null))
			.respondLiftOptOut(LiftOptOutOutcome.Delivered(subjectId = SUBJECT, optOut = null))
		val store = InthStore(backend)
		val kernel = testKernel(store = store, clock = clock, transport = transport)
		kernel.bootstrap()

		assertTrue(kernel.optOut().ok)
		assertEquals(1, store.readPendingOptOuts().size)
		assertNotNull(kernel.snapshot().optOut)

		assertTrue(kernel.optIn().ok)
		assertNull(kernel.snapshot().optOut)
		// optIn drains the earlier queued record before sending the lift, so both are settled.
		assertTrue(store.readPendingOptOuts().isEmpty())
		assertEquals(FlushResult(delivered = 0, remaining = 0), kernel.flushPending())

		assertEquals(2, transport.optOutRequests.size)
		assertEquals(
			transport.optOutRequests[0].first.idempotencyKey,
			transport.optOutRequests[1].first.idempotencyKey,
		)
		assertNull(kernel.snapshot().optOut, "optOut: null on retry must restore nothing")
		assertTrue(kernel.isAllowed(ConsentCategory.MARKETING))
	}

	@Test
	fun `reset empties the opt-out queue and ignores an in-flight answer from before the reset`() {
		val backend = InMemoryKeyValueStore()
		seedSubject(backend)
		val clock = FixedClock(NOW)
		val tasks = ArrayDeque<() -> Unit>()
		val transport = RecordingTransport()
			.respondInit(optOutInit())
			.respondOptOut(OptOutOutcome.Unavailable("offline"))
		val store = InthStore(backend)
		val kernel = testKernel(
			store = store,
			clock = clock,
			transport = transport,
			executor = TaskExecutor { tasks.addLast(it) },
		)
		kernel.bootstrap()
		while (tasks.isNotEmpty()) tasks.removeFirst()()

		assertTrue(kernel.optOut().ok)
		assertEquals(1, store.readPendingOptOuts().size)

		kernel.reset()
		assertTrue(store.readPendingOptOuts().isEmpty())
		assertNull(kernel.snapshot().optOut)

		// Draining any pre-reset task must send nothing and restore nothing.
		transport.respondOptOut(
			OptOutOutcome.Delivered(
				subjectId = SUBJECT,
				optOut = OptOutRecord(
					rights = listOf(OptOutRight.SALE),
					method = OptOutMethod.BUTTON,
					recordedAt = NOW + 500,
					heldBy = OptOutHolder.DEVICE,
				),
			),
		)
		while (tasks.isNotEmpty()) tasks.removeFirst()()
		assertTrue(transport.optOutRequests.isEmpty())
		assertNull(kernel.snapshot().optOut)
	}

	// -- Failure classification & 409 subject_conflict recovery ---------------

	@Test
	fun `409 subject_conflict moves to a new subject ID and resends the opt-out`() {
		val backend = InMemoryKeyValueStore()
		seedSubject(backend)
		val clock = FixedClock(NOW)
		var attempts = 0
		val http = RecordingHttpClient { request ->
			when {
				request.url.endsWith(InthProtocol.INIT_PATH) ->
					HttpResponse(200, emptyMap(), optOutInitBodyJson())

				request.url.endsWith(InthProtocol.OPT_OUTS_PATH) -> {
					attempts += 1
					if (attempts == 1) {
						HttpResponse(
							409,
							emptyMap(),
							"""{"error":{"code":"subject_conflict","message":"belongs to another tenant"},"requestId":"req_conflict"}""",
						)
					} else {
						val sentSubject = json.parseToJsonElement(requireNotNull(request.body)).jsonObject["subjectId"]!!
							.jsonPrimitive.content
						val returnedSubject = if (SubjectIdGenerator.isUuidV7(sentSubject)) sentSubject else CANONICAL_TWO
						HttpResponse(
							200,
							emptyMap(),
							"""{"recordId":"$RECORD","subjectId":"$returnedSubject","optOut":{"rights":["sale","share"],"method":"button","recordedAt":${NOW + 300},"heldBy":"device"}}""",
						)
					}
				}

				else -> HttpResponse(200, emptyMap(), "{}")
			}
		}
		val store = InthStore(backend)
		val kernel = ConsentCore(
			config = TEST_CONFIG,
			store = store,
			clock = clock,
			transport = HostedTransport(http, TEST_CONFIG, clock),
			executor = TaskExecutor.DIRECT,
		)
		kernel.bootstrap()

		kernel.optOut()

		val posts = http.requests.filter { it.url.endsWith(InthProtocol.OPT_OUTS_PATH) }
		assertEquals(2, posts.size)
		val firstBody = json.parseToJsonElement(requireNotNull(posts[0].body)).jsonObject
		val secondBody = json.parseToJsonElement(requireNotNull(posts[1].body)).jsonObject
		val firstSubject = firstBody["subjectId"]?.jsonPrimitive?.content
		val secondSubject = secondBody["subjectId"]?.jsonPrimitive?.content
		assertEquals(SUBJECT, firstSubject)
		assertNotEquals(SUBJECT, secondSubject)
		assertEquals(
			firstBody["idempotencyKey"]?.jsonPrimitive?.content,
			secondBody["idempotencyKey"]?.jsonPrimitive?.content,
		)
		assertEquals(secondSubject, kernel.snapshot().subject?.id)
		assertEquals(NOW + 300, kernel.snapshot().optOut?.recordedAt)
		assertEquals(listOf(OptOutRight.SALE, OptOutRight.SHARE), kernel.snapshot().optOut?.rights)
		assertTrue(store.readPendingOptOuts().isEmpty())
	}

	@Test
	fun `400 invalid_request and 413 drop the queued opt-out while 404, 401, 429, 5xx and bare 400 stay queued`() {
		for ((status, code) in listOf(400 to "invalid_request", 413 to "payload_too_large")) {
			val backend = InMemoryKeyValueStore()
			seedSubject(backend)
			val errors = mutableListOf<KernelError>()
			val http = RecordingHttpClient { request ->
				when {
					request.url.endsWith(InthProtocol.INIT_PATH) ->
						HttpResponse(200, emptyMap(), optOutInitBodyJson())

					else -> HttpResponse(
						status,
						emptyMap(),
						"""{"error":{"code":"$code","message":"rejected"},"requestId":"req_perm"}""",
					)
				}
			}
			val store = InthStore(backend)
			val kernel = testKernel(
				store = store,
				transport = HostedTransport(http, TEST_CONFIG),
				logger = { errors += it },
			)
			kernel.bootstrap()

			kernel.optOut()

			assertTrue(store.readPendingOptOuts().isEmpty(), "$status $code must drop entry")
			assertTrue(errors.any { it.code == "opt-out-rejected" }, "$status $code must emit opt-out-rejected")
			assertFalse(kernel.isAllowed(ConsentCategory.MARKETING), "local opt-out remains enforced")
		}

		val retryableCases = listOf(
			Triple(404, "not_found", """{"error":{"code":"not_found","message":"missing"},"requestId":"req_404"}"""),
			Triple(401, "unauthorized", """{"error":{"code":"unauthorized","message":"nope"},"requestId":"req_401"}"""),
			Triple(429, "rate_limited", """{"error":{"code":"rate_limited","message":"slow"},"requestId":"req_429"}"""),
			Triple(500, "server_error", """{"error":{"code":"server_error","message":"boom"},"requestId":"req_500"}"""),
			Triple(409, "policy_snapshot_invalid", """{"error":{"code":"policy_snapshot_invalid","message":"stale"},"requestId":"req_409"}"""),
			Triple(409, "policy_snapshot_required", """{"error":{"code":"policy_snapshot_required","message":"req"},"requestId":"req_409b"}"""),
			Triple(409, "conflict", """{"error":{"code":"conflict","message":"dup"},"requestId":"req_409c"}"""),
			Triple(400, null, "<html>Bad Request</html>"),
		)
		for ((status, _, body) in retryableCases) {
			val backend = InMemoryKeyValueStore()
			seedSubject(backend)
			val http = RecordingHttpClient { request ->
				if (request.url.endsWith(InthProtocol.INIT_PATH)) {
					HttpResponse(200, emptyMap(), optOutInitBodyJson())
				} else {
					HttpResponse(status, emptyMap(), body)
				}
			}
			val store = InthStore(backend)
			val kernel = testKernel(store = store, transport = HostedTransport(http, TEST_CONFIG))
			kernel.bootstrap()

			kernel.optOut()

			assertEquals(1, store.readPendingOptOuts().size, "HTTP $status ($body) must stay queued")
		}
	}

	// -- HostedTransport parsing & invalid optOut handling --------------------

	@Test
	fun `HostedTransport parses optOut on records, link, opt-outs and lift and treats invalid or empty rights as no information`() {
		val validJson = """{"rights":["share","sale"],"method":"api","recordedAt":${NOW + 500},"heldBy":"person"}"""
		val expectedCanonical = OptOutRecord(
			rights = listOf(OptOutRight.SALE, OptOutRight.SHARE),
			method = OptOutMethod.API,
			recordedAt = NOW + 500,
			heldBy = OptOutHolder.PERSON,
		)

		// Link with valid optOut -> canonical rights order.
		val linkValid = HostedTransport(
			RecordingHttpClient {
				HttpResponse(200, emptyMap(), """{"subjectId":"$SUBJECT","externalId":"u1","verifiedBy":"identity_token","optOut":$validJson}""")
			},
			TEST_CONFIG,
		).link(ConsentSubject(SUBJECT), KernelUser("u1"), "tok")
		assertEquals(LinkOutcome.Linked(SUBJECT, expectedCanonical), linkValid)

		// Link with invalid optOut (empty rights) -> no information.
		val linkEmpty = HostedTransport(
			RecordingHttpClient {
				HttpResponse(200, emptyMap(), """{"subjectId":"$SUBJECT","externalId":"u1","optOut":{"rights":[],"method":"api","recordedAt":$NOW,"heldBy":"person"}}""")
			},
			TEST_CONFIG,
		).link(ConsentSubject(SUBJECT), KernelUser("u1"), "tok")
		assertEquals(LinkOutcome.Linked(SUBJECT, null), linkEmpty)

		// Lift with explicit null -> cleared = true.
		val liftPayload = LiftOptOutPayload(
			subjectId = SUBJECT,
			idempotencyKey = RECORD,
			givenAt = NOW,
			user = KernelUser("u1", identityProvider = "clerk"),
			uiSource = ActiveUI.DIALOG,
		)
		val liftHttp = RecordingHttpClient {
			HttpResponse(200, emptyMap(), """{"recordId":"$RECORD","subjectId":"$SUBJECT","optOut":null}""")
		}
		val liftNull = HostedTransport(liftHttp, TEST_CONFIG).liftOptOut(liftPayload, identityToken = "tok_lift")
		assertEquals(LiftOptOutOutcome.Delivered(SUBJECT, optOut = null, cleared = true), liftNull)
		val liftSentBody = json.parseToJsonElement(requireNotNull(liftHttp.requests.single().body)).jsonObject
		assertFalse("rights" in liftSentBody)
		assertEquals("tok_lift", liftSentBody["identityToken"]?.jsonPrimitive?.content)
		assertEquals("dialog", liftSentBody["uiSource"]?.jsonPrimitive?.content)

		// Lift with invalid optOut (negative recordedAt) -> no information, NOT cleared!
		val liftInvalid = HostedTransport(
			RecordingHttpClient {
				HttpResponse(
					200,
					emptyMap(),
					"""{"recordId":"$RECORD","subjectId":"$SUBJECT","optOut":{"rights":["sale"],"method":"api","recordedAt":-1,"heldBy":"person"}}""",
				)
			},
			TEST_CONFIG,
		).liftOptOut(liftPayload)
		assertEquals(LiftOptOutOutcome.Delivered(SUBJECT, optOut = null, cleared = false), liftInvalid)

		// Lift missing recordId -> retryable Unavailable.
		val liftNoRecordId = HostedTransport(
			RecordingHttpClient {
				HttpResponse(200, emptyMap(), """{"subjectId":"$SUBJECT","optOut":null}""")
			},
			TEST_CONFIG,
		).liftOptOut(liftPayload)
		assertTrue(liftNoRecordId is LiftOptOutOutcome.Unavailable)

		// Opt-out with unknown key inside optOut -> no information.
		val optOutPayload = OptOutPayload(
			subjectId = SUBJECT,
			idempotencyKey = RECORD,
			method = OptOutMethod.BUTTON,
			givenAt = NOW,
		)
		val optOutUnknownKey = HostedTransport(
			RecordingHttpClient {
				HttpResponse(
					200,
					emptyMap(),
					"""{"recordId":"$RECORD","subjectId":"$SUBJECT","optOut":{"rights":["sale"],"method":"button","recordedAt":$NOW,"heldBy":"device","extra":1}}""",
				)
			},
			TEST_CONFIG,
		).optOut(optOutPayload)
		assertEquals(OptOutOutcome.Delivered(SUBJECT, optOut = null), optOutUnknownKey)
	}

	@Test
	fun `unknown fields in a stored pendingOptOuts entry are tolerated on read`() {
		val backend = InMemoryKeyValueStore()
		seedSubject(backend)
		val store = InthStore(backend)
		val offline = RecordingTransport()
			.respondInit(optOutInit())
			.respondOptOut(OptOutOutcome.Unavailable("offline"))
		val kernel = testKernel(store = store, transport = offline)
		kernel.bootstrap()
		kernel.optOut()
		assertEquals(1, store.readPendingOptOuts().size)

		// Inject an unknown field into the stored pendingOptOuts entry.
		val root = json.parseToJsonElement(assertNotNull(backend.read(InthStoreKeys.SNAPSHOT))).jsonObject
		val pendingArray = root.getValue("pendingOptOuts") as JsonArray
		val entryObj = pendingArray.single().jsonObject
		val patchedEntry = JsonObject(entryObj + ("futureQueueField" to JsonPrimitive("v4")))
		val patchedRoot = JsonObject(root + ("pendingOptOuts" to JsonArray(listOf(patchedEntry))))
		backend.putSilently(InthStoreKeys.SNAPSHOT, patchedRoot.toString())

		val readBack = InthStore(backend).readPendingOptOuts()
		assertEquals(1, readBack.size, "unknown fields inside pendingOptOuts entries must be tolerated")
		assertEquals(offline.optOutRequests.single().first.idempotencyKey, readBack.single().idempotencyKey)
	}

	@Test
	fun `dryRun records opt-outs locally without queueing or sending`() {
		val backend = InMemoryKeyValueStore()
		seedSubject(backend)
		val transport = RecordingTransport().respondInit(optOutInit())
		val store = InthStore(backend)
		val kernel = testKernel(
			config = TEST_CONFIG.copy(dryRun = true),
			store = store,
			transport = transport,
		)
		kernel.bootstrap()

		assertTrue(kernel.optOut().ok)
		assertNotNull(kernel.snapshot().optOut)
		assertTrue(transport.optOutRequests.isEmpty())
		assertTrue(store.readPendingOptOuts().isEmpty())

		assertTrue(kernel.optIn().ok)
		assertNull(kernel.snapshot().optOut)
		assertTrue(transport.liftOptOutRequests.isEmpty())
		assertTrue(store.readPendingOptOuts().isEmpty())
	}

	@Test
	fun `refusing marketing and granting measurement in one save keeps measurement permitted after the server replaces recordedAt with a later timestamp`() {
		val backend = InMemoryKeyValueStore()
		seedSubject(backend)
		val clock = FixedClock(NOW)
		val serverRecordedAt = NOW + 60_000L
		val serverOptOut = OptOutRecord(
			rights = listOf(OptOutRight.SALE, OptOutRight.SHARE),
			method = OptOutMethod.BUTTON,
			recordedAt = serverRecordedAt,
			heldBy = OptOutHolder.DEVICE,
		)
		val transport = RecordingTransport()
			.respondInit(optOutInit())
			.respondSave(SaveOutcome.Delivered(subjectId = SUBJECT))
			.respondOptOut(OptOutOutcome.Delivered(subjectId = SUBJECT, optOut = serverOptOut))
		val kernel = testKernel(store = InthStore(backend), clock = clock, transport = transport)
		kernel.bootstrap()

		kernel.save(
			CommitIntent.Custom(
				mapOf(
					ConsentCategory.MARKETING to false,
					ConsentCategory.MEASUREMENT to true,
				),
			),
		)

		assertEquals(serverOptOut, kernel.snapshot().optOut)
		assertFalse(kernel.isAllowed(ConsentCategory.MARKETING))
		assertTrue(kernel.isAllowed(ConsentCategory.MEASUREMENT))
		assertEquals(
			mapOf("marketing" to listOf("explicit-denial", "opt-out")),
			kernel.snapshot().restrictions,
		)
	}

	@Test
	fun `holding an opt-out under an opt-in rule, granting marketing lifts and sends one lift, and refusing marketing records nothing`() {
		val backend = InMemoryKeyValueStore()
		seedOptOut(
			backend,
			OptOutRecord(
				rights = listOf(OptOutRight.SALE, OptOutRight.SHARE),
				method = OptOutMethod.BUTTON,
				recordedAt = NOW - 1_000L,
				heldBy = OptOutHolder.DEVICE,
			),
		)
		val clock = FixedClock(NOW)
		val transport = RecordingTransport()
			.respondInit(optOutInit(model = "\"opt-in\"", prompt = "\"choice\"", gpcDenyCategories = "[]"))
			.respondSave(SaveOutcome.Delivered(subjectId = SUBJECT))
			.respondLiftOptOut(LiftOptOutOutcome.Delivered(subjectId = SUBJECT, optOut = null, cleared = true))
		val kernel = testKernel(store = InthStore(backend), clock = clock, transport = transport)
		kernel.bootstrap()

		kernel.save(CommitIntent.Custom(mapOf(ConsentCategory.MARKETING to true)))

		assertNull(kernel.snapshot().optOut)
		assertEquals(1, transport.liftOptOutRequests.size)
		assertEquals("snapshot-token", transport.liftOptOutRequests.single().first.policySnapshotToken)
		assertTrue(transport.optOutRequests.isEmpty())

		kernel.save(CommitIntent.Custom(mapOf(ConsentCategory.MARKETING to false)))
		assertNull(kernel.snapshot().optOut)
		assertTrue(transport.optOutRequests.isEmpty())
	}

	@Test
	fun `lift body carries policySnapshotToken when held, omits it when absent, and preserves it on queued replay`() {
		val record = OptOutRecord(
			rights = listOf(OptOutRight.SALE, OptOutRight.SHARE),
			method = OptOutMethod.BUTTON,
			recordedAt = NOW - 1_000L,
			heldBy = OptOutHolder.DEVICE,
		)

		// With token held.
		val withTokenBackend = InMemoryKeyValueStore()
		seedOptOut(withTokenBackend, record)
		val withTokenHttp = RecordingHttpClient { request ->
			when {
				request.url.endsWith(InthProtocol.INIT_PATH) ->
					HttpResponse(200, emptyMap(), optOutInitBodyJson(policySnapshotToken = "lift-token-1"))

				else ->
					HttpResponse(200, emptyMap(), """{"recordId":"$RECORD","subjectId":"$SUBJECT","optOut":null}""")
			}
		}
		val withToken = testKernel(
			store = InthStore(withTokenBackend),
			clock = FixedClock(NOW),
			transport = HostedTransport(withTokenHttp, TEST_CONFIG, FixedClock(NOW)),
		)
		withToken.bootstrap()
		assertTrue(withToken.optIn().ok)
		val withTokenBody = json.parseToJsonElement(
			requireNotNull(withTokenHttp.requests.single { it.url.endsWith(InthProtocol.OPT_OUT_LIFT_PATH) }.body),
		).jsonObject
		assertEquals("lift-token-1", withTokenBody["policySnapshotToken"]?.jsonPrimitive?.content)

		// Without token held.
		val withoutTokenBackend = InMemoryKeyValueStore()
		seedOptOut(withoutTokenBackend, record)
		val withoutTokenHttp = RecordingHttpClient { request ->
			when {
				request.url.endsWith(InthProtocol.INIT_PATH) ->
					HttpResponse(200, emptyMap(), optOutInitBodyJson(policySnapshotToken = null))

				else ->
					HttpResponse(200, emptyMap(), """{"recordId":"$RECORD","subjectId":"$SUBJECT","optOut":null}""")
			}
		}
		val withoutToken = testKernel(
			store = InthStore(withoutTokenBackend),
			clock = FixedClock(NOW),
			transport = HostedTransport(withoutTokenHttp, TEST_CONFIG, FixedClock(NOW)),
		)
		withoutToken.bootstrap()
		assertTrue(withoutToken.optIn().ok)
		val withoutTokenBody = json.parseToJsonElement(
			requireNotNull(withoutTokenHttp.requests.single { it.url.endsWith(InthProtocol.OPT_OUT_LIFT_PATH) }.body),
		).jsonObject
		assertFalse("policySnapshotToken" in withoutTokenBody, "absent token must be omitted: $withoutTokenBody")

		// Queued lift replays with its original token even after a later init serves a newer token.
		val queuedBackend = InMemoryKeyValueStore()
		seedOptOut(queuedBackend, record)
		val offlineHttp = RecordingHttpClient { request ->
			if (request.url.endsWith(InthProtocol.INIT_PATH)) {
				HttpResponse(200, emptyMap(), optOutInitBodyJson(policySnapshotToken = "queued-lift-token"))
			} else {
				throw java.io.IOException("offline")
			}
		}
		val first = testKernel(
			store = InthStore(queuedBackend),
			clock = FixedClock(NOW),
			transport = HostedTransport(offlineHttp, TEST_CONFIG, FixedClock(NOW)),
		)
		first.bootstrap()
		assertTrue(first.optIn().ok)
		val queued = InthStore(queuedBackend).readPendingOptOuts()
		assertEquals(1, queued.size)
		assertEquals(OptOutActKind.LIFT, queued.single().kind)
		assertEquals("queued-lift-token", queued.single().liftPayload?.policySnapshotToken)

		val replayHttp = RecordingHttpClient { request ->
			when {
				request.url.endsWith(InthProtocol.INIT_PATH) ->
					HttpResponse(200, emptyMap(), optOutInitBodyJson(policySnapshotToken = "newer-token-ignored-by-replay"))

				else ->
					HttpResponse(200, emptyMap(), """{"recordId":"$RECORD","subjectId":"$SUBJECT","optOut":null}""")
			}
		}
		val replayed = testKernel(
			store = InthStore(queuedBackend),
			clock = FixedClock(NOW),
			transport = HostedTransport(replayHttp, TEST_CONFIG, FixedClock(NOW)),
		)
		replayed.bootstrap()
		val replayLiftPosts = replayHttp.requests.filter { it.url.endsWith(InthProtocol.OPT_OUT_LIFT_PATH) }
		assertEquals(1, replayLiftPosts.size)
		val replayBody = json.parseToJsonElement(requireNotNull(replayLiftPosts.single().body)).jsonObject
		assertEquals("queued-lift-token", replayBody["policySnapshotToken"]?.jsonPrimitive?.content)
		assertTrue(InthStore(queuedBackend).readPendingOptOuts().isEmpty())
	}

	@Test
	fun `a lift answer with optOut null clears snapshot and storage for device, person and both via optIn and granting save`() {
		for (holder in listOf(OptOutHolder.DEVICE, OptOutHolder.PERSON, OptOutHolder.BOTH)) {
			for (action in listOf("optIn", "save")) {
				val backend = InMemoryKeyValueStore()
				val record = OptOutRecord(
					rights = listOf(OptOutRight.SALE, OptOutRight.SHARE),
					method = if (holder == OptOutHolder.DEVICE) OptOutMethod.BUTTON else OptOutMethod.PROPAGATED,
					recordedAt = NOW - 1_000L,
					heldBy = holder,
				)
				seedOptOut(backend, record)
				val clock = FixedClock(NOW)
				val transport = RecordingTransport()
					.respondInit(optOutInit())
					.respondLink(LinkOutcome.Linked(subjectId = SUBJECT, optOut = record))
					.respondSave(SaveOutcome.Delivered(subjectId = SUBJECT))
					.respondLiftOptOut(LiftOptOutOutcome.Delivered(subjectId = SUBJECT, optOut = null, cleared = true))
				val kernel = testKernel(store = InthStore(backend), clock = clock, transport = transport)
				kernel.bootstrap()
				if (holder != OptOutHolder.DEVICE) {
					kernel.identify(KernelUser("user_123", identityProvider = "clerk"), identityToken = "tok_verified")
				}
				assertEquals(record, kernel.snapshot().optOut, "$holder/$action must hold record before lift")

				if (action == "optIn") {
					val res = kernel.optIn()
					assertTrue(res.ok, "$holder/optIn must succeed")
				} else {
					val res = kernel.save(CommitIntent.Custom(mapOf(ConsentCategory.MARKETING to true)))
					assertTrue(res.ok, "$holder/save must succeed")
				}

				assertEquals(1, transport.liftOptOutRequests.size, "$holder/$action must send one lift")
				assertEquals("snapshot-token", transport.liftOptOutRequests.single().first.policySnapshotToken, "$holder/$action")
				if (holder != OptOutHolder.DEVICE) {
					assertEquals("tok_verified", transport.liftOptOutRequests.single().second, "$holder/$action")
				}
				assertNull(kernel.snapshot().optOut, "$holder/$action must clear snapshot.optOut")
				assertTrue(kernel.isAllowed(ConsentCategory.MARKETING), "$holder/$action must permit marketing")
				assertNull(assertNotNull(InthStore(backend).readEnvelope()).snapshot.optOut, "$holder/$action must clear stored optOut")

				// Reloading from storage confirms the opt-out stays cleared.
				val reloaded = testKernel(
					store = InthStore(backend),
					clock = clock,
					transport = RecordingTransport().respondInit(optOutInit()),
				)
				reloaded.bootstrap()
				assertNull(reloaded.snapshot().optOut, "$holder/$action reload must stay clear")
				assertTrue(reloaded.isAllowed(ConsentCategory.MARKETING), "$holder/$action reload must permit marketing")
			}
		}
	}

	@Test
	fun `failed durable write during applyInit for a held click opt-out leaves mark unset until a working refresh reports once`() {
		val backend = InMemoryKeyValueStore()
		val held = OptOutRecord(
			rights = listOf(OptOutRight.SALE, OptOutRight.SHARE),
			method = OptOutMethod.BUTTON,
			recordedAt = NOW - 5_000L,
			heldBy = OptOutHolder.DEVICE,
		)
		// Stored envelope has no evaluationPolicy yet, so applyInit is the call site that reconciles GPC.
		seedOptOut(backend, held)
		backend.refuseDurableWrites = true

		val clock = FixedClock(NOW)
		val errors = mutableListOf<KernelError>()
		val transport = RecordingTransport()
			.respondInit(optOutInit())
			.respondOptOut(OptOutOutcome.Delivered(subjectId = SUBJECT, optOut = held))
		val kernel = testKernel(
			config = TEST_CONFIG.copy(detectedGpc = true),
			store = InthStore(backend),
			clock = clock,
			transport = transport,
			logger = { errors += it },
		)

		kernel.bootstrap()

		assertTrue(transport.optOutRequests.isEmpty())
		assertTrue(errors.isEmpty())
		assertFalse(assertNotNull(InthStore(backend).readEnvelope()).optOutGpcReported)
		assertTrue(InthStore(backend).readPendingOptOuts().isEmpty())
		assertEquals(FlushResult(delivered = 0, remaining = 0), kernel.flushPending())

		backend.refuseDurableWrites = false
		kernel.refresh()

		assertEquals(1, transport.optOutRequests.size)
		assertEquals(OptOutMethod.GPC, transport.optOutRequests.single().first.method)
		assertTrue(assertNotNull(InthStore(backend).readEnvelope()).optOutGpcReported)
		assertTrue(InthStore(backend).readPendingOptOuts().isEmpty())

		kernel.refresh()
		assertEquals(1, transport.optOutRequests.size)
	}

	@Test
	fun `failed durable write when init first activates GPC and records the opt-out retries once on a working refresh`() {
		val backend = InMemoryKeyValueStore()
		seedSubject(backend)
		backend.refuseDurableWrites = true

		val clock = FixedClock(NOW)
		val errors = mutableListOf<KernelError>()
		val serverGpc = OptOutRecord(
			rights = listOf(OptOutRight.SALE, OptOutRight.TARGETED_ADS),
			method = OptOutMethod.GPC,
			recordedAt = NOW + 100L,
			heldBy = OptOutHolder.DEVICE,
		)
		val transport = RecordingTransport()
			.respondInit(optOutInit(country = "US", region = "CO"))
			.respondOptOut(OptOutOutcome.Delivered(subjectId = SUBJECT, optOut = serverGpc))
		val kernel = testKernel(
			config = TEST_CONFIG.copy(detectedGpc = true),
			store = InthStore(backend),
			clock = clock,
			transport = transport,
			logger = { errors += it },
		)

		kernel.bootstrap()

		assertEquals(OptOutMethod.GPC, kernel.snapshot().optOut?.method)
		assertTrue(transport.optOutRequests.isEmpty())
		assertTrue(errors.isEmpty())
		assertNull(InthStore(backend).readEnvelope())
		assertTrue(InthStore(backend).readPendingOptOuts().isEmpty())
		assertEquals(FlushResult(delivered = 0, remaining = 0), kernel.flushPending())

		backend.refuseDurableWrites = false
		kernel.refresh()

		assertEquals(1, transport.optOutRequests.size)
		assertEquals(OptOutMethod.GPC, transport.optOutRequests.single().first.method)
		assertEquals(serverGpc, kernel.snapshot().optOut)
		assertTrue(assertNotNull(InthStore(backend).readEnvelope()).optOutGpcReported)
		assertTrue(InthStore(backend).readPendingOptOuts().isEmpty())

		kernel.refresh()
		assertEquals(1, transport.optOutRequests.size)
	}

	@Test
	fun `failed durable write in setOverrides leaves mark unset until a working refresh reports once`() {
		val backend = InMemoryKeyValueStore()
		seedSubject(backend)
		val clock = FixedClock(NOW)
		val buttonAnswer = OptOutRecord(
			rights = listOf(OptOutRight.SALE, OptOutRight.SHARE),
			method = OptOutMethod.BUTTON,
			recordedAt = NOW,
			heldBy = OptOutHolder.DEVICE,
		)
		val errors = mutableListOf<KernelError>()
		val transport = RecordingTransport()
			.respondInit(optOutInit())
			.respondOptOut(OptOutOutcome.Delivered(subjectId = SUBJECT, optOut = buttonAnswer))
			.respondOptOut(OptOutOutcome.Delivered(subjectId = SUBJECT, optOut = buttonAnswer))
		val kernel = testKernel(
			store = InthStore(backend),
			clock = clock,
			transport = transport,
			logger = { errors += it },
		)
		kernel.bootstrap()
		assertTrue(kernel.optOut().ok)
		assertEquals(1, transport.optOutRequests.size)
		assertEquals(OptOutMethod.BUTTON, transport.optOutRequests.single().first.method)
		assertFalse(assertNotNull(InthStore(backend).readEnvelope()).optOutGpcReported)

		backend.refuseDurableWrites = true
		kernel.setOverrides(KernelOverrides(gpc = true))

		assertEquals(1, transport.optOutRequests.size)
		assertTrue(errors.isEmpty())
		assertFalse(assertNotNull(InthStore(backend).readEnvelope()).optOutGpcReported)
		assertTrue(InthStore(backend).readPendingOptOuts().isEmpty())
		assertEquals(FlushResult(delivered = 0, remaining = 0), kernel.flushPending())

		backend.refuseDurableWrites = false
		kernel.refresh()

		assertEquals(2, transport.optOutRequests.size)
		assertEquals(OptOutMethod.GPC, transport.optOutRequests[1].first.method)
		assertTrue(assertNotNull(InthStore(backend).readEnvelope()).optOutGpcReported)

		kernel.refresh()
		assertEquals(2, transport.optOutRequests.size)
	}

	@Test
	fun `failed durable write during bootstrap hydration leaves mark unset so a working init reports once`() {
		val backend = InMemoryKeyValueStore()
		seedSubject(backend)
		val clock = FixedClock(NOW)
		val buttonAnswer = OptOutRecord(
			rights = listOf(OptOutRight.SALE, OptOutRight.SHARE),
			method = OptOutMethod.BUTTON,
			recordedAt = NOW,
			heldBy = OptOutHolder.DEVICE,
		)
		// First session stores a matched opt-out policy and a clicked opt-out with GPC off.
		val firstTransport = RecordingTransport()
			.respondInit(optOutInit())
			.respondOptOut(OptOutOutcome.Delivered(subjectId = SUBJECT, optOut = buttonAnswer))
		val first = testKernel(store = InthStore(backend), clock = clock, transport = firstTransport)
		first.bootstrap()
		assertTrue(first.optOut().ok)
		assertFalse(assertNotNull(InthStore(backend).readEnvelope()).optOutGpcReported)

		// Restart with GPC on while the store refuses bootstrap's durable write.
		backend.refuseDurableWrites = true
		val tasks = ArrayDeque<() -> Unit>()
		val errors = mutableListOf<KernelError>()
		val restartTransport = RecordingTransport()
			.respondInit(optOutInit())
			.respondOptOut(OptOutOutcome.Delivered(subjectId = SUBJECT, optOut = buttonAnswer))
		val restarted = testKernel(
			config = TEST_CONFIG.copy(detectedGpc = true),
			store = InthStore(backend),
			clock = clock,
			transport = restartTransport,
			executor = TaskExecutor { tasks.addLast(it) },
			logger = { errors += it },
		)
		restarted.bootstrap()
		// First queued task is flushPending(); run it while writes are still refused.
		assertTrue(tasks.isNotEmpty())
		tasks.removeFirst()()
		assertTrue(restartTransport.optOutRequests.isEmpty())
		assertTrue(errors.isEmpty())
		assertFalse(assertNotNull(InthStore(backend).readEnvelope()).optOutGpcReported)
		assertTrue(InthStore(backend).readPendingOptOuts().isEmpty())

		// Store recovers before the deferred runInit() executes: applyInit must see the
		// mark still unset and report GPC once.
		backend.refuseDurableWrites = false
		while (tasks.isNotEmpty()) tasks.removeFirst()()

		assertEquals(1, restartTransport.optOutRequests.size)
		assertEquals(OptOutMethod.GPC, restartTransport.optOutRequests.single().first.method)
		assertTrue(assertNotNull(InthStore(backend).readEnvelope()).optOutGpcReported)
		assertTrue(InthStore(backend).readPendingOptOuts().isEmpty())

		restarted.refresh()
		while (tasks.isNotEmpty()) tasks.removeFirst()()
		assertEquals(1, restartTransport.optOutRequests.size)
	}

	@Test
	fun `optIn after a retryable optOut keeps FIFO order on the wire instead of overtaking the queued record`() {
		val backend = InMemoryKeyValueStore()
		seedSubject(backend)
		val clock = FixedClock(NOW)
		val order = mutableListOf<String>()
		var recordAttempts = 0
		val buttonAnswer = OptOutRecord(
			rights = listOf(OptOutRight.SALE, OptOutRight.SHARE),
			method = OptOutMethod.BUTTON,
			recordedAt = NOW,
			heldBy = OptOutHolder.DEVICE,
		)
		val transport = object : com.inth.core.transport.InthTransport {
			override fun init(context: com.inth.core.transport.InitContext): TransportOutcome = optOutInit()
			override fun save(entry: com.inth.core.model.QueuedSave): SaveOutcome = SaveOutcome.Delivered(subjectId = SUBJECT)
			override fun link(subject: ConsentSubject, user: KernelUser, identityToken: String): LinkOutcome =
				LinkOutcome.Linked(subjectId = subject.id)

			override fun optOut(payload: OptOutPayload, identityToken: String?): OptOutOutcome {
				recordAttempts += 1
				order += "record#$recordAttempts"
				return if (recordAttempts <= 2) {
					OptOutOutcome.Rejected(TransportOutcome.HttpFailure(status = 429, code = "rate_limited"))
				} else {
					OptOutOutcome.Delivered(subjectId = payload.subjectId, optOut = buttonAnswer)
				}
			}

			override fun liftOptOut(payload: LiftOptOutPayload, identityToken: String?): LiftOptOutOutcome {
				order += "lift"
				return LiftOptOutOutcome.Delivered(subjectId = payload.subjectId, optOut = null, cleared = true)
			}
		}
		val store = InthStore(backend)
		val kernel = testKernel(store = store, clock = clock, transport = transport)
		kernel.bootstrap()

		// First optOut gets a retryable 429 and remains queued.
		assertTrue(kernel.optOut().ok)
		assertEquals(listOf("record#1"), order)
		assertEquals(1, store.readPendingOptOuts().size)

		// User then lifts the opt-out while the earlier record still hits 429.
		// The lift must NOT overtake the retryable record.
		assertTrue(kernel.optIn().ok)
		assertNull(kernel.snapshot().optOut)
		assertEquals(listOf("record#1", "record#2"), order)
		assertEquals(
			listOf(OptOutActKind.RECORD, OptOutActKind.LIFT),
			store.readPendingOptOuts().map { it.kind },
		)

		// Next flush delivers the older record first, then the lift, leaving the opt-out cleared.
		val flushed = kernel.flushPending()
		assertEquals(2, flushed.delivered)
		assertEquals(0, flushed.remaining)
		assertEquals(listOf("record#1", "record#2", "record#3", "lift"), order)
		assertNull(kernel.snapshot().optOut)
		assertTrue(kernel.isAllowed(ConsentCategory.MARKETING))
	}

	@Test
	fun `GPC activating before or during an account lift blocks the lift and keeps the durable opt-out`() {
		val accountOptOut = OptOutRecord(
			rights = listOf(OptOutRight.SALE, OptOutRight.SHARE),
			method = OptOutMethod.API,
			recordedAt = NOW - 1_000,
			heldBy = OptOutHolder.PERSON,
		)

		// Case 1: GPC activates while optIn() account lift is in flight.
		run {
			val backend = InMemoryKeyValueStore()
			seedOptOut(backend, accountOptOut)
			val clock = FixedClock(NOW)
			lateinit var kernel: ConsentCore
			val transport = object : com.inth.core.transport.InthTransport {
				override fun init(context: com.inth.core.transport.InitContext): TransportOutcome = optOutInit()
				override fun save(entry: com.inth.core.model.QueuedSave): SaveOutcome = SaveOutcome.Delivered(subjectId = SUBJECT)
				override fun link(subject: ConsentSubject, user: KernelUser, identityToken: String): LinkOutcome =
					LinkOutcome.Linked(subjectId = subject.id)

				override fun optOut(payload: OptOutPayload, identityToken: String?): OptOutOutcome =
					OptOutOutcome.Delivered(subjectId = payload.subjectId, optOut = accountOptOut)

				override fun liftOptOut(payload: LiftOptOutPayload, identityToken: String?): LiftOptOutOutcome {
					kernel.setOverrides(KernelOverrides(gpc = true))
					return LiftOptOutOutcome.Delivered(subjectId = payload.subjectId, optOut = null, cleared = true)
				}
			}
			kernel = testKernel(store = InthStore(backend), clock = clock, transport = transport)
			kernel.bootstrap()
			kernel.identify(KernelUser("user_123"), identityToken = "tok_1")

			val lifted = kernel.optIn()
			assertFalse(lifted.ok)
			assertEquals(OptInRefusalReason.GPC_ACTIVE, lifted.reason)
			assertEquals(accountOptOut, kernel.snapshot().optOut)

			kernel.setOverrides(KernelOverrides(gpc = false))
			assertEquals(accountOptOut, kernel.snapshot().optOut)
			assertFalse(kernel.isAllowed(ConsentCategory.MARKETING))
		}

		// Case 2: GPC activates after a granting save but before liftAccountOptOutAfterSave runs.
		run {
			val backend = InMemoryKeyValueStore()
			seedOptOut(backend, accountOptOut)
			val clock = FixedClock(NOW)
			val tasks = ArrayDeque<() -> Unit>()
			val transport = RecordingTransport()
				.respondInit(optOutInit())
				.respondLink(LinkOutcome.Linked(subjectId = SUBJECT))
				.respondSave(SaveOutcome.Delivered(subjectId = SUBJECT))
				.respondOptOut(OptOutOutcome.Delivered(subjectId = SUBJECT, optOut = accountOptOut))
				.respondLiftOptOut(LiftOptOutOutcome.Delivered(subjectId = SUBJECT, optOut = null, cleared = true))
			val kernel = testKernel(
				store = InthStore(backend),
				clock = clock,
				transport = transport,
				executor = TaskExecutor { tasks.addLast(it) },
			)
			kernel.bootstrap()
			while (tasks.isNotEmpty()) tasks.removeFirst()()
			kernel.identify(KernelUser("user_123"), identityToken = "tok_1")
			while (tasks.isNotEmpty()) tasks.removeFirst()()

			assertTrue(kernel.save(CommitIntent.Custom(mapOf(ConsentCategory.MARKETING to true))).ok)
			kernel.setOverrides(KernelOverrides(gpc = true))
			while (tasks.isNotEmpty()) tasks.removeFirst()()

			assertTrue(transport.liftOptOutRequests.isEmpty(), "GPC must block deferred post-save account lift")
			kernel.setOverrides(KernelOverrides(gpc = false))
			while (tasks.isNotEmpty()) tasks.removeFirst()()
			assertEquals(accountOptOut, kernel.snapshot().optOut)
		}

		// Case 3: GPC activates while liftAccountOptOutAfterSave is in flight (applySyncedOptOut clear path).
		run {
			val backend = InMemoryKeyValueStore()
			seedOptOut(backend, accountOptOut)
			val clock = FixedClock(NOW)
			lateinit var kernel: ConsentCore
			val transport = object : com.inth.core.transport.InthTransport {
				override fun init(context: com.inth.core.transport.InitContext): TransportOutcome = optOutInit()
				override fun save(entry: com.inth.core.model.QueuedSave): SaveOutcome = SaveOutcome.Delivered(subjectId = SUBJECT)
				override fun link(subject: ConsentSubject, user: KernelUser, identityToken: String): LinkOutcome =
					LinkOutcome.Linked(subjectId = subject.id)

				override fun optOut(payload: OptOutPayload, identityToken: String?): OptOutOutcome =
					OptOutOutcome.Delivered(subjectId = payload.subjectId, optOut = accountOptOut)

				override fun liftOptOut(payload: LiftOptOutPayload, identityToken: String?): LiftOptOutOutcome {
					kernel.setOverrides(KernelOverrides(gpc = true))
					return LiftOptOutOutcome.Delivered(subjectId = payload.subjectId, optOut = null, cleared = true)
				}
			}
			kernel = testKernel(store = InthStore(backend), clock = clock, transport = transport)
			kernel.bootstrap()
			kernel.identify(KernelUser("user_123"), identityToken = "tok_1")

			assertTrue(kernel.save(CommitIntent.Custom(mapOf(ConsentCategory.MARKETING to true))).ok)
			assertEquals(accountOptOut, kernel.snapshot().optOut)

			kernel.setOverrides(KernelOverrides(gpc = false))
			assertEquals(accountOptOut, kernel.snapshot().optOut)
			assertFalse(kernel.isAllowed(ConsentCategory.MARKETING))
		}
	}

	@Test
	fun `deferred and in-flight account lifts stay bound to the identity that authorized them`() {
		val optOutA = OptOutRecord(
			rights = listOf(OptOutRight.SALE, OptOutRight.SHARE),
			method = OptOutMethod.API,
			recordedAt = NOW - 2_000,
			heldBy = OptOutHolder.PERSON,
		)
		val optOutB = OptOutRecord(
			rights = listOf(OptOutRight.SALE, OptOutRight.TARGETED_ADS),
			method = OptOutMethod.PROPAGATED,
			recordedAt = NOW - 1_000,
			heldBy = OptOutHolder.PERSON,
		)

		// Case 1: User B signs in before User A's deferred post-save lift dispatches.
		run {
			val backend = InMemoryKeyValueStore()
			seedOptOut(backend, optOutA)
			val clock = FixedClock(NOW)
			val tasks = ArrayDeque<() -> Unit>()
			val transport = RecordingTransport()
				.respondInit(optOutInit())
				.respondLink(LinkOutcome.Linked(subjectId = SUBJECT, optOut = optOutA))
				.respondLink(LinkOutcome.Linked(subjectId = SUBJECT, optOut = optOutB))
				.respondSave(SaveOutcome.Delivered(subjectId = SUBJECT))
				.respondLiftOptOut(LiftOptOutOutcome.Delivered(subjectId = SUBJECT, optOut = null, cleared = true))
			val kernel = testKernel(
				store = InthStore(backend),
				clock = clock,
				transport = transport,
				executor = TaskExecutor { tasks.addLast(it) },
			)
			kernel.bootstrap()
			while (tasks.isNotEmpty()) tasks.removeFirst()()
			kernel.identify(KernelUser("user_a"), identityToken = "tok_a")
			while (tasks.isNotEmpty()) tasks.removeFirst()()

			// User A grants marketing, scheduling a deferred account lift.
			assertTrue(kernel.save(CommitIntent.Custom(mapOf(ConsentCategory.MARKETING to true))).ok)
			// User B signs in before A's background lift task runs.
			kernel.identify(KernelUser("user_b"), identityToken = "tok_b")
			while (tasks.isNotEmpty()) tasks.removeFirst()()

			assertTrue(
				transport.liftOptOutRequests.isEmpty(),
				"User A's deferred lift must not dispatch after User B signs in",
			)
			assertEquals(optOutB, kernel.snapshot().optOut)
		}

		// Case 2: User B signs in while User A's optIn() account lift is in flight.
		run {
			val backend = InMemoryKeyValueStore()
			seedOptOut(backend, optOutA)
			val clock = FixedClock(NOW)
			lateinit var kernel: ConsentCore
			val transport = object : com.inth.core.transport.InthTransport {
				override fun init(context: com.inth.core.transport.InitContext): TransportOutcome = optOutInit()
				override fun save(entry: com.inth.core.model.QueuedSave): SaveOutcome = SaveOutcome.Delivered(subjectId = SUBJECT)
				override fun link(subject: ConsentSubject, user: KernelUser, identityToken: String): LinkOutcome =
					LinkOutcome.Linked(subjectId = subject.id, optOut = if (user.externalId == "user_b") optOutB else optOutA)

				override fun optOut(payload: OptOutPayload, identityToken: String?): OptOutOutcome =
					OptOutOutcome.Delivered(subjectId = payload.subjectId, optOut = optOutA)

				override fun liftOptOut(payload: LiftOptOutPayload, identityToken: String?): LiftOptOutOutcome {
					kernel.identify(KernelUser("user_b"), identityToken = "tok_b")
					return LiftOptOutOutcome.Delivered(subjectId = payload.subjectId, optOut = null, cleared = true)
				}
			}
			kernel = testKernel(store = InthStore(backend), clock = clock, transport = transport)
			kernel.bootstrap()
			kernel.identify(KernelUser("user_a"), identityToken = "tok_a")

			val lifted = kernel.optIn()
			assertFalse(lifted.ok)
			assertEquals(OptInRefusalReason.HELD_BY_ACCOUNT, lifted.reason)
			assertEquals(optOutB, kernel.snapshot().optOut)
		}
	}

	@Test
	fun `logout invalidates an in-flight link opt-out response while a later identify still applies`() {
		val backend = InMemoryKeyValueStore()
		seedSubject(backend)
		val clock = FixedClock(NOW)
		val optOutA = OptOutRecord(
			rights = listOf(OptOutRight.SALE, OptOutRight.SHARE),
			method = OptOutMethod.API,
			recordedAt = NOW - 2_000,
			heldBy = OptOutHolder.PERSON,
		)
		val optOutB = OptOutRecord(
			rights = listOf(OptOutRight.SALE, OptOutRight.TARGETED_ADS),
			method = OptOutMethod.PROPAGATED,
			recordedAt = NOW - 1_000,
			heldBy = OptOutHolder.PERSON,
		)
		lateinit var kernel: ConsentCore
		val transport = object : com.inth.core.transport.InthTransport {
			override fun init(context: com.inth.core.transport.InitContext): TransportOutcome = optOutInit()
			override fun save(entry: com.inth.core.model.QueuedSave): SaveOutcome = SaveOutcome.Delivered(subjectId = SUBJECT)
			override fun link(subject: ConsentSubject, user: KernelUser, identityToken: String): LinkOutcome =
				if (user.externalId == "user_a") {
					kernel.logout()
					LinkOutcome.Linked(subjectId = subject.id, optOut = optOutA)
				} else {
					LinkOutcome.Linked(subjectId = subject.id, optOut = optOutB)
				}

			override fun optOut(payload: OptOutPayload, identityToken: String?): OptOutOutcome =
				OptOutOutcome.Delivered(subjectId = payload.subjectId)

			override fun liftOptOut(payload: LiftOptOutPayload, identityToken: String?): LiftOptOutOutcome =
				LiftOptOutOutcome.Delivered(subjectId = payload.subjectId, optOut = null, cleared = true)
		}
		kernel = testKernel(store = InthStore(backend), clock = clock, transport = transport)
		kernel.bootstrap()

		kernel.identify(KernelUser("user_a"), identityToken = "tok_a")
		assertNull(kernel.snapshot().subject?.externalId)
		assertNull(kernel.snapshot().optOut, "logout must invalidate user_a's in-flight link opt-out")

		kernel.identify(KernelUser("user_b"), identityToken = "tok_b")
		assertEquals("user_b", kernel.snapshot().subject?.externalId)
		assertEquals(optOutB, kernel.snapshot().optOut)
	}

	@Test
	fun `link opt-out checks identifyGeneration inside the mutation after waiting for commitGate`() {
		val optOutA = OptOutRecord(
			rights = listOf(OptOutRight.SALE, OptOutRight.SHARE),
			method = OptOutMethod.API,
			recordedAt = NOW - 2_000,
			heldBy = OptOutHolder.PERSON,
		)
		var observedInterleaving = false
		var installedAfterUserB = false
		for (attempt in 1..40) {
			val backend = InMemoryKeyValueStore()
			seedSubject(backend)
			val clock = FixedClock(NOW)
			val holdWrite = java.util.concurrent.CountDownLatch(1)
			val releaseWrite = java.util.concurrent.CountDownLatch(1)
			val allowLinkReturn = java.util.concurrent.CountDownLatch(1)
			val linkDone = java.util.concurrent.CountDownLatch(1)
			val pauseNextWrite = java.util.concurrent.atomic.AtomicBoolean(false)
			val swapOnNotify = java.util.concurrent.atomic.AtomicBoolean(false)
			val seenUserBWithoutOptOut = java.util.concurrent.atomic.AtomicBoolean(false)
			val storeBackend = object : com.inth.core.spi.KeyValueStore by backend {
				override fun writeDurably(key: String, value: String?): Boolean {
					if (key == InthStoreKeys.SNAPSHOT && pauseNextWrite.compareAndSet(true, false)) {
						holdWrite.countDown()
						releaseWrite.await(5, java.util.concurrent.TimeUnit.SECONDS)
					}
					return backend.writeDurably(key, value)
				}
			}
			val linkWorker = java.util.concurrent.Executors.newSingleThreadExecutor()
			try {
				val linkThreadRef = java.util.concurrent.atomic.AtomicReference<Thread?>()
				val transport = object : com.inth.core.transport.InthTransport {
					override fun init(context: com.inth.core.transport.InitContext): TransportOutcome = optOutInit()
					override fun save(entry: com.inth.core.model.QueuedSave): SaveOutcome = SaveOutcome.Delivered(subjectId = SUBJECT)
					override fun link(subject: ConsentSubject, user: KernelUser, identityToken: String): LinkOutcome {
						if (user.externalId == "user_a") {
							linkThreadRef.set(Thread.currentThread())
							allowLinkReturn.await(5, java.util.concurrent.TimeUnit.SECONDS)
							return LinkOutcome.Linked(subjectId = subject.id, optOut = optOutA)
						}
						return LinkOutcome.Linked(subjectId = subject.id, optOut = null)
					}

					override fun optOut(payload: OptOutPayload, identityToken: String?): OptOutOutcome =
						OptOutOutcome.Delivered(subjectId = payload.subjectId)

					override fun liftOptOut(payload: LiftOptOutPayload, identityToken: String?): LiftOptOutOutcome =
						LiftOptOutOutcome.Delivered(subjectId = payload.subjectId, optOut = null, cleared = true)
				}
				val deferLink = java.util.concurrent.atomic.AtomicBoolean(false)
				val kernel = testKernel(
					store = InthStore(storeBackend),
					clock = clock,
					transport = transport,
					executor = TaskExecutor { task ->
						if (deferLink.compareAndSet(true, false)) {
							linkWorker.execute {
								try {
									task()
								} finally {
									linkDone.countDown()
								}
							}
						} else {
							task()
						}
					},
				)
				kernel.bootstrap()
				kernel.onChange { snapshot ->
					if (snapshot.subject?.externalId == "user_b" && snapshot.optOut == null) {
						seenUserBWithoutOptOut.set(true)
					}
					if (swapOnNotify.compareAndSet(true, false)) {
						// Barges into commitGate right after setOverrides releases it, before linkThread wakes.
						kernel.identify(KernelUser("user_b"))
					}
				}

				deferLink.set(true)
				kernel.identify(KernelUser("user_a"), identityToken = "tok_a")

				// Hold commitGate in setOverrides so user_a's link passes its pre-mutation check and parks on commitGate.
				pauseNextWrite.set(true)
				val blocker = Thread {
					kernel.setOverrides(KernelOverrides(language = "fr"))
				}
				blocker.start()
				assertTrue(holdWrite.await(5, java.util.concurrent.TimeUnit.SECONDS))

				allowLinkReturn.countDown()
				val deadline = System.nanoTime() + java.util.concurrent.TimeUnit.SECONDS.toNanos(5)
				while (System.nanoTime() < deadline) {
					val t = linkThreadRef.get()
					if (t != null && t.state == Thread.State.WAITING) break
					Thread.yield()
				}

				swapOnNotify.set(true)
				releaseWrite.countDown()
				blocker.join(5_000)
				assertTrue(linkDone.await(5, java.util.concurrent.TimeUnit.SECONDS))

				assertEquals("user_b", kernel.snapshot().subject?.externalId)
				if (seenUserBWithoutOptOut.get()) {
					observedInterleaving = true
					if (kernel.snapshot().optOut != null) {
						installedAfterUserB = true
						break
					}
					break
				}
			} finally {
				linkWorker.shutdownNow()
			}
		}
		assertTrue(observedInterleaving, "test must observe user_b acquiring commitGate ahead of user_a's link")
		assertFalse(installedAfterUserB, "user_a's link opt-out must not be installed after user_b's identify")
	}

	@Test
	fun `failed write of authoritative opt-out answer keeps the queued lift pending instead of dropping the account opt-out`() {
		val backend = InMemoryKeyValueStore()
		val deviceOptOut = OptOutRecord(
			rights = listOf(OptOutRight.SALE, OptOutRight.SHARE),
			method = OptOutMethod.BUTTON,
			recordedAt = NOW - 5_000,
			heldBy = OptOutHolder.DEVICE,
		)
		val remainingAccountOptOut = OptOutRecord(
			rights = listOf(OptOutRight.SALE, OptOutRight.SHARE),
			method = OptOutMethod.PROPAGATED,
			recordedAt = NOW - 2_000,
			heldBy = OptOutHolder.PERSON,
		)
		seedOptOut(backend, deviceOptOut)
		val clock = FixedClock(NOW)
		val refuseAuthoritativeOptOutWrite = java.util.concurrent.atomic.AtomicBoolean(false)
		val storeBackend = object : com.inth.core.spi.KeyValueStore by backend {
			override fun writeDurably(key: String, value: String?): Boolean {
				if (
					key == InthStoreKeys.SNAPSHOT &&
					value != null &&
					value.contains("\"heldBy\":\"person\"") &&
					refuseAuthoritativeOptOutWrite.compareAndSet(true, false)
				) {
					return false
				}
				return backend.writeDurably(key, value)
			}
		}
		val transport = RecordingTransport()
			.respondInit(optOutInit())
			.respondLiftOptOut(LiftOptOutOutcome.Unavailable("offline"))
			.respondLiftOptOut(LiftOptOutOutcome.Delivered(subjectId = SUBJECT, optOut = remainingAccountOptOut, cleared = false))
			.respondLiftOptOut(LiftOptOutOutcome.Delivered(subjectId = SUBJECT, optOut = remainingAccountOptOut, cleared = false))
		val store = InthStore(storeBackend)
		val kernel = testKernel(store = store, clock = clock, transport = transport)
		kernel.bootstrap()

		// Lift offline so optOut clears locally and the lift stays queued.
		assertTrue(kernel.optIn().ok)
		assertNull(kernel.snapshot().optOut)
		assertEquals(1, store.readPendingOptOuts().size)

		// Replay receives a remaining account-held opt-out, but persisting that record fails once.
		refuseAuthoritativeOptOutWrite.set(true)
		val firstFlush = kernel.flushPending()
		assertEquals(0, firstFlush.delivered)
		assertEquals(1, firstFlush.remaining)
		assertEquals(1, store.readPendingOptOuts().size, "queued lift must remain pending when storing the answer fails")

		// Next flush retries and durably stores the remaining account opt-out while releasing the act.
		val secondFlush = kernel.flushPending()
		assertEquals(1, secondFlush.delivered)
		assertEquals(0, secondFlush.remaining)
		assertEquals(remainingAccountOptOut, kernel.snapshot().optOut)
		assertEquals(remainingAccountOptOut, assertNotNull(InthStore(backend).readEnvelope()).snapshot.optOut)
		assertTrue(InthStore(backend).readPendingOptOuts().isEmpty())
	}

	@Test
	fun `permanent opt-out rejection stops replay and reports queue-write-failed when queue removal fails`() {
		val backend = InMemoryKeyValueStore()
		seedSubject(backend)
		val clock = FixedClock(NOW)
		val errors = mutableListOf<KernelError>()
		val transport = RecordingTransport()
			.respondInit(optOutInit())
			.respondOptOut(OptOutOutcome.Unavailable("offline"))
			.respondOptOut(OptOutOutcome.Unavailable("offline"))
			.respondOptOut(OptOutOutcome.Rejected(TransportOutcome.HttpFailure(status = 413, code = "payload_too_large")))
			.respondOptOut(OptOutOutcome.Rejected(TransportOutcome.HttpFailure(status = 413, code = "payload_too_large")))
			.respondLiftOptOut(LiftOptOutOutcome.Delivered(subjectId = SUBJECT, optOut = null, cleared = true))
		val store = InthStore(backend)
		val kernel = testKernel(
			store = store,
			clock = clock,
			transport = transport,
			logger = { errors += it },
		)
		kernel.bootstrap()

		// Queue [RECORD, LIFT] while offline.
		assertTrue(kernel.optOut().ok)
		assertTrue(kernel.optIn().ok)
		assertEquals(listOf(OptOutActKind.RECORD, OptOutActKind.LIFT), store.readPendingOptOuts().map { it.kind })
		errors.clear()

		// Backend returns 413 on RECORD while storage refuses to drop the entry.
		backend.refuseDurableWrites = true
		val failedFlush = kernel.flushPending()
		assertEquals(0, failedFlush.delivered)
		assertEquals(2, failedFlush.remaining)
		assertTrue(transport.liftOptOutRequests.isEmpty(), "replay must stop instead of sending LIFT while RECORD stays on disk")
		assertEquals(listOf("queue-write-failed"), errors.map { it.code })

		// Once storage recovers, RECORD is dropped as permanently rejected and LIFT delivers.
		backend.refuseDurableWrites = false
		errors.clear()
		val recoveredFlush = kernel.flushPending()
		assertEquals(1, recoveredFlush.delivered)
		assertEquals(0, recoveredFlush.remaining)
		assertEquals(1, transport.liftOptOutRequests.size)
		assertEquals(listOf("opt-out-rejected"), errors.map { it.code })
		assertTrue(store.readPendingOptOuts().isEmpty())
	}

	private companion object {
		const val NOW = 1_770_000_000_000L
		const val SUBJECT = "019c1c38-a400-7100-8000-000000000001"
		const val CANONICAL_TWO = "019c1c38-a400-7100-8000-000000000002"
		const val RECORD = "019c1c38-a400-7100-8000-000000000099"
	}
}
