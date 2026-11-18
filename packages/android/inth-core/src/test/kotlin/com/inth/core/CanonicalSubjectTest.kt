package com.inth.core

import com.inth.core.model.ConsentCategory
import com.inth.core.model.ConsentSnapshot
import com.inth.core.model.ConsentSubject
import com.inth.core.model.KernelError
import com.inth.core.model.KernelUser
import com.inth.core.spi.HttpResponse
import com.inth.core.store.InthJson
import com.inth.core.store.InthStore
import com.inth.core.store.InthStoreKeys
import com.inth.core.transport.HostedTransport
import com.inth.core.transport.LinkOutcome
import com.inth.core.transport.SaveOutcome
import com.inth.core.transport.TransportOutcome
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * Adopting the canonical subject id a `/v1` response names, and linking a person with an
 * identity token. See "Subject identity" in `packages/native-protocol/CONTRACT.md`.
 */
class CanonicalSubjectTest {
	@Test
	fun `a records 200 naming another UUIDv7 replaces the stored id in one revision`() {
		val backend = InMemoryKeyValueStore()
		val store = InthStore(backend)
		val transport = RecordingTransport().respondInit(initSuccess()).respondSave(SaveOutcome.Delivered(CANONICAL))
		val core = testKernel(store = store, transport = transport)
		core.bootstrap()
		val original = assertNotNull(core.snapshot().subject).id
		val published = mutableListOf<ConsentSnapshot>()
		core.onChange { published += it }

		assertTrue(core.save(CommitIntent.All).ok)

		val after = core.snapshot()
		assertEquals(CANONICAL, after.subject?.id)
		assertEquals(listOf(original), after.subject?.previousIds)
		assertTrue(core.isAllowed(ConsentCategory.MARKETING), "the decision is unchanged")
		assertEquals(CANONICAL, store.readSubject()?.id, "the identity slot holds the canonical id")
		assertEquals(CANONICAL, store.readEnvelope()?.snapshot?.subject?.id, "and so does the envelope")
		// The save's own publication, then exactly one for the identity change.
		assertEquals(2, published.size)
		assertEquals(published[0].revision + 1, published[1].revision)
		assertEquals(transport.saveRequests.single().payload.subjectId, original, "the body was not rewritten")
	}

	@Test
	fun `a subject id that is not a UUIDv7 is ignored`() {
		for (named in listOf("sub_4ZrjtiRsJnoW34Px8dAvhPTKJiWc", CANONICAL.uppercase(), "not-an-id")) {
			val store = InthStore(InMemoryKeyValueStore())
			val core = testKernel(
				store = store,
				transport = RecordingTransport().respondInit(initSuccess()).respondSave(SaveOutcome.Delivered(named)),
			)
			core.bootstrap()
			val original = assertNotNull(core.snapshot().subject).id
			core.save(CommitIntent.All)
			assertEquals(original, core.snapshot().subject?.id, named)
			assertEquals(original, store.readSubject()?.id, named)
		}
	}

	@Test
	fun `a grant queued under the replaced id still delivers and a relaunch keeps the decision`() {
		val backend = InMemoryKeyValueStore()
		val offline = RecordingTransport().respondInit(initSuccess()).respondSave(SaveOutcome.Unavailable("offline"))
		val first = testKernel(store = InthStore(backend), transport = offline)
		first.bootstrap()
		val original = assertNotNull(first.snapshot().subject).id
		assertTrue(first.save(CommitIntent.Custom(mapOf(ConsentCategory.MARKETING to true))).ok)
		assertTrue(first.save(CommitIntent.All).ok)
		assertEquals(2, InthStore(backend).readPending().size)

		// Back online: the first delivery names the canonical id, and the second body, frozen
		// under the replaced id, still goes out unchanged.
		val online = RecordingTransport().respondInit(initSuccess()).respondSave(SaveOutcome.Delivered(CANONICAL))
		val store = InthStore(backend)
		val relaunch = testKernel(store = store, transport = online)
		relaunch.bootstrap()
		assertEquals(listOf(original, original), online.saveRequests.map { it.payload.subjectId })
		assertTrue(store.readPending().isEmpty(), "both bodies left the queue")
		assertEquals(CANONICAL, relaunch.snapshot().subject?.id)
		assertTrue(relaunch.isAllowed(ConsentCategory.MEASUREMENT))

		val again = testKernel(store = InthStore(backend), transport = RecordingTransport())
		again.bootstrap()
		assertEquals(CANONICAL, again.snapshot().subject?.id)
		assertTrue(again.snapshot().ready, "the envelope was restored, not discarded")
		assertTrue(again.isAllowed(ConsentCategory.MEASUREMENT))
	}

