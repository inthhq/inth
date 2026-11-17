import os
import XCTest

/// Real PostHog, Mixpanel and Sentry Replay traffic follows the c15t measurement decision.
///
/// Runs only under `run-vendor-e2e.sh`, which starts `scripts/vendor_capture.py` and passes
/// its base URL as `C15T_VENDOR_BASE`. The app points every SDK at that server; this test
/// reads what arrived from `/captured`. Firebase cannot be redirected, so the runner checks
/// its debug log against the step markers this test writes to the unified log
/// (`scripts/vendor-firebase-log.py`).
final class VendorSDKTests: XCTestCase {
    static let vendors = ["posthog", "mixpanel", "sentry"]
    static let replayItems: Set<String> = ["replay_event", "replay_recording", "replay_video"]
    /// Longer than two Sentry replay segments (5 s each) and any SDK's reaction to an explicit flush.
    static let quietWindow: TimeInterval = 12

    var app: XCUIApplication!
    var base: URL!
    let marker = Logger(subsystem: "com.c15t.vendor-e2e", category: "step")
    var evidence: [[String: Any]] = []

    override func setUpWithError() throws {
        continueAfterFailure = false
        guard let raw = ProcessInfo.processInfo.environment["C15T_VENDOR_BASE"], let url = URL(string: raw) else {
            throw XCTSkip("Set C15T_VENDOR_BASE with run-vendor-e2e.sh to run the real vendor SDK journey.")
        }
        base = url
    }

    override func tearDown() {
        if testRun?.hasSucceeded == false, let app { print(app.debugDescription) }
        let data = (try? JSONSerialization.data(withJSONObject: evidence, options: [.prettyPrinted, .sortedKeys])) ?? Data()
        let attachment = XCTAttachment(data: data, uniformTypeIdentifier: "public.json")
        attachment.name = "vendor-steps.json"
        attachment.lifetime = .keepAlways
        add(attachment)
        if let dir = ProcessInfo.processInfo.environment["C15T_CAPTURE_DIR"] {
            try? FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
            try? data.write(to: URL(fileURLWithPath: dir).appendingPathComponent("vendor-steps.json"))
        }
    }

    func testRealVendorSDKsFollowTheMeasurementDecision() throws {
        // 1. Fresh install: every SDK starts denied and the first layer is showing.
        // Read the capture position before launching so SDK startup traffic is checked too.
        let beforeFresh = capturedLast()
        launch(reset: true)
        XCTAssertTrue(app.buttons["c15t.first-layer.reject-all"].waitForExistence(timeout: 15))
        try expectNoCapture(step: "1-fresh", since: beforeFresh)

        // 2. Reject all.
        app.buttons["c15t.first-layer.reject-all"].tap()
        XCTAssertTrue(app.buttons["fixture.open-preferences"].waitForExistence(timeout: 10))
        XCTAssertEqual(app.staticTexts["fixture.state.permission.measurement"].label, "measurement: false")
        try expectNoCapture(step: "2-reject")

        // 3. Grant measurement only, from the standing preferences.
        setMeasurement(true)
        let since = mark("3-grant")
        probe()
        let granted = try waitFor("every SDK to deliver after the grant", timeout: 60) { rows in
            let missing = Self.vendors.filter { vendor in !rows.contains { Self.counts($0, for: vendor, probeOnly: true) } }
            return missing.isEmpty ? true : nil
        } rows: { self.captured(since: since) }
        record("3-grant", since: since, rows: granted)
        for vendor in Self.vendors {
            XCTAssertTrue(granted.contains { Self.counts($0, for: vendor, probeOnly: true) }, vendor)
        }

        // 4. Withdraw from Privacy settings. Drain what was captured while granted, then probe.
        setMeasurement(false)
        let withdrawn = mark("4-withdraw-drain")
        tap("vendor.flush")
        let inFlight = try settle(since: withdrawn)
        record("4-withdraw-in-flight", since: withdrawn, rows: inFlight)
        try expectNoCapture(step: "4-withdraw")

        // 5. Relaunch with the saved refusal, again checking from before the launch.
        app.terminate()
        let beforeRelaunch = capturedLast()
        launch(reset: false)
        XCTAssertTrue(app.buttons["fixture.open-preferences"].waitForExistence(timeout: 15))
        XCTAssertEqual(app.staticTexts["fixture.state.permission.measurement"].label, "measurement: false")
        try expectNoCapture(step: "5-relaunch", since: beforeRelaunch)
        mark("done")
    }

