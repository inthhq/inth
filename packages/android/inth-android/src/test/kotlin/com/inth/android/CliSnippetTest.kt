package com.c15t.android

import android.app.Application
import com.c15t.core.ConsentPolicy
import com.c15t.core.NativeConfig
import com.c15t.core.PolicyMatch
import com.c15t.core.PolicyRule
import com.c15t.core.model.ConsentCategory
import com.c15t.core.model.ConsentModel
import com.c15t.core.policy.PolicyPrompt
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * The installs `c15t setup` prints for an Android app: with an in-code policy, and hosted.
 *
 * Compiling [cliOfflineInstall] and [cliHostedInstall] is the check that the printed code
 * matches this module's API. `packages/cli/vendor/c15t-mobile/src/__tests__/mobile/mobile-setup.test.ts` reads
 * the lines between each pair of markers and fails when the CLI prints anything else, so
 * change both together.
 */
class CliSnippetTest {
	// Never called. `this` is the Application, as in `Application.onCreate`.
	@Suppress("unused")
	private fun Application.cliOfflineInstall() {
		// c15t-cli-snippet:offline:start
		val policy = ConsentPolicy(listOf(
		    PolicyRule("everywhere", PolicyMatch(fallback = true, isDefault = true), ConsentModel.OPT_IN, PolicyPrompt.CHOICE),
		))
		C15tAndroid.install(this, NativeConfig(
		    backendUrl = "https://your-project.inth.app",
		    consentCategories = listOf(ConsentCategory.NECESSARY, ConsentCategory.MEASUREMENT, ConsentCategory.MARKETING),
		    policy = policy,
		))
		// c15t-cli-snippet:offline:end
	}

	// Never called, like [cliOfflineInstall].
	@Suppress("unused")
	private fun Application.cliHostedInstall() {
		// c15t-cli-snippet:hosted:start
		C15tAndroid.install(this, NativeConfig(
		    backendUrl = "https://your-project.inth.app",
		    consentCategories = listOf(ConsentCategory.NECESSARY, ConsentCategory.MEASUREMENT, ConsentCategory.MARKETING),
		))
		// c15t-cli-snippet:hosted:end
	}

	@Test
	fun `the printed rule is one the core accepts as an in-code policy`() {
		val policy = ConsentPolicy(listOf(
			PolicyRule("everywhere", PolicyMatch(fallback = true, isDefault = true), ConsentModel.OPT_IN, PolicyPrompt.CHOICE),
		))
		val config = NativeConfig(backendUrl = "https://your-project.inth.app", policy = policy)
		assertEquals(1, config.policy?.rules?.size)
	}
}