	@Test
	fun `an envelope still under a replaced id reads as the same subject`() {
		// An app stopped between the identity write and the envelope write.
		val backend = InMemoryKeyValueStore()
		val core = testKernel(
			store = InthStore(backend),
			transport = RecordingTransport().respondInit(initSuccess()).respondSave(SaveOutcome.Delivered()),
		)
		core.bootstrap()
		assertTrue(core.save(CommitIntent.All).ok)
		val original = assertNotNull(core.snapshot().subject)
		backend.putSilently(
			InthStoreKeys.SUBJECT,
			InthJson.storage.encodeToString(ConsentSubject.serializer(), original.replacingId(CANONICAL)),
		)
		val errors = mutableListOf<KernelError>()
		val relaunch = testKernel(store = InthStore(backend), transport = RecordingTransport(), logger = { errors += it })
		relaunch.bootstrap()

		assertTrue(errors.none { it.code.startsWith("subject-id-") }, "got $errors")
		assertEquals(CANONICAL, relaunch.snapshot().subject?.id)
		assertTrue(relaunch.isAllowed(ConsentCategory.MARKETING))
	}

	@Test
	fun `identify with a token links once and adopts the canonical id`() {
		val store = InthStore(InMemoryKeyValueStore())
		val transport = RecordingTransport().respondInit(initSuccess()).respondLink(LinkOutcome.Linked(CANONICAL))
		val core = testKernel(store = store, transport = transport)
		core.bootstrap()
		val original = assertNotNull(core.snapshot().subject).id

		core.identify(KernelUser("user-1", identityProvider = "clerk"), identityToken = "token-1")

		assertEquals(listOf(Triple(original, "user-1", "token-1")), transport.linkRequests)
		assertEquals(CANONICAL, core.snapshot().subject?.id)
		assertEquals("user-1", core.snapshot().subject?.externalId)
		assertEquals(CANONICAL, store.readSubject()?.id)
		val stored = assertNotNull(store.readSubject())
		assertTrue("token-1" !in InthJson.storage.encodeToString(ConsentSubject.serializer(), stored))
	}

	@Test
	fun `a refused link names the backend code, keeps the local identity and is not retried`() {
		val store = InthStore(InMemoryKeyValueStore())
		val failure = TransportOutcome.HttpFailure(401, "identity_token_invalid", "req_7", "token expired")
		val transport = RecordingTransport().respondInit(initSuccess()).respondLink(LinkOutcome.Rejected(failure))
		val errors = mutableListOf<KernelError>()
		val core = testKernel(store = store, transport = transport, logger = { errors += it })
		core.bootstrap()
		val original = assertNotNull(core.snapshot().subject).id

		core.identify(KernelUser("user-1"), identityToken = "token-1")
		core.flushPending()
		core.refresh()

		assertEquals(1, transport.linkRequests.size, "a link is not queued")
		assertEquals(original, core.snapshot().subject?.id)
		assertEquals("user-1", core.snapshot().subject?.externalId)
		val error = errors.single { it.code == "identity_token_invalid" }
		for (fragment in listOf("HTTP 401", "identity_token_invalid", "req_7")) {
			assertTrue(fragment in error.message, "${error.message} must name $fragment")
		}
	}

	@Test
	fun `the link request carries the token and the save body never does`() {
		val http = RecordingHttpClient { request ->
			when {
				request.url.endsWith("/v1/consent/init") -> HttpResponse(200, emptyMap(), initBody())
				request.url.endsWith("/link") -> HttpResponse(200, emptyMap(), """{"subjectId":"$CANONICAL","externalId":"user 1","verifiedBy":"identity_token"}""")
				else -> HttpResponse(200, emptyMap(), """{"subjectId":"$CANONICAL","recordId":"r1","link":{"stored":false,"reason":"unverified"}}""")
			}
		}
		val config = TEST_CONFIG
		val core = testKernel(config = config, store = InthStore(InMemoryKeyValueStore()), transport = HostedTransport(http, config))
		core.bootstrap()
		val original = assertNotNull(core.snapshot().subject).id

		core.identify(KernelUser("user 1", identityProvider = "clerk"), identityToken = "secret-token")
		assertTrue(core.save(CommitIntent.All).ok)

		val link = http.requests.single { it.url.endsWith("/link") }
		assertEquals("POST", link.method)
		assertEquals("https://test.c15t.app/v1/subjects/${java.net.URLEncoder.encode(original, "UTF-8")}/link", link.url)
		assertEquals(
			kotlinx.serialization.json.Json.parseToJsonElement(
				"""{"externalId":"user 1","identityProvider":"clerk","identityToken":"secret-token"}""",
			),
			kotlinx.serialization.json.Json.parseToJsonElement(assertNotNull(link.body)),
		)
		val save = http.requests.single { it.url.endsWith("/v1/consent/records") }
		assertTrue("secret-token" !in assertNotNull(save.body), "the token never goes into a save body")
		assertTrue("\"externalId\":\"user 1\"" in save.body!!)
	}

	private companion object {
		const val CANONICAL = "019c1c38-a400-7100-8000-0000000000aa"
	}
}