    // MARK: - Steps

    func launch(reset: Bool) {
        app = XCUIApplication()
        app.launchEnvironment = [
            "C15T_FIXTURE_SCENARIO": "vendor-sdks",
            "C15T_FIXTURE_RESET": reset ? "1" : "0",
            "C15T_VENDOR_BASE": base.absoluteString,
        ]
        // Debug mode logs collection changes and each event; verbose adds the consent values.
        // scripts/vendor-firebase-log.py reads them against this test's step markers.
        app.launchArguments = ["-FIRDebugEnabled", "-FIRAnalyticsDebugEnabled", "-FIRAnalyticsVerboseLoggingEnabled"]
        app.launch()
        XCTAssertTrue(app.buttons["vendor.probe"].waitForExistence(timeout: 15), "The vendor harness did not start.")
    }

    /// Probes, then watches the capture server for the quiet window. Any capture fails the step.
    /// `since` starts the window earlier than the step marker, such as before a launch.
    func expectNoCapture(step: String, since startedAt: Int? = nil) throws {
        let marked = mark(step)
        let since = startedAt ?? marked
        probe()
        let rows = try waitFor("no capture during \(step)", timeout: Self.quietWindow, until: { rows in
            rows.contains { row in Self.vendors.contains { Self.counts(row, for: $0, probeOnly: false) } } ? rows : nil
        }, rows: { self.captured(since: since) }, absenceIsSuccess: true)
        record(step, since: since, rows: rows)
        XCTAssertTrue(rows.isEmpty, "\(step): \(rows)")
    }

    /// Waits until the capture log is quiet for six seconds and returns what arrived meanwhile.
    func settle(since: Int) throws -> [[String: Any]] {
        var seen = captured(since: since)
        var quietSince = Date()
        let deadline = Date().addingTimeInterval(45)
        while Date() < deadline {
            if Date().timeIntervalSince(quietSince) >= 6 { return seen }
            RunLoop.current.run(until: Date().addingTimeInterval(0.5))
            let now = captured(since: since)
            if now.count != seen.count { seen = now; quietSince = Date() }
        }
        XCTFail("Vendor traffic did not settle after withdrawal: \(seen)")
        return seen
    }

    func setMeasurement(_ on: Bool) {
        let open = app.buttons["fixture.open-preferences"]
        XCTAssertTrue(open.waitForExistence(timeout: 10))
        let ready = NSPredicate(format: "isHittable == true")
        expectation(for: ready, evaluatedWith: open)
        waitForExpectations(timeout: 10)
        open.tap()
        let measurement = app.switches["c15t.prefs.category.measurement.switch"]
        XCTAssertTrue(measurement.waitForExistence(timeout: 10))
        for _ in 0..<8 where !measurement.isHittable { app.swipeUp() }
        if (measurement.value as? String == "1") != on { measurement.tap() }
        XCTAssertEqual(measurement.value as? String, on ? "1" : "0")
        let save = app.buttons["c15t.prefs.save"]
        for _ in 0..<8 where !save.isHittable { app.swipeUp() }
        save.tap()
        let state = app.staticTexts["fixture.state.permission.measurement"]
        expectation(for: NSPredicate(format: "label == %@", "measurement: \(on)"), evaluatedWith: state)
        waitForExpectations(timeout: 10)
    }

