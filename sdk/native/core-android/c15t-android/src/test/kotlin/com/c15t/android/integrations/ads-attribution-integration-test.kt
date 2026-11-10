package com.c15t.android.integrations

import com.c15t.core.CommitIntent
import com.c15t.core.model.ConsentCategory.MARKETING
import com.c15t.core.model.ConsentCategory.MEASUREMENT
import com.c15t.core.model.ConsentCategory.NECESSARY
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AdMobIntegrationTest {
	@Test
	fun `denies every advertising type while pending and on close`() {
		val calls = mutableListOf<GoogleAdsConsent>()
		val integration = AdMobIntegration(kernel(online = false), setConsent = { calls += it }, onError = ::unexpectedError)
		integration.close()
		assertEquals(listOf(ADS_DENIED, ADS_DENIED), calls)
	}

	@Test
	fun `marketing grants and withdraws every advertising type`() {
		val core = kernel()
		val calls = mutableListOf<GoogleAdsConsent>()
		val integration = AdMobIntegration(core, setConsent = { calls += it }, onError = ::unexpectedError)
		assertTrue(core.save(CommitIntent.All).ok)
		core.choose(MARKETING to false)
		assertEquals(listOf(ADS_DENIED, ADS_GRANTED, ADS_DENIED), calls)
		integration.close()
	}

	@Test
	fun `a marketing-only change after a measurement grant updates once`() {
		val core = kernel()
		val calls = mutableListOf<GoogleAdsConsent>()
		val integration = AdMobIntegration(core, setConsent = { calls += it }, onError = ::unexpectedError)
		core.choose(MEASUREMENT to true)
		core.choose(MEASUREMENT to true, MARKETING to true)
		assertEquals(listOf(ADS_DENIED, ADS_GRANTED), calls)
		integration.sync()
		assertEquals(ADS_GRANTED, calls.last())
		integration.close()
	}
}

class AppsFlyerIntegrationTest {
	private fun appsFlyer(core: com.c15t.core.ConsentCore, calls: MutableList<String>, category: com.c15t.core.model.ConsentCategory = MARKETING, start: () -> Unit = {}) =
		AppsFlyerIntegration(core, category,
			setConsentData = { calls += "consent:${it.adUserData}" },
			stop = { calls += "stop:$it" },
			start = { calls += "start"; start() },
			onError = ::unexpectedError,
		)

	@Test
	fun `stays stopped while pending and on close`() {
		val calls = mutableListOf<String>()
		appsFlyer(kernel(online = false), calls).close()
		assertEquals(listOf("stop:true", "consent:false", "stop:true", "consent:false"), calls)
	}

	@Test
	fun `a grant sends consent then starts and withdrawal stops first`() {
		val core = kernel()
		val calls = mutableListOf<String>()
		val integration = appsFlyer(core, calls)
		calls.clear()
		assertTrue(core.save(CommitIntent.All).ok)
		assertEquals(listOf("consent:true", "stop:false", "start"), calls.drain())
		assertTrue(core.save(CommitIntent.Necessary).ok)
		assertEquals(listOf("stop:true", "consent:false"), calls.drain())
		integration.close()
	}

	@Test
	fun `a marketing-only change while running sends consent without starting again`() {
		val core = kernel()
		val calls = mutableListOf<String>()
		val integration = appsFlyer(core, calls, MEASUREMENT)
		core.choose(MEASUREMENT to true)
		calls.clear()
		core.choose(MEASUREMENT to true, MARKETING to true)
		assertEquals(listOf("consent:true"), calls.drain())
		core.choose(MARKETING to false)
		assertEquals(listOf("consent:false"), calls.drain())
		integration.sync()
		assertEquals(listOf("consent:false", "stop:false", "start"), calls.drain())
		integration.close()
	}

	@Test
	fun `withdrawal during start stops again`() {
		val core = kernel()
		val calls = mutableListOf<String>()
		val integration = appsFlyer(core, calls, start = { assertTrue(core.save(CommitIntent.Necessary).ok) })
		calls.clear()
		assertTrue(core.save(CommitIntent.All).ok)
		assertEquals(listOf("consent:true", "stop:false", "start", "stop:true", "consent:false"), calls)
		integration.close()
	}

	@Test(expected = IllegalArgumentException::class)
	fun `rejects necessary as tracking authorization`() {
		appsFlyer(kernel(), mutableListOf(), NECESSARY)
	}

	@Test
	fun `a failed stop on withdrawal still sends denied consent and is reported`() {
		val core = kernel()
		val calls = mutableListOf<String>()
		val failures = mutableListOf<Exception>()
		var failStop = false
		val integration = AppsFlyerIntegration(core,
			setConsentData = { calls += "consent:${it.adUserData}" },
			stop = { stopped ->
				if (stopped && failStop) error("AppsFlyer rejected stop")
				calls += "stop:$stopped"
			},
			start = { calls += "start" },
			onError = failures::add,
		)
		assertTrue(core.save(CommitIntent.All).ok)
		calls.clear()
		failStop = true
		assertTrue(core.save(CommitIntent.Necessary).ok)
		assertEquals(listOf("consent:false"), calls)
		assertEquals(listOf("AppsFlyer rejected stop"), failures.map { it.message })
		failStop = false
		integration.close()
		assertEquals("stop:true", calls[1])
	}
}

