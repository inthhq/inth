package com.inth.demo

import android.content.Intent
import android.os.ParcelFileDescriptor
import android.os.SystemClock
import android.util.Log
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createEmptyComposeRule
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.UiDevice
import org.json.JSONArray
import org.json.JSONObject
import org.junit.*
import org.junit.runner.RunWith
import java.net.HttpURLConnection
import java.net.URL

/**
 * Consent journeys against the real PostHog, Mixpanel, Sentry Session Replay and
 * Firebase Analytics SDKs, bound through the Inth Android integration helpers.
 *
 * PostHog, Mixpanel and Sentry send to `scripts/vendor_capture.py`. Start it,
 * forward its port and pass its base URL:
 *
 * ```
 * python3 scripts/vendor_capture.py --port 39874 --out <dir>
 * adb reverse tcp:39874 tcp:39874
 * gradlew :consent-demo:connectedDebugAndroidTest \
 *   -Pandroid.testInstrumentationRunnerArguments.inthVendorCapture=http://localhost:39874
 * ```
 *
 * Without the argument the network journey runs only if the default port answers.
 * Run it on an emulator: Mixpanel refuses loopback servers, so the demo sends
 * Mixpanel to the same port on 10.0.2.2, the emulator's alias for the host.
 * Firebase cannot be redirected, so its journey reads Firebase's own verbose
 * logcat instead. Network errors to Google are expected with the fake options.
 *
 * "Relaunch" recreates the activity, core and helpers in the same process. The
 * vendor SDK singletons survive, as the test process is the app process.
 *
 * The live check sends PostHog, and only PostHog, to a real project instead.
 * It runs only when given a host and key, and is the only test that can run in
 * that process, because PostHog starts once per process:
 *
 * ```
 * gradlew :consent-demo:connectedDebugAndroidTest \
 *   -Pandroid.testInstrumentationRunnerArguments.class=com.inth.demo.RealVendorSdkTest#posthogLiveFollowsConsent \
 *   -Pandroid.testInstrumentationRunnerArguments.inthPostHogLiveHost=https://eu.i.posthog.com \
 *   -Pandroid.testInstrumentationRunnerArguments.inthPostHogLiveKey=$POSTHOG_E2E_PROJECT_KEY \
 *   -Pandroid.testInstrumentationRunnerArguments.inthPostHogLiveRunId=<unique id>
 * ```
 *
 * It cannot see PostHog's traffic. It drives the same journey, waits after
 * each probe until PostHog's disk queue is empty, and logs the run id and each
 * step's expected outcome under [EVIDENCE_TAG]. Query the project for that run
 * id afterwards; see the demo README.
 */
@RunWith(AndroidJUnit4::class)
class RealVendorSdkTest {
	@get:Rule val compose = createEmptyComposeRule()
	private var scenario: ActivityScenario<ConsentDemoActivity>? = null
	private val instrumentation get() = InstrumentationRegistry.getInstrumentation()
	private val context get() = instrumentation.targetContext
	private val device get() = UiDevice.getInstance(instrumentation)

	@After fun close() { scenario?.close() }

	// region Shared journey

	private fun launch(name: String, reset: Boolean, vendorExtras: Intent.() -> Unit) {
		scenario?.close()
		probes = 0 // Each launch has its own model and probe count.
		scenario = ActivityScenario.launch(Intent(context, ConsentDemoActivity::class.java)
			.putExtra("INTH_FIXTURE_SCENARIO", name).putExtra("INTH_FIXTURE_RESET", reset).apply(vendorExtras))
	}

	private fun waitFor(id: String, timeout: Long = 15_000): SemanticsNodeInteraction {
		compose.waitUntil(timeout) { compose.onAllNodesWithTag(id).fetchSemanticsNodes().isNotEmpty() }
		return compose.onNodeWithTag(id)
	}

	private fun awaitPermission(category: String, value: Boolean) {
		compose.waitUntil(10_000) {
			compose.onAllNodes(hasTestTag("fixture.state.permission.$category") and hasText("$category: $value")).fetchSemanticsNodes().isNotEmpty()
		}
	}

	private fun awaitClosed() {
		compose.waitUntil(10_000) { listOf("inth.first-layer.accept-all", "inth.prefs.save").all { compose.onAllNodesWithTag(it).fetchSemanticsNodes().isEmpty() } }
	}

	private var probes = 0

