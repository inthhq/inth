import XCTest

/// The real-vendor consent journey for the Expo E2E build, on iOS.
///
/// The steps and the traffic rules match the vendor steps in the bare fixture's
/// `ConsentJourney` (react-native-bare/ios/C15tBareUITests/consent-journey.swift):
/// a fresh install and a refusal send no user data, a measurement grant delivers
/// the probe, a withdrawal stops every vendor once in-flight uploads settle, and a
/// relaunch keeps the refusal. Firebase is checked from its log after the run.
/// `vendor-e2e.sh` builds this as an external UI test bundle that drives the app.
/// Longer than Sentry's 5-second replay upload interval.
private let vendorQuietSeconds: TimeInterval = 6

final class VendorJourney: XCTestCase {
  private let app = XCUIApplication(bundleIdentifier: "com.c15t.expodev")
  /// Vendors whose traffic the capture server records. Firebase is checked from its log.
  private let trafficVendors = ["posthog", "mixpanel", "amplitude", "sentry"]

  override func setUpWithError() throws {
    continueAfterFailure = false
  }

  // MARK: Fixture backend

  private func endpoint(_ path: String) -> URL {
    URL(string: (ProcessInfo.processInfo.environment["C15T_E2E_URL"] ?? "http://localhost:3000") + path)!
  }

  private func fetchJSON(_ path: String, body: [String: Any]? = nil) throws -> [String: Any] {
    let done = expectation(description: "Fixture backend \(path)")
    var request = URLRequest(url: endpoint(path))
    if let body {
      request.httpMethod = "POST"
      request.httpBody = try JSONSerialization.data(withJSONObject: body)
      request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    }
    var response: Data?
    URLSession.shared.dataTask(with: request) { data, _, _ in
      response = data
      done.fulfill()
    }.resume()
    wait(for: [done], timeout: 5)
    return try XCTUnwrap(JSONSerialization.jsonObject(with: XCTUnwrap(response)) as? [String: Any])
  }

  private func vendorProbes() throws -> [[String: Any]] {
    try fetchJSON("/e2e/state")["vendorProbes"] as? [[String: Any]] ?? []
  }

  // MARK: Real vendor SDKs

  /// Capture requests after `since`. Sentry counts only replay items, the part c15t controls.
  private func governedCapture(since: Int) throws -> (last: Int, rows: [[String: Any]]) {
    let captured = try fetchJSON("/captured?kind=capture&since=\(since)")
    // A response without the list is a broken capture server, never "no traffic".
    let rows = try XCTUnwrap(captured["requests"] as? [[String: Any]], "Capture server response has no requests list").filter { row in
      row["vendor"] as? String != "sentry" || (row["items"] as? [String] ?? []).contains { $0.hasPrefix("replay_") }
    }
    return (try XCTUnwrap(captured["last"] as? Int), rows)
  }

  private func counts(_ rows: [[String: Any]]) -> [String: Int] {
    Dictionary(uniqueKeysWithValues: trafficVendors.map { vendor in (vendor, rows.filter { $0["vendor"] as? String == vendor }.count) })
  }

  /// Wait for the probe the app reports after `count` earlier ones. Each SDK must accept
  /// the calls, and the app must read the measurement decision the step expects.
  private func awaitVendorProbe(after count: Int, reason: String, measurement: Bool) throws -> [String: Any] {
    let deadline = Date().addingTimeInterval(60)
    repeat {
      if let probe = try vendorProbes().dropFirst(count).first(where: { $0["reason"] as? String == reason }) {
        XCTAssertEqual(probe["started"] as? Bool, true, "Vendor SDKs did not start: \(probe)")
        XCTAssertEqual((probe["errors"] as? [String: Any])?.isEmpty, true, "Vendor SDK errors: \(probe)")
        XCTAssertEqual(probe["measurementAllowed"] as? Bool, measurement, "Probe ran with the wrong decision: \(probe)")
        return probe
      }
      RunLoop.current.run(until: Date().addingTimeInterval(0.25))
    } while Date() < deadline
    XCTFail("No \(reason) vendor probe after \(count)")
    return [:]
  }

  private func sendVendorProbe(measurement: Bool) throws -> [String: Any] {
    let count = try vendorProbes().count
    tap("fixture.vendor-probe")
    return try awaitVendorProbe(after: count, reason: "button", measurement: measurement)
  }

