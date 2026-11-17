package com.c15t.consentui

import android.view.View
import androidx.activity.ComponentActivity
import androidx.compose.runtime.Composable

/**
 * The consent-screen entry points `c15t setup` prints for an Android app: Compose, an
 * Activity with views, and the privacy-settings call.
 *
 * Compiling these is the check that the printed code matches this module's API.
 * `packages/cli/vendor/c15t-mobile/src/__tests__/mobile/mobile-setup.test.ts` reads the lines between each
 * pair of markers and fails when the CLI prints anything else, so change both together.
 */
@Suppress("unused")
class CliEntrySnippetTest {
	// Never called: showing the prompt needs an installed core.
	@Composable
	private fun CliComposeEntry() {
		// c15t-cli-snippet:compose:start
		C15tConsent(privacyPolicyUrl = "https://app.example/privacy")
		// c15t-cli-snippet:compose:end
	}

	// Never called. `this` is the Activity, after `setContentView`.
	private fun ComponentActivity.cliActivityEntry(privacySettings: View) {
		// c15t-cli-snippet:activity:start
		val consent = attachConsent("https://app.example/privacy")
		privacySettings.setOnClickListener { consent.presentPreferences() }
		// c15t-cli-snippet:activity:end
	}

	// Never called, like [cliActivityEntry].
	private fun cliPrivacySettings() {
		// c15t-cli-snippet:privacy-settings:start
		ConsentPrompt.current?.presentPreferences()
		// c15t-cli-snippet:privacy-settings:end
	}
}
