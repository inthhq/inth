package com.c15t.android.integrations

import com.c15t.core.CommitIntent
import com.c15t.core.ConsentCore
import java.util.Collections
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized

/**
 * Vendor calls recorded as strings. [blockNext] blocks the call `skip` calls from now
 * until `release` counts down, and returns a latch that opens when that call starts.
 */
internal class BlockingRecorder {
	private class Hold(var skip: Int, val release: CountDownLatch, val entered: CountDownLatch)

	val calls: MutableList<String> = Collections.synchronizedList(mutableListOf())
	private val hold = AtomicReference<Hold?>()

	fun blockNext(release: CountDownLatch, skip: Int = 0): CountDownLatch =
		CountDownLatch(1).also { hold.set(Hold(skip, release, it)) }

	fun call(name: String) {
		calls += name
		val held = hold.get() ?: return
		synchronized(held) {
			if (held.skip > 0) {
				held.skip--
				return
			}
		}
		if (!hold.compareAndSet(held, null)) return
		held.entered.countDown()
		check(held.release.await(10, TimeUnit.SECONDS)) { "test never released the blocked call" }
	}

	fun since(mark: Int): List<String> = synchronized(calls) { calls.drop(mark) }
}

class IntegrationHelper internal constructor(val name: String, internal val connect: (ConsentCore, (String) -> Unit, (Exception) -> Unit) -> AutoCloseable) {
	override fun toString() = name
}

internal val integrationHelpers = listOf(
	IntegrationHelper("Firebase") { core, r, e ->
		FirebaseAnalyticsIntegration(core, setConsent = { r("consent:${it.analyticsStorage}:${it.adStorage}") }, setCollectionEnabled = { r("collection:$it") }, onError = e)
	},
	IntegrationHelper("PostHog") { core, r, e -> PostHogIntegration(core, optIn = { r("optIn") }, optOut = { r("optOut") }, onError = e) },
	IntegrationHelper("Mixpanel") { core, r, e -> MixpanelIntegration(core, optInTracking = { r("optIn") }, optOutTracking = { r("optOut") }, onError = e) },
	IntegrationHelper("Sentry Replay") { core, r, e -> SentryReplayIntegration(core, start = { r("start") }, stop = { r("stop") }, onError = e) },
	IntegrationHelper("AdMob") { core, r, e -> AdMobIntegration(core, setConsent = { r("ads:${it.adStorage}") }, onError = e) },
	IntegrationHelper("AppsFlyer") { core, r, e ->
		AppsFlyerIntegration(core, setConsentData = { r("consent:${it.adUserData}") }, stop = { r("stop:$it") }, start = { r("start") }, onError = e)
	},
	IntegrationHelper("Adjust") { core, r, e ->
		AdjustIntegration(core, enable = { r("enable") }, disable = { r("disable") }, trackThirdPartySharing = { r("sharing:${it.adUserData}") }, onError = e)
	},
	IntegrationHelper("Meta App Events") { core, r, e ->
		MetaAppEventsIntegration(core,
			setAutoLogAppEventsEnabled = { r("autoLog:$it") },
			setAdvertiserIDCollectionEnabled = { r("advertiserId:$it") },
			setLimitedDataUse = { r("ldu:$it") },
			onError = e,
		)
	},
)

@RunWith(Parameterized::class)
class WithdrawalPreemptionTest(private val helper: IntegrationHelper) {
	companion object {
		@JvmStatic
		@Parameterized.Parameters(name = "{0}")
		fun helpers(): List<IntegrationHelper> = integrationHelpers
	}

	/** The calls a helper makes for denial, for a grant, and those only a grant makes. */
	private fun profile(): Triple<List<String>, List<String>, Set<String>> {
		val core = kernel()
		val recorder = BlockingRecorder()
		val integration = helper.connect(core, recorder::call, ::unexpectedError)
		val denied = recorder.since(0)
		val mark = recorder.calls.size
		assertTrue(core.save(CommitIntent.All).ok)
		val grant = recorder.since(mark)
		integration.close()
		return Triple(denied, grant, grant.toSet() - denied.toSet())
	}

