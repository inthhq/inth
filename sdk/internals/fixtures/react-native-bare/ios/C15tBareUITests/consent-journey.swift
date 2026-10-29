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
    let deadline = Date().addingTimeInterval(45)
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
    control.tap()
  }

  private func launch(reset: Bool = false) {
    app.terminate()
    app.launchEnvironment = reset ? ["C15T_DEMO_LINK": "c15t-demo://reset"] : [:]
    app.launch()
  }

  private func fresh() throws {
    try awaitState("prompt-owed") { snapshot, _ in
      let prompt = snapshot["promptRequirement"] as? [String: Any]
      let permissions = snapshot["effectivePermissions"] as? [String: Bool]
      return snapshot["explicitChoice"] is NSNull && prompt?["kind"] as? String == "choice"
        && self.categories.allSatisfy { permissions?[$0] == false }
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
            writes.last?["consentAction"] as? String == "custom",
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

  func testConsentJourney() throws {
    launch()
    try fresh()
    capture("01-fresh-prompt")
    tap("c15t.first-layer.reject-all")
    try choice([], saves: 1)
    capture("02-rejected")

    launch(reset: true)
    try fresh()
    tap("c15t.first-layer.accept-all")
    try choice(Set(categories), saves: 2)
    capture("03-accepted")

    launch(reset: true)
    try fresh()
    tap("c15t.first-layer.customize")
    tap("c15t.prefs.category.measurement.switch")
    capture("04-customize-measurement")
    tap("c15t.prefs.save")
    let saved = try choice(["measurement"], saves: 3)
    capture("05-saved")

    tap("fixture.open-preferences")
    let measurement = app.descendants(matching: .any)["c15t.prefs.category.measurement.switch"].firstMatch
    XCTAssertTrue(measurement.waitForExistence(timeout: 15))
    XCTAssertEqual(measurement.value as? String, "1")
    tap("c15t.prefs.category.measurement.switch")
    XCTAssertEqual(measurement.value as? String, "0")
    capture("06-unsaved-draft")
    tap("c15t.prefs.cancel")
    tap("c15t.prefs.discard.confirm")
    XCTAssertTrue(app.buttons["fixture.open-preferences"].waitForExistence(timeout: 10))
    let cancelled = try choice(["measurement"], saves: 3)
    let savedChoice = (saved["snapshot"] as? [String: Any])?["explicitChoice"]
    let cancelledChoice = (cancelled["snapshot"] as? [String: Any])?["explicitChoice"]
    XCTAssertEqual(try JSONSerialization.data(withJSONObject: XCTUnwrap(savedChoice), options: .sortedKeys), try JSONSerialization.data(withJSONObject: XCTUnwrap(cancelledChoice), options: .sortedKeys))

    tap("fixture.open-preferences")
    XCTAssertEqual(measurement.value as? String, "1")
    XCTAssertEqual(app.descendants(matching: .any)["c15t.prefs.category.marketing.switch"].firstMatch.value as? String, "0")

    launch()
    try awaitState("new-process") { _, report in report["session"] as? String != saved["session"] as? String }
    let relaunched = try choice(["measurement"], saves: 3)
    let restoredChoice = (relaunched["snapshot"] as? [String: Any])?["explicitChoice"]
    XCTAssertEqual(try JSONSerialization.data(withJSONObject: XCTUnwrap(savedChoice), options: .sortedKeys), try JSONSerialization.data(withJSONObject: XCTUnwrap(restoredChoice), options: .sortedKeys))
    tap("fixture.open-preferences")
    XCTAssertEqual(measurement.value as? String, "1")
    capture("07-relaunched-preferences")
    tap("c15t.prefs.cancel")
    try nativeIabWhileJSIsBlocked()
  }

  private func reveal(_ control: XCUIElement) {
    for _ in 0..<14 {
      if control.exists && control.isHittable { return }
      app.scrollViews.firstMatch.swipeUp()
    }
    XCTAssertTrue(control.isHittable, "Not reachable: \(control)")
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
    for id in [1, 3, 4] {
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
    let provider = app.switches["c15t.ac.provider.10.switch"]; reveal(provider); provider.tap()
    capture("11-native-additional-consent")
    tap("c15t.ac.back")
    // Category gates use the same commit as IAB/AC choices.
    let measurement = app.switches["c15t.prefs.category.measurement.switch"]
    for _ in 0..<12 { if measurement.exists && measurement.isHittable { break }; app.scrollViews.firstMatch.swipeDown() }
    XCTAssertTrue(measurement.isHittable); measurement.tap()
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
    capture("12-native-committed-before-js")
    let resumed = try awaitState("one-outcome-after-js-resumes") { snapshot, report in
      guard let block = report["jsBlock"] as? [String: Any], block["blocked"] as? Bool == false,
            let outcomes = block["outcomes"] as? [[String: Any]], let before = block["outcomesBefore"] as? Int else { return false }
      return outcomes.count == before + 1 && outcomes.last?["kind"] as? String == "committed"
        && (snapshot["effectivePermissions"] as? [String: Bool])?["measurement"] == true
    }
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
}