	/** Press the demo's probe control and wait until every SDK was handed the event and flushed. */
	private fun probe() {
		probes++
		waitFor("fixture.vendor-probe").performScrollTo().performClick()
		compose.waitUntil(20_000) {
			compose.onAllNodes(hasTestTag("fixture.vendor-probe.status") and hasText("$probes probes sent", substring = true)).fetchSemanticsNodes().isNotEmpty()
		}
	}

	private fun setMeasurement(on: Boolean) {
		waitFor("fixture.open-preferences").performScrollTo().performClick()
		waitFor("inth.prefs").performScrollToNode(hasTestTag("inth.prefs.category.measurement.switch"))
		val toggle = compose.onNodeWithTag("inth.prefs.category.measurement.switch")
		if (on) toggle.assertIsOff() else toggle.assertIsOn()
		toggle.performClick()
		compose.onNodeWithTag("inth.prefs.save").performClick()
		awaitClosed()
		awaitPermission("measurement", on)
	}

	private fun rejectAll() {
		waitFor("fixture.open-preferences").performScrollTo().performClick()
		waitFor("inth.prefs.reject-all").performClick()
		awaitClosed()
		awaitPermission("measurement", false)
	}

	/** Steps 1 and 2: fresh install, then Reject all. Ends on a fresh-install core with no choice. */
	private fun freshThenReject(name: String, vendorExtras: Intent.() -> Unit, assertNone: (String) -> Unit) {
		launch(name, reset = true, vendorExtras)
		waitFor("inth.first-layer.reject-all")
		// Dismissing the first layer records nothing; the host stays undecided.
		device.pressBack()
		waitFor("fixture.state.explicit-choice").assertTextEquals("none")
		awaitPermission("measurement", false)
		assertNone("1-fresh")
		rejectAll()
		assertNone("2-reject-all")
	}

	// endregion

	// region Network vendors through the capture server

	private val captureBase: String? by lazy {
		val argument = InstrumentationRegistry.getArguments().getString("inthVendorCapture")
		val base = (argument ?: "http://localhost:39874").trimEnd('/')
		val reachable = runCatching { get("$base/health").getBoolean("ok") }.getOrDefault(false)
		if (argument != null) Assert.assertTrue("Vendor capture server at $base is not reachable. Run adb reverse.", reachable)
		base.takeIf { reachable }
	}

	private fun get(url: String): JSONObject {
		val connection = URL(url).openConnection() as HttpURLConnection
		connection.connectTimeout = 2_000; connection.readTimeout = 2_000
		return connection.inputStream.bufferedReader().use { JSONObject(it.readText()) }
	}

	private data class Captured(val last: Int, val rows: List<JSONObject>) {
		fun vendor(name: String) = rows.filter { it.getString("vendor") == name }
	}

	private fun captured(since: Int): Captured {
		val body = get("$captureBase/captured?kind=capture&since=$since")
		val rows = body.getJSONArray("requests").let { array -> List(array.length()) { array.getJSONObject(it) } }
		return Captured(body.getInt("last"), rows)
	}

	private fun JSONArray.strings() = List(length()) { getString(it) }
	private fun List<JSONObject>.events() = flatMap { it.getJSONArray("events").strings() }
	private fun List<JSONObject>.items() = flatMap { it.getJSONArray("items").strings() }

	private fun evidence(step: String, since: Int, rows: Captured) {
		val counts = NETWORK_VENDORS.associateWith { rows.vendor(it).size }
		Log.i(EVIDENCE_TAG, "network step=$step since=$since last=${rows.last} capture=$counts events=${rows.rows.events()} items=${rows.rows.items()}")
	}

	/**
	 * Probe, then require that no SDK sends user data for longer than the
	 * slowest scheduled upload (Sentry's 5 s replay segment). [from] starts the
	 * window earlier, such as before a launch, so SDK startup traffic counts.
	 */
	private fun assertNoNetworkCapture(step: String, from: Int? = null) {
		val since = from ?: captured(0).last
		probe()
		val deadline = SystemClock.uptimeMillis() + QUIET_WINDOW_MS
		var rows = captured(since)
		while (rows.governed().isEmpty() && SystemClock.uptimeMillis() < deadline) {
			SystemClock.sleep(POLL_MS)
			rows = captured(since)
		}
		evidence(step, since, rows)
		Assert.assertEquals("$step: capture requests after seq $since: ${rows.governed()}", emptyList<JSONObject>(), rows.governed())
	}

	/**
	 * The requests Inth governs: every PostHog and Mixpanel capture, and Sentry
	 * only when it carries replay. The Sentry helper controls Session Replay and
	 * leaves error reporting and profiling to the app.
	 */
	private fun Captured.governed() = rows.filter { row ->
		row.getString("vendor") != "sentry" || row.getJSONArray("items").strings().any { it in REPLAY_ITEMS }
	}

