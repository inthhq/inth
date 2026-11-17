package com.c15t.core

import com.c15t.core.spi.TaskExecutor
import com.c15t.core.store.C15tStore
import com.c15t.core.spi.KeyValueStore
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException
import kotlin.test.Test
import kotlin.test.assertFailsWith
import kotlin.test.assertSame
import kotlin.test.assertTrue

/** Holds every read until the test releases it, so a bootstrap can be caught mid-flight. */
private class BlockingKeyValueStore(
	private val inner: KeyValueStore,
	private val entered: CountDownLatch,
	private val release: CountDownLatch,
) : KeyValueStore by inner {
	override fun read(key: String): String? {
		entered.countDown()
		release.await()
		return inner.read(key)
	}
}

class FacadeBootstrapTest {
	@Test
	fun `a concurrent bootstrap waits for the installing call to finish`() {
		C15t.uninstall()
		val entered = CountDownLatch(1)
		val release = CountDownLatch(1)
		val pool = Executors.newFixedThreadPool(2)
		try {
			val first = pool.submit<ConsentCore> {
				C15t.bootstrap(
					config = TEST_CONFIG,
					store = C15tStore(BlockingKeyValueStore(InMemoryKeyValueStore(), entered, release)),
					executor = TaskExecutor.DIRECT,
				)
			}
			assertTrue(entered.await(5, TimeUnit.SECONDS), "the first call must reach storage")

			val second = pool.submit<ConsentCore> {
				C15t.bootstrap(
					config = TEST_CONFIG,
					store = C15tStore(InMemoryKeyValueStore()),
					executor = TaskExecutor.DIRECT,
				)
			}
			assertFailsWith<TimeoutException>("the second call must not return a core that is still starting") {
				second.get(300, TimeUnit.MILLISECONDS)
			}

			release.countDown()
			assertSame(first.get(5, TimeUnit.SECONDS), second.get(5, TimeUnit.SECONDS))
		} finally {
			release.countDown()
			pool.shutdownNow()
			C15t.uninstall()
		}
	}
}
