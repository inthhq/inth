import XCTest

final class ConsentJourneyTests: XCTestCase {
    var app: XCUIApplication!
    override func setUp() { continueAfterFailure = false }
    override func tearDown() { if testRun?.hasSucceeded == false { print(app.debugDescription) } }
    func launch(_ scenario: String = "fresh-online", fail: Bool = false, reset: Bool = true, offline: Bool = false, backend: String? = nil, appearance: String? = nil, theme: String? = nil, branding: String? = nil, identity: String? = nil, arguments: [String] = []) {
        app = XCUIApplication()
        app.launchEnvironment = ["C15T_FIXTURE_SCENARIO": scenario, "C15T_FIXTURE_RESET": reset ? "1" : "0", "C15T_FIXTURE_FAIL_NEXT_WRITE": fail ? "1" : "0", "C15T_FIXTURE_OFFLINE": offline ? "1" : "0"]
        if let backend { app.launchEnvironment["C15T_FIXTURE_BACKEND"] = backend }
        if let appearance { app.launchEnvironment["C15T_FIXTURE_APPEARANCE"] = appearance }
        if let theme { app.launchEnvironment["C15T_FIXTURE_THEME"] = theme }
        if let branding { app.launchEnvironment["C15T_FIXTURE_BRANDING"] = branding }
        if let identity { app.launchEnvironment["C15T_FIXTURE_IDENTITY"] = identity }
        app.launchArguments = arguments
        app.launch()
    }
    func capture(_ name: String) {
        let screenshot = app.screenshot()
        let attachment = XCTAttachment(screenshot: screenshot)
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
        // A copy outside the result bundle, so the evidence does not depend on xcodebuild finalising it.
        if let dir = ProcessInfo.processInfo.environment["C15T_CAPTURE_DIR"] {
            try? FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
            try? screenshot.pngRepresentation.write(to: URL(fileURLWithPath: dir).appendingPathComponent(name + ".png"))
        }
    }
    func button(_ id: String) -> XCUIElement { app.buttons[id] }
    func openStandingPreferences() {
        let gone = NSPredicate { _, _ in
            !self.button("c15t.prefs.save").exists && !self.button("c15t.iab.save").exists && !self.button("c15t.first-layer.accept-all").exists
        }
        expectation(for: gone, evaluatedWith: app)
        waitForExpectations(timeout: 5)
        XCTAssertTrue(button("fixture.open-preferences").isHittable)
        button("fixture.open-preferences").tap()
    }
    static let ax2 = ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityL"]
    static let ax5 = ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"]
    static let xxxl = ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryXXXL"]
    /// The pinned footer, when the page has one. Decisions that sit in the page are not it.
    var footer: XCUIElement { app.otherElements["c15t.footer"] }
    /// Scroll the page until `element` sits between the bar and whatever is pinned below: the
    /// footer, or the keyboard. Once the element is in the hierarchy the drag covers only the
    /// distance to the middle of that window and holds at the end, so the list cannot coast past
    /// it and oscillate; a fixed full-screen flick did exactly that on iOS 27. Only the page is
    /// ever dragged: a control that needs a second scrolling region to reach is a failure.
    /// `backwards` says the element lies earlier in the page than the current position; a row the
    /// list has recycled cannot say which way it is.
    func reveal(_ element: XCUIElement, backwards: Bool = false) {
        // Forty page-height drags: at the largest size on a 4.7-inch screen the IAB list runs to several thousand points.
        for _ in 0..<40 {
            let keyboard = app.keyboards.firstMatch
            let bottom = keyboard.exists ? keyboard.frame.minY - 12 : footer.exists && footer.frame.minY > 150 ? footer.frame.minY - 12 : app.frame.maxY - 40
            let top: CGFloat = 150
            // A row the list has not realised yet can exist with an empty frame; treat it as still ahead.
            let realised = element.exists && element.frame.height > 0
            if realised, element.isHittable, element.frame.midY > top, element.frame.midY < bottom { return }
            let room = bottom - top - 60
            let delta = realised ? element.frame.midY - (top + bottom) / 2 : backwards ? -room : room
            let distance = min(abs(delta), room)
            let x = app.frame.midX
            let from = delta > 0 ? bottom - 20 : top + 30
            let to = delta > 0 ? from - distance : from + distance
            let start = app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: x, dy: from))
            let end = app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: x, dy: to))
            start.press(forDuration: 0.1, thenDragTo: end, withVelocity: .slow, thenHoldForDuration: 0.3)
        }
        XCTFail("Not reachable: \(element)")
    }
    /// Waits for the page's own scroll to bring `element` into reach; no drag is sent.
    func waitHittable(_ element: XCUIElement, timeout: TimeInterval = 5) {
        expectation(for: NSPredicate(format: "isHittable == true"), evaluatedWith: element)
        waitForExpectations(timeout: timeout)
    }
    /// Scrolls the host's own list until a state row is visible.
    func hostState(_ id: String) -> XCUIElement {
        let row = app.staticTexts[id]
        for _ in 0..<6 where !(row.exists && row.isHittable) { app.swipeUp() }
        return row
    }
    func test01EqualDecisionsAndRejectPersistOffline() {
        launch()
        print(app.debugDescription)
        let reject = button("c15t.first-layer.reject-all"), accept = button("c15t.first-layer.accept-all")
        XCTAssertTrue(reject.waitForExistence(timeout: 10)); XCTAssertTrue(accept.isHittable)
        XCTAssertEqual(reject.frame.width, accept.frame.width, accuracy: 1)
        XCTAssertEqual(reject.frame.height, accept.frame.height, accuracy: 1)
        // The stock header is provider-branded and does not adopt the demo app identity.
        XCTAssertEqual(app.staticTexts["c15t.first-layer.brand"].label, "Your brand here")
        capture("ios-first-layer")
        reject.tap()
        XCTAssertTrue(button("fixture.open-preferences").waitForExistence(timeout: 5))
        XCTAssertFalse(accept.exists)
        XCTAssertEqual(app.staticTexts["fixture.state.permission.marketing"].label, "marketing: false")
        app.terminate(); launch(reset: false, offline: true)
        XCTAssertTrue(button("fixture.open-preferences").waitForExistence(timeout: 10))
        XCTAssertFalse(button("c15t.first-layer.accept-all").exists)
        XCTAssertEqual(app.staticTexts["fixture.state.explicit-choice"].label, "recorded")
    }
    func test02CustomDraftRefusalRetryAndStandingSettings() {
        launch(fail: true)
        XCTAssertTrue(button("c15t.first-layer.customize").waitForExistence(timeout: 10)); button("c15t.first-layer.customize").tap()
        let measurement = app.switches["c15t.prefs.category.measurement.switch"]
        reveal(measurement); measurement.tap(); XCTAssertEqual(measurement.value as? String, "1")
        XCTAssertFalse(app.staticTexts["Data use"].exists)
        capture("ios-category-preferences")
        // Rows keep a 44pt target without their own padding, and the footer shares the cards' edges.
        for id in ["experience", "functionality", "marketing", "measurement"] {
            let row = app.switches["c15t.prefs.category.\(id).switch"]
            XCTAssertGreaterThanOrEqual(row.frame.height, 44, id)
            print("row-frame \(id) \(row.frame)")
        }
        print("row-frame necessary \(app.descendants(matching: .any)["c15t.prefs.category.necessary.locked"].firstMatch.frame)")
        print("cell-frames \(app.cells.allElementsBoundByIndex.map(\.frame))")
        // Below accessibility sizes the footer is pinned and never a scroll view of its own.
        XCTAssertTrue(footer.exists); XCTAssertFalse(app.scrollViews["c15t.footer"].exists)
        XCTAssertEqual(app.cells.firstMatch.frame.minX, button("c15t.prefs.save").frame.minX, accuracy: 0.5)
        XCTAssertEqual(app.cells.firstMatch.frame.maxX, button("c15t.prefs.save").frame.maxX, accuracy: 0.5)
        button("c15t.prefs.save").tap()
        XCTAssertTrue(button("c15t.prefs.error.retry").waitForExistence(timeout: 5))
        XCTAssertEqual(measurement.value as? String, "1")
        capture("ios-save-error")
        button("c15t.prefs.error.retry").tap()
        XCTAssertTrue(button("fixture.open-preferences").waitForExistence(timeout: 5))
        XCTAssertEqual(app.staticTexts["fixture.state.permission.measurement"].label, "measurement: true")
        openStandingPreferences()
        reveal(measurement); XCTAssertEqual(measurement.value as? String, "1")
        measurement.tap(); button("c15t.prefs.cancel").tap()
        XCTAssertTrue(button("c15t.prefs.discard.keep").waitForExistence(timeout: 3)); button("c15t.prefs.discard.keep").tap()
        XCTAssertEqual(measurement.value as? String, "0")
        button("c15t.prefs.cancel").tap(); button("c15t.prefs.discard.confirm").tap()
        app.terminate(); launch(reset: false, offline: true)
        XCTAssertTrue(button("fixture.open-preferences").waitForExistence(timeout: 5))
        XCTAssertEqual(app.staticTexts["fixture.state.permission.measurement"].label, "measurement: true")
    }
    func test03IabSearchRestrictionObjectionAndAcCommit() {
        launch("fresh-online-iab")
        XCTAssertTrue(button("c15t.first-layer.customize").waitForExistence(timeout: 10)); capture("ios-iab-first-layer")
        button("c15t.first-layer.customize").tap()
        // One purpose consent on, so a partner consent later shows as Partly on rather than Off.
        let storage = app.switches["c15t.iab.purpose.1.consent"]
        reveal(storage); storage.tap(); XCTAssertEqual(storage.value as? String, "1")
        let purpose = app.switches["c15t.iab.purpose.7.consent"]
        reveal(purpose); capture("ios-iab-centre")
        let details = button("c15t.iab.purpose.7.details"); reveal(details); details.tap()
        // Text actions size their own 44pt target; a frame outside the button would leave 18pt.
        let viewPartners = button("c15t.iab.purpose.7.view-partners"); reveal(viewPartners)
        XCTAssertGreaterThanOrEqual(viewPartners.frame.height, 44)
        XCTAssertGreaterThanOrEqual(details.frame.height, 44)
        let li = app.switches["c15t.iab.purpose.7.li"]
        reveal(li); XCTAssertEqual(li.value as? String, "0")
        li.tap(); li.tap()
        XCTAssertFalse(app.switches["c15t.iab.purpose.1.li"].exists)
        let partners = button("c15t.iab.partners"); reveal(partners); partners.tap()
        let search = app.textFields["c15t.iab.vendors.search"]
        XCTAssertTrue(search.waitForExistence(timeout: 3)); capture("ios-partner-list")
        search.tap(); search.typeText("elan")
        XCTAssertTrue(button("c15t.iab.vendors.vendor.1").exists); capture("ios-partner-search")
        button("c15t.iab.vendors.vendor.1").tap()
        let consent = app.switches["c15t.iab.vendor.1.consent"]
        XCTAssertTrue(consent.waitForExistence(timeout: 3)); consent.tap()
        let vendorLI = app.switches["c15t.iab.vendor.1.li"]; XCTAssertEqual(vendorLI.value as? String, "0"); vendorLI.tap(); vendorLI.tap()
        capture("ios-partner-details")
        button("c15t.iab.vendor.back").tap()
        XCTAssertTrue(app.staticTexts["c15t.iab.vendors.vendor.1.status"].waitForExistence(timeout: 3))
        XCTAssertEqual(app.staticTexts["c15t.iab.vendors.vendor.1.status"].label, "Partly on")
        capture("ios-partner-status")
        button("c15t.iab.vendors.back").tap()
        let features = app.staticTexts["c15t.iab.features-standard-text"]; reveal(features); XCTAssertFalse(features.label.isEmpty)
        let ac = button("c15t.iab.other-partners"); reveal(ac); ac.tap()
        XCTAssertTrue(app.textFields["c15t.ac.search"].waitForExistence(timeout: 3))
        app.switches["c15t.ac.provider.10.switch"].tap(); capture("ios-additional-consent")
        XCTAssertTrue(app.staticTexts["c15t.ac.intro"].label.contains("Store and access information on a device"))
        XCTAssertFalse(app.staticTexts["c15t.ac.intro"].label.contains("Purposes 1"))
        button("c15t.ac.back").tap()
        button("c15t.iab.save").tap()
        XCTAssertTrue(button("fixture.open-preferences").waitForExistence(timeout: 5))
        let summary = app.staticTexts["fixture.state.iab"].label
        XCTAssertTrue(summary.contains("purposeObjections=[7]"), summary)
        XCTAssertTrue(summary.contains("vendorObjections=[1]"), summary)
        // Native AC authoring refuses an ATP grant without purposes 1, 3 and 4.
        XCTAssertTrue(summary.contains("ac=2~~dv.10.20"), summary)
    }
    func test04AcceptAllIncludesNativeIabAndAcThenWithdraw() {
        launch("fresh-online-iab")
        XCTAssertTrue(button("c15t.first-layer.accept-all").waitForExistence(timeout: 10)); button("c15t.first-layer.accept-all").tap()
        XCTAssertTrue(button("fixture.open-preferences").waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["fixture.state.iab"].label.contains("ac=2~10.20~dv."))
        openStandingPreferences(); button("c15t.iab.reject-all").tap()
        XCTAssertTrue(button("fixture.open-preferences").waitForExistence(timeout: 5))
        XCTAssertEqual(app.staticTexts["fixture.state.permission.marketing"].label, "marketing: false")
    }
    func test05UnavailableAndNotice() {
        launch("fresh-offline-none")
        XCTAssertTrue(button("fixture.open-preferences").waitForExistence(timeout: 10)); XCTAssertFalse(button("c15t.first-layer.accept-all").exists)
        openStandingPreferences(); XCTAssertTrue(button("c15t.status.unavailable.retry").waitForExistence(timeout: 3)); capture("ios-policy-unavailable")
        app.terminate(); launch("fresh-online-notice", fail: true)
        XCTAssertTrue(button("c15t.notice.acknowledge").waitForExistence(timeout: 10))
        XCTAssertTrue(button("fixture.open-preferences").isHittable)
        button("c15t.notice.acknowledge").tap(); XCTAssertTrue(button("c15t.notice.error.retry").waitForExistence(timeout: 5))
        XCTAssertEqual(app.descendants(matching: .any)["c15t.notice.error"].label, "Couldn't dismiss this notice. Nothing changed on this device.")
        button("c15t.notice.error.retry").tap(); XCTAssertFalse(button("c15t.notice.acknowledge").waitForExistence(timeout: 2))
        XCTAssertEqual(app.staticTexts["fixture.state.explicit-choice"].label, "none")
    }
    func test06DarkLargeTextEqualDecisions() {
        launch(appearance: "dark", arguments: Self.ax5)
        print(app.debugDescription)
        let reject = button("c15t.first-layer.reject-all"), accept = button("c15t.first-layer.accept-all"), customize = button("c15t.first-layer.customize")
        XCTAssertTrue(reject.waitForExistence(timeout: 10))
        // At accessibility sizes there is no footer: the decisions follow the text in the one scrolling page.
        XCTAssertFalse(footer.exists); XCTAssertFalse(app.scrollViews["c15t.footer"].exists)
        capture("ios-dark-large-text")
        // iOS 26 exposes a SwiftUI Link as a button; earlier runtimes as a link.
        let policy = app.links["c15t.privacy-policy"].exists ? app.links["c15t.privacy-policy"] : app.buttons["c15t.privacy-policy"]
        reveal(policy)
        XCTAssertTrue(policy.isHittable)
        XCTAssertGreaterThanOrEqual(policy.frame.height, 44)
        capture("ios-dark-large-text-policy")
        reveal(reject); XCTAssertTrue(reject.isHittable)
        XCTAssertEqual(reject.frame.width, accept.frame.width, accuracy: 1)
        XCTAssertEqual(reject.frame.height, accept.frame.height, accuracy: 1)
        // Stacked, in that order, and never overlapping.
        XCTAssertLessThanOrEqual(reject.frame.maxY, accept.frame.minY + 0.5)
        capture("ios-dark-large-text-decisions")
        reveal(customize); XCTAssertTrue(customize.isHittable)
        XCTAssertLessThanOrEqual(accept.frame.maxY, customize.frame.minY + 0.5)
        XCTAssertTrue(app.descendants(matching: .any)["c15t.first-layer.branding"].firstMatch.exists)
        reveal(reject); reject.tap()
        XCTAssertTrue(button("fixture.open-preferences").waitForExistence(timeout: 5))
        XCTAssertEqual(hostState("fixture.state.permission.marketing").label, "marketing: false")
    }
    func test07CustomizeThenBackReturnsToTheFirstLayer() {
        launch(appearance: "dark")
        XCTAssertTrue(button("c15t.first-layer.customize").waitForExistence(timeout: 10))
        capture("ios-dark-first-layer")
        button("c15t.first-layer.customize").tap()
        XCTAssertTrue(button("c15t.prefs.save").waitForExistence(timeout: 5))
        XCTAssertFalse(button("c15t.first-layer.accept-all").exists)
        capture("ios-dark-preferences")
        // Back from a first-layer Customize returns to the first layer; it never closes the gate.
        button("c15t.prefs.cancel").tap()
        XCTAssertTrue(button("c15t.first-layer.accept-all").waitForExistence(timeout: 5))
        XCTAssertFalse(button("c15t.prefs.save").exists)
        XCTAssertEqual(app.staticTexts["fixture.state.explicit-choice"].label, "none")
        button("c15t.first-layer.reject-all").tap()
        XCTAssertTrue(button("fixture.open-preferences").waitForExistence(timeout: 5))
        XCTAssertEqual(app.staticTexts["fixture.state.permission.marketing"].label, "marketing: false")
    }
    func test08BrandThemeKeepsEqualDecisions() {
        launch("fresh-online-iab", theme: "brand")
        let reject = button("c15t.first-layer.reject-all"), accept = button("c15t.first-layer.accept-all")
        XCTAssertTrue(reject.waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["c15t.first-layer.brand"].exists)
        XCTAssertEqual(app.staticTexts["c15t.first-layer.title"].label, "Before you shop.")
        XCTAssertEqual(reject.frame.width, accept.frame.width, accuracy: 1)
        XCTAssertEqual(reject.frame.height, accept.frame.height, accuracy: 1)
        capture("ios-brand-first-layer")
        button("c15t.first-layer.customize").tap()
        XCTAssertTrue(button("c15t.iab.save").waitForExistence(timeout: 5))
        capture("ios-brand-preferences")
        let partners = button("c15t.iab.partners"); reveal(partners); partners.tap()
        XCTAssertTrue(button("c15t.iab.vendors.vendor.1").waitForExistence(timeout: 5))
        capture("ios-brand-partners")
        button("c15t.iab.vendors.back").tap()
        button("c15t.prefs.cancel").tap()
        XCTAssertTrue(accept.waitForExistence(timeout: 5))
        accept.tap()
        XCTAssertTrue(button("fixture.open-preferences").waitForExistence(timeout: 5))
        XCTAssertEqual(app.staticTexts["fixture.state.permission.marketing"].label, "marketing: true")
    }

    func test09ProviderBrandingCanSwapWithoutChangingDecisions() {
        for (value, name) in [("c15t", "c15t"), ("inth", "Inth"), ("custom", "Pantry")] {
            launch(branding: value)
            let reject = button("c15t.first-layer.reject-all"), accept = button("c15t.first-layer.accept-all")
            XCTAssertTrue(reject.waitForExistence(timeout: 10))
            let attribution = app.descendants(matching: .any)["c15t.first-layer.branding"].firstMatch
            XCTAssertTrue(attribution.exists)
            XCTAssertEqual(attribution.label, "Secured by \(name)")
            XCTAssertEqual(app.staticTexts["c15t.first-layer.brand"].label, "Your brand here")
            XCTAssertEqual(reject.frame.width, accept.frame.width, accuracy: 1)
            XCTAssertEqual(reject.frame.height, accept.frame.height, accuracy: 1)
            capture("ios-provider-\(value)")
            reject.tap()
            XCTAssertTrue(button("fixture.open-preferences").waitForExistence(timeout: 5))
            XCTAssertEqual(app.staticTexts["fixture.state.permission.marketing"].label, "marketing: false")
        }
        launch(branding: "hidden")
        XCTAssertTrue(button("c15t.first-layer.reject-all").waitForExistence(timeout: 10))
        XCTAssertFalse(app.descendants(matching: .any)["c15t.first-layer.branding"].firstMatch.exists)
    }

    func test10IdentityFallsBackToAnInitialAndCanBeHidden() {
        launch(identity: "generic")
        XCTAssertTrue(button("c15t.first-layer.reject-all").waitForExistence(timeout: 10))
        XCTAssertEqual(app.staticTexts["c15t.first-layer.brand"].label, "Your brand here")
        capture("ios-identity-generic")
        launch(identity: "hidden")
        XCTAssertTrue(button("c15t.first-layer.reject-all").waitForExistence(timeout: 10))
        XCTAssertFalse(app.staticTexts["c15t.first-layer.brand"].exists)
        capture("ios-identity-hidden")
        button("c15t.first-layer.reject-all").tap()
        XCTAssertTrue(button("fixture.open-preferences").waitForExistence(timeout: 5))
    }
    func test11SaveRefusalStaysCalmInDarkAndAtTheLargestText() {
        launch(fail: true, appearance: "dark")
        XCTAssertTrue(button("c15t.first-layer.customize").waitForExistence(timeout: 10)); button("c15t.first-layer.customize").tap()
        button("c15t.prefs.save").tap()
        XCTAssertTrue(button("c15t.prefs.error.retry").waitForExistence(timeout: 5))
        XCTAssertEqual(app.descendants(matching: .any)["c15t.prefs.error"].label, "Couldn't save your choices. Nothing changed on this device.")
        // Try again follows the message in the same run; its 44pt target stops short of the first decision.
        let inline = button("c15t.prefs.error.retry")
        XCTAssertGreaterThanOrEqual(inline.frame.height, 44)
        XCTAssertLessThanOrEqual(inline.frame.maxY, button("c15t.prefs.reject-all").frame.minY + 0.5)
        capture("ios-save-error-dark")
        button("c15t.prefs.error.retry").tap()
        XCTAssertTrue(button("fixture.open-preferences").waitForExistence(timeout: 5))
        XCTAssertEqual(app.staticTexts["fixture.state.explicit-choice"].label, "recorded")
        for (name, size) in [("ax2", Self.ax2), ("ax5", Self.ax5)] {
            app.terminate(); launch(fail: true, appearance: "dark", arguments: size)
            let customize = button("c15t.first-layer.customize")
            XCTAssertTrue(customize.waitForExistence(timeout: 10)); reveal(customize); customize.tap()
            let save = button("c15t.prefs.save")
            XCTAssertTrue(save.waitForExistence(timeout: 5))
            // One compact pinned action, Save alone, with no scroll of its own, leaving most of the window to the page.
            XCTAssertTrue(footer.exists); XCTAssertFalse(app.scrollViews["c15t.footer"].exists)
            XCTAssertTrue(save.isHittable)
            XCTAssertGreaterThanOrEqual(footer.frame.minY, app.frame.height * 0.7, "footer top \(footer.frame.minY) of \(app.frame.height)")
            // Reject all and Accept all sit in the page after the introduction, equal and stacked.
            let reject = button("c15t.prefs.reject-all"), accept = button("c15t.prefs.accept-all")
            reveal(reject); XCTAssertTrue(reject.isHittable)
            XCTAssertEqual(reject.frame.width, accept.frame.width, accuracy: 1)
            XCTAssertEqual(reject.frame.height, accept.frame.height, accuracy: 1)
            XCTAssertLessThanOrEqual(reject.frame.maxY, accept.frame.minY + 0.5)
            capture("ios-\(name)-preferences")
            // Read and change a later setting by ordinary scrolling, then save from the pinned bar.
            let measurement = app.switches["c15t.prefs.category.measurement.switch"]
            reveal(measurement); measurement.tap(); XCTAssertEqual(measurement.value as? String, "1")
            capture("ios-\(name)-measurement")
            XCTAssertTrue(save.isHittable); save.tap()
            let retry = button("c15t.prefs.error.retry")
            XCTAssertTrue(retry.waitForExistence(timeout: 5))
            // The page scrolls to the failure by itself: the whole message and Try again sit above the pinned Save.
            waitHittable(retry)
            let message = app.descendants(matching: .any)["c15t.prefs.error"].firstMatch
            print("failure-frames \(name) window \(app.frame) message \(message.frame) retry \(retry.frame) footer \(footer.frame) save \(save.frame)")
            XCTAssertEqual(message.label, "Couldn't save your choices. Nothing changed on this device.")
            // Wholly between the bar and the pinned Save: on the SE at the largest size that is 76pt to 486pt of 667.
            XCTAssertGreaterThanOrEqual(message.frame.minY, app.navigationBars.firstMatch.frame.maxY - 0.5)
            XCTAssertLessThanOrEqual(message.frame.maxY, footer.frame.minY + 0.5)
            XCTAssertGreaterThanOrEqual(retry.frame.height, 44)
            XCTAssertLessThanOrEqual(retry.frame.maxY, footer.frame.minY + 0.5)
            XCTAssertFalse(retry.frame.intersects(save.frame))
            capture("ios-\(name)-save-error")
            // The draft is kept: scroll back up to the changed row (the list recycles it at this size), then return to the failure.
            reveal(measurement, backwards: true); XCTAssertEqual(measurement.value as? String, "1")
            reveal(retry); retry.tap()
            // The gate only closes on a durable commit.
            XCTAssertTrue(button("fixture.open-preferences").waitForExistence(timeout: 5))
            XCTAssertFalse(button("c15t.prefs.save").exists)
            // The host list is lazy too; read its rows in page order.
            XCTAssertEqual(hostState("fixture.state.explicit-choice").label, "recorded")
            XCTAssertEqual(hostState("fixture.state.permission.measurement").label, "measurement: true")
        }
    }
    func test12LargestNonAccessibilitySizeKeepsThePinnedFooter() {
        launch(fail: true, arguments: Self.xxxl)
        let reject = button("c15t.first-layer.reject-all"), accept = button("c15t.first-layer.accept-all")
        XCTAssertTrue(reject.waitForExistence(timeout: 10))
        // The last non-accessibility size keeps the pinned footer, still not a scroll view, within half the window.
        XCTAssertTrue(footer.exists); XCTAssertFalse(app.scrollViews["c15t.footer"].exists)
        XCTAssertTrue(reject.isHittable); XCTAssertTrue(accept.isHittable)
        XCTAssertLessThanOrEqual(footer.frame.height, app.frame.height * 0.5)
        capture("ios-xxxl-first-layer")
        button("c15t.first-layer.customize").tap()
        let save = button("c15t.prefs.save")
        XCTAssertTrue(save.waitForExistence(timeout: 5)); save.tap()
        let retry = button("c15t.prefs.error.retry")
        XCTAssertTrue(retry.waitForExistence(timeout: 5)); XCTAssertTrue(retry.isHittable)
        XCTAssertFalse(app.scrollViews["c15t.footer"].exists)
        XCTAssertLessThanOrEqual(footer.frame.height, app.frame.height * 0.5)
        XCTAssertLessThanOrEqual(retry.frame.maxY, button("c15t.prefs.reject-all").frame.minY + 0.5)
        capture("ios-xxxl-save-error")
        retry.tap()
        XCTAssertTrue(button("fixture.open-preferences").waitForExistence(timeout: 5))
        XCTAssertEqual(app.staticTexts["fixture.state.explicit-choice"].label, "recorded")
    }
    func test13LargestTextIabNavigationSearchAndSave() {
        launch("fresh-online-iab", arguments: Self.ax5)
        let customize = button("c15t.first-layer.customize")
        XCTAssertTrue(customize.waitForExistence(timeout: 10))
        XCTAssertFalse(footer.exists)
        let count = button("c15t.first-layer.partner-count")
        reveal(count); XCTAssertTrue(count.isHittable); XCTAssertGreaterThanOrEqual(count.frame.height, 44)
        capture("ios-ax5-iab-first-layer")
        reveal(customize); customize.tap()
        let save = button("c15t.iab.save")
        XCTAssertTrue(save.waitForExistence(timeout: 5)); XCTAssertTrue(save.isHittable)
        XCTAssertFalse(app.scrollViews["c15t.footer"].exists)
        XCTAssertGreaterThanOrEqual(footer.frame.minY, app.frame.height * 0.7)
        let reject = button("c15t.iab.reject-all"), accept = button("c15t.iab.accept-all")
        reveal(reject); XCTAssertTrue(reject.isHittable)
        XCTAssertEqual(reject.frame.width, accept.frame.width, accuracy: 1)
        XCTAssertLessThanOrEqual(reject.frame.maxY, accept.frame.minY + 0.5)
        capture("ios-ax5-iab-preferences")
        let purpose = app.switches["c15t.iab.purpose.7.consent"]
        reveal(purpose); purpose.tap(); XCTAssertEqual(purpose.value as? String, "1")
        let details = button("c15t.iab.purpose.7.details"); reveal(details); details.tap()
        let viewPartners = button("c15t.iab.purpose.7.view-partners"); reveal(viewPartners)
        XCTAssertGreaterThanOrEqual(viewPartners.frame.height, 44)
        capture("ios-ax5-iab-purpose-details")
        viewPartners.tap()
        let search = app.textFields["c15t.iab.vendors.search"]
        XCTAssertTrue(search.waitForExistence(timeout: 3))
        XCTAssertTrue(button("c15t.iab.vendors.filter.purpose.clear").exists)
        capture("ios-ax5-partner-list")
        search.tap(); search.typeText("elan")
        let vendor = button("c15t.iab.vendors.vendor.1")
        XCTAssertTrue(vendor.waitForExistence(timeout: 3))
        capture("ios-ax5-partner-search")
        // Return puts the keyboard away; the result row is then reached like any other row.
        search.typeText("\n")
        reveal(vendor); vendor.tap()
        let consent = app.switches["c15t.iab.vendor.1.consent"]
        XCTAssertTrue(consent.waitForExistence(timeout: 3)); reveal(consent); consent.tap()
        XCTAssertEqual(consent.value as? String, "1")
        capture("ios-ax5-partner-details")
        button("c15t.iab.vendor.back").tap()
        XCTAssertTrue(app.staticTexts["c15t.iab.vendors.vendor.1.status"].waitForExistence(timeout: 3))
        button("c15t.iab.vendors.back").tap()
        let ac = button("c15t.iab.other-partners"); reveal(ac); ac.tap()
        XCTAssertTrue(app.textFields["c15t.ac.search"].waitForExistence(timeout: 3))
        let provider = app.switches["c15t.ac.provider.10.switch"]
        reveal(provider); provider.tap(); XCTAssertEqual(provider.value as? String, "1")
        capture("ios-ax5-additional-consent")
        button("c15t.ac.back").tap()
        XCTAssertTrue(save.waitForExistence(timeout: 3)); XCTAssertTrue(save.isHittable); save.tap()
        XCTAssertTrue(button("fixture.open-preferences").waitForExistence(timeout: 5))
        let summary = hostState("fixture.state.iab").label
        XCTAssertTrue(summary.contains("vendors=[1]"), summary)
    }
}

