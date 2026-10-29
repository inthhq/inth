package com.c15t.bare.e2e

import android.os.SystemClock
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.Direction
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
        val deadline = SystemClock.elapsedRealtime() + 100000
        var last = JSONObject()
        do {
            last = report()
            // The consent Activity pauses RN timers. Read the installed core from the
            // independent native observer while that Activity owns the screen.
            val snapshot = last.optJSONObject("native")?.optJSONObject("snapshot") ?: last.optJSONObject("snapshot")
            if (snapshot != null) last.put("snapshot", snapshot)
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
        device.waitForIdle()
        // Accessibility state can update before the Compose animation is drawn.
        SystemClock.sleep(500)
        device.dumpWindowHierarchy(hierarchy)
        check(device.takeScreenshot(screenshot)) { "Screenshot failed: $name" }
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
            (categories + "experience").all { !snapshot.getJSONObject("effectivePermissions").getBoolean(it) }
    }

    private fun choice(granted: Set<String>, saves: Int) = awaitState("choice-$saves") { snapshot, report ->
        val receipts = snapshot.optJSONObject("explicitChoice")?.optJSONObject("categories")
        val permissions = snapshot.optJSONObject("effectivePermissions")
        val writes = report.getJSONArray("saves")
        val action = if (granted.isEmpty()) "necessary" else if (granted == categories.toSet()) "all" else "custom"
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

    private fun network(online: Boolean) {
        val connection = URL("http://localhost:3000/e2e/network").openConnection() as HttpURLConnection
        connection.requestMethod = "POST"; connection.doOutput = true
        try { connection.outputStream.use { it.write(JSONObject().put("online", online).toString().toByteArray()) }; check(connection.responseCode == 200) } finally { connection.disconnect() }
    }

    private fun localChoice(granted: Set<String>, saves: Int) = awaitState("offline-choice-$saves") { snapshot, report ->
        val receipts = snapshot.optJSONObject("explicitChoice")?.optJSONObject("categories")
        val permissions = snapshot.optJSONObject("effectivePermissions")
        receipts != null && permissions != null && report.getJSONArray("saves").length() == saves && !report.getBoolean("backendOnline") && categories.all {
            receipts.optJSONObject(it)?.optBoolean("value") == granted.contains(it) && permissions.getBoolean(it) == granted.contains(it)
        }
    }

    private fun choiceBytes(report: JSONObject): String {
        val choice = report.getJSONObject("snapshot").get("explicitChoice")
        return if (choice is JSONObject) canonical(choice) else choice.toString()
    }

    private fun reveal(id: String, down: Boolean = false): UiObject2 {
        var direction = if (down) Direction.UP else Direction.DOWN
        repeat(32) { index ->
            if (index == 16) direction = if (direction == Direction.UP) Direction.DOWN else Direction.UP
            device.findObject(By.res(id))?.let { if (it.visibleBounds.height() >= 48) return it }
            val list = device.findObject(By.scrollable(true)) ?: error("No native scroll container for $id")
            list.scroll(direction, .4f)
            device.waitForIdle()
        }
        error("Not reachable: $id")
    }

    private fun setChecked(id: String, checked: Boolean) {
        val row = reveal(id)
        device.waitForIdle()
        if (row.isChecked != checked) {
            // The shared row exposes one switch node. Tap its visible thumb.
            val bounds = control(id).visibleBounds
            device.click(bounds.right - bounds.width() / 16, bounds.centerY())
        }
        assertTrue("$id becomes $checked", device.wait(Until.hasObject(By.res(id).checked(checked)), 5000))
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
        setChecked("c15t.prefs.category.measurement.switch", true)
        for (id in listOf(1, 3, 4, 7)) setChecked("c15t.iab.purpose.$id.consent", true)
        reveal("c15t.iab.purpose.7.details").click()
        setChecked("c15t.iab.purpose.7.li", true); setChecked("c15t.iab.purpose.7.li", false)
        reveal("c15t.iab.partners").click()
        control("c15t.iab.vendors.search").text = "elan"
        capture("09-native-partner-search")
        tap("c15t.iab.vendors.vendor.1")
        setChecked("c15t.iab.vendor.1.consent", true)
        setChecked("c15t.iab.vendor.1.li", true); setChecked("c15t.iab.vendor.1.li", false)
        capture("10-native-partner-details")
        device.pressBack(); device.pressBack()
        reveal("c15t.iab.other-partners").click()
        control("c15t.ac.search").text = "Harbour"
        capture("before-additional-consent-toggle")
        setChecked("c15t.ac.provider.10.switch", true)
        capture("11-native-additional-consent")
        device.pressBack()
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
        val block = resumed.getJSONObject("jsBlock")
        val sessionId = block.getJSONObject("presentation").getString("sessionId")
        val outcomes = block.getJSONArray("outcomes")
        assertEquals(sessionId, outcomes.getJSONObject(outcomes.length() - 1).getString("sessionId"))
        assertEquals(1, (0 until outcomes.length()).count { outcomes.getJSONObject(it).getString("sessionId") == sessionId })
        assertEquals(setOf("sessionId", "kind", "revision"), outcomes.getJSONObject(outcomes.length() - 1).keys().asSequence().toSet())
        assertEquals(5, resumed.getJSONArray("saves").length())
        capture("13-js-outcome-resumed")
    }

    private fun setControl(body: JSONObject) {
        val connection = URL("http://localhost:3000/e2e/control").openConnection() as HttpURLConnection
        connection.requestMethod = "POST"; connection.doOutput = true
        try { connection.outputStream.use { it.write(body.toString().toByteArray()) }; assertEquals(200, connection.responseCode) } finally { connection.disconnect() }
    }

    private fun expiryState(name: String, matches: (JSONObject, JSONObject) -> Boolean): JSONObject {
        val deadline = SystemClock.elapsedRealtime() + 30000
        var last = JSONObject()
        do {
            last = report()
            val snapshot = last.optJSONObject("native")?.optJSONObject("snapshot")
            if (snapshot != null && matches(snapshot, last)) {
                File(output, "$name.json").also { it.writeText(last.toString(2)); publish(it) }
                return last
            }
            SystemClock.sleep(200)
        } while (SystemClock.elapsedRealtime() < deadline)
        error("Missing expiry state $name: $last")
    }

    private fun expiryJourney() {
        val optional = listOf("functionality", "experience", "measurement", "marketing")
        fun receipts(snapshot: JSONObject) = snapshot.optJSONObject("explicitChoice")?.optJSONObject("categories")
        fun denied(snapshot: JSONObject, report: JSONObject): Boolean = optional.all {
            receipts(snapshot)?.optJSONObject(it)?.opt("value") == false && report.getJSONObject("native").getJSONObject("gates").opt(it) == false
        }
        network(false); launch(); fresh()
        capture("20-expiry-initial-prompt")
        tap("c15t.first-layer.accept-all")
        val all = expiryState("expiry-earlier-all") { snapshot, _ -> optional.all { receipts(snapshot)?.optJSONObject(it)?.opt("value") == true } }
        val prior = all.getJSONObject("native").getInt("process")
        capture("21-expiry-earlier-all")
        setControl(JSONObject().put("categories", org.json.JSONArray(listOf("necessary", "measurement")))); launch()
        expiryState("expiry-narrowed-offline-relaunch") { snapshot, report ->
            snapshot.optJSONArray("consentCategories")?.toString() == "[\"necessary\",\"measurement\"]" && !snapshot.getBoolean("policyPending") && report.getJSONObject("native").getInt("process") != prior && optional.all { receipts(snapshot)?.optJSONObject(it)?.opt("value") == true }
        }
        tap("fixture.open-preferences")
        control("c15t.prefs.category.measurement.switch")
        assertFalse(device.hasObject(By.res("c15t.prefs.category.marketing.switch")))
        capture("22-expiry-narrowed-preferences")
        tap("c15t.prefs.cancel")
        setControl(JSONObject().put("now", 1793232001000L))
        expiryState("expiry-exact-boundary") { snapshot, report -> snapshot.getBoolean("policyPending") && report.getJSONObject("native").getLong("clock") == 1793232001000L }
        tap("fixture.open-preferences")
        control("c15t.status.unavailable.retry")
        assertFalse(device.hasObject(By.res("c15t.prefs.category.measurement.switch")))
        assertTrue(control("c15t.prefs.reject-all").isEnabled)
        assertFalse(device.hasObject(By.res("c15t.prefs.accept-all")))
        assertFalse(device.hasObject(By.res("c15t.prefs.save")))
        capture("23-expiry-reject-only")
        tap("c15t.prefs.reject-all")
        val denial = expiryState("expiry-durable-full-denial", ::denied)
        val frozen = canonical(denial.getJSONObject("native").getJSONObject("snapshot").getJSONObject("explicitChoice"))
        assertEquals(0, denial.getJSONArray("saves").length())
        capture("24-expiry-denied")
        launch()
        val restored = expiryState("expiry-denial-after-process-death") { snapshot, report -> denied(snapshot, report) && report.getJSONObject("native").getInt("process") != denial.getJSONObject("native").getInt("process") }
        assertEquals(frozen, canonical(restored.getJSONObject("native").getJSONObject("snapshot").getJSONObject("explicitChoice")))
        capture("25-expiry-denial-restored")
        network(true); launch()
        val replayed = expiryState("expiry-replayed-same-fingerprint") { snapshot, report -> denied(snapshot, report) && !snapshot.getBoolean("policyPending") && report.getJSONArray("saves").length() == 1 }
        val delivered = replayed.getJSONArray("saves").getJSONObject(0)
        assertEquals(frozen, canonical(delivered.getJSONObject("choice")))
        assertEquals("necessary", delivered.getString("consentAction"))
        capture("26-expiry-replayed")
        setControl(JSONObject().put("categories", org.json.JSONArray(listOf("necessary") + optional))); launch()
        expiryState("expiry-wide-refresh-no-resurrection") { snapshot, report -> denied(snapshot, report) && snapshot.getJSONArray("consentCategories").length() == 5 && !snapshot.getBoolean("policyPending") && report.getJSONArray("saves").length() == 1 }
        tap("fixture.open-preferences")
        assertFalse(control("c15t.prefs.category.measurement.switch").isChecked)
        capture("27-expiry-wide-denial")
    }

    private fun scenario(kind: String) {
        val connection = URL("http://localhost:3000/e2e/scenario").openConnection() as HttpURLConnection
        connection.requestMethod = "POST"; connection.doOutput = true
        try { connection.outputStream.use { it.write(JSONObject().put("kind", kind).toString().toByteArray()) }; assertEquals(200, connection.responseCode) } finally { connection.disconnect() }
    }

    private fun adapterJourney() {
        scenario("fallback"); network(true); launch()
        awaitState("adapter-definitive-no-match") { snapshot, _ -> snapshot.getJSONObject("resolution").getString("status") == "no-match" }
        tap("fixture.present-prompt")
        control("c15t.first-layer.reject-all")
        val opened = awaitState("adapter-fallback-command") { _, report -> report.getJSONObject("jsBlock").optJSONArray("presentations")?.length() == 1 }
        val fallbackId = opened.getJSONObject("jsBlock").getJSONArray("presentations").getJSONObject(0).getString("sessionId")
        capture("30-fallback-choice")
        tap("c15t.first-layer.reject-all")
        val committed = awaitState("adapter-fallback-committed") { snapshot, report ->
            !snapshot.isNull("explicitChoice") && report.getJSONArray("saves").length() == 1 && report.getJSONObject("jsBlock").optJSONArray("outcomes")?.length() == 1
        }
        val outcome = committed.getJSONObject("jsBlock").getJSONArray("outcomes").getJSONObject(0)
        assertEquals("committed", outcome.getString("kind"))
        assertEquals(fallbackId, outcome.getString("sessionId"))
        assertEquals(setOf("sessionId", "kind", "revision"), outcome.keys().asSequence().toSet())
        assertEquals("necessary", committed.getJSONArray("saves").getJSONObject(0).getString("consentAction"))
        capture("31-fallback-compact-commit")

        scenario("notice"); launch()
        awaitState("adapter-notice-owed") { snapshot, _ -> snapshot.getJSONObject("promptRequirement").getString("kind") == "notice" }
        tap("fixture.present-prompt")
        control("c15t.notice.acknowledge")
        val notice = awaitState("adapter-notice-command") { _, report -> report.getJSONObject("jsBlock").optJSONArray("presentations")?.length() == 1 }
        val native = notice.getJSONObject("native")
        val generation = native.getInt("activityGeneration")
        val process = native.getInt("process")
        val noticeId = notice.getJSONObject("jsBlock").getJSONArray("presentations").getJSONObject(0).getString("sessionId")
        val priorChoice = canonical(native.getJSONObject("snapshot").getJSONObject("explicitChoice"))
        tap("fixture.block-js-recreation")
        awaitState("adapter-js-blocked") { _, report -> report.getJSONObject("jsBlock").optBoolean("blocked") }
        device.executeShellCommand("am start -W --ez c15t.fixture.recreate true -n $app/.MainActivity")
        val recreated = awaitState("adapter-native-activity-recreated") { _, report -> report.getJSONObject("native").getInt("activityGeneration") > generation }
        assertEquals(process, recreated.getJSONObject("native").getInt("process"))
        assertTrue(recreated.getJSONObject("jsBlock").getBoolean("blocked"))
        control("c15t.notice.acknowledge")
        capture("32-notice-recreated-with-js-blocked")
        tap("c15t.notice.acknowledge")
        val acknowledged = awaitState("adapter-native-ack-before-js") { snapshot, _ -> snapshot.getJSONObject("promptRequirement").getString("kind") == "none" }
        assertTrue(acknowledged.getJSONObject("jsBlock").getBoolean("blocked"))
        assertEquals(priorChoice, canonical(acknowledged.getJSONObject("native").getJSONObject("snapshot").getJSONObject("explicitChoice")))
        capture("33-notice-acknowledged-with-js-blocked")
        val resumed = awaitState("adapter-one-correlated-notice-outcome") { _, report ->
            val block = report.getJSONObject("jsBlock")
            !block.optBoolean("blocked") && block.optJSONArray("outcomes")?.length() == 1
        }
        val block = resumed.getJSONObject("jsBlock")
        assertEquals(1, block.getJSONArray("presentations").length())
        val final = block.getJSONArray("outcomes").getJSONObject(0)
        assertEquals(noticeId, final.getString("sessionId"))
        assertEquals("acknowledged", final.getString("kind"))
        assertEquals(setOf("sessionId", "kind", "revision"), final.keys().asSequence().toSet())
        assertEquals(1, resumed.getJSONArray("saves").length())
        capture("34-notice-one-final-outcome")
    }

    @Test
    fun consentJourney() {
        if (InstrumentationRegistry.getArguments().getString("scenario") == "adapter") { adapterJourney(); return }
        if (InstrumentationRegistry.getArguments().getString("scenario") == "expiry") { expiryJourney(); return }
        try {
            network(false)
            launch()
            fresh()
            awaitState("first-install-unknown") { snapshot, report ->
                snapshot.isNull("policySnapshotToken") && snapshot.getJSONObject("location").isNull("countryCode") && !report.getBoolean("backendOnline") && report.getJSONArray("saves").length() == 0
            }
            control("c15t.first-layer.reject-all")
            control("c15t.first-layer.accept-all")
            control("c15t.first-layer.customize")
            device.waitForIdle()
            capture("01-fresh-prompt")
            tap("c15t.first-layer.reject-all")
            val rejected = localChoice(emptySet(), 0)
            network(true); launch()
            assertEquals(choiceBytes(rejected), choiceBytes(choice(emptySet(), 1)))
            network(false)
            capture("02-rejected")

            launch(reset = true)
            fresh()
            tap("c15t.first-layer.accept-all")
            val accepted = localChoice(categories.toSet(), 1)
            network(true); launch()
            assertEquals(choiceBytes(accepted), choiceBytes(choice(categories.toSet(), 2)))
            network(false)
            capture("03-accepted")

            launch(reset = true)
            fresh()
            tap("c15t.first-layer.customize")
            tap("c15t.prefs.category.measurement.switch")
            capture("04-customize-measurement")
            tap("c15t.prefs.save")
            val saved = localChoice(setOf("measurement"), 2)
            val savedChoice = canonical(saved.getJSONObject("snapshot").getJSONObject("explicitChoice"))
            capture("05-saved")

            tap("fixture.repeat-preferences")
            assertTrue("Saved switch is checked", control("c15t.prefs.category.measurement.switch").isChecked)
            tap("c15t.prefs.category.measurement.switch")
            assertTrue("The unsaved draft changed the visible switch", device.wait(Until.hasObject(By.res("c15t.prefs.category.measurement.switch").checked(false)), 5000))
            device.setOrientationLeft()
            device.setOrientationNatural()
            assertFalse("Draft survives native host recreation", reveal("c15t.prefs.category.measurement.switch").isChecked)
            device.pressHome()
            device.executeShellCommand("am start -W -a android.intent.action.MAIN -c android.intent.category.LAUNCHER -f 0x10200000 -n $app/.MainActivity")
            if (device.wait(Until.hasObject(By.res("fixture.open-preferences")), 3000)) tap("fixture.open-preferences")
            assertFalse("Draft survives background", control("c15t.prefs.category.measurement.switch").isChecked)
            device.unfreezeRotation()
            capture("06-unsaved-draft")
            tap("c15t.prefs.cancel")
            tap("c15t.prefs.discard.confirm")
            control("fixture.open-preferences")
            val probe = report().getJSONObject("jsBlock").getJSONObject("sessionProbe")
            assertEquals(probe.getJSONObject("first").getString("sessionId"), probe.getJSONObject("repeated").getString("sessionId"))
            assertEquals("already-presented", probe.getJSONObject("repeated").getString("status"))
            val cancelled = localChoice(setOf("measurement"), 2)
            assertEquals(savedChoice, canonical(cancelled.getJSONObject("snapshot").getJSONObject("explicitChoice")))

            tap("fixture.open-preferences")
            assertTrue(control("c15t.prefs.category.measurement.switch").isChecked)
            assertFalse(control("c15t.prefs.category.marketing.switch").isChecked)

            launch()
            awaitState("new-process") { _, report -> report.optString("session") != saved.getString("session") }
            val relaunched = localChoice(setOf("measurement"), 2)
            assertEquals(savedChoice, canonical(relaunched.getJSONObject("snapshot").getJSONObject("explicitChoice")))
            tap("fixture.open-preferences")
            assertTrue(control("c15t.prefs.category.measurement.switch").isChecked)
            capture("07-relaunched-preferences")
            tap("c15t.prefs.reject-all")
            val withdrawn = localChoice(emptySet(), 2)
            capture("08-withdrawn-offline")
            launch()
            assertEquals(choiceBytes(withdrawn), choiceBytes(localChoice(emptySet(), 2)))
            capture("09-withdrawal-relaunched")
            network(true); launch()
            val replayed = choice(emptySet(), 3)
            assertEquals(choiceBytes(withdrawn), canonical(replayed.getJSONArray("saves").getJSONObject(2).getJSONObject("choice")))
            assertEquals(choiceBytes(withdrawn), choiceBytes(replayed))
            launch()
            choice(emptySet(), 3)
            capture("10-reconnected")
            nativeIabWhileJSIsBlocked()
            nativeNoticePassesHostTouches()
        } finally {
            capture("final-or-failure")
        }
    }

    private fun nativeNoticePassesHostTouches() {
        val prepare = URL("http://localhost:3000/e2e/scenario").openConnection() as HttpURLConnection
        prepare.requestMethod = "POST"; prepare.doOutput = true
        prepare.outputStream.use { it.write("{\"kind\":\"notice\"}".toByteArray()) }; check(prepare.responseCode == 200); prepare.disconnect()
        launch()
        control("c15t.notice.acknowledge")
        val beforeSnapshot = report().getJSONObject("native").getJSONObject("snapshot")
        val before = choiceBytes(JSONObject().put("snapshot", beforeSnapshot))
        tap("fixture.host-action")
        assertTrue(device.wait(Until.hasObject(By.res("fixture.host-count").text("1")), 5000))
        control("c15t.notice.acknowledge")
        capture("14-nonmodal-native-notice")
        tap("c15t.notice.acknowledge")
        val after = awaitState("notice-acknowledged") { snapshot, report ->
            val outcomes = report.getJSONObject("jsBlock").optJSONArray("outcomes")
            snapshot.getJSONObject("promptRequirement").getString("kind") == "none" && outcomes != null && outcomes.length() > 0 &&
                outcomes.getJSONObject(outcomes.length()-1).getString("kind") == "acknowledged"
        }
        assertEquals(before, choiceBytes(after))
        assertEquals(5, after.getJSONArray("saves").length())
        capture("15-notice-acknowledged")
    }
}