	private fun assertNetworkCapture(step: String) {
		val since = captured(0).last
		probe()
		val deadline = SystemClock.uptimeMillis() + CAPTURE_TIMEOUT_MS
		fun complete(rows: Captured) = PROBE_EVENT in rows.vendor("posthog").events() &&
			PROBE_EVENT in rows.vendor("mixpanel").events() &&
			rows.vendor("sentry").items().any { it in REPLAY_ITEMS }
		var rows = captured(since)
		while (!complete(rows) && SystemClock.uptimeMillis() < deadline) {
			SystemClock.sleep(POLL_MS)
			rows = captured(since)
		}
		evidence(step, since, rows)
		Assert.assertTrue("$step: PostHog sent no probe: ${rows.vendor("posthog")}", PROBE_EVENT in rows.vendor("posthog").events())
		Assert.assertTrue("$step: Mixpanel sent no probe: ${rows.vendor("mixpanel")}", PROBE_EVENT in rows.vendor("mixpanel").events())
		Assert.assertTrue("$step: Sentry sent no replay: ${rows.vendor("sentry")}", rows.vendor("sentry").items().any { it in REPLAY_ITEMS })
	}

	/**
	 * Uploads already handed to an SDK before withdrawal can still arrive: Sentry
	 * sends the final segment recorded while replay was allowed when it stops.
	 * Wait until traffic is quiet and log what arrived, so the probe that follows
	 * is measured from a settled point.
	 */
	private fun settleAfterWithdrawal(since: Int) {
		val deadline = SystemClock.uptimeMillis() + CAPTURE_TIMEOUT_MS
		var last = captured(since).last
		var quietSince = SystemClock.uptimeMillis()
		while (SystemClock.uptimeMillis() - quietSince < SETTLE_MS && SystemClock.uptimeMillis() < deadline) {
			SystemClock.sleep(POLL_MS)
			val now = captured(since).last
			if (now != last) { last = now; quietSince = SystemClock.uptimeMillis() }
		}
		evidence("4-withdraw-in-flight", since, captured(since))
	}

	@Test fun posthogMixpanelAndSentryReplayFollowConsent() {
		Assume.assumeTrue("PostHog points at a live project in this run", live == null)
		val base = captureBase
		Assume.assumeTrue("Start scripts/vendor_capture.py, adb reverse its port and pass inthVendorCapture", base != null)
		val extras: Intent.() -> Unit = { putExtra(VendorSdkRequest.CAPTURE_EXTRA, base) }
		// Read the capture position before launching so startup traffic is checked too.
		val beforeFresh = captured(0).last
		freshThenReject("vendor-sdks-network", extras) { step ->
			assertNoNetworkCapture(step, from = if (step == "1-fresh") beforeFresh else null)
		}

		setMeasurement(on = true)
		assertNetworkCapture("3-grant-measurement")

		val beforeWithdrawal = captured(0).last
		setMeasurement(on = false)
		settleAfterWithdrawal(beforeWithdrawal)
		assertNoNetworkCapture("4-withdraw")

		val beforeRelaunch = captured(0).last
		launch("vendor-sdks-network", reset = false, extras)
		waitFor("fixture.state.explicit-choice").assertTextEquals("recorded")
		awaitPermission("measurement", false)
		assertNoNetworkCapture("5-relaunch-refused", from = beforeRelaunch)
	}

	// endregion

	// region PostHog against a real project

	private val live: PostHogLive? by lazy {
		val arguments = InstrumentationRegistry.getArguments()
		val host = arguments.getString("inthPostHogLiveHost")?.takeIf { it.isNotBlank() }
		val key = arguments.getString("inthPostHogLiveKey")?.takeIf { it.isNotBlank() }
		if ((host == null) != (key == null)) Assert.fail("Pass both inthPostHogLiveHost and inthPostHogLiveKey, or neither")
		val runId = arguments.getString("inthPostHogLiveRunId")?.takeIf { it.isNotBlank() } ?: java.util.UUID.randomUUID().toString()
		PostHogLive.from(host, key, runId)
	}

	private val liveSteps = JSONArray()

	/**
	 * Wait until PostHog's disk queue is empty, flushing as it goes. Without
	 * this, an event queued late in the journey dies with the test process.
	 */
	private fun drainLiveQueue(): Int {
		// PostHog writes the event to its queue on its own thread.
		SystemClock.sleep(LIVE_QUEUE_WRITE_MS)
		val deadline = SystemClock.uptimeMillis() + LIVE_DRAIN_MS
		var queued = PostHogLiveProbe.queued(context)
		while (queued > 0 && SystemClock.uptimeMillis() < deadline) {
			PostHogLiveProbe.flush()
			SystemClock.sleep(LIVE_FLUSH_POLL_MS)
			queued = PostHogLiveProbe.queued(context)
		}
		return queued
	}