	@Test
	fun `withdrawal applies at once while any grant-time vendor call is blocked`() {
		val (denied, grant, grantedOnly) = profile()
		assertTrue("${helper.name} must make a grant-only call", grantedOnly.isNotEmpty())
		// Hold each grant-time call in turn, so every enabling call is shown to
		// re-read consent rather than trust a stale grant.
		for (held in grant.indices) {
			val core = kernel()
			val recorder = BlockingRecorder()
			val integration = helper.connect(core, recorder::call, ::unexpectedError)
			val release = CountDownLatch(1)
			val entered = recorder.blockNext(release, skip = held)
			val granting = Thread { core.save(CommitIntent.All) }
			granting.start()
			assertTrue(entered.await(5, TimeUnit.SECONDS))

			val mark = recorder.calls.size
			val withdrawing = Thread { core.save(CommitIntent.Necessary) }
			withdrawing.start()
			withdrawing.join(5_000)
			assertFalse("withdrawal must not wait for grant call $held", withdrawing.isAlive)
			assertTrue("grant call $held is still blocked", granting.isAlive)
			assertEquals(
				"every denial call ran, in order, while grant call $held was blocked",
				denied,
				recorder.since(mark).filter { it in denied }.take(denied.size),
			)

			release.countDown()
			granting.join(5_000)
			assertFalse(granting.isAlive)
			val afterWithdrawal = recorder.since(mark)
			assertEquals("no grant-only call after withdrawal, holding grant call $held", emptyList<String>(), afterWithdrawal.filter { it in grantedOnly })
			assertEquals("the late grant is overwritten by denial", denied, afterWithdrawal.takeLast(denied.size))
			integration.close()
		}
	}

	@Test
	fun `a regrant waits for a blocked preempting withdrawal, then applies`() {
		val (_, _, grantedOnly) = profile()
		val core = kernel()
		val recorder = BlockingRecorder()
		val integration = helper.connect(core, recorder::call, ::unexpectedError)
		val releaseGrant = CountDownLatch(1)
		val grantEntered = recorder.blockNext(releaseGrant)
		val granting = Thread { core.save(CommitIntent.All) }
		granting.start()
		assertTrue(grantEntered.await(5, TimeUnit.SECONDS))

		val releaseWithdrawal = CountDownLatch(1)
		val withdrawalEntered = recorder.blockNext(releaseWithdrawal)
		val withdrawing = Thread { core.save(CommitIntent.Necessary) }
		withdrawing.start()
		assertTrue(withdrawalEntered.await(5, TimeUnit.SECONDS))

		releaseGrant.countDown()
		granting.join(5_000)
		assertFalse(granting.isAlive)
		val mark = recorder.calls.size
		val regranting = Thread { core.save(CommitIntent.All) }
		regranting.start()
		regranting.join(5_000)
		assertFalse("the regrant must not wait for the blocked withdrawal", regranting.isAlive)
		assertEquals("the regrant must not overtake the blocked withdrawal", emptyList<String>(), recorder.since(mark).filter { it in grantedOnly })

		releaseWithdrawal.countDown()
		withdrawing.join(5_000)
		assertFalse(withdrawing.isAlive)
		val afterRelease = recorder.since(mark)
		assertTrue("the regrant applies once the withdrawal returns", afterRelease.containsAll(grantedOnly))
		val lastGrant = afterRelease.indexOfLast { it in grantedOnly }
		val lastDenial = afterRelease.indexOfLast { it !in grantedOnly }
		assertTrue("the vendor ends granted", lastGrant > lastDenial)
		integration.close()
	}

	@Test
	fun `a failing first denial call does not skip the rest and is reported`() {
		val (denied, _, _) = profile()
		val core = kernel()
		val recorder = BlockingRecorder()
		val failures = mutableListOf<Exception>()
		var fail = false
		val integration = helper.connect(core, { name ->
			if (fail && name == denied.first()) error("vendor rejected $name")
			recorder.call(name)
		}, { failures += it })
		assertTrue(core.save(CommitIntent.All).ok)
		val mark = recorder.calls.size
		fail = true
		assertTrue(core.save(CommitIntent.Necessary).ok)
		assertEquals(denied.drop(1), recorder.since(mark))
		assertEquals(listOf("vendor rejected ${denied.first()}"), failures.map { it.message })
		fail = false
		integration.close()
	}
}
