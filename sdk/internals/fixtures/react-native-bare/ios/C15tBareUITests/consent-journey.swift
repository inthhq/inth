import XCTest

final class ConsentJourney: XCTestCase {
  private let app = XCUIApplication(bundleIdentifier: "org.reactjs.native.example.C15tBare")
  private let categories = ["functionality", "measurement", "marketing"]

  override func setUpWithError() throws {
    continueAfterFailure = false
  }

  private func report() throws -> [String: Any] {
    let done = expectation(description: "Native snapshot observer")
    var response: Data?
    URLSession.shared.dataTask(with: URL(string: (ProcessInfo.processInfo.environment["C15T_E2E_URL"] ?? "http://localhost:3000") + "/e2e/state")!) { data, _, _ in
      response = data
      done.fulfill()
    }.resume()
    wait(for: [done], timeout: 5)
    return try XCTUnwrap(JSONSerialization.jsonObject(with: XCTUnwrap(response)) as? [String: Any])
  }

  @discardableResult
  private func awaitState(_ description: String, matching: ([String: Any], [String: Any]) -> Bool) throws -> [String: Any] {
    let deadline = Date().addingTimeInterval(100)
    var last: [String: Any] = [:]
    repeat {
      last = try report()
      if last["core"] as? String == "native",
         let snapshot = last["snapshot"] as? [String: Any],
         snapshot["ready"] as? Bool == true,
         snapshot["policyPending"] as? Bool == false,
         matching(snapshot, last) {
        let evidence = XCTAttachment(data: try JSONSerialization.data(withJSONObject: last, options: [.prettyPrinted, .sortedKeys]), uniformTypeIdentifier: "public.json")
        evidence.name = description
        evidence.lifetime = .keepAlways
        add(evidence)
        return last
      }
      RunLoop.current.run(until: Date().addingTimeInterval(0.25))
    } while Date() < deadline
    XCTFail("Timed out waiting for \(description). Native report: \(last)")
    return last
  }

  // MARK: Real vendor SDKs

