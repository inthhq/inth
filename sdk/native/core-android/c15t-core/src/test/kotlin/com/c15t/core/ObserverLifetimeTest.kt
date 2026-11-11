package com.c15t.core

import com.c15t.core.model.ConsentSnapshot
import com.c15t.core.model.KernelUser
import com.c15t.core.store.C15tStore
import com.c15t.core.transport.TransportOutcome
import java.lang.ref.WeakReference
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * The subscription handle owns its callback. An observer written as an inline
 * lambda, with no other reference, must keep firing after a garbage collection,
 * and must stop once its handle is closed.
 */
class ObserverLifetimeTest {
	@Test
	fun `an inline snapshot observer still fires after a forced collection`() {
		val kernel = testKernel(store = C15tStore(InMemoryKeyValueStore()))
		kernel.bootstrap()
		val revisions = mutableListOf<Long>()
		val subscription = kernel.onChange { revisions += it.revision.toLong() }

		forceCollection()
		kernel.identify(KernelUser(externalId = "user-1"))

		assertTrue(revisions.isNotEmpty(), "the core dropped an observer whose handle was still open")
		subscription.close()
	}

	@Test
	fun `an inline error observer still fires after a forced collection`() {
		val transport = RecordingTransport()
		val kernel = testKernel(store = C15tStore(InMemoryKeyValueStore()), transport = transport)
		kernel.bootstrap()
		val failures = mutableListOf<String>()
		val subscription = kernel.onError { failures += it.message }

		forceCollection()
		transport.respondInit(TransportOutcome.NetworkFailure("offline"))
		kernel.refresh()

		assertTrue("offline" in failures, "the core dropped an error observer whose handle was still open: $failures")
		subscription.close()
	}

	@Test
	fun `closing the handle stops the callback, once per registration`() {
		val kernel = testKernel(store = C15tStore(InMemoryKeyValueStore()))
		kernel.bootstrap()
		var calls = 0
		val observer: (ConsentSnapshot) -> Unit = { calls += 1 }
		val first = kernel.onChange(observer)
		val second = kernel.onChange(observer)

		first.close()
		first.close()
		kernel.identify(KernelUser(externalId = "user-1"))
		val afterFirstClose = calls
		assertTrue(afterFirstClose > 0, "closing one handle must leave the other registration in place")

		second.close()
		kernel.identify(KernelUser(externalId = "user-2"))
		assertEquals(afterFirstClose, calls, "a closed handle still delivered")
	}

	/** Run the collector until an unreachable sentinel is gone, so a weak hold would have been cleared too. */
	private fun forceCollection() {
		val sentinel = WeakReference(Any())
		repeat(50) {
			if (sentinel.get() == null) return
			System.gc()
			Thread.sleep(10)
		}
		error("the JVM did not collect an unreachable object")
	}
}
