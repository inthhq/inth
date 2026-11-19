package com.inth.core

import com.inth.core.spi.HttpClient
import com.inth.core.spi.HttpRequest
import com.inth.core.spi.HttpResponse
import com.inth.core.spi.TaskExecutor
import com.inth.core.store.InthStore
import com.inth.core.transport.HostedTransport
import com.inth.core.wire.SnapshotWire
import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** `promptOwedSince` names each owed prompt, so a reader that skipped snapshots still sees a new one. */
class PromptOwedSinceTest {
	@Test
	fun theSamePromptOwedAgainGetsANewIdentifier() {
		val core = boot()
		val first = assertNotNull(core.snapshot().promptOwedSince)
		assertTrue(core.snapshot().promptRequirement.acknowledge)

		// An unrelated revision keeps the identifier.
		val before = core.snapshot().revision
		core.refresh()
		assertTrue(core.snapshot().revision > before)
		assertEquals(first, core.snapshot().promptOwedSince)

		assertTrue(core.save(CommitIntent.All).ok)
		assertNull(core.snapshot().promptOwedSince, "nothing is owed")

		core.reset()
		assertTrue(core.snapshot().promptRequirement.acknowledge)
		val again = assertNotNull(core.snapshot().promptOwedSince)
		assertNotEquals(first, again, "the same requirement owed again is a new prompt")
		assertEquals(core.snapshot().revision, again)
	}

	@Test
	fun theIdentifierStaysOutOfTheKernelWire() {
		val core = boot()
		assertNotNull(core.snapshot().promptOwedSince)
		assertFalse("promptOwedSince" in SnapshotWire.toJsonElement(core.snapshot()))
	}

	private fun boot(): ConsentCore {
		val body = generateSequence(File(requireNotNull(System.getProperty("user.dir")))) { it.parentFile }
			.map { File(it, "examples/native/consent-demo/fixtures/category-init.json") }.first { it.exists() }.readText()
		val client = object : HttpClient {
			override fun send(request: HttpRequest) = if (request.method == HttpRequest.GET)
				HttpResponse(200, mapOf("x-inth-policy-contract" to "1"), body) else HttpResponse(503)
		}
		val config = NativeConfig("https://fixture.invalid")
		return ConsentCore(config, InthStore(InMemoryKeyValueStore()), transport = HostedTransport(client, config), executor = TaskExecutor.DIRECT)
			.also { it.bootstrap() }
	}
}