class AdjustIntegrationTest {
	private fun adjust(core: com.c15t.core.ConsentCore, calls: MutableList<String>, category: com.c15t.core.model.ConsentCategory = MARKETING, enable: () -> Unit = {}) =
		AdjustIntegration(core, category,
			enable = { calls += "enable"; enable() },
			disable = { calls += "disable" },
			trackThirdPartySharing = { calls += "sharing:${it.adUserData}:${it.adPersonalization}" },
			onError = ::unexpectedError,
		)

	@Test
	fun `stays disabled while pending and on close`() {
		val calls = mutableListOf<String>()
		adjust(kernel(online = false), calls).close()
		assertEquals(listOf("disable", "disable"), calls)
	}

	@Test
	fun `a grant enables then shares and withdrawal disables without sharing`() {
		val core = kernel()
		val calls = mutableListOf<String>()
		val integration = adjust(core, calls)
		calls.clear()
		assertTrue(core.save(CommitIntent.All).ok)
		assertEquals(listOf("enable", "sharing:true:true"), calls.drain())
		assertTrue(core.save(CommitIntent.Necessary).ok)
		assertEquals(listOf("disable"), calls.drain())
		integration.close()
	}

	@Test
	fun `a marketing-only change while running sends sharing again`() {
		val core = kernel()
		val calls = mutableListOf<String>()
		val integration = adjust(core, calls, MEASUREMENT)
		core.choose(MEASUREMENT to true)
		assertEquals(listOf("disable", "enable", "sharing:false:false"), calls.drain())
		core.choose(MEASUREMENT to true, MARKETING to true)
		assertEquals(listOf("sharing:true:true"), calls.drain())
		core.choose(MARKETING to false)
		assertEquals(listOf("sharing:false:false"), calls.drain())
		integration.close()
		assertEquals(listOf("disable"), calls)
	}

	@Test
	fun `withdrawal during enable disables without sharing`() {
		val core = kernel()
		val calls = mutableListOf<String>()
		val integration = adjust(core, calls, enable = { assertTrue(core.save(CommitIntent.Necessary).ok) })
		calls.clear()
		assertTrue(core.save(CommitIntent.All).ok)
		assertEquals(listOf("enable", "disable"), calls)
		integration.close()
	}
}

class MetaAppEventsIntegrationTest {
	private val denied = listOf("autoLog:false", "advertiserId:false", "ldu:true")
	private val granted = listOf("ldu:false", "advertiserId:true", "autoLog:true")

	private fun meta(core: com.c15t.core.ConsentCore, calls: MutableList<String>, category: com.c15t.core.model.ConsentCategory = MARKETING) =
		MetaAppEventsIntegration(core, category,
			setAutoLogAppEventsEnabled = { calls += "autoLog:$it" },
			setAdvertiserIDCollectionEnabled = { calls += "advertiserId:$it" },
			setLimitedDataUse = { calls += "ldu:$it" },
			onError = ::unexpectedError,
		)

	@Test
	fun `turns collection off while pending and on close`() {
		val calls = mutableListOf<String>()
		meta(kernel(online = false), calls).close()
		assertEquals(denied + denied, calls)
	}

	@Test
	fun `marketing grants and withdraws while measurement changes send nothing`() {
		val core = kernel()
		val calls = mutableListOf<String>()
		val integration = meta(core, calls)
		assertEquals(denied, calls.drain())
		core.choose(MEASUREMENT to true)
		assertEquals(emptyList<String>(), calls.drain())
		core.choose(MEASUREMENT to true, MARKETING to true)
		assertEquals(granted, calls.drain())
		core.choose(MARKETING to false)
		assertEquals(denied, calls.drain())
		integration.close()
	}

	@Test
	fun `a failed denial call does not stop the other two and is reported`() {
		val core = kernel()
		val calls = mutableListOf<String>()
		val failures = mutableListOf<Exception>()
		var failAutoLogOff = false
		val integration = MetaAppEventsIntegration(core,
			setAutoLogAppEventsEnabled = {
				if (!it && failAutoLogOff) error("Meta rejected auto-log")
				calls += "autoLog:$it"
			},
			setAdvertiserIDCollectionEnabled = { calls += "advertiserId:$it" },
			setLimitedDataUse = { calls += "ldu:$it" },
			onError = failures::add,
		)
		assertTrue(core.save(CommitIntent.All).ok)
		calls.clear()
		failAutoLogOff = true
		assertTrue(core.save(CommitIntent.Necessary).ok)
		assertEquals(listOf("advertiserId:false", "ldu:true"), calls)
		assertEquals(listOf("Meta rejected auto-log"), failures.map { it.message })
		failAutoLogOff = false
		integration.close()
	}

	@Test
	fun `withdrawal during a grant ends denied`() {
		val core = kernel()
		val calls = mutableListOf<String>()
		val integration = MetaAppEventsIntegration(core,
			setAutoLogAppEventsEnabled = { calls += "autoLog:$it" },
			setAdvertiserIDCollectionEnabled = {
				calls += "advertiserId:$it"
				if (it) assertTrue(core.save(CommitIntent.Necessary).ok)
			},
			setLimitedDataUse = { calls += "ldu:$it" },
			onError = ::unexpectedError,
		)
		calls.clear()
		assertTrue(core.save(CommitIntent.All).ok)
		assertEquals(denied, calls.takeLast(3))
		integration.close()
	}
}
