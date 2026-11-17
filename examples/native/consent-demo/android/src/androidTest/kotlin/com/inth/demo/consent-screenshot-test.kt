package com.inth.demo

import android.content.Intent
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.UiDevice
import org.junit.After
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Opens the first-layer prompt, preferences and the IAB screen in the stock UI and in the
 * app-owned UI built on the headless blocks, in light and dark, and saves a device screenshot
 * of each to [DIRECTORY]. The `screenshots` job in `.depot/workflows/android-emulator.yml`
 * pulls them. It also proves the custom example reaches every screen on a device.
 */
@RunWith(AndroidJUnit4::class)
class ConsentScreenshotTest {
    @get:Rule val compose = createEmptyComposeRule()
    private val instrumentation get() = InstrumentationRegistry.getInstrumentation()
    private val device get() = UiDevice.getInstance(instrumentation)

    @After fun day() { device.executeShellCommand("cmd uimode night no") }

    @Test fun stockAndCustomScreensInLightAndDark() {
        device.executeShellCommand("mkdir -p $DIRECTORY")
        for (tone in listOf("light", "dark")) {
            device.executeShellCommand("cmd uimode night ${if (tone == "dark") "yes" else "no"}")
            for (ui in listOf("stock", "custom")) {
                val custom = ui == "custom"
                open("category", ui, if (custom) "ledger.prompt" else "inth.first-layer") {
                    capture("android-$ui-prompt-$tone")
                    compose.onNodeWithTag(if (custom) "ledger.prompt.customize" else "inth.first-layer.customize").performClick()
                    waitFor(if (custom) "ledger.preferences" else "inth.prefs")
                    capture("android-$ui-preferences-$tone")
                }
                open("iab", ui, if (custom) "ledger.prompt" else "inth.first-layer") {
                    compose.onNodeWithTag(if (custom) "ledger.prompt.customize" else "inth.first-layer.customize").performClick()
                    if (custom) { waitFor("ledger.preferences"); compose.onNodeWithTag("ledger.tab.1").performClick(); waitFor("ledger.purpose.1") }
                    else waitFor("inth.iab")
                    capture("android-$ui-iab-$tone")
                }
            }
        }
    }

    private fun open(mode: String, ui: String, tag: String, then: () -> Unit) {
        val intent = Intent(instrumentation.targetContext, ConsentDemoActivity::class.java)
            .putExtra("C15T_FIXTURE_SCENARIO", "screenshots-$mode").putExtra("C15T_FIXTURE_RESET", true).putExtra("C15T_FIXTURE_UI", ui)
        ActivityScenario.launch<ConsentDemoActivity>(intent).use { waitFor(tag); then() }
    }

    private fun waitFor(tag: String) = compose.waitUntil(20_000) { compose.onAllNodesWithTag(tag).fetchSemanticsNodes().isNotEmpty() }

    private fun capture(name: String) {
        compose.waitForIdle()
        // Let the last frame reach the display before the shell reads it.
        Thread.sleep(1500)
        device.executeShellCommand("screencap -p $DIRECTORY/$name.png")
        assertTrue("$name was not written", device.executeShellCommand("ls $DIRECTORY").contains("$name.png"))
    }

    private companion object { const val DIRECTORY = "/sdcard/Download/inth-consent-screenshots" }
}