    func probe() {
        let count = app.staticTexts["vendor.probe.count"]
        let before = count.label
        tap("vendor.probe")
        expectation(for: NSPredicate(format: "label != %@", before), evaluatedWith: count)
        waitForExpectations(timeout: 5)
    }

    func tap(_ id: String) {
        let button = app.buttons[id]
        XCTAssertTrue(button.waitForExistence(timeout: 5))
        button.tap()
    }

    /// Writes a step marker to the unified log for the Firebase check and returns the capture position.
    @discardableResult
    func mark(_ step: String) -> Int {
        let last = capturedLast()
        marker.notice("c15t-vendor-step \(step, privacy: .public) seq=\(last, privacy: .public)")
        return last
    }

    func record(_ step: String, since: Int, rows: [[String: Any]]) {
        var byVendor: [String: Int] = [:]
        for vendor in Self.vendors { byVendor[vendor] = rows.filter { Self.counts($0, for: vendor, probeOnly: false) }.count }
        evidence.append(["step": step, "since": since, "captures": byVendor, "requests": rows])
        print("vendor-step \(step) since=\(since) captures=\(byVendor)")
    }

    // MARK: - Capture server

    /// A capture request for `vendor`. Sentry counts replay items only: the c15t helper gates
    /// replay, not errors or sessions. `probeOnly` asks for the probe event itself.
    static func counts(_ row: [String: Any], for vendor: String, probeOnly: Bool) -> Bool {
        guard row["vendor"] as? String == vendor, row["kind"] as? String == "capture" else { return false }
        if vendor == "sentry" {
            return !replayItems.isDisjoint(with: row["items"] as? [String] ?? [])
        }
        return !probeOnly || (row["events"] as? [String] ?? []).contains("c15t_probe")
    }

    func capturedLast() -> Int {
        guard let last = query("/captured?kind=capture&since=0")["last"] as? Int else {
            XCTFail("Capture server response has no last sequence number")
            return 0
        }
        return last
    }

    /// An unreachable or broken capture server fails the test; it must never read as "no traffic".
    func captured(since: Int) -> [[String: Any]] {
        guard let rows = query("/captured?kind=capture&since=\(since)")["requests"] as? [[String: Any]] else {
            XCTFail("Capture server response has no requests list")
            return []
        }
        return rows
    }

    func query(_ path: String) -> [String: Any] {
        let url = URL(string: path, relativeTo: base)!.absoluteURL
        let done = DispatchSemaphore(value: 0)
        var result: [String: Any] = [:]
        var problem: String?
        URLSession.shared.dataTask(with: url) { data, response, error in
            if let error {
                problem = "request failed: \(error.localizedDescription)"
            } else if let status = (response as? HTTPURLResponse)?.statusCode, status != 200 {
                problem = "HTTP \(status)"
            } else if let data, let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                result = json
            } else {
                problem = "response is not a JSON object"
            }
            done.signal()
        }.resume()
        if done.wait(timeout: .now() + 10) == .timedOut {
            XCTFail("Capture server did not answer \(url)")
        } else if let problem {
            XCTFail("Capture server \(url): \(problem)")
        }
        return result
    }

    /// Polls `rows` until `until` returns a value or the timeout passes. With `absenceIsSuccess`,
    /// reaching the timeout is the pass and the rows seen are returned for the assertion.
    func waitFor<Value>(_ what: String, timeout: TimeInterval, until: ([[String: Any]]) -> Value?,
                        rows: () -> [[String: Any]], absenceIsSuccess: Bool = false) throws -> [[String: Any]] {
        let deadline = Date().addingTimeInterval(timeout)
        var latest: [[String: Any]] = []
        repeat {
            latest = rows()
            if until(latest) != nil { return latest }
            RunLoop.current.run(until: Date().addingTimeInterval(0.5))
        } while Date() < deadline
        if !absenceIsSuccess { XCTFail("Timed out waiting for \(what): \(latest)") }
        return latest
    }
}