	/**
	 * Tag the next probe with [step], check PostHog's own opt-out state, probe,
	 * then wait until PostHog has sent everything it queued.
	 */
	private fun liveProbe(live: PostHogLive, step: String, expected: Boolean) {
		Assert.assertEquals("$step: PostHog opt-out", !expected, PostHogLiveProbe.optedOut)
		PostHogLiveProbe.step = step
		probe()
		val left = drainLiveQueue()
		val outcome = if (expected) "present" else "absent"
		liveSteps.put(JSONObject().put("step", step).put("expected", outcome).put("sdk_opted_out", PostHogLiveProbe.optedOut).put("queued_after", left))
		Log.i(EVIDENCE_TAG, "posthog-live run_id=${live.runId} step=$step expected=$outcome queued_after=$left")
		Assert.assertEquals("$step: PostHog events still queued after ${LIVE_DRAIN_MS} ms", 0, left)
	}

	@Test fun posthogLiveFollowsConsent() {
		val live = live
		Assume.assumeTrue("Pass inthPostHogLiveHost and inthPostHogLiveKey to send to a real PostHog project", live != null)
		checkNotNull(live)
		val extras: Intent.() -> Unit = {
			putExtra(VendorSdkRequest.POSTHOG_LIVE_HOST_EXTRA, live.host)
			putExtra(VendorSdkRequest.POSTHOG_LIVE_KEY_EXTRA, live.key)
			putExtra(VendorSdkRequest.POSTHOG_LIVE_RUN_ID_EXTRA, live.runId)
		}
		Log.i(EVIDENCE_TAG, "posthog-live run_id=${live.runId} host=${live.host} event=$PROBE_EVENT")
		freshThenReject("vendor-sdks-posthog-live", extras) { label ->
			liveProbe(live, if (label == "1-fresh") "fresh" else "rejected", expected = false)
		}
		setMeasurement(on = true)
		liveProbe(live, "granted", expected = true)
		setMeasurement(on = false)
		liveProbe(live, "withdrawn", expected = false)
		launch("vendor-sdks-posthog-live", reset = false, extras)
		waitFor("fixture.state.explicit-choice").assertTextEquals("recorded")
		awaitPermission("measurement", false)
		liveProbe(live, "relaunched", expected = false)
		Assert.assertEquals("PostHog events still queued at the end", 0, drainLiveQueue())
		val evidence = JSONObject()
			.put("run_id", live.runId)
			.put("host", live.host)
			.put("event", PROBE_EVENT)
			.put("distinct_id", PostHogLiveProbe.distinctId)
			.put("steps", liveSteps)
		Log.i(EVIDENCE_TAG, "posthog-live evidence $evidence")
	}

	// endregion

	// region Firebase through its verbose log

	private fun shell(command: String): String {
		val descriptor = instrumentation.uiAutomation.executeShellCommand(command)
		return ParcelFileDescriptor.AutoCloseInputStream(descriptor).bufferedReader().use { it.readText() }
	}

	/** Firebase log lines since [sinceMillis], from the app (FA) and the measurement service (FA-SVC). */
	private fun firebaseLog(sinceMillis: Long): List<String> = shell("logcat -d -v epoch -s FA:V FA-SVC:V")
		.lineSequence()
		.filter { line -> line.trim().substringBefore(' ').toDoubleOrNull()?.let { it * 1000 >= sinceMillis } == true }
		.toList()

	/** Lines worth keeping as evidence: consent, collection, the probe and uploads. */
	private fun evidenceLine(line: String) = listOf("analytics_storage=", "measurement enabled", "Event not sent", PROBE_EVENT, "Uploading data", "upload successful").any { it in line }

	private fun awaitFirebase(step: String, since: Long, timeout: Long, done: (List<String>) -> Boolean): List<String> {
		val deadline = SystemClock.uptimeMillis() + timeout
		var lines = firebaseLog(since)
		while (!done(lines) && SystemClock.uptimeMillis() < deadline) {
			SystemClock.sleep(POLL_MS)
			lines = firebaseLog(since)
		}
		Log.i(EVIDENCE_TAG, "firebase step=$step\n${lines.filter(::evidenceLine).joinToString("\n")}")
		return lines
	}

