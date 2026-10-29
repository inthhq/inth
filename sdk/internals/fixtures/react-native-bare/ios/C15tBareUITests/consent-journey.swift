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
    URLSession.shared.dataTask(with: URL(string: "http://127.0.0.1:3000/e2e/state")!) { data, _, _ in
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
    let scrim = app.buttons["c15t.prefs.cancel"].firstMatch
    scrim.coordinate(withNormalizedOffset: CGVector(dx: 0.03, dy: 0.12)).tap()
    XCTAssertTrue(scrim.waitForNonExistence(timeout: 10))
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
