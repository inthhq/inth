package com.inth.reactnative

import com.inth.core.CommitIntent
import com.inth.core.Subscription
import com.inth.core.model.ConsentSnapshot
import com.inth.core.model.KernelError
import com.inth.core.store.InthStore
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Event rules from `packages/native-protocol/CONTRACT.md`: the module announces a revision, never a
 * snapshot, and JavaScript pulls.
 */
class InthChangePumpTest {
	private val json = Json { ignoreUnknownKeys = true }

	@Test
	fun `one snapshot event per committed change`() {
		val kernel = bridgeKernel(InthStore(MemoryStore()))
		kernel.bootstrap()
		val sink = RecordingSink()
		val pump = InthChangePump(sink)
		val observer: (ConsentSnapshot) -> Unit = { pump.onSnapshot(it) }
		val subscription: Subscription = kernel.onChange(observer)

		kernel.save(CommitIntent.All)

		val events = sink.names(InthChangePump.EVENT_SNAPSHOT)
		assertEquals("one commit is one event", 1, events.size)
		assertEquals(kernel.snapshot().revision, json.parseToJsonElement(events.first()).jsonObject["revision"]!!.jsonPrimitive.long)
		val payload = json.parseToJsonElement(events.first()).jsonObject
		assertTrue("the payload carries the dirty flag", payload["dirty"]!!.jsonPrimitive.content.toBoolean())
		assertEquals(
			"the event carries a revision and a flag, not a snapshot",
			setOf("revision", "dirty"),
			payload.keys,
		)

		kernel.save(CommitIntent.Necessary)

		val afterTwo = sink.names(InthChangePump.EVENT_SNAPSHOT)
		assertEquals("two commits, two events", 2, afterTwo.size)
		val revisions = afterTwo.map { json.parseToJsonElement(it).jsonObject["revision"]!!.jsonPrimitive.long }
		assertEquals("revisions are the two distinct results, in order", 2, revisions.distinct().size)
		assertTrue("revisions increase", revisions[0] < revisions[1])
		subscription.close()
	}

	@Test
	fun `the same revision never emits twice`() {
		val sink = RecordingSink()
		val pump = InthChangePump(sink)
		val snapshot = ConsentSnapshot(revision = 7)

		pump.onSnapshot(snapshot)
		pump.onSnapshot(snapshot)
		pump.onSnapshot(ConsentSnapshot(revision = 7))

		assertEquals(1, sink.names(InthChangePump.EVENT_SNAPSHOT).size)
	}

	@Test
	fun `initialized is announced once, when a policy first resolves`() {
		val sink = RecordingSink()
		val pump = InthChangePump(sink)

		pump.onSnapshot(ConsentSnapshot(revision = 1, policyPending = true))
		assertEquals("nothing is initialized while the policy is pending", 0, sink.names(InthChangePump.EVENT_INITIALIZED).size)

		pump.onSnapshot(ConsentSnapshot(revision = 2, policyPending = false))
		pump.onSnapshot(ConsentSnapshot(revision = 3, policyPending = false))

		val initialized = sink.names(InthChangePump.EVENT_INITIALIZED)
		assertEquals(1, initialized.size)
		assertEquals(2L, json.parseToJsonElement(initialized.first()).jsonObject["revision"]!!.jsonPrimitive.long)
	}

	@Test
	fun `errors reach JavaScript in the NativeSnapshotError shape`() {
		val sink = RecordingSink()
		val pump = InthChangePump(sink)

		pump.onError(KernelError("save-rejected", "HTTP 422 invalid_request"))

		val payload = json.parseToJsonElement(sink.names(InthChangePump.EVENT_ERROR).single()).jsonObject
		assertEquals("save-rejected", payload["code"]!!.jsonPrimitive.content)
		assertEquals("HTTP 422 invalid_request", payload["message"]!!.jsonPrimitive.content)
	}
}