	/** Firebase's latest collection setting and analytics_storage consent, as it logged them. */
	private data class FirebaseState(val collection: Boolean?, val analyticsStorage: Boolean?)

	private fun firebaseState(lines: List<String>) = FirebaseState(
		collection = lines.lastOrNull { "Setting app measurement enabled (FE):" in it }?.trim()?.endsWith("true"),
		analyticsStorage = lines.lastOrNull { "analytics_storage=" in it }?.substringAfter("analytics_storage=")?.startsWith("granted"),
	)

	private var testStart = 0L

	private fun assertFirebaseState(step: String, allowed: Boolean) {
		val expected = FirebaseState(allowed, allowed)
		val lines = awaitFirebase("$step-state", testStart, CAPTURE_TIMEOUT_MS) { firebaseState(it) == expected }
		Assert.assertEquals("$step: Firebase collection and analytics_storage", expected, firebaseState(lines))
	}

	private fun loggedProbe(line: String) = "Logging event" in line && "name=$PROBE_EVENT" in line
	private fun droppedEvent(line: String) = "Event not sent since app measurement is disabled" in line

	/** Firebase receives the probe and drops it, and never logs it as an event. */
	private fun assertNoFirebaseEvent(step: String) {
		assertFirebaseState(step, allowed = false)
		val since = System.currentTimeMillis()
		probe()
		val lines = awaitFirebase(step, since, QUIET_WINDOW_MS) { lines -> lines.any(::droppedEvent) || lines.any(::loggedProbe) }
		Assert.assertFalse("$step: Firebase logged the probe:\n${lines.joinToString("\n")}", lines.any(::loggedProbe))
		Assert.assertTrue("$step: Firebase did not report dropping the probe:\n${lines.joinToString("\n")}", lines.any(::droppedEvent))
	}

	private fun assertFirebaseEvent(step: String) {
		assertFirebaseState(step, allowed = true)
		val since = System.currentTimeMillis()
		probe()
		val lines = awaitFirebase(step, since, CAPTURE_TIMEOUT_MS) { lines -> lines.any(::loggedProbe) }
		Assert.assertTrue("$step: Firebase did not log the probe:\n${lines.joinToString("\n")}", lines.any(::loggedProbe))
	}

	@Test fun firebaseAnalyticsFollowsConsent() {
		shell("setprop log.tag.FA VERBOSE")
		shell("setprop log.tag.FA-SVC VERBOSE")
		// The journey reads back its whole log; FA-SVC upload dumps are long.
		shell("logcat -G 8M")
		testStart = System.currentTimeMillis()
		val extras: Intent.() -> Unit = { putExtra(VendorSdkRequest.FIREBASE_EXTRA, true) }
		freshThenReject("vendor-sdks-firebase", extras, ::assertNoFirebaseEvent)
		setMeasurement(on = true)
		assertFirebaseEvent("3-grant-measurement")
		val withdrawal = System.currentTimeMillis()
		setMeasurement(on = false)
		assertNoFirebaseEvent("4-withdraw")
		launch("vendor-sdks-firebase", reset = false, extras)
		waitFor("fixture.state.explicit-choice").assertTextEquals("recorded")
		awaitPermission("measurement", false)
		assertNoFirebaseEvent("5-relaunch-refused")
		// Withdrawal stops new collection. The measurement service still uploads
		// events it stored while collection was allowed, on its own schedule.
		val uploaded = firebaseLog(withdrawal).count { "name: $PROBE_EVENT" in it }
		Log.i(EVIDENCE_TAG, "firebase in-flight: upload dumps naming $PROBE_EVENT after withdrawal=$uploaded")
	}

	// endregion

	private companion object {
		const val EVIDENCE_TAG = "inth-vendor-evidence"
		const val PROBE_EVENT = "inth_probe"
		val NETWORK_VENDORS = listOf("posthog", "mixpanel", "sentry")
		val REPLAY_ITEMS = setOf("replay_event", "replay_recording", "replay_video")
		const val POLL_MS = 250L
		/** Longer than Sentry's 5 s replay segment, PostHog's and Mixpanel's explicit flush. */
		const val QUIET_WINDOW_MS = 10_000L
		const val SETTLE_MS = 6_000L
		const val CAPTURE_TIMEOUT_MS = 45_000L
		/** Longer than PostHog's 30 s flush timer. */
		const val LIVE_DRAIN_MS = 40_000L
		const val LIVE_FLUSH_POLL_MS = 1_000L
		const val LIVE_QUEUE_WRITE_MS = 2_000L
	}
}
