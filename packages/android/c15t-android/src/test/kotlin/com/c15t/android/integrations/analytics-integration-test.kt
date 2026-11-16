package com.c15t.android.integrations

import com.c15t.core.ConsentCore
import com.c15t.core.CommitIntent
import com.c15t.core.model.ConsentCategory
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import java.lang.ref.WeakReference
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AnalyticsIntegrationTest {
	@Test
	fun `dropping the posthog handle does not stop withdrawal`() {
		val core = kernel()
		assertTrue(core.save(CommitIntent.All).ok)
		val calls = mutableListOf<String>()
		val handle = connectWithoutRetainingHandle(core, calls)
		repeat(20) {
			System.gc()
			System.runFinalization()
			Thread.sleep(5)
		}
		assertTrue(core.save(CommitIntent.Necessary).ok)
		assertEquals(listOf("in", "out"), calls)
		handle.get()?.close()
	}

	private fun connectWithoutRetainingHandle(core: ConsentCore, calls: MutableList<String>) =
		WeakReference(PostHogIntegration(core,
			optIn = { calls += "in" }, optOut = { calls += "out" },
			onError = ::unexpectedError,
		))

	@Test
	fun `firebase immediately disables a persisted vendor grant while authority is pending`() {
		val core = kernel(online = false)
		val calls = mutableListOf<String>()
		val integration = firebase(core, calls)

		assertEquals(listOf("collection:false", "consent:false"), calls)
		integration.close()
		integration.close()
		assertEquals(4, calls.size)
	}

	@Test
	fun `firebase applies a current grant immediately and disables before withdrawal`() {
		val core = kernel()
		assertTrue(core.save(CommitIntent.All).ok)
		val calls = mutableListOf<String>()
		val integration = firebase(core, calls)
		assertEquals(listOf("collection:false", "consent:true", "collection:true"), calls)

		calls.clear()
		assertTrue(core.save(CommitIntent.Necessary).ok)
		assertEquals(listOf("collection:false", "consent:false"), calls)
		integration.close()
	}

	@Test
	fun `firebase grants advertising from marketing as the web does`() {
		val core = kernel()
		val states = mutableListOf<FirebaseAnalyticsConsent>()
		val integration = FirebaseAnalyticsIntegration(core, onError = ::unexpectedError, setConsent = states::add, setCollectionEnabled = {})
		assertTrue(core.save(CommitIntent.All).ok)

		assertEquals(
			listOf(
				FirebaseAnalyticsConsent(analyticsStorage = false, adStorage = false, adUserData = false, adPersonalization = false),
				FirebaseAnalyticsConsent(analyticsStorage = true, adStorage = true, adUserData = true, adPersonalization = true),
			),
			states,
		)
		integration.close()
		assertEquals(FirebaseAnalyticsConsent(false, false, false, false), states.last())
	}

	@Test
	fun `firebase follows marketing alone without enabling collection`() {
		val core = kernel()
		val states = mutableListOf<FirebaseAnalyticsConsent>()
		val enabled = mutableListOf<Boolean>()
		val integration = FirebaseAnalyticsIntegration(core, onError = ::unexpectedError, setConsent = states::add, setCollectionEnabled = enabled::add)
		states.clear()

		assertTrue(core.save(CommitIntent.Custom(mapOf(ConsentCategory.MARKETING to true))).ok)
		assertEquals(listOf(FirebaseAnalyticsConsent(false, true, true, true)), states)
		assertTrue(core.save(CommitIntent.Custom(mapOf(ConsentCategory.MARKETING to false))).ok)
		assertEquals(FirebaseAnalyticsConsent(false, false, false, false), states.last())
		assertEquals(2, states.size)
		assertFalse(enabled.contains(true))
		integration.close()
	}

	@Test
	fun `unrelated native publications do not repeat vendor calls`() {
		val core = kernel()
		val calls = mutableListOf<String>()
		val integration = firebase(core, calls)
		calls.clear()

		assertTrue(core.save(CommitIntent.Custom(mapOf(ConsentCategory.EXPERIENCE to true))).ok)
		core.refresh()
		assertTrue(calls.isEmpty())
		integration.close()
	}

	@Test
	fun `closing a granted integration disables and prevents later grants`() {
		val core = kernel()
		val calls = mutableListOf<String>()
		val integration = firebase(core, calls)
		assertTrue(core.save(CommitIntent.All).ok)
		calls.clear()

		integration.close()
		integration.close()
		assertTrue(core.save(CommitIntent.Necessary).ok)
		assertTrue(core.save(CommitIntent.All).ok)
		assertEquals(listOf("collection:false", "consent:false"), calls)
	}

	@Test
	fun `firebase rechecks a grant if consent is withdrawn during the vendor callback`() {
		val core = kernel()
		val enabled = mutableListOf<Boolean>()
		val consent = mutableListOf<Boolean>()
		val integration = FirebaseAnalyticsIntegration(
			core,
			onError = ::unexpectedError,
			setConsent = {
				consent += it.analyticsStorage
				if (it.analyticsStorage) assertTrue(core.save(CommitIntent.Necessary).ok)
			},
			setCollectionEnabled = enabled::add,
		)

		assertTrue(core.save(CommitIntent.All).ok)

		assertFalse("a withdrawn grant must never enable collection", enabled.contains(true))
		assertEquals(listOf(false, true, false), consent)
		integration.close()
	}

	@Test
	fun `reentrant close during consent update never enables collection afterwards`() {
		val core = kernel()
		val enabled = mutableListOf<Boolean>()
		lateinit var integration: FirebaseAnalyticsIntegration
		integration = FirebaseAnalyticsIntegration(
			core,
			onError = ::unexpectedError,
			setConsent = { if (it.analyticsStorage) integration.close() },
			setCollectionEnabled = enabled::add,
		)

		assertTrue(core.save(CommitIntent.All).ok)

		assertFalse(enabled.contains(true))
		assertTrue(core.save(CommitIntent.Necessary).ok)
		assertTrue(core.save(CommitIntent.All).ok)
		assertFalse(enabled.contains(true))
	}

	@Test
	fun `withdrawal committed on another thread prevents a delayed firebase enable`() {
		val core = kernel()
		val enteredGrant = CountDownLatch(1)
		val releaseGrant = CountDownLatch(1)
		val enabled = mutableListOf<Boolean>()
		val failure = AtomicReference<Throwable?>()
		val integration = FirebaseAnalyticsIntegration(
			core,
			onError = ::unexpectedError,
			setConsent = {
				if (it.analyticsStorage) {
					enteredGrant.countDown()
					check(releaseGrant.await(5, TimeUnit.SECONDS))
				}
			},
			setCollectionEnabled = enabled::add,
		)
		val granting = Thread {
			try { check(core.save(CommitIntent.All).ok) } catch (error: Throwable) { failure.set(error) }
		}
		granting.start()
		assertTrue(enteredGrant.await(5, TimeUnit.SECONDS))
		val withdrawing = Thread {
			try { check(core.save(CommitIntent.Necessary).ok) } catch (error: Throwable) { failure.set(error) }
		}
		withdrawing.start()
		try {
			val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5)
			while (core.isAllowed(ConsentCategory.MEASUREMENT) && System.nanoTime() < deadline) Thread.yield()
			assertFalse("withdrawal must commit while the vendor callback is blocked", core.isAllowed(ConsentCategory.MEASUREMENT))
		} finally {
			releaseGrant.countDown()
			granting.join(5_000)
			withdrawing.join(5_000)
		}
		assertFalse(granting.isAlive)
		assertFalse(withdrawing.isAlive)
		assertEquals(null, failure.get())
		assertFalse(enabled.contains(true))
		integration.close()
	}

	@Test
	fun `restart reconciles the persisted native refusal over vendor state`() {
		val store = MemoryStore()
		val first = kernel(store)
		assertTrue(first.save(CommitIntent.All).ok)
		assertTrue(first.save(CommitIntent.Necessary).ok)
		val calls = mutableListOf<String>()
		val restarted = kernel(store, online = false)
		val integration = firebase(restarted, calls)

		assertFalse(restarted.isAllowed(ConsentCategory.MEASUREMENT))
		assertEquals(listOf("collection:false", "consent:false"), calls)
		integration.close()
	}

	@Test
	fun `restart immediately applies a retained native grant`() {
		val store = MemoryStore()
		assertTrue(kernel(store).save(CommitIntent.All).ok)
		val calls = mutableListOf<String>()
		val integration = firebase(kernel(store, online = false), calls)

		assertEquals(listOf("collection:false", "consent:true", "collection:true"), calls)
		integration.close()
	}

	@Test
	fun `posthog opts out until granted and again on withdrawal and close`() {
		val core = kernel(online = false)
		val calls = mutableListOf<String>()
		val integration = PostHogIntegration(core, onError = ::unexpectedError, optIn = { calls += "in" }, optOut = { calls += "out" })
		assertEquals(listOf("out"), calls)
		integration.close()

		val resolved = kernel()
		val active = PostHogIntegration(resolved, onError = ::unexpectedError, optIn = { calls += "in" }, optOut = { calls += "out" })
		assertTrue(resolved.save(CommitIntent.All).ok)
		assertTrue(resolved.save(CommitIntent.Necessary).ok)
		assertTrue(resolved.save(CommitIntent.All).ok)
		active.close()
		active.close()
		assertEquals(listOf("out", "out", "out", "in", "out", "in", "out"), calls)
	}

	@Test
	fun `custom optional category does not follow measurement grants`() {
		val core = kernel()
		val calls = mutableListOf<Boolean>()
		val integration = PostHogIntegration(
			core,
			onError = ::unexpectedError,
			category = ConsentCategory.EXPERIENCE,
			optIn = { calls += true },
			optOut = { calls += false },
		)
		assertTrue(core.save(CommitIntent.Custom(mapOf(ConsentCategory.MEASUREMENT to true))).ok)
		assertEquals(listOf(false), calls)
		assertTrue(core.save(CommitIntent.Custom(mapOf(ConsentCategory.EXPERIENCE to true))).ok)
		assertEquals(listOf(false, true), calls)
		integration.close()
	}

	@Test(expected = IllegalArgumentException::class)
	fun `necessary cannot authorize analytics`() {
		PostHogIntegration(kernel(), onError = ::unexpectedError, category = ConsentCategory.NECESSARY, optIn = {}, optOut = {})
	}

	@Test
	fun `a failed initial vendor call detaches its observer`() {
		val core = kernel()
		var calls = 0
		try {
			FirebaseAnalyticsIntegration(core, onError = ::unexpectedError, setCollectionEnabled = {}, setConsent = {
				calls++
				error("vendor refused configuration")
			})
			throw AssertionError("construction must report the vendor failure")
		} catch (error: IllegalStateException) {
			assertEquals("vendor refused configuration", error.message)
		}
		val callsAfterFailure = calls
		assertTrue(core.save(CommitIntent.All).ok)
		assertEquals(callsAfterFailure, calls)
	}

	@Test
	fun `failed vendor teardown can be retried without reattaching`() {
		val core = kernel()
		var failDisable = false
		val enabled = mutableListOf<Boolean>()
		val integration = FirebaseAnalyticsIntegration(core, onError = ::unexpectedError, setConsent = {}, setCollectionEnabled = {
			if (!it && failDisable) error("vendor rejected disable")
			enabled += it
		})
		assertTrue(core.save(CommitIntent.All).ok)
		failDisable = true
		try {
			integration.close()
			throw AssertionError("teardown must report the vendor failure")
		} catch (error: IllegalStateException) {
			assertEquals("vendor rejected disable", error.message)
		}
		failDisable = false
		integration.close()
		assertEquals(listOf(false, false, true, false), enabled)
		assertTrue(core.save(CommitIntent.Necessary).ok)
		assertTrue(core.save(CommitIntent.All).ok)
		assertEquals(listOf(false, false, true, false), enabled)
	}

	@Test
	fun `firebase sync restores native denial and grant after vendor reset`() {
		val core = kernel()
		var enabled = true
		var analyticsStorage = true
		val integration = FirebaseAnalyticsIntegration(core, onError = ::unexpectedError,
			setConsent = { analyticsStorage = it.analyticsStorage },
			setCollectionEnabled = { enabled = it },
		)
		enabled = true
		analyticsStorage = true
		integration.sync()
		assertFalse(enabled)
		assertFalse(analyticsStorage)

		assertTrue(core.save(CommitIntent.All).ok)
		enabled = false
		analyticsStorage = false
		integration.sync()
		assertTrue(enabled)
		assertTrue(analyticsStorage)
		integration.close()
		integration.sync()
		assertFalse(enabled)
		assertFalse(analyticsStorage)
	}

	@Test
	fun `posthog sync restores native denial and grant after vendor reset`() {
		val core = kernel()
		var enabled = true
		val calls = mutableListOf<Boolean>()
		val integration = PostHogIntegration(core, onError = ::unexpectedError,
			optIn = { enabled = true; calls += true },
			optOut = { enabled = false; calls += false },
		)
		enabled = true
		integration.sync()
		assertFalse(enabled)

		assertTrue(core.save(CommitIntent.All).ok)
		enabled = false
		integration.sync()
		assertTrue(enabled)
		integration.close()
		val callsAfterClose = calls.toList()
		integration.sync()
		assertEquals(callsAfterClose, calls)
		assertFalse(enabled)
	}

	@Test
	fun `one failed vendor disable does not prevent other integrations observing withdrawal`() {
		val core = kernel()
		val failures = mutableListOf<Exception>()
		var failDisable = false
		var posthogAllowed = false
		val firebase = FirebaseAnalyticsIntegration(core,
			setConsent = {},
			setCollectionEnabled = { if (!it && failDisable) error("Firebase rejected disable") },
			onError = failures::add,
		)
		val posthog = PostHogIntegration(core,
			optIn = { posthogAllowed = true },
			optOut = { posthogAllowed = false },
			onError = ::unexpectedError,
		)
		assertTrue(core.save(CommitIntent.All).ok)
		assertTrue(posthogAllowed)
		failDisable = true
		assertTrue(core.save(CommitIntent.Necessary).ok)
		assertFalse(core.isAllowed(ConsentCategory.MEASUREMENT))
		assertFalse(posthogAllowed)
		assertEquals(listOf("Firebase rejected disable"), failures.map { it.message })
		failDisable = false
		firebase.sync()
		firebase.close()
		posthog.close()
	}

	@Test
	fun `a grant that takes effect then throws cannot suppress later refusal`() {
		val core = kernel()
		val failures = mutableListOf<Exception>()
		var enabled = false
		val integration = FirebaseAnalyticsIntegration(core,
			setConsent = {},
			setCollectionEnabled = {
				enabled = it
				if (it) error("grant acknowledgement failed")
			},
			onError = failures::add,
		)
		assertTrue(core.save(CommitIntent.All).ok)
		assertTrue(enabled)
		assertEquals(1, failures.size)
		assertTrue(core.save(CommitIntent.Necessary).ok)
		assertFalse(enabled)
		integration.close()
	}

	@Test
	fun `close overrides a vendor reset while native permission is unchanged`() {
		val core = kernel()
		var enabled = false
		val integration = PostHogIntegration(core,
			optIn = { enabled = true },
			optOut = { enabled = false },
			onError = ::unexpectedError,
		)
		enabled = true
		integration.close()
		assertFalse(enabled)
	}

	@Test
	fun `failed construction opts out after a vendor enable takes effect then throws`() {
		val core = kernel()
		assertTrue(core.save(CommitIntent.All).ok)
		var enabled = false
		try {
			PostHogIntegration(core,
				optIn = { enabled = true; error("grant acknowledgement failed") },
				optOut = { enabled = false },
				onError = ::unexpectedError,
			)
			throw AssertionError("construction must report the vendor failure")
		} catch (error: IllegalStateException) {
			assertEquals("grant acknowledgement failed", error.message)
		}
		assertFalse(enabled)
		assertTrue(core.save(CommitIntent.Necessary).ok)
	}

	@Test
	fun `mixpanel denies a persisted vendor grant while native authority is pending`() {
		val core = kernel(online = false)
		var optedOut = false
		var optOuts = 0
		val integration = MixpanelIntegration(core,
			optInTracking = { optedOut = false },
			optOutTracking = { optedOut = true; optOuts++ },
			onError = ::unexpectedError,
		)

		assertTrue(optedOut)
		integration.sync()
		integration.close()
		integration.close()
		assertEquals("only explicit sync and first close reapply denial", 3, optOuts)
	}

	@Test
	fun `mixpanel applies a retained grant immediately and on explicit sync`() {
		val core = kernel()
		assertTrue(core.save(CommitIntent.All).ok)
		var optedOut = false
		var optIns = 0
		val integration = MixpanelIntegration(core,
			optInTracking = { optedOut = false; optIns++ },
			optOutTracking = { optedOut = true },
			onError = ::unexpectedError,
		)

		integration.sync()
		assertEquals(2, optIns)
		integration.close()
		assertTrue(optedOut)
	}

	@Test
	fun `mixpanel sync repairs vendor reset while unrelated updates do not repeat commands`() {
		val core = kernel()
		var optedOut = true
		var optIns = 0
		var optOuts = 0
		val integration = MixpanelIntegration(core,
			optInTracking = { optedOut = false; optIns++ },
			optOutTracking = { optedOut = true; optOuts++ },
			onError = ::unexpectedError,
		)
		assertTrue(core.save(CommitIntent.All).ok)
		assertFalse(optedOut)
		assertTrue(core.save(CommitIntent.Custom(mapOf(ConsentCategory.MARKETING to false))).ok)
		assertEquals(1, optIns)

		optedOut = true
		integration.sync()
		assertFalse(optedOut)
		assertEquals(2, optIns)
		assertTrue(core.save(CommitIntent.Necessary).ok)
		assertTrue(optedOut)
		assertEquals(2, optOuts)

		optedOut = false
		integration.sync()
		assertTrue(optedOut)
		assertEquals(3, optOuts)
		integration.close()
		assertTrue(core.save(CommitIntent.All).ok)
		assertEquals(2, optIns)
	}

	@Test
	fun `mixpanel reconciles withdrawal during a vendor grant`() {
		val core = kernel()
		var optedOut = true
		var optIns = 0
		val integration = MixpanelIntegration(core,
			optInTracking = {
				optedOut = false
				optIns++
				assertTrue(core.save(CommitIntent.Necessary).ok)
			},
			optOutTracking = { optedOut = true },
			onError = ::unexpectedError,
		)

		assertTrue(core.save(CommitIntent.All).ok)
		assertEquals(1, optIns)
		assertTrue(optedOut)
		integration.close()
	}

	@Test
	fun `mixpanel reentrant close cannot leave tracking enabled`() {
		val core = kernel()
		var optedOut = true
		lateinit var integration: MixpanelIntegration
		integration = MixpanelIntegration(core,
			optInTracking = { optedOut = false; integration.close() },
			optOutTracking = { optedOut = true },
			onError = ::unexpectedError,
		)

		assertTrue(core.save(CommitIntent.All).ok)
		assertTrue(optedOut)
		assertTrue(core.save(CommitIntent.Necessary).ok)
		assertTrue(core.save(CommitIntent.All).ok)
		assertTrue(optedOut)
	}

	@Test
	fun `mixpanel reports a vendor failure and still applies later withdrawal`() {
		val core = kernel()
		val failures = mutableListOf<Exception>()
		var optedOut = true
		val integration = MixpanelIntegration(core,
			optInTracking = { optedOut = false; error("vendor acknowledgement failed") },
			optOutTracking = { optedOut = true },
			onError = failures::add,
		)

		assertTrue(core.save(CommitIntent.All).ok)
		assertEquals(listOf("vendor acknowledgement failed"), failures.map { it.message })
		assertTrue(core.save(CommitIntent.Necessary).ok)
		assertTrue(optedOut)
		integration.close()
	}

	@Test(expected = IllegalArgumentException::class)
	fun `mixpanel rejects necessary as tracking authorization`() {
		MixpanelIntegration(kernel(), category = ConsentCategory.NECESSARY,
			optInTracking = {}, optOutTracking = {},
			onError = ::unexpectedError,
		)
	}

	@Test
	fun `sentry replay stops while authority is pending and again on close`() {
		val calls = mutableListOf<String>()
		val integration = SentryReplayIntegration(kernel(online = false),
			start = { calls += "start" }, stop = { calls += "stop" },
			onError = ::unexpectedError,
		)
		assertEquals(listOf("stop"), calls)
		integration.close()
		integration.close()
		assertEquals(listOf("stop", "stop"), calls)
	}

	@Test
	fun `sentry replay applies a retained grant immediately`() {
		val core = kernel()
		assertTrue(core.save(CommitIntent.All).ok)
		val calls = mutableListOf<String>()
		val integration = SentryReplayIntegration(core,
			start = { calls += "start" }, stop = { calls += "stop" },
			onError = ::unexpectedError,
		)
		assertEquals(listOf("start"), calls)
		integration.close()
	}

	@Test
	fun `sentry replay orders grant withdrawal and teardown without unrelated commands`() {
		val core = kernel()
		val commands = mutableListOf<String>()
		val integration = SentryReplayIntegration(core,
			start = { commands += "start" }, stop = { commands += "stop" },
			onError = ::unexpectedError,
		)
		assertTrue(core.save(CommitIntent.All).ok)
		assertTrue(core.save(CommitIntent.Custom(mapOf(ConsentCategory.MARKETING to false))).ok)
		assertEquals(listOf("stop", "start"), commands)
		assertTrue(core.save(CommitIntent.Necessary).ok)
		assertTrue(core.save(CommitIntent.All).ok)
		integration.close()
		assertTrue(core.save(CommitIntent.Necessary).ok)
		assertTrue(core.save(CommitIntent.All).ok)
		assertEquals(listOf("stop", "start", "stop", "start", "stop"), commands)
	}

	@Test
	fun `sentry replay sync reapplies authority after a vendor session reset`() {
		val core = kernel()
		var recording = true
		val integration = SentryReplayIntegration(core,
			start = { recording = true }, stop = { recording = false },
			onError = ::unexpectedError,
		)
		assertFalse(recording)
		assertTrue(core.save(CommitIntent.All).ok)
		assertTrue(recording)
		recording = false
		integration.sync()
		assertTrue(recording)
		assertTrue(core.save(CommitIntent.Necessary).ok)
		recording = true
		integration.sync()
		assertFalse(recording)
		integration.close()
		recording = true
		integration.sync()
		assertTrue("sync does not command a vendor after teardown", recording)
	}

	@Test
	fun `sentry replay stops after reentrant withdrawal during start`() {
		val core = kernel()
		val commands = mutableListOf<String>()
		val integration = SentryReplayIntegration(core,
			start = {
				commands += "start"
				assertTrue(core.save(CommitIntent.Necessary).ok)
			},
			stop = { commands += "stop" }, onError = ::unexpectedError,
		)
		assertTrue(core.save(CommitIntent.All).ok)
		assertEquals(listOf("stop", "start", "stop"), commands)
		integration.close()
	}

	@Test
	fun `sentry replay stop failure does not prevent other vendor withdrawal`() {
		val core = kernel()
		var failStop = false
		var recording = false
		var posthogAllowed = false
		val errors = mutableListOf<Exception>()
		val replay = SentryReplayIntegration(core,
			start = { recording = true },
			stop = {
				if (failStop) error("Sentry rejected replay stop")
				recording = false
			},
			onError = errors::add,
		)
		val posthog = PostHogIntegration(core,
			optIn = { posthogAllowed = true }, optOut = { posthogAllowed = false },
			onError = ::unexpectedError,
		)
		assertTrue(core.save(CommitIntent.All).ok)
		failStop = true
		assertTrue(core.save(CommitIntent.Necessary).ok)
		assertFalse(posthogAllowed)
		assertEquals(listOf("Sentry rejected replay stop"), errors.map { it.message })
		failStop = false
		replay.sync()
		assertFalse(recording)
		replay.close()
		posthog.close()
	}

	@Test
	fun `sentry replay explicit stop errors remain observable and retryable`() {
		val core = kernel()
		var failStop = false
		var recording = false
		val integration = SentryReplayIntegration(core,
			start = { recording = true },
			stop = {
				if (failStop) error("Sentry rejected replay stop")
				recording = false
			},
			onError = ::unexpectedError,
		)
		failStop = true
		try {
			integration.sync()
			throw AssertionError("sync must report the stop failure")
		} catch (error: IllegalStateException) {
			assertEquals("Sentry rejected replay stop", error.message)
		}
		failStop = false
		assertTrue(core.save(CommitIntent.All).ok)
		failStop = true
		try {
			integration.close()
			throw AssertionError("close must report the stop failure")
		} catch (error: IllegalStateException) {
			assertEquals("Sentry rejected replay stop", error.message)
		}
		failStop = false
		integration.close()
		assertFalse(recording)
	}

	@Test
	fun `sentry replay can follow an optional category other than measurement`() {
		val core = kernel()
		var recording = false
		val integration = SentryReplayIntegration(core, category = ConsentCategory.EXPERIENCE,
			start = { recording = true }, stop = { recording = false },
			onError = ::unexpectedError,
		)
		assertTrue(core.save(CommitIntent.Custom(mapOf(ConsentCategory.MEASUREMENT to true))).ok)
		assertFalse(recording)
		assertTrue(core.save(CommitIntent.Custom(mapOf(ConsentCategory.EXPERIENCE to true))).ok)
		assertTrue(recording)
		integration.close()
	}

	@Test(expected = IllegalArgumentException::class)
	fun `sentry replay rejects necessary as recording authorization`() {
		SentryReplayIntegration(kernel(), category = ConsentCategory.NECESSARY,
			start = {}, stop = {}, onError = ::unexpectedError,
		)
	}

	@Test
	fun `throwing error reporter cannot block another vendor withdrawal`() {
		val core = kernel()
		var failDisable = false
		var posthogAllowed = false
		val sentry = SentryReplayIntegration(core,
			start = {}, stop = { if (failDisable) error("vendor rejected replay stop") },
			onError = { error("reporter failed") },
		)
		val posthog = PostHogIntegration(core,
			optIn = { posthogAllowed = true }, optOut = { posthogAllowed = false },
			onError = ::unexpectedError,
		)
		assertTrue(core.save(CommitIntent.All).ok)
		assertTrue(posthogAllowed)
		failDisable = true
		assertTrue(core.save(CommitIntent.Necessary).ok)
		assertFalse(core.isAllowed(ConsentCategory.MEASUREMENT))
		assertFalse(posthogAllowed)
		failDisable = false
		sentry.sync()
		sentry.close()
		posthog.close()
	}

	private fun firebase(core: ConsentCore, calls: MutableList<String>): FirebaseAnalyticsIntegration =
		FirebaseAnalyticsIntegration(core, onError = ::unexpectedError,
			setConsent = { calls += "consent:${it.analyticsStorage}" },
			setCollectionEnabled = { calls += "collection:$it" },
		)
}
