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

/** Vendor calls recorded as strings. The next call after [blockNext] blocks until released. */
internal class BlockingRecorder {
	val calls: MutableList<String> = Collections.synchronizedList(mutableListOf())
	private val gate = AtomicReference<CountDownLatch?>()
	val entered = CountDownLatch(1)

	fun blockNext(release: CountDownLatch) = gate.set(release)

	fun call(name: String) {
		calls += name
		val release = gate.getAndSet(null) ?: return
		entered.countDown()
		check(release.await(10, TimeUnit.SECONDS)) { "test never released the blocked call" }
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
	IntegrationHelper("Braze") { core, r, e ->
		BrazeIntegration(core, enableSdk = { r("enable") }, disableSdk = { r("disable") }, setGoogleAdsConsent = { r("ads:${it.adUserData}") }, onError = e)
	},
	IntegrationHelper("Branch") { core, r, e ->
		BranchIntegration(core, setConsumerProtectionAttributionLevel = { r("level:$it") }, setDMAParamsForEEA = { r("dma:${it.adUserData}") }, onError = e)
	},
	IntegrationHelper("Singular") { core, r, e ->
		SingularIntegration(core,
			limitDataSharing = { r("limit:$it") },
			stopAllTracking = { r("stop") },
			resumeAllTracking = { r("resume") },
			trackingOptIn = { r("optIn") },
			onError = e,
		)
	},
	IntegrationHelper("Amplitude") { core, r, e -> AmplitudeIntegration(core, setOptOut = { r("optOut:$it") }, onError = e) },
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

	/** The calls a helper makes for denial, and those only a grant makes. */
	private fun profile(): Pair<List<String>, Set<String>> {
		val core = kernel()
		val recorder = BlockingRecorder()
		val integration = helper.connect(core, recorder::call, ::unexpectedError)
		val denied = recorder.since(0)
		val mark = recorder.calls.size
		assertTrue(core.save(CommitIntent.All).ok)
		val grantedOnly = recorder.since(mark).toSet() - denied.toSet()
		integration.close()
		return denied to grantedOnly
	}

	@Test
	fun `withdrawal applies at once while a grant-time vendor call is blocked`() {
		val (denied, grantedOnly) = profile()
		assertTrue("${helper.name} must make a grant-only call", grantedOnly.isNotEmpty())
		val core = kernel()
		val recorder = BlockingRecorder()
		val integration = helper.connect(core, recorder::call, ::unexpectedError)
		val release = CountDownLatch(1)
		recorder.blockNext(release)
		val granting = Thread { core.save(CommitIntent.All) }
		granting.start()
		assertTrue(recorder.entered.await(5, TimeUnit.SECONDS))

		val mark = recorder.calls.size
		val withdrawing = Thread { core.save(CommitIntent.Necessary) }
		withdrawing.start()
		withdrawing.join(5_000)
		assertFalse("withdrawal must not wait for the blocked grant", withdrawing.isAlive)
		assertTrue("the grant is still blocked", granting.isAlive)
		val beforeRelease = recorder.since(mark)
		assertEquals("every denial call ran, in order, before the grant returned", denied, beforeRelease.filter { it in denied }.take(denied.size))

		release.countDown()
		granting.join(5_000)
		assertFalse(granting.isAlive)
		val afterWithdrawal = recorder.since(mark)
		assertEquals("no grant-only call after withdrawal", emptyList<String>(), afterWithdrawal.filter { it in grantedOnly })
		assertEquals("the late grant is overwritten by denial", denied, afterWithdrawal.takeLast(denied.size))
		integration.close()
	}

	@Test
	fun `a failing first denial call does not skip the rest and is reported`() {
		val (denied, _) = profile()
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
