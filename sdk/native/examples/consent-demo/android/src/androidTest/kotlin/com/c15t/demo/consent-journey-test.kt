package com.c15t.demo

import android.content.Intent
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.test.core.app.ActivityScenario
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.uiautomator.UiDevice
import org.junit.*
import org.junit.runner.RunWith
import java.io.File

@RunWith(AndroidJUnit4::class)
class ConsentJourneyTest {
    @get:Rule val compose = createEmptyComposeRule()
    private var scenario: ActivityScenario<ConsentDemoActivity>? = null
    private val context get() = InstrumentationRegistry.getInstrumentation().targetContext
    private val device get() = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation())
    private fun launch(name: String = "fresh-online", fail: Boolean = false, reset: Boolean = true, offline: Boolean = false, backend: String? = null, theme: String? = null, branding: String? = null, identity: String? = null) {
        scenario?.close()
        scenario = ActivityScenario.launch(Intent(context, ConsentDemoActivity::class.java).putExtra("C15T_FIXTURE_SCENARIO",name)
            .putExtra("C15T_FIXTURE_RESET",reset).putExtra("C15T_FIXTURE_FAIL_NEXT_WRITE",fail).putExtra("C15T_FIXTURE_OFFLINE",offline).putExtra("C15T_FIXTURE_BACKEND", backend)
            .putExtra("C15T_FIXTURE_THEME", theme).putExtra("C15T_FIXTURE_BRANDING", branding).putExtra("C15T_FIXTURE_IDENTITY", identity))
    }
    private fun waitFor(id: String): SemanticsNodeInteraction {
        compose.waitUntil(15000) { compose.onAllNodesWithTag(id).fetchSemanticsNodes().isNotEmpty() }
        return compose.onNodeWithTag(id)
    }
    private fun state(id: String, text: String): SemanticsNodeInteraction {
        compose.waitUntil(10000) { compose.onAllNodes(hasTestTag(id) and hasText(text, substring = true)).fetchSemanticsNodes().isNotEmpty() }
        return compose.onNodeWithTag(id)
    }
    private fun awaitClosed() {
        compose.waitUntil(10000) { listOf("c15t.first-layer.accept-all", "c15t.prefs.save", "c15t.iab.save").all { compose.onAllNodesWithTag(it).fetchSemanticsNodes().isEmpty() } }
    }
    private fun capture(name: String) {
        compose.waitForIdle()
        // The consent window fades in through the platform's dialog animation, which the
        // Compose clock does not cover; a capture taken mid-fade shows the host through it.
        device.waitForIdle(); android.os.SystemClock.sleep(600)
        val folder = File(context.getExternalFilesDir(null),"prototype-evidence").apply { mkdirs() }
        Assert.assertTrue(device.takeScreenshot(File(folder,"$name.png")))
        device.dumpWindowHierarchy(File(folder,"$name.xml"))
    }
    @After fun close() { scenario?.close() }

    @Test fun compiledManifestThemeColoursResolve() {
        val testContext = InstrumentationRegistry.getInstrumentation().context
        val metadata = testContext.packageManager.getApplicationInfo(testContext.packageName,
            android.content.pm.PackageManager.GET_META_DATA).metaData
        val theme = com.c15t.consentui.ConsentTheme.c15t.applying(metadata, testContext)
        Assert.assertEquals(com.c15t.consentui.ConsentThemeColor(0x009688), theme.colors.accent)
        Assert.assertEquals(com.c15t.consentui.ConsentThemeColor(0xFFFFFF), theme.colors.onAccent)
        Assert.assertEquals(com.c15t.consentui.ConsentThemeColor(0x009688, 0x4FD1C0), theme.colors.decision)
    }

    private fun report(): org.json.JSONObject = java.net.URL("http://localhost:3000/e2e/state")
        .openConnection().apply { connectTimeout = 2000; readTimeout = 2000 }
        .getInputStream().bufferedReader().use { org.json.JSONObject(it.readText()) }

    private fun assertJsonEqual(expected: org.json.JSONObject, actual: org.json.JSONObject) {
        Assert.assertEquals(expected.keys().asSequence().toSet(), actual.keys().asSequence().toSet())
        for (key in expected.keys()) {
            val value = expected.get(key)
            if (value is org.json.JSONObject) assertJsonEqual(value, actual.getJSONObject(key))
            else Assert.assertEquals(key, value, actual.get(key))
        }
    }
    @Test fun realControlsDeliverNativeReceipts() {
        Assume.assumeTrue("Start the reviewed e2e-backend.py and adb reverse port 3000", runCatching { report() }.isSuccess)
        launch("protocol-backend", backend = "http://localhost:3000/api/self-host")
        waitFor("c15t.first-layer.reject-all").performClick()
        var captured = org.json.JSONObject()
        compose.waitUntil(15000) {
            captured = report()
            captured.optJSONArray("saves")?.length() == 1 && captured.optJSONObject("snapshot")?.optJSONObject("explicitChoice") != null
        }
        Assert.assertEquals("native", captured.getString("core"))
        val snapshot = captured.getJSONObject("snapshot")
        val receipts = snapshot.getJSONObject("explicitChoice").getJSONObject("categories")
        val delivered = captured.getJSONArray("saves").getJSONObject(0)
        val deliveredReceipts = delivered.getJSONObject("choice").getJSONObject("categories")
        Assert.assertEquals(snapshot.getJSONObject("subject").getString("subjectId"), delivered.getString("subjectId"))
        for (category in listOf("functionality", "experience", "measurement", "marketing")) {
            Assert.assertFalse(delivered.getJSONObject("preferences").getBoolean(category))
            Assert.assertFalse(receipts.getJSONObject(category).getBoolean("value"))
            val receipt = receipts.getJSONObject(category)
            val received = deliveredReceipts.getJSONObject(category)
            assertJsonEqual(receipt, received)
        }
        File(context.getExternalFilesDir(null), "native-compose-protocol-receipt.json").writeText(captured.toString(2))
        launch("protocol-backend", reset = false, backend = "http://localhost:3000/api/self-host")
        waitFor("fixture.state.explicit-choice").assertTextEquals("recorded")
        compose.onNodeWithTag("c15t.first-layer.accept-all").assertDoesNotExist()
    }

    @Test fun equalRejectPersistsAndBackKeepsHostForeground() {
        launch()
        val reject = waitFor("c15t.first-layer.reject-all")
        val accept = waitFor("c15t.first-layer.accept-all")
        val r = reject.fetchSemanticsNode().boundsInRoot; val a = accept.fetchSemanticsNode().boundsInRoot
        Assert.assertEquals(r.width,a.width,1f); Assert.assertEquals(r.height,a.height,1f)
        waitFor("c15t.first-layer.brand").assertContentDescriptionEquals("Your brand here")
        compose.onNodeWithTag("c15t.first-layer.brand-logo.c15t", useUnmergedTree = true).assertIsDisplayed()
        capture("android-first-layer")
        device.pressBack()
        waitFor("fixture.open-preferences").assertIsDisplayed()
        Assert.assertEquals(context.packageName, device.currentPackageName)
        compose.onNodeWithTag("fixture.state.explicit-choice").assertTextEquals("none")
        compose.onNodeWithTag("fixture.open-preferences").performClick()
        waitFor("c15t.prefs.reject-all").performClick()
        waitFor("fixture.state.permission.marketing").assertTextEquals("marketing: false")
        launch(reset = false,offline = true)
        waitFor("fixture.state.explicit-choice").assertTextEquals("recorded")
        compose.onNodeWithTag("c15t.first-layer.accept-all").assertDoesNotExist()
        compose.onNodeWithTag("fixture.state.permission.marketing").assertTextEquals("marketing: false")
    }
    @Test fun customSaveRefusalRetryCancelAndRecreate() {
        launch(fail = true)
        waitFor("c15t.first-layer.customize").performClick()
        val measurement = waitFor("c15t.prefs.category.measurement.switch")
        measurement.performScrollTo().performClick().assertIsOn()
        compose.onNodeWithText("Data use").assertDoesNotExist()
        capture("android-category-preferences")
        compose.onNodeWithTag("c15t.prefs.save").performClick()
        waitFor("c15t.prefs.error.retry").assertIsEnabled()
        measurement.assertIsOn(); capture("android-save-error")
        compose.onNodeWithTag("c15t.prefs.error.retry").performClick(); awaitClosed()
        state("fixture.state.permission.measurement", "measurement: true").assertTextEquals("measurement: true")
        waitFor("fixture.open-preferences").performClick()
        waitFor("c15t.prefs.category.measurement.switch").performScrollTo().assertIsOn().performClick()
        device.pressBack(); waitFor("c15t.prefs.discard.keep").performClick()
        compose.onNodeWithTag("c15t.prefs.category.measurement.switch").assertIsOff()
        device.pressBack(); waitFor("c15t.prefs.discard.confirm").performClick()
        scenario!!.recreate()
        state("fixture.state.permission.measurement", "measurement: true").assertTextEquals("measurement: true")
    }
    @Test fun iabSearchDetailsObjectionsAndAdditionalConsent() {
        launch("fresh-online-iab")
        waitFor("c15t.first-layer.customize"); capture("android-iab-first-layer")
        compose.onNodeWithTag("c15t.first-layer.customize").performClick()
        // One purpose consent on, so a partner consent later shows as Partly on rather than Off.
        compose.onNodeWithTag("c15t.iab").performScrollToNode(hasTestTag("c15t.iab.purpose.1.consent"))
        compose.onNodeWithTag("c15t.iab.purpose.1.consent").performScrollTo().performClick().assertIsOn()
        compose.onNodeWithTag("c15t.iab").performScrollToNode(hasTestTag("c15t.iab.purpose.7.consent"))
        val purpose = waitFor("c15t.iab.purpose.7.consent")
        purpose.performScrollTo(); capture("android-iab-centre")
        compose.onNodeWithTag("c15t.iab.purpose.7.details").performScrollTo().performClick()
        val li = compose.onNodeWithTag("c15t.iab.purpose.7.li")
        li.performScrollTo().assertIsOff().performClick().performClick().assertIsOff()
        compose.onNodeWithTag("c15t.iab.purpose.1.li").assertDoesNotExist()
        compose.onNodeWithTag("c15t.iab").performScrollToNode(hasTestTag("c15t.iab.partners"))
        compose.onNodeWithTag("c15t.iab.partners").performScrollTo().performClick()
        waitFor("c15t.iab.vendors.search").performTextInput("elan")
        waitFor("c15t.iab.vendors.vendor.1").assertIsDisplayed(); capture("android-partner-search")
        compose.onNodeWithTag("c15t.iab.vendors.vendor.1").performClick()
        waitFor("c15t.iab.vendor.1.consent").performClick()
        compose.onNodeWithTag("c15t.iab.vendor.1.li").performScrollTo().assertIsOff().performClick().performClick()
        capture("android-partner-details")
        device.pressBack()
        // The tag sits inside the clickable row, which merges its children's semantics.
        compose.waitUntil(15000) { compose.onAllNodesWithTag("c15t.iab.vendors.vendor.1.status", useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithTag("c15t.iab.vendors.vendor.1.status", useUnmergedTree = true).assertTextEquals("Partly on"); capture("android-partner-status")
        device.pressBack()
        compose.onNodeWithTag("c15t.iab").performScrollToNode(hasTestTag("c15t.iab.features-standard-text"))
        compose.onNodeWithTag("c15t.iab.features-standard-text").performScrollTo().assertTextContains("Features have no separate choice.", substring = true)
        compose.onNodeWithTag("c15t.iab").performScrollToNode(hasTestTag("c15t.iab.other-partners"))
        compose.onNodeWithTag("c15t.iab.other-partners").performScrollTo().performClick()
        waitFor("c15t.ac.provider.10.switch").performScrollTo().performClick(); capture("android-additional-consent")
        compose.onNodeWithTag("c15t.ac.intro").assertTextContains("Store and access information on a device", substring = true)
        device.pressBack(); compose.onNodeWithTag("c15t.iab.save").performClick(); awaitClosed()
        val summary = state("fixture.state.iab", "purposeObjections=[7]")
        summary.performScrollTo().assertTextContains("purposeObjections=[7]",substring = true).assertTextContains("vendorObjections=[1]",substring = true).assertTextContains("ac=2~~dv.10.20",substring = true)
    }
    @Test fun nativeAcceptIncludesAcAndWithdrawsOffline() {
        launch("fresh-online-iab")
        waitFor("c15t.first-layer.accept-all").performClick(); awaitClosed()
        state("fixture.state.iab", "ac=2~10.20~dv.").performScrollTo().assertTextContains("ac=2~10.20~dv.",substring = true)
        compose.onNodeWithTag("fixture.open-preferences").performScrollTo().performClick()
        waitFor("c15t.iab.reject-all").performClick(); awaitClosed()
        waitFor("fixture.state.permission.marketing").assertTextEquals("marketing: false")
    }
    @Test fun darkLargeTextKeepsDecisionsEqual() {
        try {
            device.executeShellCommand("settings put system font_scale 2.0")
            device.executeShellCommand("cmd uimode night yes")
            launch()
            val r = waitFor("c15t.first-layer.reject-all").fetchSemanticsNode().boundsInRoot
            val a = waitFor("c15t.first-layer.accept-all").fetchSemanticsNode().boundsInRoot
            Assert.assertEquals(r.width, a.width, 1f); Assert.assertEquals(r.height, a.height, 1f)
            compose.onNodeWithTag("c15t.first-layer.reject-all").assertIsDisplayed()
            compose.onNodeWithTag("c15t.first-layer.accept-all").assertIsDisplayed()
            capture("android-dark-large-text")
            compose.onNodeWithTag("c15t.first-layer.reject-all").performClick(); awaitClosed()
        } finally {
            device.executeShellCommand("settings put system font_scale 1.0")
            device.executeShellCommand("cmd uimode night no")
        }
    }
    @Test fun customizeThenBackReturnsToTheFirstLayer() {
        try {
            device.executeShellCommand("cmd uimode night yes")
            launch()
            waitFor("c15t.first-layer.customize"); capture("android-dark-first-layer")
            compose.onNodeWithTag("c15t.first-layer.customize").performClick()
            waitFor("c15t.prefs.save"); compose.onNodeWithTag("c15t.first-layer.accept-all").assertDoesNotExist()
            capture("android-dark-preferences")
            // Back from a first-layer Customize returns to the first layer; it never closes the gate.
            compose.onNodeWithTag("c15t.prefs.cancel").performClick()
            waitFor("c15t.first-layer.accept-all"); compose.onNodeWithTag("c15t.prefs.save").assertDoesNotExist()
            compose.onNodeWithTag("fixture.state.explicit-choice").assertTextEquals("none")
            compose.onNodeWithTag("c15t.first-layer.reject-all").performClick(); awaitClosed()
            waitFor("fixture.state.permission.marketing").assertTextEquals("marketing: false")
        } finally { device.executeShellCommand("cmd uimode night no") }
    }
    @Test fun brandThemeKeepsDecisionsEqual() {
        val colors = PantryBrand.theme.colors
        fun assertContrast(foreground: com.c15t.consentui.ConsentThemeColor, background: com.c15t.consentui.ConsentThemeColor) {
            for ((front, back) in listOf(foreground.light to background.light, foreground.dark to background.dark)) {
                val frontLuminance = android.graphics.Color.luminance(front or 0xFF000000.toInt())
                val backLuminance = android.graphics.Color.luminance(back or 0xFF000000.toInt())
                val ratio = (maxOf(frontLuminance, backLuminance) + 0.05f) / (minOf(frontLuminance, backLuminance) + 0.05f)
                Assert.assertTrue("Brand text contrast $ratio must be at least 4.5:1", ratio >= 4.5f)
            }
        }
        assertContrast(colors.onDecision, colors.decision)
        assertContrast(colors.onAccent, colors.accent)
        assertContrast(colors.accent, colors.canvas)
        assertContrast(colors.accent, colors.surface)
        launch("fresh-online-iab", theme = "brand")
        val reject = waitFor("c15t.first-layer.reject-all"); val accept = waitFor("c15t.first-layer.accept-all")
        waitFor("c15t.first-layer.brand").assertTextEquals("PANTRY")
        compose.onNodeWithTag("c15t.first-layer.title").assertTextEquals("Before you shop.")
        val r = reject.fetchSemanticsNode().boundsInRoot; val a = accept.fetchSemanticsNode().boundsInRoot
        Assert.assertEquals(r.width, a.width, 1f); Assert.assertEquals(r.height, a.height, 1f)
        capture("android-brand-first-layer")
        compose.onNodeWithTag("c15t.first-layer.customize").performClick()
        waitFor("c15t.iab.save"); capture("android-brand-preferences")
        compose.onNodeWithTag("c15t.iab").performScrollToNode(hasTestTag("c15t.iab.partners"))
        compose.onNodeWithTag("c15t.iab.partners").performClick()
        waitFor("c15t.iab.vendors.vendor.1"); capture("android-brand-partners")
        device.pressBack()
        waitFor("c15t.prefs.cancel").performClick()
        waitFor("c15t.first-layer.accept-all").performClick(); awaitClosed()
        waitFor("fixture.state.permission.marketing").assertTextEquals("marketing: true")
    }
    @Test fun providerLogosSwapWithoutChangingDecisions() {
        for ((provider, name) in listOf("c15t" to "c15t", "inth" to "Inth", "custom" to "Pantry")) {
            launch(branding = provider)
            waitFor("c15t.first-layer.brand").assertTextEquals("YOUR BRAND HERE")
            val headerLogo = if (provider == "custom") "custom" else provider
            compose.onNodeWithTag("c15t.first-layer.brand-logo.$headerLogo", useUnmergedTree = true).assertIsDisplayed()
            compose.onNodeWithText("CONSENT DEMO").assertDoesNotExist()
            waitFor("c15t.first-layer.branding").assertContentDescriptionEquals("Secured by $name")
            compose.onNodeWithTag("c15t.first-layer.branding.logo", useUnmergedTree = true).assertIsDisplayed()
            val reject = waitFor("c15t.first-layer.reject-all").fetchSemanticsNode().boundsInRoot
            val accept = waitFor("c15t.first-layer.accept-all").fetchSemanticsNode().boundsInRoot
            Assert.assertEquals(reject.width, accept.width, 1f)
            Assert.assertEquals(reject.height, accept.height, 1f)
            capture("android-provider-$provider")
        }
        launch(branding = "hidden")
        waitFor("c15t.first-layer.reject-all")
        compose.onNodeWithTag("c15t.first-layer.branding").assertDoesNotExist()
        compose.onNodeWithTag("c15t.first-layer.branding.logo", useUnmergedTree = true).assertDoesNotExist()
        capture("android-provider-hidden")
    }
    @Test fun identityFallsBackToAnInitialAndCanBeHidden() {
        launch(identity = "generic")
        waitFor("c15t.first-layer.brand").assertContentDescriptionEquals("Your brand here")
        compose.onNodeWithTag("c15t.first-layer.brand-logo.initial", useUnmergedTree = true).assertIsDisplayed()
        capture("android-identity-generic")
        launch(identity = "hidden")
        waitFor("c15t.first-layer.reject-all")
        compose.onNodeWithTag("c15t.first-layer.brand").assertDoesNotExist()
        capture("android-identity-hidden")
        compose.onNodeWithTag("c15t.first-layer.reject-all").performClick(); awaitClosed()
    }
    @Test fun unavailableAndDurableNoticeRefusal() {
        launch("fresh-offline-none")
        waitFor("fixture.open-preferences").performClick()
        waitFor("c15t.status.unavailable.retry"); capture("android-policy-unavailable")
        launch("fresh-online-notice",fail = true)
        waitFor("c15t.notice.acknowledge").performClick()
        waitFor("c15t.notice.error.retry"); compose.onNodeWithText("Couldn't dismiss this notice. Nothing changed on this device.", substring = true).assertIsDisplayed()
        compose.onNodeWithTag("c15t.notice.error.retry").performClick()
        compose.waitUntil(5000) { compose.onAllNodesWithTag("c15t.notice.acknowledge").fetchSemanticsNodes().isEmpty() }
        compose.onNodeWithTag("fixture.state.explicit-choice").assertTextEquals("none")
    }
    @Test fun saveRefusalStaysCalmInDarkAndAtTheLargestText() {
        try {
            launch(fail = true)
            waitFor("c15t.first-layer.customize").performClick()
            waitFor("c15t.prefs.save").performClick()
            waitFor("c15t.prefs.error.retry").assertIsDisplayed(); capture("android-save-error-light")
            compose.onNodeWithTag("c15t.prefs.error.retry").performClick(); awaitClosed()
            device.executeShellCommand("cmd uimode night yes")
            launch(fail = true)
            waitFor("c15t.first-layer.customize").performClick()
            waitFor("c15t.prefs.save").performClick()
            waitFor("c15t.prefs.error.retry").assertIsDisplayed()
            compose.onNodeWithText("Couldn't save your choices. Nothing changed on this device.", substring = true).assertIsDisplayed()
            // Try again follows the message in the same run; its 48dp target stops short of the first decision.
            val inline = compose.onNodeWithTag("c15t.prefs.error.retry").fetchSemanticsNode().boundsInRoot
            Assert.assertTrue(inline.height >= 48 * context.resources.displayMetrics.density - 1)
            Assert.assertTrue(inline.bottom <= compose.onNodeWithTag("c15t.prefs.reject-all").fetchSemanticsNode().boundsInRoot.top + 1f)
            capture("android-save-error-dark")
            compose.onNodeWithTag("c15t.prefs.error.retry").performClick(); awaitClosed()
            device.executeShellCommand("settings put system font_scale 2.0")
            launch(fail = true)
            waitFor("c15t.first-layer.customize").performClick()
            waitFor("c15t.prefs.save").performScrollTo().performClick()
            val retry = waitFor("c15t.prefs.error.retry")
            // The failure sits at the top of the footer, so its retry is in reach without scrolling.
            retry.assertIsDisplayed()
            Assert.assertTrue(retry.fetchSemanticsNode().boundsInRoot.height >= 48 * context.resources.displayMetrics.density - 1)
            Assert.assertTrue(retry.fetchSemanticsNode().boundsInRoot.bottom <= compose.onNodeWithTag("c15t.prefs.reject-all").fetchSemanticsNode().boundsInRoot.top + 1f)
            capture("android-save-error-large")
            retry.performClick(); awaitClosed()
            state("fixture.state.explicit-choice", "recorded")
        } finally {
            device.executeShellCommand("settings put system font_scale 1.0")
            device.executeShellCommand("cmd uimode night no")
        }
    }
}