  private func recordVendorStep(_ step: String, probe: [String: Any], granted: Bool, since: Int, rows: [[String: Any]], extra: [String: Any] = [:]) throws {
    let body: [String: Any] = ["step": step, "probe": probe["name"] ?? NSNull(), "granted": granted, "since": since, "counts": counts(rows), "requests": rows].merging(extra) { $1 }
    _ = try fetchJSON("/e2e/vendor-step", body: body)
    let evidence = XCTAttachment(data: try JSONSerialization.data(withJSONObject: body, options: [.prettyPrinted, .sortedKeys]), uniformTypeIdentifier: "public.json")
    evidence.name = step
    evidence.lifetime = .keepAlways
    add(evidence)
  }

  /// No vendor may send user data after `since`. An absence needs a window: Mixpanel's
  /// native flush returns before its upload, and Sentry uploads replay every 5 seconds.
  private func assertVendorsSilent(_ step: String, since: Int, probe: [String: Any], extra: [String: Any] = [:]) throws {
    let until = Date().addingTimeInterval(8)
    var observed = try governedCapture(since: since)
    while observed.rows.isEmpty && Date() < until {
      RunLoop.current.run(until: Date().addingTimeInterval(0.5))
      observed = try governedCapture(since: since)
    }
    try recordVendorStep(step, probe: probe, granted: false, since: since, rows: observed.rows, extra: extra)
    XCTAssertTrue(observed.rows.isEmpty, "\(step): vendors sent user data without consent: \(observed.rows)")
  }

  /// Every SDK sends the probe event, and Sentry uploads replay, once measurement is granted.
  private func assertVendorsCapture(_ step: String, since: Int, probe: [String: Any]) throws {
    let name = try XCTUnwrap(probe["name"] as? String)
    func sent(_ rows: [[String: Any]], _ vendor: String) -> Bool {
      rows.contains { row in
        row["vendor"] as? String == vendor && (vendor == "sentry" || (row["events"] as? [String] ?? []).contains(name))
      }
    }
    let deadline = Date().addingTimeInterval(60)
    var observed = try governedCapture(since: since)
    while !trafficVendors.allSatisfy({ sent(observed.rows, $0) }) && Date() < deadline {
      RunLoop.current.run(until: Date().addingTimeInterval(0.5))
      observed = try governedCapture(since: since)
    }
    try recordVendorStep(step, probe: probe, granted: true, since: since, rows: observed.rows)
    for vendor in trafficVendors {
      XCTAssertTrue(sent(observed.rows, vendor), "\(step): \(vendor) sent no \(vendor == "sentry" ? "replay" : name) after granting measurement: \(observed.rows)")
    }
  }

  /// Withdrawal may finish uploads already in flight; Sentry documents a final replay
  /// segment after stop and uploads replay every 5 seconds. Wait until vendor traffic
  /// has been quiet for longer than that interval (`vendorQuietSeconds`).
  private func vendorTrafficSettles(after since: Int) throws -> (last: Int, inFlight: [[String: Any]]) {
    let deadline = Date().addingTimeInterval(30)
    var observed = try governedCapture(since: since)
    var quietSince = Date()
    var seen = observed.rows.count
    while Date().timeIntervalSince(quietSince) < vendorQuietSeconds && Date() < deadline {
      RunLoop.current.run(until: Date().addingTimeInterval(0.5))
      observed = try governedCapture(since: since)
      if observed.rows.count != seen { seen = observed.rows.count; quietSince = Date() }
    }
    XCTAssertGreaterThanOrEqual(Date().timeIntervalSince(quietSince), vendorQuietSeconds, "Vendor traffic did not stop after withdrawal: \(observed.rows)")
    return (observed.last, observed.rows)
  }

  // MARK: App controls

  private func capture(_ name: String) {
    let screenshot = XCTAttachment(screenshot: app.screenshot())
    screenshot.name = name
    screenshot.lifetime = .keepAlways
    add(screenshot)
  }

  private func element(_ identifier: String) -> XCUIElement {
    app.descendants(matching: .any)[identifier].firstMatch
  }

  private func tap(_ identifier: String) {
    let control = element(identifier)
    XCTAssertTrue(control.waitForExistence(timeout: 30), "Missing control \(identifier)\n\(app.debugDescription)")
    if control.elementType == .switch { reveal(control) }
    XCTAssertTrue(control.isHittable, "Control not hittable: \(identifier)")
    control.tap()
  }

