package com.c15t.android.integrations

import com.c15t.core.CommitIntent
import com.c15t.core.ConsentCore
import com.c15t.core.model.ConsentCategory
import com.c15t.core.model.ConsentCategory.FUNCTIONALITY
import com.c15t.core.model.ConsentCategory.MARKETING
import com.c15t.core.model.ConsentCategory.MEASUREMENT
import com.c15t.core.model.ConsentCategory.NECESSARY
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class BrazeIntegrationTest {
	private fun braze(core: ConsentCore, calls: MutableList<String>, category: ConsentCategory = MARKETING) =
		BrazeIntegration(core, category,
			enableSdk = { calls += "enable" },
			disableSdk = { calls += "disable" },
			setGoogleAdsConsent = { calls += "ads:${it.adUserData}:${it.adPersonalization}" },
			onError = ::unexpectedError,
		)

	@Test
	fun `stays disabled while pending without writing attributes`() {
		val calls = mutableListOf<String>()
		braze(kernel(online = false), calls).close()
		assertEquals(listOf("disable", "disable"), calls)
	}

	@Test
	fun `a grant enables then records consent and withdrawal only disables`() {
		val core = kernel()
		val calls = mutableListOf<String>()
		val integration = braze(core, calls)
		calls.clear()
		assertTrue(core.save(CommitIntent.All).ok)
		assertEquals(listOf("enable", "ads:true:true"), calls.drain())
		assertTrue(core.save(CommitIntent.Necessary).ok)
		assertEquals(listOf("disable"), calls.drain())
		integration.close()
		assertEquals(listOf("disable"), calls)
	}

	@Test
	fun `a marketing-only change while running records attributes without enabling again`() {
		val core = kernel()
		val calls = mutableListOf<String>()
		val integration = braze(core, calls, FUNCTIONALITY)
		core.choose(FUNCTIONALITY to true)
		assertEquals(listOf("disable", "enable", "ads:false:false"), calls.drain())
		core.choose(FUNCTIONALITY to true, MARKETING to true)
		assertEquals(listOf("ads:true:true"), calls.drain())
		core.choose(MARKETING to false)
		assertEquals("Braze still runs, so the denial is written", listOf("ads:false:false"), calls.drain())
		core.choose(MARKETING to true)
		calls.clear()
		integration.sync()
		assertEquals(listOf("enable", "ads:true:true"), calls.drain())
		integration.close()
	}

	@Test(expected = IllegalArgumentException::class)
	fun `rejects necessary as tracking authorization`() {
		braze(kernel(), mutableListOf(), NECESSARY)
	}
}

class BranchIntegrationTest {
	private fun branch(core: ConsentCore, calls: MutableList<String>) =
		BranchIntegration(core,
			setConsumerProtectionAttributionLevel = { calls += "level:$it" },
			setDMAParamsForEEA = { calls += "dma:${it.adPersonalization}:${it.adUserData}" },
			onError = ::unexpectedError,
		)

	@Test
	fun `sets no attribution while pending and on close`() {
		val calls = mutableListOf<String>()
		branch(kernel(online = false), calls).close()
		assertEquals(listOf("level:NONE", "dma:false:false", "level:NONE", "dma:false:false"), calls)
	}

	@Test
	fun `marketing raises the level after consent and withdrawal lowers it first`() {
		val core = kernel()
		val calls = mutableListOf<String>()
		val integration = branch(core, calls)
		calls.clear()
		assertTrue(core.save(CommitIntent.All).ok)
		assertEquals(listOf("dma:true:true", "level:FULL"), calls.drain())
		assertTrue(core.save(CommitIntent.Necessary).ok)
		assertEquals(listOf("level:NONE", "dma:false:false"), calls.drain())
		integration.close()
	}

	@Test
	fun `a failed level change on withdrawal still sends denied DMA parameters and is reported`() {
		val core = kernel()
		val calls = mutableListOf<String>()
		val failures = mutableListOf<Exception>()
		var failLowering = false
		val integration = BranchIntegration(core,
			setConsumerProtectionAttributionLevel = {
				if (failLowering && it != BranchAttribution.FULL) error("Branch rejected level")
				calls += "level:$it"
			},
			setDMAParamsForEEA = { calls += "dma:${it.adPersonalization}:${it.adUserData}" },
			onError = failures::add,
		)
		assertTrue(core.save(CommitIntent.All).ok)
		calls.clear()
		failLowering = true
		assertTrue(core.save(CommitIntent.Necessary).ok)
		assertEquals(listOf("dma:false:false"), calls)
		assertEquals(listOf("Branch rejected level"), failures.map { it.message })
		failLowering = false
		integration.close()
	}

