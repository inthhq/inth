import XCTest

final class PackedConsentJourney: XCTestCase {
  private let app = XCUIApplication(bundleIdentifier: "com.inth.expodev")
  override func setUpWithError() throws { continueAfterFailure = false }
  private func capture(_ name: String) {
    let image = XCTAttachment(screenshot: app.screenshot()); image.name = name; image.lifetime = .keepAlways; add(image)
    let tree = XCTAttachment(string: app.debugDescription); tree.name = name + "-hierarchy"; tree.lifetime = .keepAlways; add(tree)
  }
  private func value(_ id: String, matches: ([String: Any]) -> Bool) throws -> [String: Any] {
    let deadline = Date().addingTimeInterval(45)
    var last = ""
    repeat {
      let element = app.staticTexts[id].firstMatch
      if element.exists {
        last = element.label
        if let data = last.data(using: .utf8), let body = try? JSONSerialization.jsonObject(with: data) as? [String: Any], matches(body) { return body }
      }
      RunLoop.current.run(until: Date().addingTimeInterval(0.2))
    } while Date() < deadline
    XCTFail("No matching \(id): \(last)\n\(app.debugDescription)")
    return [:]
  }
  private func launch() {
    app.terminate()
    app.launchEnvironment = ["DYLD_INSERT_LIBRARIES": ProcessInfo.processInfo.environment["INTH_PACKED_FAULT"]!, "INTH_PACKED_NATIVE_PROOF": ProcessInfo.processInfo.environment["INTH_PACKED_NATIVE_PROOF"] ?? "0"]
    app.launch()
  }
  func testColdOfflinePackedRelease() throws {
    launch()
    let reject = app.buttons["inth.first-layer.reject-all"]
    XCTAssertTrue(reject.waitForExistence(timeout: 45))
    capture("01-cold-offline-native-prompt")
    reject.tap()
    func denied(_ state: [String: Any]) -> Bool {
      guard let permissions = state["permissions"] as? [String: Bool], let choice = state["explicitChoice"] as? [String: Bool] else { return false }
      return state["policyPending"] as? Bool == false && state["prompt"] as? String == "none"
        && permissions["necessary"] == true
        && ["functionality", "experience", "measurement", "marketing"].allSatisfy { permissions[$0] == false && choice[$0] == false }
    }
    let rejected = try value("fixture.native-state", matches: denied)
    let outcome = try value("fixture.native-outcome") { $0["kind"] as? String == "committed" }
    XCTAssertEqual(Set(outcome.keys), Set(["sessionId", "kind", "revision"]))
    capture("02-compact-native-outcome")
    launch()
    let restored = try value("fixture.native-state", matches: denied)
    XCTAssertEqual(try JSONSerialization.data(withJSONObject: rejected, options: .sortedKeys), try JSONSerialization.data(withJSONObject: restored, options: .sortedKeys))
    capture("03-offline-process-restart")
    app.buttons["Privacy settings"].tap()
    let measurement = app.switches["inth.prefs.category.measurement.switch"]
    XCTAssertTrue(measurement.waitForExistence(timeout: 15))
    XCTAssertEqual(measurement.value as? String, "0")
    app.swipeUp()
    XCTAssertTrue(measurement.isHittable)
    capture("04-restored-native-preferences")
    let proof = XCTAttachment(data: try JSONSerialization.data(withJSONObject: ["stateAfterReject": rejected, "restored": restored, "outcome": outcome], options: [.sortedKeys, .prettyPrinted]), uniformTypeIdentifier: "public.json")
    proof.name = "packed-runtime-proof"; proof.lifetime = .keepAlways; add(proof)
  }
  override func tearDownWithError() throws { capture("final-or-failure"); app.terminate() }
}
