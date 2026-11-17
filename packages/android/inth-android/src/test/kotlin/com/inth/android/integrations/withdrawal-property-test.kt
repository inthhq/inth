package com.inth.android.integrations

import com.inth.core.CommitIntent
import com.inth.core.ConsentCore
import com.inth.core.model.ConsentCategory
import com.inth.core.model.ConsentCategory.MARKETING
import com.inth.core.model.ConsentCategory.MEASUREMENT
import java.util.Collections
import java.util.Random
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

/**
 * Property: whatever grants, withdrawals and vendor calls that return, throw or block
 * came before, a withdrawal returns at once and makes every stop call the same helper
 * makes against a vendor that always returns. A blocked call is a grant-time call on
 * another thread; a stop call that blocks would block its caller in any synchronous
 * API, so calls on the withdrawing thread only return or throw.
 */
@RunWith(Parameterized::class)
class WithdrawalPropertyTest(private val helper: IntegrationHelper, private val measured: Boolean) {
	companion object {
		@JvmStatic
		@Parameterized.Parameters(name = "{0} measured={1}")
		fun cases(): List<Array<Any>> = integrationHelpers.flatMap { listOf(arrayOf<Any>(it, false), arrayOf<Any>(it, true)) }
	}

	private fun connect(core: ConsentCore, call: (String) -> Unit, onError: (Exception) -> Unit) =
		if (measured) helper.measured(core, call, onError) else helper.connect(core, call, onError)

	/** The calls a withdrawal of everything makes, against a vendor that returns. */
	private fun fullDenial(): Set<String> {
		val core = kernel()
		val calls = Collections.synchronizedList(mutableListOf<String>())
		val integration = connect(core, { calls += it }, ::unexpectedError)
		core.choose(MEASUREMENT to true, MARKETING to true)
		calls.clear()
		assertTrue(core.save(CommitIntent.Necessary).ok)
		integration.close()
		return calls.toSet()
	}

	@Test
	fun `withdrawal stops at once in random sequences`() {
		val denial = fullDenial()
		for (seed in 1..25) runSeed(seed.toLong(), denial)
	}

	private fun runSeed(seed: Long, denial: Set<String>) {
		val random = Random(seed)
		// Set during teardown, so a released thread's next call cannot block again.
		val finishing = AtomicBoolean(false)
		// Construction applies the first state and throws a vendor failure to its caller.
		val constructed = AtomicBoolean(false)
		val withdrawing = ConcurrentHashMap.newKeySet<Thread>()
		val held = Collections.synchronizedList(mutableListOf<CountDownLatch>())
		val threads = mutableListOf<Thread>()
		val subjectCalls = Collections.synchronizedList(mutableListOf<String>())
		val shadowCalls = Collections.synchronizedList(mutableListOf<String>())
		val core = kernel()
		// The shadow observes first, so a blocked subject call never delays it.
		val shadow = connect(core, { shadowCalls += it }, ::unexpectedError)
		val subject = connect(core, { name ->
			subjectCalls += name
			if (!constructed.get()) return@connect
			val roll = synchronized(random) { random.nextDouble() }
			when {
				roll < 0.15 -> error("vendor rejected $name")
				roll < 0.40 && Thread.currentThread() !in withdrawing && !finishing.get() -> {
					val release = CountDownLatch(1)
					held += release
					release.await(3, TimeUnit.SECONDS)
				}
			}
		}, {})
		constructed.set(true)
		val granted = mutableSetOf<ConsentCategory>()
		try {
			repeat(30) {
				if (synchronized(random) { random.nextDouble() } < 0.25 && held.isNotEmpty()) {
					val index = synchronized(random) { random.nextInt(held.size) }
					held.removeAt(index).countDown()
					Thread.sleep(20)
					return@repeat
				}
				val category = if (synchronized(random) { random.nextBoolean() }) MARKETING else MEASUREMENT
				val withdrawal = category in granted
				if (withdrawal) granted -= category else granted += category
				val change = CommitIntent.Custom(mapOf(category to !withdrawal))
				if (!withdrawal) {
					val granting = Thread { core.save(change) }
					threads += granting
					granting.start()
					// Wait until the grant reached the helpers: its thread finished or is
					// held inside a vendor call. Not for the vendor calls themselves.
					val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5)
					while (granting.isAlive && granting.state != Thread.State.TIMED_WAITING && System.nanoTime() < deadline) Thread.yield()
					assertTrue("seed $seed: the grant committed", core.isAllowed(category))
					return@repeat
				}
				val subjectMark = subjectCalls.size
				val shadowMark = shadowCalls.size
				val thread = Thread { core.save(change) }
				withdrawing += thread
				thread.start()
				thread.join(5_000)
				assertFalse("seed $seed: withdrawing $category must not wait", thread.isAlive)
				val owed = synchronized(shadowCalls) { shadowCalls.drop(shadowMark) }.filter { it in denial }
				val made = synchronized(subjectCalls) { subjectCalls.drop(subjectMark) }
				assertEquals("seed $seed: stop calls owed after withdrawing $category", emptyList<String>(), owed.filter { it !in made })
			}
		} finally {
			finishing.set(true)
			synchronized(held) { held.forEach(CountDownLatch::countDown) }
			threads.forEach { it.join(5_000) }
			try {
				subject.close()
			} catch (_: Exception) {
				// A vendor call made during teardown may throw by design here.
			}
			shadow.close()
		}
	}
}
