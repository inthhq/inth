package com.inth.android

import android.app.Application
import com.inth.core.ConsentPolicy
import com.inth.core.NativeConfig
import com.inth.core.PolicyMatch
import com.inth.core.PolicyRule
import com.inth.core.model.ConsentCategory
import com.inth.core.model.ConsentModel
import com.inth.core.policy.PolicyPrompt
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
		// inth-cli-snippet:offline:start
		val policy = ConsentPolicy(listOf(
		    PolicyRule("everywhere", PolicyMatch(fallback = true, isDefault = true), ConsentModel.OPT_IN, PolicyPrompt.CHOICE),
		))
		InthAndroid.install(this, NativeConfig(
		    backendUrl = "https://your-project.inth.app",
		    consentCategories = listOf(ConsentCategory.NECESSARY, ConsentCategory.MEASUREMENT, ConsentCategory.MARKETING),
		    policy = policy,
		))
		// inth-cli-snippet:offline:end
	}

	// Never called, like [cliOfflineInstall].
	@Suppress("unused")
	private fun Application.cliHostedInstall() {
		// inth-cli-snippet:hosted:start
		InthAndroid.install(this, NativeConfig(
		    backendUrl = "https://your-project.inth.app",
		    consentCategories = listOf(ConsentCategory.NECESSARY, ConsentCategory.MEASUREMENT, ConsentCategory.MARKETING),
		))
		// inth-cli-snippet:hosted:end
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