  /// Vendors whose traffic the capture server records. Firebase is checked from its log.
  private let trafficVendors = ["posthog", "mixpanel", "amplitude", "sentry"]

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
    try report()["vendorProbes"] as? [[String: Any]] ?? []
  }

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

  /// Wait for the probe the app reports after `count` earlier ones. Each SDK must accept the calls.
  private func awaitVendorProbe(after count: Int, reason: String) throws -> [String: Any] {
    let deadline = Date().addingTimeInterval(60)
    repeat {
      if let probe = try vendorProbes().dropFirst(count).first(where: { $0["reason"] as? String == reason }) {
        XCTAssertEqual(probe["started"] as? Bool, true, "Vendor SDKs did not start: \(probe)")
        XCTAssertEqual((probe["errors"] as? [String: Any])?.isEmpty, true, "Vendor SDK errors: \(probe)")
        return probe
      }
      RunLoop.current.run(until: Date().addingTimeInterval(0.25))
    } while Date() < deadline
    XCTFail("No \(reason) vendor probe after \(count)")
    return [:]
  }

  private func sendVendorProbe() throws -> [String: Any] {
    let count = try vendorProbes().count
    tap("fixture.vendor-probe")
    return try awaitVendorProbe(after: count, reason: "button")
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
  /// has been quiet for longer than that interval.
  /// Longer than Sentry's 5-second replay upload interval.
  private static let vendorQuietSeconds: TimeInterval = 6

  private func vendorTrafficSettles(after since: Int) throws -> (last: Int, inFlight: [[String: Any]]) {
    let deadline = Date().addingTimeInterval(30)
    var observed = try governedCapture(since: since)
    var quietSince = Date()
    var seen = observed.rows.count
    while Date().timeIntervalSince(quietSince) < Self.vendorQuietSeconds && Date() < deadline {
      RunLoop.current.run(until: Date().addingTimeInterval(0.5))
      observed = try governedCapture(since: since)
      if observed.rows.count != seen { seen = observed.rows.count; quietSince = Date() }
    }
    XCTAssertGreaterThanOrEqual(Date().timeIntervalSince(quietSince), Self.vendorQuietSeconds, "Vendor traffic did not stop after withdrawal: \(observed.rows)")
    return (observed.last, observed.rows)
  }

  private func capture(_ name: String) {
    let screenshot = XCTAttachment(screenshot: app.screenshot())
    screenshot.name = name
    screenshot.lifetime = .keepAlways
    add(screenshot)
  }

  private func tap(_ identifier: String) {
    let control = app.descendants(matching: .any)[identifier].firstMatch
    XCTAssertTrue(control.waitForExistence(timeout: 15), "Missing control \(identifier)\n\(app.debugDescription)")
    XCTAssertTrue(control.isHittable, "Control not hittable: \(identifier)")
    if control.elementType == .switch { reveal(control) }
    control.tap()
  }

  private func launch(reset: Bool = false) {
    app.terminate()
    app.launchEnvironment = reset ? ["C15T_DEMO_LINK": "c15t-demo://reset"] : [:]
    // Firebase debug logging is the evidence for Firebase, which cannot be redirected.
    app.launchArguments = ["-FIRDebugEnabled", "-FIRAnalyticsDebugEnabled"]
    app.launch()
  }

  private func fresh() throws {
    try awaitState("prompt-owed") { snapshot, _ in
      let prompt = snapshot["promptRequirement"] as? [String: Any]
      let permissions = snapshot["effectivePermissions"] as? [String: Bool]
      return snapshot["explicitChoice"] is NSNull && prompt?["kind"] as? String == "choice"
        && (self.categories + ["experience"]).allSatisfy { permissions?[$0] == false }
    }
  }

  @discardableResult
  private func choice(_ granted: Set<String>, saves: Int) throws -> [String: Any] {
    try awaitState("choice-\(saves)") { snapshot, report in
      guard let permissions = snapshot["effectivePermissions"] as? [String: Bool],
            let choice = snapshot["explicitChoice"] as? [String: Any],
            let receipts = choice["categories"] as? [String: [String: Any]],
            let writes = report["saves"] as? [[String: Any]],
            writes.count == saves,
            writes.last?["consentAction"] as? String == (granted.isEmpty ? "necessary" : granted == Set(self.categories) ? "all" : "custom"),
            let delivered = writes.last,
            let preferences = delivered["preferences"] as? [String: Bool],
            let deliveredChoice = delivered["choice"] as? [String: Any],
            let deliveredReceipts = deliveredChoice["categories"] as? [String: [String: Any]],
            NSDictionary(dictionary: receipts).isEqual(NSDictionary(dictionary: deliveredReceipts)),
            delivered["subjectId"] as? String == (snapshot["subject"] as? [String: Any])?["subjectId"] as? String,
            permissions["necessary"] == true else { return false }
      return self.categories.allSatisfy { category in
        permissions[category] == granted.contains(category)
          && preferences[category] == granted.contains(category)
          && receipts[category]?["value"] as? Bool == granted.contains(category)
          && receipts[category]?["confirmedAt"] as? Double != nil
      }
    }
  }

  private func choiceBytes(_ report: [String: Any]) throws -> Data {
    try JSONSerialization.data(withJSONObject: XCTUnwrap((report["snapshot"] as? [String: Any])?["explicitChoice"]), options: [.sortedKeys, .fragmentsAllowed])
  }

  private func network(_ online: Bool) throws {
    let done = expectation(description: "Fixture backend availability")
    var request = URLRequest(url: URL(string: (ProcessInfo.processInfo.environment["C15T_E2E_URL"] ?? "http://localhost:3000") + "/e2e/network")!)
    request.httpMethod = "POST"
    request.httpBody = try JSONSerialization.data(withJSONObject: ["online": online])
    URLSession.shared.dataTask(with: request) { _, _, _ in done.fulfill() }.resume()
    wait(for: [done], timeout: 5)
  }

  private func localChoice(_ granted: Set<String>, saves: Int) throws -> [String: Any] {
    try awaitState("offline-choice-\(saves)") { snapshot, report in
      guard let choice = snapshot["explicitChoice"] as? [String: Any],
        let receipts = choice["categories"] as? [String: [String: Any]],
        let permissions = snapshot["effectivePermissions"] as? [String: Bool],
        let writes = report["saves"] as? [[String: Any]], writes.count == saves,
        report["backendOnline"] as? Bool == false else { return false }
      return self.categories.allSatisfy { receipts[$0]?["value"] as? Bool == granted.contains($0) && permissions[$0] == granted.contains($0) }
    }
  }

  private func setControl(_ body: [String: Any]) throws {
    let done = expectation(description: "Fixture clock and declaration")
    var request = URLRequest(url: URL(string: ProcessInfo.processInfo.environment["C15T_E2E_URL"]! + "/e2e/control")!)
    request.httpMethod = "POST"
    request.httpBody = try JSONSerialization.data(withJSONObject: body)
    URLSession.shared.dataTask(with: request) { _, response, _ in
      XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200)
      done.fulfill()
    }.resume()
    wait(for: [done], timeout: 5)
  }

  private func expiryState(_ name: String, _ matches: ([String: Any], [String: Any]) -> Bool) throws -> [String: Any] {
    let deadline = Date().addingTimeInterval(30)
    var last: [String: Any] = [:]
    repeat {
      last = try report()
      if let native = last["native"] as? [String: Any], let snapshot = native["snapshot"] as? [String: Any], matches(snapshot, last) {
        let evidence = XCTAttachment(data: try JSONSerialization.data(withJSONObject: last, options: [.sortedKeys, .prettyPrinted]), uniformTypeIdentifier: "public.json")
        evidence.name = name; evidence.lifetime = .keepAlways; add(evidence)
        return last
      }
      RunLoop.current.run(until: Date().addingTimeInterval(0.2))
    } while Date() < deadline
    XCTFail("Missing expiry state \(name): \(last)")
    return last
  }

  private func expiryJourney() throws {
    let optional = ["functionality", "experience", "measurement", "marketing"]
    func receipts(_ snapshot: [String: Any]) -> [String: [String: Any]] { (snapshot["explicitChoice"] as? [String: Any])?["categories"] as? [String: [String: Any]] ?? [:] }
    func denied(_ snapshot: [String: Any], _ report: [String: Any]) -> Bool {
      let values = receipts(snapshot)
      let gates = (report["native"] as? [String: Any])?["gates"] as? [String: Bool] ?? [:]
      return optional.allSatisfy { values[$0]?["value"] as? Bool == false && gates[$0] == false }
    }
    try network(false); launch()
    try fresh()
    capture("20-expiry-initial-prompt")
    tap("c15t.first-layer.accept-all")
    let all = try expiryState("expiry-earlier-all") { snapshot, _ in optional.allSatisfy { receipts(snapshot)[$0]?["value"] as? Bool == true } }
    let prior = (all["native"] as? [String: Any])?["process"] as? Int
    capture("21-expiry-earlier-all")
    try setControl(["categories": ["necessary", "measurement"]]); launch()
    try expiryState("expiry-narrowed-offline-relaunch") { snapshot, report in
      snapshot["consentCategories"] as? [String] == ["necessary", "measurement"] && snapshot["policyPending"] as? Bool == false && (report["native"] as? [String: Any])?["process"] as? Int != prior
        && optional.allSatisfy { receipts(snapshot)[$0]?["value"] as? Bool == true }
    }
    tap("fixture.open-preferences")
    XCTAssertTrue(app.switches["c15t.prefs.category.measurement.switch"].waitForExistence(timeout: 10))
    XCTAssertFalse(app.switches["c15t.prefs.category.marketing.switch"].exists)
    capture("22-expiry-narrowed-preferences")
    tap("c15t.prefs.cancel")
    try setControl(["now": 1793232001000])
    try expiryState("expiry-exact-boundary") { snapshot, report in
      snapshot["policyPending"] as? Bool == true && (report["native"] as? [String: Any])?["clock"] as? Int64 == 1793232001000
        && snapshot["evaluatedAt"] as? Int64 == 1793232001000
        && (snapshot["nextDeadline"] as? Int64 ?? Int64.max) > 1793232001000
    }
    tap("fixture.open-preferences")
    XCTAssertTrue(app.buttons["c15t.status.unavailable.retry"].waitForExistence(timeout: 10))
    XCTAssertFalse(app.switches["c15t.prefs.category.measurement.switch"].exists)
    XCTAssertTrue(app.buttons["c15t.prefs.reject-all"].waitForExistence(timeout: 10))
    XCTAssertTrue(app.buttons["c15t.prefs.reject-all"].isEnabled)
    XCTAssertFalse(app.buttons["c15t.prefs.accept-all"].exists)
    XCTAssertFalse(app.buttons["c15t.prefs.save"].exists)
    capture("23-expiry-reject-only")
    tap("c15t.prefs.reject-all")
    let denial = try expiryState("expiry-durable-full-denial", denied)
    let deniedChoice = try XCTUnwrap(((denial["native"] as? [String: Any])?["snapshot"] as? [String: Any])?["explicitChoice"])
    let bytes = try JSONSerialization.data(withJSONObject: deniedChoice, options: .sortedKeys)
    XCTAssertEqual((denial["saves"] as? [Any])?.count, 0)
    capture("24-expiry-denied")
    launch()
    let restored = try expiryState("expiry-denial-after-process-death") { snapshot, report in
      denied(snapshot, report) && (report["native"] as? [String: Any])?["process"] as? Int != (denial["native"] as? [String: Any])?["process"] as? Int
    }
    XCTAssertEqual(bytes, try JSONSerialization.data(withJSONObject: XCTUnwrap(((restored["native"] as? [String: Any])?["snapshot"] as? [String: Any])?["explicitChoice"]), options: .sortedKeys))
    capture("25-expiry-denial-restored")
    try network(true); launch()
    let replayed = try expiryState("expiry-replayed-same-fingerprint", { snapshot, report in denied(snapshot, report) && snapshot["policyPending"] as? Bool == false && (report["saves"] as? [Any])?.count == 1 })
    let delivered = try XCTUnwrap((replayed["saves"] as? [[String: Any]])?.first)
    XCTAssertEqual(bytes, try JSONSerialization.data(withJSONObject: XCTUnwrap(delivered["choice"]), options: .sortedKeys))
    XCTAssertEqual(delivered["consentAction"] as? String, "necessary")
    capture("26-expiry-replayed")
    // Widen again to prove removed grants were erased, rather than merely hidden.
    try setControl(["categories": ["necessary"] + optional]); launch()
    try expiryState("expiry-wide-refresh-no-resurrection") { snapshot, report in
      denied(snapshot, report) && (snapshot["consentCategories"] as? [String])?.count == 5 && snapshot["policyPending"] as? Bool == false && (report["saves"] as? [Any])?.count == 1
    }
    tap("fixture.open-preferences")
    XCTAssertEqual(app.switches["c15t.prefs.category.measurement.switch"].value as? String, "0")
    capture("27-expiry-wide-denial")
  }

  func testConsentJourney() throws {
    if ProcessInfo.processInfo.environment["C15T_APP_E2E_SCENARIO"] == "expiry" { try expiryJourney(); return }
    try network(false)
    launch()
    try fresh()
    // Vendor step 1: a fresh install sends nothing, including the launch probe.
    try assertVendorsSilent("vendor-1-fresh-install", since: 0, probe: try awaitVendorProbe(after: 0, reason: "startup"))
    let initial = try awaitState("first-install-unknown") { snapshot, report in
      snapshot["policySnapshotToken"] as? String == nil
        && (snapshot["location"] as? [String: Any])?["countryCode"] as? String == nil
        && report["backendOnline"] as? Bool == false
        && (report["saves"] as? [Any])?.isEmpty == true
    }
    XCTAssertNotNil(initial["snapshot"])
    capture("01-fresh-prompt")
    tap("c15t.first-layer.reject-all")
    let rejected = try localChoice([], saves: 0)
    // Vendor step 2: a refusal keeps every vendor silent.
    let rejectSeq = try governedCapture(since: 0).last
    try assertVendorsSilent("vendor-2-reject-all", since: rejectSeq, probe: try sendVendorProbe())
    try network(true); launch()
    let deliveredReject = try choice([], saves: 1)
    XCTAssertEqual(try choiceBytes(rejected), try choiceBytes(deliveredReject))
    try network(false)
    capture("02-rejected")

    launch(reset: true)
    try fresh()
    tap("c15t.first-layer.accept-all")
    let accepted = try localChoice(Set(categories), saves: 1)
    try network(true); launch()
    let deliveredAccept = try choice(Set(categories), saves: 2)
    XCTAssertEqual(try choiceBytes(accepted), try choiceBytes(deliveredAccept))
    try network(false)
    capture("03-accepted")

    launch(reset: true)
    try fresh()
    tap("c15t.first-layer.customize")
    tap("c15t.prefs.category.measurement.switch")
    XCTAssertEqual(app.switches["c15t.prefs.category.measurement.switch"].value as? String, "1")
    capture("04-customize-measurement")
    tap("c15t.prefs.save")
    let saved = try localChoice(["measurement"], saves: 2)
    capture("05-saved")
    // Vendor step 3: measurement is the category every helper defaults to.
    let grantSeq = try governedCapture(since: 0).last
    try assertVendorsCapture("vendor-3-grant-measurement", since: grantSeq, probe: try sendVendorProbe())

    tap("fixture.repeat-preferences")
    let measurement = app.descendants(matching: .any)["c15t.prefs.category.measurement.switch"].firstMatch
    XCTAssertTrue(measurement.waitForExistence(timeout: 15))
    XCTAssertEqual(measurement.value as? String, "1")
    tap("c15t.prefs.category.measurement.switch")
    XCTAssertEqual(measurement.value as? String, "0")
    XCUIDevice.shared.press(.home)
    app.activate()
    XCTAssertTrue(measurement.waitForExistence(timeout: 15))
    XCTAssertEqual(measurement.value as? String, "0")
    capture("06-unsaved-draft")
    tap("c15t.prefs.cancel")
    tap("c15t.prefs.discard.confirm")
    XCTAssertTrue(app.buttons["fixture.open-preferences"].waitForExistence(timeout: 10))
    let sessionReport = try report()
    let probe = try XCTUnwrap((sessionReport["jsBlock"] as? [String: Any])?["sessionProbe"] as? [String: [String: Any]])
    XCTAssertEqual(probe["first"]?["sessionId"] as? String, probe["repeated"]?["sessionId"] as? String)
    XCTAssertEqual(probe["repeated"]?["status"] as? String, "already-presented")
    let cancelled = try localChoice(["measurement"], saves: 2)
    let savedChoice = (saved["snapshot"] as? [String: Any])?["explicitChoice"]
    let cancelledChoice = (cancelled["snapshot"] as? [String: Any])?["explicitChoice"]
    XCTAssertEqual(try JSONSerialization.data(withJSONObject: XCTUnwrap(savedChoice), options: .sortedKeys), try JSONSerialization.data(withJSONObject: XCTUnwrap(cancelledChoice), options: .sortedKeys))

    tap("fixture.open-preferences")
    XCTAssertEqual(measurement.value as? String, "1")
    XCTAssertEqual(app.descendants(matching: .any)["c15t.prefs.category.marketing.switch"].firstMatch.value as? String, "0")

    launch()
    try awaitState("new-process") { _, report in report["session"] as? String != saved["session"] as? String }
    let relaunched = try localChoice(["measurement"], saves: 2)
    let restoredChoice = (relaunched["snapshot"] as? [String: Any])?["explicitChoice"]
    XCTAssertEqual(try JSONSerialization.data(withJSONObject: XCTUnwrap(savedChoice), options: .sortedKeys), try JSONSerialization.data(withJSONObject: XCTUnwrap(restoredChoice), options: .sortedKeys))
    tap("fixture.open-preferences")
    XCTAssertEqual(measurement.value as? String, "1")
    capture("07-relaunched-preferences")
    tap("c15t.prefs.reject-all")
    let withdrawn = try localChoice([], saves: 2)
    capture("08-withdrawn-offline")
    // Vendor step 4: after in-flight uploads settle, a withdrawal stops every vendor.
    let settled = try vendorTrafficSettles(after: try governedCapture(since: 0).last)
    let withdrawSeq = settled.last
    try assertVendorsSilent("vendor-4-withdraw", since: withdrawSeq, probe: try sendVendorProbe(), extra: ["inFlightAfterWithdrawal": settled.inFlight])
    let probesBeforeRelaunch = try vendorProbes().count
    launch()
    let restoredWithdrawal = try localChoice([], saves: 2)
    // Vendor step 5: the saved refusal holds across a relaunch.
    try assertVendorsSilent("vendor-5-relaunch-refused", since: withdrawSeq, probe: try awaitVendorProbe(after: probesBeforeRelaunch, reason: "startup"))
    XCTAssertEqual(try choiceBytes(withdrawn), try choiceBytes(restoredWithdrawal))
    capture("09-withdrawal-relaunched")
    try network(true); launch()
    let replayed = try choice([], saves: 3)
    let writes = try XCTUnwrap(replayed["saves"] as? [[String: Any]])
    XCTAssertEqual(try choiceBytes(withdrawn), try JSONSerialization.data(withJSONObject: XCTUnwrap(writes[2]["choice"]), options: .sortedKeys))
    XCTAssertEqual(try choiceBytes(withdrawn), try choiceBytes(replayed))
    launch()
    try choice([], saves: 3)
    capture("10-reconnected")
    try nativeIabWhileJSIsBlocked()
    try nativeNoticePassesHostTouches()
  }

  private func reveal(_ control: XCUIElement) {
    for _ in 0..<18 {
      let save = app.buttons["c15t.iab.save"].exists ? app.buttons["c15t.iab.save"] : app.buttons["c15t.prefs.save"]
      let reject = app.buttons["c15t.iab.reject-all"].exists ? app.buttons["c15t.iab.reject-all"] : app.buttons["c15t.prefs.reject-all"]
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

  private func nativeIabWhileJSIsBlocked() throws {
    var request = URLRequest(url: URL(string: (ProcessInfo.processInfo.environment["C15T_E2E_URL"] ?? "http://localhost:3000") + "/e2e/scenario")!)
    request.httpMethod = "POST"; request.httpBody = Data("{}".utf8)
    let prepared = expectation(description: "IAB policy prepared")
    URLSession.shared.dataTask(with: request) { _, _, _ in prepared.fulfill() }.resume()
    wait(for: [prepared], timeout: 5)
    launch(reset: true)
    tap("c15t.first-layer.reject-all")
    try awaitState("iab-rejected") { _, report in (report["saves"] as? [Any])?.count == 4 }
    tap("fixture.block-js")
    let blockedDeadline = Date().addingTimeInterval(10)
    while (try report()["jsBlock"] as? [String: Any])?["blocked"] as? Bool != true && Date() < blockedDeadline { RunLoop.current.run(until: Date().addingTimeInterval(0.1)) }
    XCTAssertEqual((try report()["jsBlock"] as? [String: Any])?["blocked"] as? Bool, true)
    capture("08-native-iab-blocked-js")
    tap("c15t.prefs.category.measurement.switch")
    for id in [1, 3, 4, 7] {
      let control = app.switches["c15t.iab.purpose.\(id).consent"]; reveal(control); control.tap()
    }
    let details = app.buttons["c15t.iab.purpose.7.details"]; reveal(details); details.tap()
    let li = app.switches["c15t.iab.purpose.7.li"]; reveal(li); li.tap(); li.tap()
    let partners = app.buttons["c15t.iab.partners"]; reveal(partners); partners.tap()
    let search = app.textFields["c15t.iab.vendors.search"]; XCTAssertTrue(search.waitForExistence(timeout: 5)); search.tap(); search.typeText("elan")
    capture("09-native-partner-search")
    tap("c15t.iab.vendors.vendor.1")
    tap("c15t.iab.vendor.1.consent")
    tap("c15t.iab.vendor.1.li"); tap("c15t.iab.vendor.1.li")
    capture("10-native-partner-details")
    tap("c15t.iab.vendor.back"); tap("c15t.iab.vendors.back")
    let ac = app.buttons["c15t.iab.other-partners"]; reveal(ac); ac.tap()
    let acSearch = app.textFields["c15t.ac.search"]; XCTAssertTrue(acSearch.waitForExistence(timeout: 5)); acSearch.tap(); acSearch.typeText("Harbour")
    let provider = app.switches["c15t.ac.provider.10.switch"]; reveal(provider)
    XCTAssertEqual(provider.value as? String, "0")
    provider.coordinate(withNormalizedOffset: CGVector(dx: 0.93, dy: 0.5)).tap()
    XCTAssertEqual(provider.value as? String, "1")
    capture("11-native-additional-consent")
    tap("c15t.ac.back")
    tap("c15t.iab.save")
    let deadline = Date().addingTimeInterval(8)
    var observed: [String: Any] = [:]
    repeat {
      observed = try report()
      if (observed["native"] as? [String: Any])?["gates"] as? [String: Bool] != nil,
         ((observed["native"] as? [String: Any])?["gates"] as? [String: Bool])?["measurement"] == true { break }
      RunLoop.current.run(until: Date().addingTimeInterval(0.1))
    } while Date() < deadline
    XCTAssertEqual((observed["jsBlock"] as? [String: Any])?["blocked"] as? Bool, true, "JS resumed before native commit")
    let native = try XCTUnwrap(observed["native"] as? [String: Any])
    XCTAssertEqual((native["gates"] as? [String: Bool])?["measurement"], true)
    let record = try XCTUnwrap(native["iabConsent"] as? [String: Any]); let choices = try XCTUnwrap(record["choices"] as? [String: Any])
    XCTAssertEqual(choices["purposeObjections"] as? [Int], [7]); XCTAssertEqual(choices["vendorObjections"] as? [Int], [1])
    XCTAssertEqual(choices["adTechProviderConsents"] as? [Int], [10])
    let evidence = XCTAttachment(data: try JSONSerialization.data(withJSONObject: observed, options: [.prettyPrinted, .sortedKeys]), uniformTypeIdentifier: "public.json")
    evidence.name = "native-before-js-resumes"; evidence.lifetime = .keepAlways; add(evidence)
    capture("12-native-committed-before-js")
    let resumed = try awaitState("one-outcome-after-js-resumes") { snapshot, report in
      guard let block = report["jsBlock"] as? [String: Any], block["blocked"] as? Bool == false,
            let outcomes = block["outcomes"] as? [[String: Any]], let before = block["outcomesBefore"] as? Int else { return false }
      return outcomes.count == before + 1 && outcomes.last?["kind"] as? String == "committed"
        && (snapshot["effectivePermissions"] as? [String: Bool])?["measurement"] == true
    }
    let resumedBlock = try XCTUnwrap(resumed["jsBlock"] as? [String: Any])
    let sessionID = try XCTUnwrap((resumedBlock["presentation"] as? [String: Any])?["sessionId"] as? String)
    let finalOutcomes = try XCTUnwrap(resumedBlock["outcomes"] as? [[String: Any]])
    XCTAssertEqual(finalOutcomes.last?["sessionId"] as? String, sessionID)
    XCTAssertEqual(finalOutcomes.filter { $0["sessionId"] as? String == sessionID }.count, 1)
    XCTAssertEqual(Set(try XCTUnwrap(finalOutcomes.last).keys), Set(["sessionId", "kind", "revision"]))
    XCTAssertEqual((resumed["saves"] as? [Any])?.count, 5)
    capture("13-js-outcome-resumed")
  }

  override func tearDownWithError() throws {
    capture("final-or-failure")
    let hierarchy = XCTAttachment(string: app.debugDescription)
    hierarchy.name = "final-hierarchy"
    hierarchy.lifetime = .keepAlways
    add(hierarchy)
    app.terminate()
  }

  private func nativeNoticePassesHostTouches() throws {
    let done = expectation(description: "Notice policy")
    var request = URLRequest(url: URL(string: (ProcessInfo.processInfo.environment["C15T_E2E_URL"] ?? "http://localhost:3000") + "/e2e/scenario")!)
    request.httpMethod = "POST"; request.httpBody = Data("{\"kind\":\"notice\"}".utf8)
    URLSession.shared.dataTask(with: request) { _, _, _ in done.fulfill() }.resume()
    wait(for: [done], timeout: 5)
    launch()
    XCTAssertTrue(app.buttons["c15t.notice.acknowledge"].waitForExistence(timeout: 20))
    let before = try report()
    tap("fixture.host-action")
    XCTAssertTrue(app.staticTexts["fixture.host-count"].waitForExistence(timeout: 5))
    XCTAssertEqual(app.staticTexts["fixture.host-count"].label, "1")
    XCTAssertTrue(app.buttons["c15t.notice.acknowledge"].exists)
    capture("14-nonmodal-native-notice")
    tap("c15t.notice.acknowledge")
    let after = try awaitState("notice-acknowledged") { snapshot, report in
      (snapshot["promptRequirement"] as? [String: Any])?["kind"] as? String == "none"
        && ((report["jsBlock"] as? [String: Any])?["outcomes"] as? [[String: Any]])?.last?["kind"] as? String == "acknowledged"
    }
    XCTAssertEqual(try choiceBytes(before), try choiceBytes(after))
    XCTAssertEqual((after["saves"] as? [Any])?.count, 5)
    capture("15-notice-acknowledged")
  }
}
