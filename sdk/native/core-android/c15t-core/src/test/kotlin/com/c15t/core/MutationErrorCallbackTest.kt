package com.c15t.core

import com.c15t.core.model.*
import com.c15t.core.spi.Clock
import com.c15t.core.spi.TaskExecutor
import com.c15t.core.store.C15tStore
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.test.*

class MutationErrorCallbackTest {
	@Test fun `throwing mutation releases the gate for the next action`() {
		val fail = AtomicBoolean(false)
		val failure = IllegalStateException("clock unavailable")
		val core = C15tKernel(config = TEST_CONFIG, store = C15tStore(InMemoryKeyValueStore()),
			transport = RecordingTransport().respondInit(initSuccess()),
			executor = TaskExecutor.DIRECT,
			clock = Clock {
				if (fail.compareAndSet(true, false)) throw failure
				1_700_000_000_000L
			})
		core.bootstrap()
		fail.set(true)
		assertSame(failure, assertFailsWith<IllegalStateException> { core.dismissNotice() })
		val worker = Thread { core.setOverrides(KernelOverrides(language = "de")) }
			.apply { isDaemon = true; name = "mutation-after-exception"; start() }
		worker.join(1500)
		assertFalse(worker.isAlive, "a throwing mutation kept the kernel gate")
		assertEquals("de", core.snapshot().overrides.language)
	}

	@Test fun `refusal error observer may change an override`() {
		val core = testKernel(store = C15tStore(InMemoryKeyValueStore()), transport = RecordingTransport().respondInit(initSuccess()))
		core.bootstrap()
		val entered = CountDownLatch(1)
		val once = AtomicBoolean(false)
		val observer: (KernelError) -> Unit = {
			if (once.compareAndSet(false, true)) {
				entered.countDown()
				core.setOverrides(KernelOverrides(language = "de"))
			}
		}
		val registration = core.onError(observer)
		val worker = Thread {
			core.save(CommitIntent.Necessary, expectedRevision = core.snapshot().revision - 1)
		}.apply { isDaemon = true; name = "refusal-error-reentry"; start() }
		assertTrue(entered.await(2, TimeUnit.SECONDS), "refusal did not reach error observer")
		worker.join(1500)
		registration.close()
		assertFalse(worker.isAlive, "error listener reentered a mutation and deadlocked the entire kernel gate")
		assertEquals("de", core.snapshot().overrides.language)
	}

	@Test fun `refusal logger may change an override`() {
		val once = AtomicBoolean(false)
		lateinit var core: C15tKernel
		core = testKernel(store = C15tStore(InMemoryKeyValueStore()),
			transport = RecordingTransport().respondInit(initSuccess()),
			logger = { if (once.compareAndSet(false, true)) core.setOverrides(KernelOverrides(language = "de")) })
		core.bootstrap()
		val worker = Thread { core.save(CommitIntent.Necessary, expectedRevision = core.snapshot().revision - 1) }
			.apply { isDaemon = true; name = "refusal-logger-reentry"; start() }
		worker.join(1500)
		assertFalse(worker.isAlive, "logger reentry deadlocked the kernel")
		assertEquals("de", core.snapshot().overrides.language)
	}

	@Test fun `orphan identity diagnostic observer may change an override`() {
		val backend = InMemoryKeyValueStore()
		testKernel(store = C15tStore(backend), transport = RecordingTransport().respondInit(initSuccess())).bootstrap()
		backend.write(com.c15t.core.store.C15tStoreKeys.SUBJECT, null)
		val core = testKernel(store = C15tStore(backend), transport = RecordingTransport().respondInit(initSuccess()))
		val once = AtomicBoolean(false)
		val observer: (KernelError) -> Unit = { error ->
			if (error.code == "subject-id-missing" && once.compareAndSet(false, true)) {
				core.setOverrides(KernelOverrides(language = "de"))
			}
		}
		val registration = core.onError(observer)
		val worker = Thread { core.bootstrap() }.apply { isDaemon = true; name = "identity-error-reentry"; start() }
		worker.join(1500)
		registration.close()
		assertFalse(worker.isAlive, "identity diagnostic reentry deadlocked bootstrap")
		assertTrue(once.get())
		assertEquals("de", core.snapshot().overrides.language)
	}
}
