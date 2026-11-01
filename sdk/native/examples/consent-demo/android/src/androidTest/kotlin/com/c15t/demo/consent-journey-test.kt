package com.c15t.demo

import android.content.Intent
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.test.core.app.ActivityScenario
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.runner.lifecycle.ActivityLifecycleMonitorRegistry
import androidx.test.runner.lifecycle.Stage
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.By
import androidx.test.uiautomator.UiObject2
import androidx.test.uiautomator.Until
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
    private fun waitForFontScaleRecreation(previous: ConsentDemoActivity, fontScale: Float) {
        // The retry tag also exists in the old dialog. Do not query semantics while it is being replaced.
        compose.waitUntil(15000) {
            compose.runOnUiThread {
                val current = ActivityLifecycleMonitorRegistry.getInstance().getActivitiesInStage(Stage.RESUMED)
                    .filterIsInstance<ConsentDemoActivity>().singleOrNull()
                previous.isDestroyed && previous.lifecycle.currentState == androidx.lifecycle.Lifecycle.State.DESTROYED &&
                    current != null && current !== previous &&
                    kotlin.math.abs(current.resources.configuration.fontScale - fontScale) < 0.001f
            }
        }
    }
    private fun nativeSearch(id: String): UiObject2 {
        waitFor(id)
        val edit = device.wait(Until.findObject(By.clazz("android.widget.EditText")), 10_000)
        Assert.assertNotNull("Native search field is missing", edit)
        Assert.assertEquals(1, device.findObjects(By.clazz("android.widget.EditText")).size)
        return edit!!
    }
    private fun enterSearch(id: String, text: String) {
        val edit = nativeSearch(id)
        edit.click()
        edit.text = text
        compose.waitForIdle()
        if (text.isNotEmpty()) Assert.assertEquals(text, edit.text)
    }
    private fun state(id: String, text: String): SemanticsNodeInteraction {
        compose.waitUntil(10000) { compose.onAllNodes(hasTestTag(id) and hasText(text, substring = true)).fetchSemanticsNodes().isNotEmpty() }
        return compose.onNodeWithTag(id)
    }
    private fun awaitClosed() {
        compose.waitUntil(10000) { listOf("c15t.first-layer.accept-all", "c15t.prefs.save", "c15t.iab.save").all { compose.onAllNodesWithTag(it).fetchSemanticsNodes().isEmpty() } }
    }
    /** The preferences page composes rows lazily; scroll the page itself until the row exists. */
    private fun scrollPage(page: String, id: String): SemanticsNodeInteraction {
        waitFor(page); compose.onNodeWithTag(page).performScrollToNode(hasTestTag(id))
        return compose.onNodeWithTag(id)
    }
    /** Unclipped geometry: boundsInRoot is clipped to the viewport, so a row scrolled out of view would report nothing. */
    private fun bounds(id: String): androidx.compose.ui.geometry.Rect {
        val node = compose.onNodeWithTag(id).fetchSemanticsNode()
        return androidx.compose.ui.geometry.Rect(node.positionInRoot, androidx.compose.ui.geometry.Size(node.size.width.toFloat(), node.size.height.toFloat()))
    }
    private val screenHeight get() = context.resources.displayMetrics.heightPixels.toFloat()
    private val density get() = context.resources.displayMetrics.density
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

    @Test fun localIabModeStartsFromTheSetupScreen() {
        context.getSharedPreferences("prototype-demo-iab", 0).edit().clear().commit()
        scenario = ActivityScenario.launch(Intent(context, ConsentDemoActivity::class.java))
        waitFor("demo.mode.iab").performScrollTo().performClick()
        waitFor("c15t.first-layer.accept-all").performClick()
        awaitClosed()
        state("fixture.state.iab", "ac=2~10.20~dv.")
        capture("android-demo-picker-iab-commit")
    }

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
        val measurement = scrollPage("c15t.prefs", "c15t.prefs.category.measurement.switch")
        measurement.performClick().assertIsOn()
        compose.onNodeWithText("Data use").assertDoesNotExist()
        // Below accessibility sizes the footer is pinned and never a scroll view of its own.
        compose.onAllNodes(hasTestTag("c15t.footer") and hasScrollAction()).assertCountEquals(0)
        capture("android-category-preferences")
        // The footer shares the cards' edges on preferences.
        val card = measurement.fetchSemanticsNode().boundsInRoot
        val save = compose.onNodeWithTag("c15t.prefs.save").fetchSemanticsNode().boundsInRoot
        Assert.assertEquals(card.left, save.left, 1f); Assert.assertEquals(card.right, save.right, 1f)
        compose.onNodeWithTag("c15t.prefs.save").performClick()
        waitFor("c15t.prefs.error.retry").assertIsEnabled()
        measurement.assertIsOn(); capture("android-save-error")
        compose.onNodeWithTag("c15t.prefs.error.retry").performClick(); awaitClosed()
        state("fixture.state.permission.measurement", "measurement: true").assertTextEquals("measurement: true")
        waitFor("fixture.open-preferences").performClick()
        scrollPage("c15t.prefs", "c15t.prefs.category.measurement.switch").assertIsOn().performClick()
        device.pressBack(); waitFor("c15t.prefs.discard.keep").performClick()
        compose.onNodeWithTag("c15t.prefs.category.measurement.switch").assertIsOff()
        device.pressBack(); waitFor("c15t.prefs.discard.confirm").performClick()
        scenario!!.recreate()
        state("fixture.state.permission.measurement", "measurement: true").assertTextEquals("measurement: true")
    }
    @Test fun nativePartnerSearchSupportsAccessibleEditingAndFiltering() {
        launch("fresh-online-iab")
        waitFor("c15t.first-layer.customize").performClick()
        scrollPage("c15t.iab", "c15t.iab.partners").performClick()
        val id = "c15t.iab.vendors.search"
        val edit = nativeSearch(id)
        Assert.assertTrue(edit.isFocusable)
        Assert.assertFalse("Search must not take focus before it is touched", edit.isFocused)
        capture("android-native-search-unfocused")
        val density = InstrumentationRegistry.getInstrumentation().targetContext.resources.displayMetrics.density
        val field = edit.visibleBounds
        Assert.assertTrue("Search needs a full-height native touch target", field.height() >= 48 * density)
        device.click(field.left + (4 * density).toInt(), field.centerY())
        compose.waitUntil(5_000) { device.findObject(By.clazz("android.widget.EditText"))?.isFocused == true }
        device.pressBack()
        fun findEdit(node: android.view.accessibility.AccessibilityNodeInfo?): android.view.accessibility.AccessibilityNodeInfo? {
            if (node == null || node.className?.toString() == "android.widget.EditText") return node
            for (index in 0 until node.childCount) findEdit(node.getChild(index))?.let { return it }
            return null
        }
        val accessible = findEdit(InstrumentationRegistry.getInstrumentation().uiAutomation.rootInActiveWindow)
        Assert.assertNotNull("Search must expose the real editable accessibility node", accessible)
        Assert.assertTrue(accessible!!.isEditable)
        if (android.os.Build.VERSION.SDK_INT >= 26) Assert.assertEquals("Search partners", accessible.hintText?.toString())

        enterSearch(id, "no-matching-partner")
        waitFor("c15t.iab.vendors.empty").assertIsDisplayed()
        enterSearch(id, "elan")
        capture("android-native-search-filtered")
        waitFor("c15t.iab.vendors.vendor.1").assertIsDisplayed()
        compose.onNodeWithTag("c15t.iab.vendors.vendor.2").assertDoesNotExist()
        device.pressKeyCode(android.view.KeyEvent.KEYCODE_MOVE_END)
        device.pressKeyCode(android.view.KeyEvent.KEYCODE_DEL)
        compose.waitUntil(5_000) { device.findObject(By.clazz("android.widget.EditText"))?.text == "ela" }
        device.pressKeyCode(android.view.KeyEvent.KEYCODE_N)
        compose.waitUntil(5_000) { device.findObject(By.clazz("android.widget.EditText"))?.text == "elan" }
        enterSearch(id, "")
        waitFor("c15t.iab.vendors.vendor.1").assertIsDisplayed()
        waitFor("c15t.iab.vendors.vendor.2").assertIsDisplayed()
        device.pressBack()
        waitFor(id).assertIsDisplayed()
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
        enterSearch("c15t.iab.vendors.search", "elan")
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
        enterSearch("c15t.ac.search", "no-matching-partner")
        waitFor("c15t.ac.empty").assertIsDisplayed()
        enterSearch("c15t.ac.search", "")
        device.pressBack()
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
    @Test fun largestTextIabNavigationSearchAndSave() {
        try {
            device.executeShellCommand("settings put system font_scale 2.0")
            launch("fresh-online-iab")
            val customize = waitFor("c15t.first-layer.customize")
            // No footer at accessibility sizes: the decisions and the partner count follow the text in the page.
            compose.onAllNodesWithTag("c15t.footer").assertCountEquals(0)
            compose.onNodeWithTag("c15t.first-layer.partner-count").performScrollTo().assertIsDisplayed()
            compose.onNodeWithTag("c15t.first-layer.reject-all").performScrollTo().assertIsDisplayed()
            val r = bounds("c15t.first-layer.reject-all"); val a = bounds("c15t.first-layer.accept-all")
            Assert.assertEquals(r.width, a.width, 1f); Assert.assertTrue(r.bottom <= a.top + 1f)
            capture("android-2.0-iab-first-layer")
            customize.performScrollTo().performClick()
            val save = waitFor("c15t.iab.save")
            save.assertIsDisplayed()
            compose.onAllNodes(hasTestTag("c15t.footer") and hasScrollAction()).assertCountEquals(0)
            Assert.assertTrue(bounds("c15t.footer").top >= screenHeight * 0.7f)
            scrollPage("c15t.iab", "c15t.iab.reject-all").assertIsDisplayed()
            capture("android-2.0-iab-preferences")
            scrollPage("c15t.iab", "c15t.iab.purpose.7.consent").performClick().assertIsOn()
            scrollPage("c15t.iab", "c15t.iab.purpose.7.details").performClick()
            scrollPage("c15t.iab", "c15t.iab.purpose.7.view-partners").assertIsDisplayed()
            capture("android-2.0-iab-purpose-details")
            compose.onNodeWithTag("c15t.iab.purpose.7.view-partners").performClick()
            waitFor("c15t.iab.vendors.filter.purpose.clear").assertIsDisplayed()
            capture("android-2.0-partner-list")
            enterSearch("c15t.iab.vendors.search", "elan")
            waitFor("c15t.iab.vendors.vendor.1").assertIsDisplayed(); capture("android-2.0-partner-search")
            compose.onNodeWithTag("c15t.iab.vendors.vendor.1").performClick()
            waitFor("c15t.iab.vendor.1.consent").performScrollTo().performClick().assertIsOn()
            capture("android-2.0-partner-details")
            device.pressBack()
            compose.waitUntil(15000) { compose.onAllNodesWithTag("c15t.iab.vendors.vendor.1.status", useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty() }
            device.pressBack()
            scrollPage("c15t.iab", "c15t.iab.other-partners").performClick()
            waitFor("c15t.ac.search")
            // The provider list is lazy and its intro fills the screen at this size; scroll the list itself.
            compose.onNode(hasAnyAncestor(hasTestTag("c15t.ac")) and hasScrollToIndexAction()).performScrollToNode(hasTestTag("c15t.ac.provider.10.switch"))
            compose.onNodeWithTag("c15t.ac.provider.10.switch").performClick().assertIsOn()
            capture("android-2.0-additional-consent")
            device.pressBack()
            waitFor("c15t.iab.save").assertIsDisplayed().performClick(); awaitClosed()
            // The host's state list is lazy too; at this size its IAB row is below the fold on a short screen.
            waitFor("fixture.state").performScrollToNode(hasTestTag("fixture.state.iab"))
            state("fixture.state.iab", "vendors=[1]").assertTextContains("vendors=[1]", substring = true)
        } finally {
            device.executeShellCommand("settings put system font_scale 1.0")
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
    // Accessibility: names, roles and states in the semantics tree (AX inspection, not TalkBack).
    private fun role(role: androidx.compose.ui.semantics.Role) = SemanticsMatcher.expectValue(androidx.compose.ui.semantics.SemanticsProperties.Role, role)
    private fun heading() = SemanticsMatcher.keyIsDefined(androidx.compose.ui.semantics.SemanticsProperties.Heading)
    @Test fun accessibilityNamesRolesAndStates() {
        launch(fail = true)
        waitFor("c15t.first-layer.title").assert(heading())
        for ((tag, name) in listOf("c15t.first-layer.reject-all" to "Reject all", "c15t.first-layer.accept-all" to "Accept all", "c15t.first-layer.customize" to "Customize")) {
            waitFor(tag).assertHasClickAction().assertContentDescriptionEquals(name)
        }
        // The brand is announced once; the mark beside it is decorative.
        compose.onAllNodes(hasContentDescription("Your brand here") or hasText("Your brand here")).assertCountEquals(1)
        waitFor("c15t.first-layer.branding").assertContentDescriptionEquals("Secured by c15t")
        capture("android-ax-first-layer")
        compose.onNodeWithTag("c15t.first-layer.customize").performClick()
        waitFor("c15t.prefs.title").assert(heading()).assertTextEquals("Privacy settings")
        // Opened from the first layer, the leading action goes back to it and is named so.
        compose.onNodeWithTag("c15t.prefs.cancel").assertContentDescriptionEquals("Back")
        val measurement = scrollPage("c15t.prefs", "c15t.prefs.category.measurement.switch")
        measurement.assert(role(androidx.compose.ui.semantics.Role.Switch)).assertIsOff().assertTextContains("Measurement", substring = true)
        measurement.performClick().assertIsOn()
        capture("android-ax-preferences")
        compose.onNodeWithTag("c15t.prefs.save").assertContentDescriptionEquals("Save choices").performClick()
        val retry = waitFor("c15t.prefs.error.retry")
        retry.assert(role(androidx.compose.ui.semantics.Role.Button)).assertHasClickAction().assertContentDescriptionEquals("Try again")
        // The failure is two nodes: the message once, then the retry.
        compose.onAllNodesWithContentDescription("Couldn't save your choices. Nothing changed on this device.").assertCountEquals(1)
        capture("android-ax-save-error")
        retry.performClick(); awaitClosed()
        state("fixture.state.permission.measurement", "measurement: true")
    }
    // Live TalkBack traversal is `TalkBackJourneyTest` (talkback-journey-test.kt): it needs a UiAutomation that
    // does not suppress other accessibility services, which the Compose rule's connection does.
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
            for (scale in listOf("1.3", "2.0")) {
                val page = scale.toFloat() >= 1.5f
                device.executeShellCommand("settings put system font_scale $scale")
                launch(fail = true)
                val customize = waitFor("c15t.first-layer.customize")
                if (page) customize.performScrollTo()
                customize.performClick()
                val save = waitFor("c15t.prefs.save")
                // The footer never scrolls on its own, at any size.
                compose.onAllNodes(hasTestTag("c15t.footer") and hasScrollAction()).assertCountEquals(0)
                save.assertIsDisplayed()
                if (page) {
                    // One compact pinned action, Save alone, leaving most of the window to the page.
                    Assert.assertTrue("footer top ${bounds("c15t.footer").top} of $screenHeight", bounds("c15t.footer").top >= screenHeight * 0.7f)
                    // Reject all and Accept all sit in the page after the introduction, equal and stacked.
                    scrollPage("c15t.prefs", "c15t.prefs.reject-all").assertIsDisplayed()
                    val r = bounds("c15t.prefs.reject-all"); val a = bounds("c15t.prefs.accept-all")
                    Assert.assertEquals(r.width, a.width, 1f); Assert.assertEquals(r.height, a.height, 1f)
                    Assert.assertTrue(r.bottom <= a.top + 1f)
                } else {
                    Assert.assertTrue("footer top ${bounds("c15t.footer").top} of $screenHeight", bounds("c15t.footer").top >= screenHeight * 0.55f)
                }
                capture("android-$scale-preferences")
                // Read and change a later setting by ordinary scrolling, then save from the pinned bar.
                scrollPage("c15t.prefs", "c15t.prefs.category.measurement.switch").performClick().assertIsOn()
                capture("android-$scale-measurement")
                compose.onNodeWithTag("c15t.prefs.save").assertIsDisplayed().performClick()
                val retry = waitFor("c15t.prefs.error.retry")
                // The page scrolls to the failure by itself: the whole message and Try again sit above the pinned Save.
                compose.waitForIdle()
                retry.assertIsDisplayed()
                compose.onNodeWithText("Couldn't save your choices. Nothing changed on this device.", substring = true).assertIsDisplayed()
                // In the page the row ends above the pinned Save; in a pinned footer it ends above Reject all. Either way it is wholly on screen.
                val message = bounds("c15t.prefs.error"); val target = bounds("c15t.prefs.error.retry")
                val limit = if (page) bounds("c15t.footer").top else bounds("c15t.prefs.reject-all").top
                Assert.assertTrue("message $message limit $limit", message.top >= 0f && message.bottom <= limit + 1f)
                Assert.assertTrue(target.height >= 48 * density - 1)
                Assert.assertTrue("retry $target limit $limit", target.bottom <= limit + 1f && target.bottom <= screenHeight)
                capture("android-$scale-save-error")
                if (page) {
                    // Text size changes while the failure is up: the draft, the failure and its retry survive the recreation.
                    lateinit var beforeResize: ConsentDemoActivity
                    scenario!!.onActivity { beforeResize = it }
                    device.executeShellCommand("settings put system font_scale 1.3")
                    waitForFontScaleRecreation(beforeResize, 1.3f)
                    waitFor("c15t.prefs.error.retry")
                    scrollPage("c15t.prefs", "c15t.prefs.category.measurement.switch").assertIsOn()
                    compose.onNodeWithTag("c15t.prefs.error.retry").assertIsDisplayed()
                    capture("android-resized-save-error")
                }
                compose.onNodeWithTag("c15t.prefs.error.retry").performClick(); awaitClosed()
                state("fixture.state.explicit-choice", "recorded")
                state("fixture.state.permission.measurement", "measurement: true")
            }
        } finally {
            device.executeShellCommand("settings put system font_scale 1.0")
            device.executeShellCommand("cmd uimode night no")
        }
    }
}
