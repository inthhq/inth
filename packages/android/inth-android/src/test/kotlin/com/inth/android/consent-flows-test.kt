package com.inth.android

import com.inth.core.CommitIntent
import com.inth.core.ConsentCore
import com.inth.core.NativeConfig
import com.inth.core.model.ConsentCategory
import com.inth.core.model.ConsentDecision
import com.inth.core.model.ConsentSubject
import com.inth.core.model.KernelUser
import com.inth.core.model.QueuedSave
import com.inth.core.spi.KeyValueStore
import com.inth.core.spi.TaskExecutor
import com.inth.core.store.InthStore
import com.inth.core.transport.InthTransport
import com.inth.core.transport.InitContext
import com.inth.core.transport.SaveOutcome
import com.inth.core.transport.TransportOutcome
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.concurrent.Executors

@OptIn(ExperimentalCoroutinesApi::class)
class ConsentFlowsTest {
	@Test
	fun `snapshotFlow holds the current snapshot and follows every save`() {
		val core = resolvedCore()
		val flow = core.snapshotFlow

		assertSame("one hot flow per core keeps collectAsState stable", flow, core.snapshotFlow)
		assertEquals(core.snapshot(), flow.value)

		assertTrue(core.save(CommitIntent.All).ok)

		assertEquals(core.snapshot(), flow.value)
		assertTrue(flow.value.isAllowed(ConsentCategory.MEASUREMENT))
	}

	@Test
	fun `decisionFlow emits each change once, from PENDING to the answer`() = runTest {
		val transport = SwitchableTransport()
		val core = core(transport)
		core.bootstrap()
		val seen = mutableListOf<ConsentDecision>()
		val flow = core.decisionFlow(ConsentCategory.MEASUREMENT)
		val collecting = launch(UnconfinedTestDispatcher(testScheduler)) { flow.collect(seen::add) }

		// Offline refreshes publish nothing new for measurement, so nothing repeats.
		core.refresh()
		core.refresh()
		transport.online = true
		core.refresh()
		assertTrue(core.save(CommitIntent.All).ok)
		assertTrue(core.save(CommitIntent.All).ok)
		assertTrue(core.save(CommitIntent.Necessary).ok)
		collecting.cancel()

		assertEquals(
			listOf(ConsentDecision.PENDING, ConsentDecision.DENIED, ConsentDecision.GRANTED, ConsentDecision.DENIED),
			seen,
		)
		assertSame(flow, core.decisionFlow(ConsentCategory.MEASUREMENT))
	}

	@Test
	fun `the flows keep following the core after a collection`() {
		// The flows never close their onChange subscription, so a screen that only
		// kept the StateFlow still sees later saves.
		val core = resolvedCore()
		val flow = core.decisionFlow(ConsentCategory.MEASUREMENT)
		repeat(3) {
			System.gc()
			Thread.sleep(10)
		}

		assertTrue(core.save(CommitIntent.All).ok)

		assertEquals(ConsentDecision.GRANTED, flow.value)
	}

	@Test
	fun `awaitRefresh returns after the refreshed snapshot reached the flow`() = runTest {
		val worker = Executors.newSingleThreadExecutor()
		try {
			val transport = SwitchableTransport()
			val core = core(transport, TaskExecutor { task -> worker.execute(task) })
			core.awaitRefresh()
			assertFalse(core.snapshotFlow.value.isReady)

			transport.online = true
			core.awaitRefresh()

			assertTrue("the init landed before awaitRefresh returned", core.snapshotFlow.value.isReady)
			assertEquals(ConsentDecision.DENIED, core.decisionFlow(ConsentCategory.MEASUREMENT).value)
		} finally {
			worker.shutdownNow()
		}
	}

	@Test
	fun `awaitSave and awaitFlushPending return the blocking results`() = runTest {
		val transport = SwitchableTransport(online = true)
		val core = core(transport)
		core.bootstrap()
		transport.delivering = false

		val saved = core.awaitSave(CommitIntent.All)

		assertTrue("${saved.error}", saved.ok)
		assertEquals(ConsentDecision.GRANTED, core.decisionFlow(ConsentCategory.MEASUREMENT).value)

		transport.delivering = true
		val flushed = core.awaitFlushPending()

		assertEquals(1, flushed.delivered)
		assertEquals(0, flushed.remaining)
	}

	private fun resolvedCore(): ConsentCore =
		core(SwitchableTransport(online = true)).also { it.bootstrap() }

	private fun core(
		transport: InthTransport,
		executor: TaskExecutor = TaskExecutor.DIRECT,
	) = ConsentCore(
		config = NativeConfig(
			backendUrl = "https://example.test",
			consentCategories = listOf(ConsentCategory.MEASUREMENT),
		),
		store = InthStore(MemoryStore()),
		transport = transport,
		executor = executor,
	)

	private class SwitchableTransport(
		@Volatile var online: Boolean = false,
	) : InthTransport {
		@Volatile var delivering = true

		override fun init(context: InitContext): TransportOutcome =
			if (online) TransportOutcome.Success(Json.parseToJsonElement(OPT_IN), emptyMap())
			else TransportOutcome.NetworkFailure("offline")

		override fun save(entry: QueuedSave): SaveOutcome =
			if (online && delivering) SaveOutcome.Delivered() else SaveOutcome.Unavailable("offline")

		override fun link(subject: ConsentSubject, user: KernelUser, identityToken: String): com.inth.core.transport.LinkOutcome =
			com.inth.core.transport.LinkOutcome.Unavailable("offline")
	}

	private class MemoryStore : KeyValueStore {
		private val values = mutableMapOf<String, String>()
		override fun read(key: String): String? = values[key]
		override fun write(key: String, value: String?) {
			if (value == null) values.remove(key) else values[key] = value
		}
		override fun writeDurably(key: String, value: String?): Boolean {
			write(key, value)
			return true
		}
		override fun keys(): Set<String> = values.keys.toSet()
	}

	private companion object {
		/** A matched opt-in policy that asks for a choice, as `/init` serves it. */
		const val OPT_IN = """{"policyResolution":{"version":1,"status":"matched","policyId":"eu",""" +
			""""matchedBy":"country","fingerprints":{"policy":"p1","choice":"c1","notice":"n1"},""" +
			""""policy":{"id":"eu","model":"opt-in","prompt":"choice","scopeMode":"permissive",""" +
			""""rights":["disclosure","preferences"],""" +
			""""validity":{"choiceMs":2592000000,"noticeMs":15552000000}}},"policySnapshotToken":"snap-1"}"""
	}
}
