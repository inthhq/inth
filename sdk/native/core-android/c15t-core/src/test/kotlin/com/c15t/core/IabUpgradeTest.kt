package com.c15t.core

import com.c15t.core.model.ConsentCategory
import com.c15t.core.store.C15tStore
import java.io.File
import java.util.Base64
import kotlinx.serialization.json.*
import kotlin.test.*

class IabUpgradeTest {
	@Test fun `permissive scope never grants without authority after commands`() {
		val transport = RecordingTransport().respondInit(initSuccess(body = initBody(model = "\"iab\"", scope = "[\"marketing\"]")))
		val core = testKernel(store = C15tStore(InMemoryKeyValueStore()), transport = transport)
		core.bootstrap()
		assertFalse(core.snapshot().policyPending)
		core.dismissNotice()
		assertFalse(core.isAllowed(ConsentCategory.MEASUREMENT))
		core.setOverrides(com.c15t.core.model.KernelOverrides(country = "GB"))
		assertFalse(core.isAllowed(ConsentCategory.MEASUREMENT))
		core.identify(com.c15t.core.model.KernelUser("u1"))
		assertFalse(core.isAllowed(ConsentCategory.MEASUREMENT))
		core.logout()
		assertFalse(core.isAllowed(ConsentCategory.MEASUREMENT))
	}

	@Test fun `configless withdrawal survives refusal reset and repeated clock`() {
		val store = C15tStore(InMemoryKeyValueStore())
		val transport = RecordingTransport().respondInit(initSuccess(body = initBody(model = "\"iab\"")))
			.respondSave(com.c15t.core.transport.SaveOutcome.Rejected(400))
		val now = 1_758_100_060_000L
		val core = testKernel(store = store, transport = transport, clock = FixedClock(now))
		core.bootstrap()
		assertTrue(core.save(CommitIntent.Necessary).ok)
		assertEquals(1, store.readPending().size, "a refused withdrawal stays owed")
		assertTrue(core.save(CommitIntent.Necessary).ok)
		assertEquals(listOf(now + 1), store.readPending().map { it.payload.givenAt })
		val frozen = store.readPending().single().body
		core.reset()
		assertTrue(store.readPending().any { it.body == frozen })
		transport.respondSave(com.c15t.core.transport.SaveOutcome.Delivered)
		core.flushPending()
		assertTrue(store.readPending().isEmpty())
	}

	@Test fun `exact legacy base bytes fail closed and allow pure withdrawal without config`() {
		val file = generateSequence(File(System.getProperty("user.dir"))) { it.parentFile }
			.map { File(it, "native/protocol/iab/legacy-category-store.json") }.first { it.exists() }
		val bytes = Json.parseToJsonElement(file.readText()).jsonObject
		val backend = InMemoryKeyValueStore()
		for ((key, value) in bytes) backend.write(key, String(Base64.getDecoder().decode(value.jsonPrimitive.content)))
		val transport = RecordingTransport().respondInit(initSuccess(body = initBody(model = "\"iab\"")))
		val core = testKernel(store = C15tStore(backend), transport = transport, clock = FixedClock(1_758_100_060_000))
		core.bootstrap()
		assertFalse(core.isAllowed(ConsentCategory.MARKETING))
		assertFalse(core.save(CommitIntent.All).ok)
		assertTrue(core.save(CommitIntent.Necessary).ok)
		assertFalse(core.isAllowed(ConsentCategory.MARKETING))
	}
}