	@Test
	fun `measurement alone is analytics only and a marketing-only change raises it`() {
		val core = kernel()
		val calls = mutableListOf<String>()
		val integration = branch(core, calls)
		calls.clear()
		core.choose(MEASUREMENT to true)
		assertEquals(listOf("level:MINIMAL", "dma:false:false"), calls.drain())
		core.choose(MEASUREMENT to true, MARKETING to true)
		assertEquals(listOf("dma:true:true", "level:FULL"), calls.drain())
		core.choose(MARKETING to false, MEASUREMENT to true)
		assertEquals(listOf("level:MINIMAL", "dma:false:false"), calls.drain())
		integration.close()
	}
}

class SingularIntegrationTest {
	private fun singular(core: ConsentCore, calls: MutableList<String>, category: ConsentCategory = MARKETING) =
		SingularIntegration(core, category,
			start = { calls += "start:$it" },
			limitDataSharing = { calls += "limit:$it" },
			stopAllTracking = { calls += "stop" },
			resumeAllTracking = { calls += "resume" },
			trackingOptIn = { calls += "optIn" },
			onError = ::unexpectedError,
		)

	@Test
	fun `never starts or calls Singular while consent was never granted`() {
		val calls = mutableListOf<String>()
		singular(kernel(online = false), calls).close()
		val core = kernel()
		val integration = singular(core, calls)
		assertTrue(core.save(CommitIntent.Necessary).ok)
		integration.close()
		assertEquals("Singular ignores privacy calls before init, so none are made", emptyList<String>(), calls)
	}

	@Test
	fun `the first grant starts Singular with the limit, then opts in, and withdrawal stops`() {
		val core = kernel()
		val calls = mutableListOf<String>()
		val integration = singular(core, calls)
		assertTrue(core.save(CommitIntent.All).ok)
		assertEquals(listOf("start:false", "limit:false", "resume", "optIn"), calls.drain())
		assertTrue(core.save(CommitIntent.Necessary).ok)
		assertEquals(listOf("stop", "limit:true"), calls.drain())
		assertTrue(core.save(CommitIntent.All).ok)
		assertEquals("Singular starts once per process", listOf("limit:false", "resume", "optIn"), calls.drain())
		integration.close()
		assertEquals(listOf("stop", "limit:true"), calls)
	}

	@Test
	fun `a failed stop on withdrawal still limits data sharing and is reported`() {
		val core = kernel()
		val calls = mutableListOf<String>()
		val failures = mutableListOf<Exception>()
		var failStop = false
		val integration = SingularIntegration(core,
			start = { calls += "start:$it" },
			limitDataSharing = { calls += "limit:$it" },
			stopAllTracking = {
				if (failStop) error("Singular rejected stop")
				calls += "stop"
			},
			resumeAllTracking = { calls += "resume" },
			trackingOptIn = { calls += "optIn" },
			onError = failures::add,
		)
		assertTrue(core.save(CommitIntent.All).ok)
		calls.clear()
		failStop = true
		assertTrue(core.save(CommitIntent.Necessary).ok)
		assertEquals(listOf("limit:true"), calls)
		assertEquals(listOf("Singular rejected stop"), failures.map { it.message })
		failStop = false
		integration.close()
	}

	@Test
	fun `a marketing-only change while tracking changes only the sharing limit`() {
		val core = kernel()
		val calls = mutableListOf<String>()
		val integration = singular(core, calls, MEASUREMENT)
		core.choose(MEASUREMENT to true)
		assertEquals(listOf("start:true", "limit:true", "resume", "optIn"), calls.drain())
		core.choose(MEASUREMENT to true, MARKETING to true)
		assertEquals(listOf("limit:false"), calls.drain())
		core.choose(MARKETING to false)
		assertEquals(listOf("limit:true"), calls.drain())
		integration.close()
	}
}

class AmplitudeIntegrationTest {
	@Test
	fun `opts out while pending, follows measurement and ignores marketing-only changes`() {
		val pendingCalls = mutableListOf<Boolean>()
		AmplitudeIntegration(kernel(online = false), setOptOut = { pendingCalls += it }, onError = ::unexpectedError).close()
		assertEquals(listOf(true, true), pendingCalls)

		val core = kernel()
		val optOut = mutableListOf<Boolean>()
		val integration = AmplitudeIntegration(core, setOptOut = { optOut += it }, onError = ::unexpectedError)
		core.choose(MEASUREMENT to true)
		core.choose(MEASUREMENT to true, MARKETING to true)
		assertTrue(core.save(CommitIntent.Necessary).ok)
		assertEquals(listOf(true, false, true), optOut)
		integration.close()
	}

	@Test
	fun `withdrawal during opt-in ends opted out`() {
		val core = kernel()
		val optOut = mutableListOf<Boolean>()
		val integration = AmplitudeIntegration(core, setOptOut = {
			optOut += it
			if (!it) assertTrue(core.save(CommitIntent.Necessary).ok)
		}, onError = ::unexpectedError)
		assertTrue(core.save(CommitIntent.All).ok)
		assertEquals(listOf(true, false, true), optOut)
		integration.close()
	}
}
