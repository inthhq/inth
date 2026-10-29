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
            val scrim = control("c15t.prefs.cancel").visibleBounds
            device.click(scrim.left + 8, device.displayHeight / 2)
            assertTrue(device.wait(Until.gone(By.res("c15t.prefs.cancel")), 10000))
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
        } finally {
            capture("final-or-failure")
        }
    }
}
