package com.c15t.bare.e2e

import android.os.SystemClock
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.UiObject2
import androidx.test.uiautomator.Until
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

@RunWith(AndroidJUnit4::class)
class ConsentJourney {
    private val device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation())
    private val output = File(InstrumentationRegistry.getInstrumentation().context.getExternalFilesDir(null), "evidence").apply { mkdirs() }
    private val categories = listOf("functionality", "measurement", "marketing")
    private val app = "com.c15t.bare"

    private fun canonical(value: JSONObject): String = value.keys().asSequence().sorted().joinToString(prefix = "{", postfix = "}") { key ->
        val child = value.get(key)
        val encoded = if (child is JSONObject) canonical(child) else if (child is String) JSONObject.quote(child) else child.toString()
        "${JSONObject.quote(key)}:$encoded"
    }

    private fun report(): JSONObject {
        val connection = URL("http://localhost:3000/e2e/state").openConnection() as HttpURLConnection
        connection.connectTimeout = 5000
        connection.readTimeout = 5000
        return try { JSONObject(connection.inputStream.bufferedReader().use { it.readText() }) }
        finally { connection.disconnect() }
    }

    private fun publish(file: File) {
        val connection = URL("http://localhost:3000/e2e/artifacts/${file.name}").openConnection() as HttpURLConnection
        connection.connectTimeout = 5000
        connection.readTimeout = 5000
        connection.requestMethod = "POST"
        connection.doOutput = true
        connection.setRequestProperty("Content-Type", "application/octet-stream")
        try {
            connection.outputStream.use { it.write(file.readBytes()) }
            check(connection.responseCode == 200) { "Could not preserve ${file.name}" }
        } finally { connection.disconnect() }
    }

    private fun awaitState(name: String, matches: (JSONObject, JSONObject) -> Boolean): JSONObject {
        val deadline = SystemClock.elapsedRealtime() + 45000
        var last = JSONObject()
        do {
            last = report()
            val snapshot = last.optJSONObject("snapshot")
            if (last.optString("core") == "native" && snapshot != null &&
                snapshot.optBoolean("ready") && !snapshot.optBoolean("policyPending") && matches(snapshot, last)) {
                val evidence = File(output, "$name.json")
                evidence.writeText(last.toString(2))
                publish(evidence)
                return last
            }
            SystemClock.sleep(250)
        } while (SystemClock.elapsedRealtime() < deadline)
        error("Timed out waiting for $name. Native report: $last")
    }

    private fun control(id: String): UiObject2 =
        device.wait(Until.findObject(By.res(id)), 15000) ?: error("Missing control $id")

    private fun tap(id: String) { control(id).click() }

    private fun capture(name: String) {
        val screenshot = File(output, "$name.png")
        val hierarchy = File(output, "$name.xml")
        check(device.takeScreenshot(screenshot)) { "Screenshot failed: $name" }
        device.dumpWindowHierarchy(hierarchy)
        // Preserve evidence before Gradle tears down the test APK.
        publish(screenshot)
        publish(hierarchy)
    }

    private fun launch(reset: Boolean = false) {
        device.executeShellCommand("am force-stop $app")
        if (reset) {
            device.executeShellCommand("am start -W -a android.intent.action.VIEW -d c15t-demo://reset -n $app/.MainActivity")
        } else {
            device.executeShellCommand("am start -W -n $app/.MainActivity")
        }
    }

    private fun fresh() = awaitState("prompt-owed") { snapshot, _ ->
        snapshot.isNull("explicitChoice") && snapshot.optJSONObject("promptRequirement")?.optString("kind") == "choice" &&
            categories.all { !snapshot.getJSONObject("effectivePermissions").getBoolean(it) }
    }

    private fun choice(granted: Set<String>, saves: Int) = awaitState("choice-$saves") { snapshot, report ->
        val receipts = snapshot.optJSONObject("explicitChoice")?.optJSONObject("categories")
        val permissions = snapshot.optJSONObject("effectivePermissions")
        val writes = report.getJSONArray("saves")
        // The app declares three optional categories; the policy governs four.
        // Bulk choices over a narrowed scope are custom on the wire.
        val action = "custom"
        receipts != null && permissions != null && writes.length() == saves &&
            writes.getJSONObject(saves - 1).getString("consentAction") == action &&
            permissions.getBoolean("necessary") &&
            categories.all { category ->
                val receipt = receipts.optJSONObject(category)
                val delivered = writes.getJSONObject(saves - 1)
                val wireReceipt = delivered.getJSONObject("choice").getJSONObject("categories").getJSONObject(category)
                permissions.getBoolean(category) == granted.contains(category) &&
                    delivered.getJSONObject("preferences").getBoolean(category) == granted.contains(category) &&
                    delivered.getString("subjectId") == snapshot.getJSONObject("subject").getString("subjectId") &&
                    receipt != null && receipt.getBoolean("value") == granted.contains(category) &&
                    receipt.getLong("confirmedAt") > 0 &&
                    wireReceipt.getBoolean("value") == receipt.getBoolean("value") &&
                    wireReceipt.getLong("confirmedAt") == receipt.getLong("confirmedAt") &&
                    canonical(wireReceipt.getJSONObject("basis")) == canonical(receipt.getJSONObject("basis"))
            }
    }

    private fun reveal(id: String, down: Boolean = false): UiObject2 {
        repeat(18) {
            device.findObject(By.res(id))?.let { if (!it.visibleBounds.isEmpty) return it }
            val x = device.displayWidth / 2
            val top = device.displayHeight / 4
            val bottom = device.displayHeight * 3 / 4
            device.swipe(x, if (down) top else bottom, x, if (down) bottom else top, 20)
        }
        error("Not reachable: $id")
    }

    private fun nativeIabWhileJSIsBlocked() {
        val prepare = URL("http://localhost:3000/e2e/scenario").openConnection() as HttpURLConnection
        prepare.requestMethod = "POST"; prepare.doOutput = true
        prepare.outputStream.use { it.write("{}".toByteArray()) }; check(prepare.responseCode == 200); prepare.disconnect()
        launch(reset = true)
        tap("c15t.first-layer.reject-all")
        awaitState("iab-rejected") { _, report -> report.getJSONArray("saves").length() == 4 }
        tap("fixture.block-js")
        val started = SystemClock.elapsedRealtime()
        while (!report().getJSONObject("jsBlock").optBoolean("blocked") && SystemClock.elapsedRealtime() - started < 10000) SystemClock.sleep(100)
        assertTrue(report().getJSONObject("jsBlock").optBoolean("blocked"))
        capture("08-native-iab-blocked-js")
        for (id in listOf(1, 3, 4)) reveal("c15t.iab.purpose.$id.consent").click()
        reveal("c15t.iab.purpose.7.details").click()
        reveal("c15t.iab.purpose.7.li").click(); tap("c15t.iab.purpose.7.li")
        reveal("c15t.iab.partners").click()
        control("c15t.iab.vendors.search").text = "elan"
        capture("09-native-partner-search")
        tap("c15t.iab.vendors.vendor.1")
        reveal("c15t.iab.vendor.1.consent").click()
        reveal("c15t.iab.vendor.1.li").click(); tap("c15t.iab.vendor.1.li")
        capture("10-native-partner-details")
        device.pressBack(); device.pressBack()
        reveal("c15t.iab.other-partners").click()
        control("c15t.ac.search").text = "Harbour"
        control("c15t.ac.provider.10.switch").click()
        capture("11-native-additional-consent")
        device.pressBack()
        reveal("c15t.prefs.category.measurement.switch", down = true).click()
        tap("c15t.iab.save")
        val deadline = SystemClock.elapsedRealtime() + 8000
        var observed = report()
        while (observed.optJSONObject("native")?.optJSONObject("gates")?.optBoolean("measurement") != true && SystemClock.elapsedRealtime() < deadline) {
            SystemClock.sleep(100); observed = report()
        }
        assertTrue("JS is still blocked at native commit", observed.getJSONObject("jsBlock").getBoolean("blocked"))
        assertTrue(observed.getJSONObject("native").getJSONObject("gates").getBoolean("measurement"))
        val choices = observed.getJSONObject("native").getJSONObject("iabConsent").getJSONObject("choices")
        assertEquals("[7]", choices.getJSONArray("purposeObjections").toString())
        assertEquals("[1]", choices.getJSONArray("vendorObjections").toString())
        assertEquals("[10]", choices.getJSONArray("adTechProviderConsents").toString())
        File(output, "native-before-js-resumes.json").also { it.writeText(observed.toString(2)); publish(it) }
        capture("12-native-committed-before-js")
        val resumed = awaitState("one-outcome-after-js-resumes") { snapshot, report ->
            val block = report.getJSONObject("jsBlock")
            val outcomes = block.optJSONArray("outcomes")
            !block.optBoolean("blocked") && outcomes != null && outcomes.length() == block.getInt("outcomesBefore") + 1 &&
                outcomes.getJSONObject(outcomes.length() - 1).getString("kind") == "committed" && snapshot.getJSONObject("effectivePermissions").getBoolean("measurement")
        }
        assertEquals(5, resumed.getJSONArray("saves").length())
        capture("13-js-outcome-resumed")
    }

    @Test
    fun consentJourney() {
        try {
            launch()
            fresh()
            capture("01-fresh-prompt")
            tap("c15t.first-layer.reject-all")
            choice(emptySet(), 1)
            capture("02-rejected")

            launch(reset = true)
            fresh()
            tap("c15t.first-layer.accept-all")
            choice(categories.toSet(), 2)
            capture("03-accepted")

            launch(reset = true)
            fresh()
            tap("c15t.first-layer.customize")
            tap("c15t.prefs.category.measurement.switch")
            capture("04-customize-measurement")
            tap("c15t.prefs.save")
            val saved = choice(setOf("measurement"), 3)
            val savedChoice = canonical(saved.getJSONObject("snapshot").getJSONObject("explicitChoice"))
            capture("05-saved")

            tap("fixture.open-preferences")
            assertTrue("Saved switch is checked", control("c15t.prefs.category.measurement.switch").isChecked)
            tap("c15t.prefs.category.measurement.switch")
            assertTrue("The unsaved draft changed the visible switch", device.wait(Until.hasObject(By.res("c15t.prefs.category.measurement.switch").checked(false)), 5000))
            capture("06-unsaved-draft")
            tap("c15t.prefs.cancel")
            tap("c15t.prefs.discard.confirm")
            control("fixture.open-preferences")
            val cancelled = choice(setOf("measurement"), 3)
            assertEquals(savedChoice, canonical(cancelled.getJSONObject("snapshot").getJSONObject("explicitChoice")))

            tap("fixture.open-preferences")
            assertTrue(control("c15t.prefs.category.measurement.switch").isChecked)
            assertFalse(control("c15t.prefs.category.marketing.switch").isChecked)

            launch()
            awaitState("new-process") { _, report -> report.optString("session") != saved.getString("session") }
            val relaunched = choice(setOf("measurement"), 3)
            assertEquals(savedChoice, canonical(relaunched.getJSONObject("snapshot").getJSONObject("explicitChoice")))
            tap("fixture.open-preferences")
            assertTrue(control("c15t.prefs.category.measurement.switch").isChecked)
            capture("07-relaunched-preferences")
            tap("c15t.prefs.cancel")
            nativeIabWhileJSIsBlocked()
        } finally {
            capture("final-or-failure")
        }
    }
}
