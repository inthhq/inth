import XCTest

final class SwiftUIJourneyTests: XCTestCase {
    private var app: XCUIApplication!
    override func setUp() { continueAfterFailure = false }

    func testStockChoicePersistsAndWithdrawalStopsWork() {
        launch(reset: true)
        let accept = app.buttons["c15t.first-layer.accept-all"]
        XCTAssertTrue(accept.waitForExistence(timeout: 10))
        capture("swiftui-stock-first-layer")
        accept.tap()
        assertLabel("sample.measurement", "Measurement: Granted")
        record()
        assertLabel("sample.events", "Recorded events: 1")
        assertLabel("sample.queue", "Queued records: 1")
        app.terminate()
        launch(unavailable: true)
        assertLabel("sample.choice", "Choice recorded on this device")
        assertLabel("sample.measurement", "Measurement: Granted")
        XCTAssertFalse(app.buttons["c15t.first-layer.accept-all"].exists)
        app.buttons["sample.preferences"].tap()
        let toggle = app.switches["c15t.prefs.category.measurement.switch"]
        XCTAssertTrue(toggle.waitForExistence(timeout: 5))
        XCTAssertEqual(toggle.value as? String, "1")
        capture("swiftui-stock-preferences")
        toggle.tap()
        app.buttons["c15t.prefs.save"].tap()
        assertLabel("sample.measurement", "Measurement: Denied")
        reveal(app.buttons["sample.record"])
        XCTAssertFalse(app.buttons["sample.record"].isEnabled)
    }

    func testHeadlessDraftCancelSaveAndRelaunch() {
        launch(reset: true, headless: true)
        assertLabel("sample.readiness", "Consent ready")
        XCTAssertFalse(app.buttons["c15t.first-layer.accept-all"].exists)
        app.buttons["sample.preferences"].tap()
        let toggle = app.switches["sample.custom.measurement"]
        XCTAssertTrue(toggle.waitForExistence(timeout: 5))
        turnOn(toggle)
        app.buttons["Cancel"].tap()
        assertLabel("sample.choice", "No choice recorded")
        assertLabel("sample.measurement", "Measurement: Denied")
        app.buttons["sample.preferences"].tap()
        XCTAssertTrue(toggle.waitForExistence(timeout: 5))
        XCTAssertEqual(toggle.value as? String, "0")
        turnOn(toggle)
        capture("swiftui-headless-preferences")
        app.buttons["sample.custom.save"].tap()
        assertLabel("sample.measurement", "Measurement: Granted")
        app.terminate()
        launch(headless: true, unavailable: true)
        assertLabel("sample.choice", "Choice recorded on this device")
        assertLabel("sample.measurement", "Measurement: Granted")
    }

    func testFreshUnavailablePolicyStaysPending() {
        launch(reset: true, unavailable: true)
        assertLabel("sample.readiness", "Waiting for consent policy")
        assertLabel("sample.measurement", "Measurement: Pending")
        XCTAssertFalse(app.staticTexts["sample.installation-error"].exists, app.debugDescription)
        XCTAssertTrue(app.buttons["sample.retry-policy"].isEnabled)
        XCTAssertFalse(app.buttons["sample.preferences"].isEnabled)
        reveal(app.buttons["sample.record"])
        XCTAssertFalse(app.buttons["sample.record"].isEnabled)
        capture("swiftui-policy-unavailable")
    }

    private func launch(reset: Bool = false, headless: Bool = false, unavailable: Bool = false) {
        app = XCUIApplication()
        app.launchArguments = ["--ui-testing"]
        if reset { app.launchArguments.append("--reset-demo") }
        if headless { app.launchArguments.append("--headless") }
        if unavailable { app.launchArguments.append("--demo-unavailable") }
        app.launch()
    }

    private func assertLabel(_ id: String, _ label: String) {
        let element = app.staticTexts[id]
        reveal(element)
        expectation(for: NSPredicate(format: "label == %@", label), evaluatedWith: element)
        waitForExpectations(timeout: 5)
    }

    private func reveal(_ element: XCUIElement) {
        for _ in 0..<5 {
            if element.exists && element.isHittable { return }
            app.swipeUp()
        }
    }

    private func record() {
        let button = app.buttons["sample.record"]
        reveal(button)
        XCTAssertTrue(button.isEnabled)
        button.tap()
    }

    private func turnOn(_ toggle: XCUIElement) {
        // Form exposes the whole labeled row. Its empty center is outside the switch control.
        toggle.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.5)).tap()
        expectation(for: NSPredicate(format: "value == %@", "1"), evaluatedWith: toggle)
        waitForExpectations(timeout: 5)
    }

    private func capture(_ name: String) {
        let screenshot = app.screenshot()
        let attachment = XCTAttachment(screenshot: screenshot)
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
        if let directory = ProcessInfo.processInfo.environment["C15T_SWIFTUI_CAPTURE_DIR"] {
            try? screenshot.pngRepresentation.write(to: URL(fileURLWithPath: directory).appendingPathComponent(name + ".png"))
        }
    }
}