  /// Scroll the native preferences until `control` sits clear of the pinned buttons.
  private func reveal(_ control: XCUIElement) {
    for _ in 0..<18 {
      let save = app.buttons["c15t.prefs.save"]
      let reject = app.buttons["c15t.prefs.reject-all"]
      let bottom = reject.exists ? reject.frame.minY - 12 : save.exists ? save.frame.minY - 12 : app.frame.maxY - 40
      let top: CGFloat = 150
      if control.exists && control.isHittable && control.frame.midY > top && control.frame.midY < bottom { return }
      let start = app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: app.frame.midX, dy: bottom - 20))
      let end = app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: app.frame.midX, dy: top + 30))
      if control.exists && control.frame.midY < top { end.press(forDuration: 0.05, thenDragTo: start) }
      else { start.press(forDuration: 0.05, thenDragTo: end) }
    }
    XCTFail("Not reachable: \(control)")
  }

  /// Wait until a fixture text reads `value`, such as `measurement:granted`.
  private func awaitLabel(_ identifier: String, _ value: String) {
    let label = app.staticTexts[identifier].firstMatch
    let deadline = Date().addingTimeInterval(30)
    while Date() < deadline {
      if label.exists && label.label == value { return }
      RunLoop.current.run(until: Date().addingTimeInterval(0.25))
    }
    XCTFail("\(identifier) never read \(value); last \(label.exists ? label.label : "missing")\n\(app.debugDescription)")
  }

  private func launch() {
    app.terminate()
    // Firebase debug logging is the evidence for Firebase, which cannot be redirected.
    app.launchArguments = ["-FIRDebugEnabled", "-FIRAnalyticsDebugEnabled"]
    app.launch()
  }

  // MARK: Journey

  func testRealVendorsFollowConsent() throws {
    // The runner creates a new Simulator, so the Keychain holds no earlier subject.
    launch()
    // Vendor step 1: a fresh install sends nothing, including the launch probe.
    try assertVendorsSilent("vendor-1-fresh-install", since: 0, probe: try awaitVendorProbe(after: 0, reason: "startup", measurement: false))
    XCTAssertTrue(element("c15t.first-layer.reject-all").waitForExistence(timeout: 60), "No native prompt\n\(app.debugDescription)")
    capture("01-fresh-prompt")

    tap("c15t.first-layer.reject-all")
    awaitLabel("fixture.prompt", "prompt:none")
    capture("02-rejected")
    // Vendor step 2: a refusal keeps every vendor silent.
    let rejectSeq = try governedCapture(since: 0).last
    try assertVendorsSilent("vendor-2-reject-all", since: rejectSeq, probe: try sendVendorProbe(measurement: false))

    tap("fixture.open-preferences")
    tap("c15t.prefs.category.measurement.switch")
    XCTAssertEqual(element("c15t.prefs.category.measurement.switch").value as? String, "1")
    capture("03-measurement-switched-on")
    tap("c15t.prefs.save")
    awaitLabel("fixture.measurement", "measurement:granted")
    capture("04-measurement-granted")
    // Vendor step 3: measurement is the category every helper defaults to.
    let grantSeq = try governedCapture(since: 0).last
    try assertVendorsCapture("vendor-3-grant-measurement", since: grantSeq, probe: try sendVendorProbe(measurement: true))

    tap("fixture.open-preferences")
    XCTAssertTrue(element("c15t.prefs.reject-all").waitForExistence(timeout: 30))
    capture("05-preferences-before-withdrawal")
    tap("c15t.prefs.reject-all")
    awaitLabel("fixture.measurement", "measurement:denied")
    capture("06-withdrawn")
    // Vendor step 4: after in-flight uploads settle, a withdrawal stops every vendor.
    let settled = try vendorTrafficSettles(after: try governedCapture(since: 0).last)
    try assertVendorsSilent("vendor-4-withdraw", since: settled.last, probe: try sendVendorProbe(measurement: false), extra: ["inFlightAfterWithdrawal": settled.inFlight])

    let probesBeforeRelaunch = try vendorProbes().count
    launch()
    // Vendor step 5: the saved refusal holds across a relaunch.
    try assertVendorsSilent("vendor-5-relaunch-refused", since: settled.last, probe: try awaitVendorProbe(after: probesBeforeRelaunch, reason: "startup", measurement: false))
    awaitLabel("fixture.prompt", "prompt:none")
    awaitLabel("fixture.measurement", "measurement:denied")
    capture("07-relaunched-refused")
  }

  override func tearDownWithError() throws {
    capture("final-or-failure")
  }
}