final class ProtocolReceiptTests: XCTestCase {
    private let app = XCUIApplication()
    private func report() async throws -> [String: Any] {
        let (data, _) = try await URLSession.shared.data(from: URL(string: "http://localhost:3000/e2e/state")!)
        return try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
    }
    @MainActor func testRealControlsDeliverNativeReceipts() async throws {
        guard (try? await report()) != nil else { throw XCTSkip("Start the reviewed e2e-backend.py on port 3000") }
        continueAfterFailure = false
        app.launchEnvironment = ["C15T_FIXTURE_SCENARIO": "protocol-backend", "C15T_FIXTURE_RESET": "1", "C15T_FIXTURE_BACKEND": "http://localhost:3000/api/self-host"]
        app.launch()
        let reject = app.buttons["c15t.first-layer.reject-all"]
        XCTAssertTrue(reject.waitForExistence(timeout: 15)); reject.tap()
        var captured: [String: Any] = [:]
        for _ in 0..<100 {
            captured = try await report()
            if (captured["saves"] as? [[String: Any]])?.count == 1, (captured["snapshot"] as? [String: Any])?["explicitChoice"] is [String: Any] { break }
            try await Task.sleep(for: .milliseconds(100))
        }
        XCTAssertEqual(captured["core"] as? String, "native")
        let snapshot = try XCTUnwrap(captured["snapshot"] as? [String: Any])
        let choice = try XCTUnwrap(snapshot["explicitChoice"] as? [String: Any])
        let saves = try XCTUnwrap(captured["saves"] as? [[String: Any]])
        XCTAssertEqual(saves.count, 1)
        let delivered = try XCTUnwrap(saves.last)
        let deliveredChoice = try XCTUnwrap(delivered["choice"] as? [String: Any])
        let receipts = try XCTUnwrap(choice["categories"] as? [String: Any])
        XCTAssertTrue(NSDictionary(dictionary: receipts).isEqual(NSDictionary(dictionary: try XCTUnwrap(deliveredChoice["categories"] as? [String: Any]))))
        XCTAssertEqual(delivered["subjectId"] as? String, (snapshot["subject"] as? [String: Any])?["subjectId"] as? String)
        let preferences = try XCTUnwrap(delivered["preferences"] as? [String: Bool])
        for category in ["functionality", "experience", "measurement", "marketing"] {
            XCTAssertEqual(preferences[category], false)
            XCTAssertEqual((receipts[category] as? [String: Any])?["value"] as? Bool, false)
        }
        let attachment = XCTAttachment(data: try JSONSerialization.data(withJSONObject: captured, options: [.prettyPrinted, .sortedKeys]), uniformTypeIdentifier: "public.json")
        attachment.name = "native-swift-protocol-receipt"; attachment.lifetime = .keepAlways; add(attachment)
        app.terminate()
        app.launchEnvironment["C15T_FIXTURE_RESET"] = "0"
        app.launch()
        XCTAssertTrue(app.buttons["fixture.open-preferences"].waitForExistence(timeout: 10))
        XCTAssertFalse(app.buttons["c15t.first-layer.accept-all"].exists)
        XCTAssertEqual(app.staticTexts["fixture.state.explicit-choice"].label, "recorded")
    }
}
