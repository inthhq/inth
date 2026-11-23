import XCTest

final class ConsentJourneyTests: XCTestCase {
    var app: XCUIApplication!
    override func setUp() { continueAfterFailure = false }
    override func tearDown() { if testRun?.hasSucceeded == false { print(app.debugDescription) } }
    func launch(_ scenario: String = "fresh-online", fail: Bool = false, reset: Bool = true, offline: Bool = false, backend: String? = nil, appearance: String? = nil, theme: String? = nil, branding: String? = nil, identity: String? = nil, arguments: [String] = []) {
        app = XCUIApplication()
        app.launchEnvironment = ["INTH_FIXTURE_SCENARIO": scenario, "INTH_FIXTURE_RESET": reset ? "1" : "0", "INTH_FIXTURE_FAIL_NEXT_WRITE": fail ? "1" : "0", "INTH_FIXTURE_OFFLINE": offline ? "1" : "0"]
        if let backend { app.launchEnvironment["INTH_FIXTURE_BACKEND"] = backend }
        if let appearance { app.launchEnvironment["INTH_FIXTURE_APPEARANCE"] = appearance }
        if let theme { app.launchEnvironment["INTH_FIXTURE_THEME"] = theme }
        if let branding { app.launchEnvironment["INTH_FIXTURE_BRANDING"] = branding }
        if let identity { app.launchEnvironment["INTH_FIXTURE_IDENTITY"] = identity }
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
        if let dir = ProcessInfo.processInfo.environment["INTH_CAPTURE_DIR"] {
            try? FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
            try? screenshot.pngRepresentation.write(to: URL(fileURLWithPath: dir).appendingPathComponent(name + ".png"))
        }
    }
    func button(_ id: String) -> XCUIElement { app.buttons[id] }
    func openStandingPreferences() {
        let gone = NSPredicate { _, _ in
            !self.button("inth.prefs.save").exists && !self.button("inth.iab.save").exists && !self.button("inth.first-layer.accept-all").exists
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
    var footer: XCUIElement { app.otherElements["inth.footer"] }
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
    func test00LocalIabModeStartsFromTheSetupScreen() {
        app = XCUIApplication()
        app.launchEnvironment = ["INTH_FIXTURE_RESET": "1"]
        app.launch()
        let mode = button("demo.mode.iab")
        reveal(mode)
        XCTAssertTrue(mode.isHittable)
        mode.tap()
        let accept = button("inth.first-layer.accept-all")
        XCTAssertTrue(accept.waitForExistence(timeout: 10))
        accept.tap()
        XCTAssertTrue(button("fixture.open-preferences").waitForExistence(timeout: 5))
        let summary = hostState("fixture.state.iab").label
        XCTAssertTrue(summary.contains("ac=2~10.20~dv."), summary)
        capture("ios-demo-picker-iab-commit")
    }
    func test21HostedSetupInstallsProtectedStorage() {
        app = XCUIApplication()
        // dryRun in this Debug build accepts a host outside Inth and sends no record.
        app.launchEnvironment = ["INTH_DEMO_DRY_RUN": "1"]
        app.launch()
        let backend = app.textFields["Inth project URL"]
        XCTAssertTrue(backend.waitForExistence(timeout: 5))
        backend.tap()
        let previous = backend.value as? String ?? ""
        backend.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: previous.count))
        backend.typeText("https://inth-hosted-setup.invalid")
        let privacy = app.textFields["Privacy policy URL"]
        privacy.tap()
        privacy.typeText("https://example.com/privacy")
        button("Connect").tap()
        // Installation probes the real Keychain before policy fetching. The reserved
        // backend cannot resolve, so this proves storage setup, not hosted delivery.
        let installed = app.staticTexts["Inth hosted project"].waitForExistence(timeout: 15)
        capture("ios-hosted-protected-storage")
        XCTAssertTrue(installed, app.debugDescription)
    }
    func test01EqualDecisionsAndRejectPersistOffline() {
        launch()
        print(app.debugDescription)
        let reject = button("inth.first-layer.reject-all"), accept = button("inth.first-layer.accept-all")
        XCTAssertTrue(reject.waitForExistence(timeout: 10)); XCTAssertTrue(accept.isHittable)
        XCTAssertEqual(reject.frame.width, accept.frame.width, accuracy: 1)
        XCTAssertEqual(reject.frame.height, accept.frame.height, accuracy: 1)
        // The stock header is provider-branded and does not adopt the demo app identity.
        XCTAssertEqual(app.staticTexts["inth.first-layer.brand"].label, "Your brand here")
        capture("ios-first-layer")
        reject.tap()
        XCTAssertTrue(button("fixture.open-preferences").waitForExistence(timeout: 5))
        XCTAssertFalse(accept.exists)
        XCTAssertEqual(app.staticTexts["fixture.state.permission.marketing"].label, "marketing: false")
        app.terminate(); launch(reset: false, offline: true)
        XCTAssertTrue(button("fixture.open-preferences").waitForExistence(timeout: 10))
        XCTAssertFalse(button("inth.first-layer.accept-all").exists)
        XCTAssertEqual(app.staticTexts["fixture.state.explicit-choice"].label, "recorded")
    }
    /// The demo hosts the one-line `.inth` modifier, so this is the default auto-present path.
    func test22AutoPresentedPromptStaysClosedAfterAnAnswerAndAForeground() {
        launch()
        XCTAssertTrue(button("inth.first-layer.reject-all").waitForExistence(timeout: 10), "an owed prompt presents by itself")
        button("inth.first-layer.reject-all").tap()
        XCTAssertTrue(button("fixture.open-preferences").waitForExistence(timeout: 5))
        XCUIDevice.shared.press(.home)
        app.activate()
        XCTAssertTrue(button("fixture.open-preferences").waitForExistence(timeout: 10))
        XCTAssertFalse(button("inth.first-layer.reject-all").waitForExistence(timeout: 2), "an answered prompt is not presented again")
        XCTAssertEqual(app.staticTexts["fixture.state.explicit-choice"].label, "recorded")
    }
    func test02CustomDraftRefusalRetryAndStandingSettings() {
        launch(fail: true)
        XCTAssertTrue(button("inth.first-layer.customize").waitForExistence(timeout: 10)); button("inth.first-layer.customize").tap()
        let measurement = app.switches["inth.prefs.category.measurement.switch"]
        reveal(measurement); measurement.tap(); XCTAssertEqual(measurement.value as? String, "1")
        XCTAssertFalse(app.staticTexts["Data use"].exists)
        capture("ios-category-preferences")
        // Rows keep a 44pt target without their own padding, and the footer shares the cards' edges.
        for id in ["experience", "functionality", "marketing", "measurement"] {
            let row = app.switches["inth.prefs.category.\(id).switch"]
            XCTAssertGreaterThanOrEqual(row.frame.height, 44, id)
            print("row-frame \(id) \(row.frame)")
        }
        print("row-frame necessary \(app.descendants(matching: .any)["inth.prefs.category.necessary.locked"].firstMatch.frame)")
        print("cell-frames \(app.cells.allElementsBoundByIndex.map(\.frame))")
        // Below accessibility sizes the footer is pinned and never a scroll view of its own.
        XCTAssertTrue(footer.exists); XCTAssertFalse(app.scrollViews["inth.footer"].exists)
        XCTAssertEqual(app.cells.firstMatch.frame.minX, button("inth.prefs.save").frame.minX, accuracy: 0.5)
        XCTAssertEqual(app.cells.firstMatch.frame.maxX, button("inth.prefs.save").frame.maxX, accuracy: 0.5)
        button("inth.prefs.save").tap()
        XCTAssertTrue(button("inth.prefs.error.retry").waitForExistence(timeout: 5))
        XCTAssertEqual(measurement.value as? String, "1")
        capture("ios-save-error")
        button("inth.prefs.error.retry").tap()
        XCTAssertTrue(button("fixture.open-preferences").waitForExistence(timeout: 5))
        XCTAssertEqual(app.staticTexts["fixture.state.permission.measurement"].label, "measurement: true")
        openStandingPreferences()
        reveal(measurement); XCTAssertEqual(measurement.value as? String, "1")
        measurement.tap(); button("inth.prefs.cancel").tap()
        XCTAssertTrue(button("inth.prefs.discard.keep").waitForExistence(timeout: 3)); button("inth.prefs.discard.keep").tap()
        XCTAssertEqual(measurement.value as? String, "0")
        button("inth.prefs.cancel").tap(); button("inth.prefs.discard.confirm").tap()
        app.terminate(); launch(reset: false, offline: true)
        XCTAssertTrue(button("fixture.open-preferences").waitForExistence(timeout: 5))
        XCTAssertEqual(app.staticTexts["fixture.state.permission.measurement"].label, "measurement: true")
    }
    func test03IabSearchRestrictionObjectionAndAcCommit() {
        launch("fresh-online-iab")
        XCTAssertTrue(button("inth.first-layer.customize").waitForExistence(timeout: 10)); capture("ios-iab-first-layer")
        // The IAB first layer: description with the partner count, the purpose summary, then
        // legitimate interest, scope and withdrawal, all from the IAB copy.
        let description = app.staticTexts["inth.first-layer.description"]
        XCTAssertTrue(description.label.contains("We and our 5 partners store and/or access information on your device"), description.label)
        XCTAssertEqual(app.staticTexts["inth.first-layer.summary.item.0"].label, "Store and access information on a device")
        XCTAssertFalse(app.staticTexts["inth.first-layer.summary.more"].exists)
        XCTAssertTrue(app.staticTexts["inth.first-layer.legitimate-interest"].label.contains("right to object"))
        XCTAssertEqual(app.staticTexts["inth.first-layer.scope"].label, "Your consent applies only to this app and will not affect other services.")
        let withdraw = app.staticTexts["inth.first-layer.withdraw"]; reveal(withdraw)
        XCTAssertTrue(withdraw.label.contains("withdraw your consent at any time"))
        XCTAssertEqual(button("inth.first-layer.reject-all").label, "Reject All")
        XCTAssertEqual(button("inth.first-layer.accept-all").label, "Accept All")
        capture("ios-iab-first-layer-disclosures")
        button("inth.first-layer.customize").tap()
        XCTAssertTrue(app.switches["inth.prefs.category.experience.switch"].waitForExistence(timeout: 5))
        // One purpose consent on, so a partner consent later shows as Partly on rather than Off.
        let storage = app.switches["inth.iab.purpose.1.consent"]
        reveal(storage); storage.tap(); XCTAssertEqual(storage.value as? String, "1")
        let purpose = app.switches["inth.iab.purpose.7.consent"]
        reveal(purpose); capture("ios-iab-centre")
        let details = button("inth.iab.purpose.7.details"); reveal(details); details.tap()
        // Text actions size their own 44pt target; a frame outside the button would leave 18pt.
        let viewPartners = button("inth.iab.purpose.7.view-partners"); reveal(viewPartners)
        XCTAssertGreaterThanOrEqual(viewPartners.frame.height, 44)
        XCTAssertGreaterThanOrEqual(details.frame.height, 44)
        let li = app.switches["inth.iab.purpose.7.li"]
        reveal(li); XCTAssertEqual(li.value as? String, "1") // Starts not objected to; one tap objects.
        li.tap(); XCTAssertEqual(li.value as? String, "0")
        XCTAssertFalse(app.switches["inth.iab.purpose.1.li"].exists)
        // The explanation of legitimate interest sits under the purposes it applies to.
        let explanation = app.staticTexts["inth.iab.legitimate-interest-explanation"]
        reveal(explanation); XCTAssertTrue(explanation.label.contains("right to object"))
        let partners = button("inth.iab.partners"); reveal(partners); partners.tap()
        let search = app.textFields["inth.iab.vendors.search"]
        XCTAssertTrue(search.waitForExistence(timeout: 3)); capture("ios-partner-list")
        search.tap(); search.typeText("elan")
        XCTAssertTrue(button("inth.iab.vendors.vendor.1").exists); capture("ios-partner-search")
        button("inth.iab.vendors.vendor.1").tap()
        let consent = app.switches["inth.iab.vendor.1.consent"]
        XCTAssertTrue(consent.waitForExistence(timeout: 3)); consent.tap()
        let vendorLI = app.switches["inth.iab.vendor.1.li"]; XCTAssertEqual(vendorLI.value as? String, "1"); vendorLI.tap(); XCTAssertEqual(vendorLI.value as? String, "0")
        capture("ios-partner-details")
        button("inth.iab.vendor.back").tap()
        XCTAssertTrue(app.staticTexts["inth.iab.vendors.vendor.1.status"].waitForExistence(timeout: 3))
        XCTAssertEqual(app.staticTexts["inth.iab.vendors.vendor.1.status"].label, "Partly on")
        capture("ios-partner-status")
        button("inth.iab.vendors.back").tap()
        let features = app.staticTexts["inth.iab.features-standard-text"]; reveal(features); XCTAssertFalse(features.label.isEmpty)
        let ac0 = button("inth.iab.other-partners")
        let consentStorage = app.staticTexts["inth.iab.consent-storage"]; reveal(consentStorage)
        XCTAssertTrue(consentStorage.label.contains("for up to 365 days"), consentStorage.label)
        capture("ios-iab-consent-storage")
        reveal(ac0, backwards: true)
        ac0.tap()
        XCTAssertTrue(app.textFields["inth.ac.search"].waitForExistence(timeout: 3))
        app.switches["inth.ac.provider.10.switch"].tap(); capture("ios-additional-consent")
        // The web's notice, from the shared copy, and no purpose numbers.
        XCTAssertTrue(app.staticTexts["inth.ac.intro"].label.contains("Google works with these ad tech providers"))
        XCTAssertFalse(app.staticTexts["inth.ac.intro"].label.contains("Purposes 1"))
        button("inth.ac.back").tap()
        button("inth.iab.save").tap()
        XCTAssertTrue(button("fixture.open-preferences").waitForExistence(timeout: 5))
        let summary = app.staticTexts["fixture.state.iab"].label
        XCTAssertTrue(summary.contains("purposeObjections=[7]"), summary)
        XCTAssertTrue(summary.contains("vendorObjections=[1]"), summary)
        // Native AC authoring refuses an ATP grant without purposes 1, 3 and 4.
        XCTAssertTrue(summary.contains("ac=2~~dv.10.20"), summary)
    }
    func test04AcceptAllIncludesNativeIabAndAcThenWithdraw() {
        launch("fresh-online-iab")
        XCTAssertTrue(button("inth.first-layer.accept-all").waitForExistence(timeout: 10)); button("inth.first-layer.accept-all").tap()
        XCTAssertTrue(button("fixture.open-preferences").waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["fixture.state.iab"].label.contains("ac=2~10.20~dv."))
        openStandingPreferences(); button("inth.iab.reject-all").tap()
        XCTAssertTrue(button("fixture.open-preferences").waitForExistence(timeout: 5))
        XCTAssertEqual(app.staticTexts["fixture.state.permission.marketing"].label, "marketing: false")
    }
    /// The theme an app gets with nothing set: the system page, and Save in the navigation bar.
    func test32StockThemeSavesFromTheNavigationBar() {
        launch("fresh-online-iab", theme: "stock")
        let customize = button("inth.first-layer.customize")
        XCTAssertTrue(customize.waitForExistence(timeout: 10))
        // The system page ends its summary in the partners row.
        XCTAssertTrue(button("inth.first-layer.partner-count").exists)
        XCTAssertEqual(button("inth.first-layer.reject-all").frame.width, button("inth.first-layer.accept-all").frame.width, accuracy: 1)
        customize.tap()
        let save = button("inth.iab.save")
        XCTAssertTrue(save.waitForExistence(timeout: 5))
        // One Save, above the list; Reject All and Accept All stay equal in the footer.
        XCTAssertLessThan(save.frame.maxY, footer.frame.minY)
        XCTAssertEqual(button("inth.iab.reject-all").frame.width, button("inth.iab.accept-all").frame.width, accuracy: 1)
        XCTAssertTrue(footer.frame.contains(button("inth.iab.reject-all").frame))
        let storage = app.switches["inth.iab.purpose.1.consent"]
        reveal(storage); XCTAssertEqual(storage.value as? String, "0"); storage.tap()
        save.tap()
        XCTAssertTrue(button("fixture.open-preferences").waitForExistence(timeout: 5))
        let summary = app.staticTexts["fixture.state.iab"].label
        XCTAssertTrue(summary.contains("purposes=[1]"), summary)
    }
    /// The sheet and the prompt: equal decisions, a full-size route to the partners, and the card
    /// again after Back from settings.
    func test33SheetAndPromptKeepTheirCardAndThePartnersRoute() {
        for layout in ["sheet", "prompt"] {
            app = XCUIApplication()
            app.launchEnvironment = ["INTH_FIXTURE_SCENARIO": "fresh-online-iab", "INTH_FIXTURE_RESET": "1", "INTH_FIXTURE_THEME": "stock", "INTH_FIXTURE_FIRST_LAYER": layout]
            app.launch()
            let reject = button("inth.first-layer.reject-all"), accept = button("inth.first-layer.accept-all")
            XCTAssertTrue(reject.waitForExistence(timeout: 10), layout)
            XCTAssertEqual(reject.frame.width, accept.frame.width, accuracy: 1, layout)
            XCTAssertEqual(reject.frame.height, accept.frame.height, accuracy: 1, layout)
            // The card's own container, which a page does not have, leaves the app visible above it.
            let container = app.descendants(matching: .any)["inth.first-layer.\(layout)"].firstMatch
            XCTAssertTrue(container.exists, layout)
            XCTAssertGreaterThan(container.frame.minY, app.frame.minY + 40, layout)
            let card = reject.frame.width
            button("inth.first-layer.customize").tap()
            XCTAssertTrue(button("inth.prefs.cancel").waitForExistence(timeout: 5), layout)
            button("inth.prefs.cancel").tap()
            XCTAssertTrue(reject.waitForExistence(timeout: 5), layout)
            XCTAssertEqual(reject.frame.width, card, accuracy: 1, "\(layout) came back as a page")
            XCTAssertTrue(container.exists, "\(layout) came back as a page")
            let partners = button("inth.first-layer.partner-count")
            XCTAssertTrue(partners.exists, layout)
            XCTAssertGreaterThanOrEqual(partners.frame.height, 44, layout)
            partners.tap()
            XCTAssertTrue(button("inth.iab.vendors.vendor.1").waitForExistence(timeout: 5), layout)
            app.terminate()
        }
    }
    func test05UnavailableAndNotice() {
        launch("fresh-offline-none")
        XCTAssertTrue(button("fixture.open-preferences").waitForExistence(timeout: 10)); XCTAssertFalse(button("inth.first-layer.accept-all").exists)
        openStandingPreferences(); XCTAssertTrue(button("inth.status.unavailable.retry").waitForExistence(timeout: 3)); capture("ios-policy-unavailable")
        app.terminate(); launch("fresh-online-notice", fail: true)
        XCTAssertTrue(button("inth.notice.acknowledge").waitForExistence(timeout: 10))
        XCTAssertTrue(button("fixture.open-preferences").isHittable)
        button("inth.notice.acknowledge").tap(); XCTAssertTrue(button("inth.notice.error.retry").waitForExistence(timeout: 5))
        XCTAssertEqual(app.descendants(matching: .any)["inth.notice.error"].label, "Couldn't dismiss this notice. Nothing changed on this device.")
        button("inth.notice.error.retry").tap(); XCTAssertFalse(button("inth.notice.acknowledge").waitForExistence(timeout: 2))
        XCTAssertEqual(app.staticTexts["fixture.state.explicit-choice"].label, "none")
    }
    func test06DarkLargeTextEqualDecisions() {
        launch(appearance: "dark", arguments: Self.ax5)
        print(app.debugDescription)
        let reject = button("inth.first-layer.reject-all"), accept = button("inth.first-layer.accept-all"), customize = button("inth.first-layer.customize")
        XCTAssertTrue(reject.waitForExistence(timeout: 10))
        // At accessibility sizes there is no footer: the decisions follow the text in the one scrolling page.
        XCTAssertFalse(footer.exists); XCTAssertFalse(app.scrollViews["inth.footer"].exists)
        capture("ios-dark-large-text")
        // iOS 26 exposes a SwiftUI Link as a button; earlier runtimes as a link.
        let policy = app.links["inth.privacy-policy"].exists ? app.links["inth.privacy-policy"] : app.buttons["inth.privacy-policy"]
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
        XCTAssertTrue(app.descendants(matching: .any)["inth.first-layer.branding"].firstMatch.exists)
        reveal(reject); reject.tap()
        XCTAssertTrue(button("fixture.open-preferences").waitForExistence(timeout: 5))
        XCTAssertEqual(hostState("fixture.state.permission.marketing").label, "marketing: false")
    }
    func test07CustomizeThenBackReturnsToTheFirstLayer() {
        launch(appearance: "dark")
        XCTAssertTrue(button("inth.first-layer.customize").waitForExistence(timeout: 10))
        capture("ios-dark-first-layer")
        button("inth.first-layer.customize").tap()
        XCTAssertTrue(button("inth.prefs.save").waitForExistence(timeout: 5))
        XCTAssertFalse(button("inth.first-layer.accept-all").exists)
        capture("ios-dark-preferences")
        // Back from a first-layer Customize returns to the first layer; it never closes the gate.
        button("inth.prefs.cancel").tap()
        XCTAssertTrue(button("inth.first-layer.accept-all").waitForExistence(timeout: 5))
        XCTAssertFalse(button("inth.prefs.save").exists)
        XCTAssertEqual(app.staticTexts["fixture.state.explicit-choice"].label, "none")
        button("inth.first-layer.reject-all").tap()
        XCTAssertTrue(button("fixture.open-preferences").waitForExistence(timeout: 5))
        XCTAssertEqual(app.staticTexts["fixture.state.permission.marketing"].label, "marketing: false")
    }
    func test08BrandThemeKeepsEqualDecisions() {
        launch("fresh-online-iab", theme: "brand")
        let reject = button("inth.first-layer.reject-all"), accept = button("inth.first-layer.accept-all")
        XCTAssertTrue(reject.waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["inth.first-layer.brand"].exists)
        XCTAssertEqual(app.staticTexts["inth.first-layer.title"].label, "Before you shop.")
        XCTAssertEqual(reject.frame.width, accept.frame.width, accuracy: 1)
        XCTAssertEqual(reject.frame.height, accept.frame.height, accuracy: 1)
        capture("ios-brand-first-layer")
        button("inth.first-layer.customize").tap()
        XCTAssertTrue(button("inth.iab.save").waitForExistence(timeout: 5))
        capture("ios-brand-preferences")
        let partners = button("inth.iab.partners"); reveal(partners); partners.tap()
        XCTAssertTrue(button("inth.iab.vendors.vendor.1").waitForExistence(timeout: 5))
        capture("ios-brand-partners")
        button("inth.iab.vendors.back").tap()
        button("inth.prefs.cancel").tap()
        XCTAssertTrue(accept.waitForExistence(timeout: 5))
        accept.tap()
        XCTAssertTrue(button("fixture.open-preferences").waitForExistence(timeout: 5))
        XCTAssertEqual(app.staticTexts["fixture.state.permission.marketing"].label, "marketing: true")
    }

    func test09ProviderBrandingCanSwapWithoutChangingDecisions() {
        for (value, name) in [("c15t", "c15t"), ("inth", "Inth"), ("custom", "Pantry")] {
            launch(branding: value)
            let reject = button("inth.first-layer.reject-all"), accept = button("inth.first-layer.accept-all")
            XCTAssertTrue(reject.waitForExistence(timeout: 10))
            let attribution = app.descendants(matching: .any)["inth.first-layer.branding"].firstMatch
            XCTAssertTrue(attribution.exists)
            XCTAssertEqual(attribution.label, "Consent by \(name)")
            XCTAssertEqual(app.staticTexts["inth.first-layer.brand"].label, "Your brand here")
            XCTAssertEqual(reject.frame.width, accept.frame.width, accuracy: 1)
            XCTAssertEqual(reject.frame.height, accept.frame.height, accuracy: 1)
            capture("ios-provider-\(value)")
            reject.tap()
            XCTAssertTrue(button("fixture.open-preferences").waitForExistence(timeout: 5))
            XCTAssertEqual(app.staticTexts["fixture.state.permission.marketing"].label, "marketing: false")
        }
        launch(branding: "hidden")
        XCTAssertTrue(button("inth.first-layer.reject-all").waitForExistence(timeout: 10))
        XCTAssertFalse(app.descendants(matching: .any)["inth.first-layer.branding"].firstMatch.exists)
    }

    func test10IdentityFallsBackToAnInitialAndCanBeHidden() {
        launch(identity: "generic")
        XCTAssertTrue(button("inth.first-layer.reject-all").waitForExistence(timeout: 10))
        XCTAssertEqual(app.staticTexts["inth.first-layer.brand"].label, "Your brand here")
        capture("ios-identity-generic")
        launch(identity: "hidden")
        XCTAssertTrue(button("inth.first-layer.reject-all").waitForExistence(timeout: 10))
        XCTAssertFalse(app.staticTexts["inth.first-layer.brand"].exists)
        capture("ios-identity-hidden")
        button("inth.first-layer.reject-all").tap()
        XCTAssertTrue(button("fixture.open-preferences").waitForExistence(timeout: 5))
    }
    func test11SaveRefusalStaysCalmInDarkAndAtTheLargestText() {
        launch(fail: true, appearance: "dark")
        XCTAssertTrue(button("inth.first-layer.customize").waitForExistence(timeout: 10)); button("inth.first-layer.customize").tap()
        button("inth.prefs.save").tap()
        XCTAssertTrue(button("inth.prefs.error.retry").waitForExistence(timeout: 5))
        XCTAssertEqual(app.descendants(matching: .any)["inth.prefs.error"].label, "Couldn't save your choices. Nothing changed on this device.")
        // Try again follows the message in the same run; its 44pt target stops short of the first decision.
        let inline = button("inth.prefs.error.retry")
        XCTAssertGreaterThanOrEqual(inline.frame.height, 44)
        XCTAssertLessThanOrEqual(inline.frame.maxY, button("inth.prefs.reject-all").frame.minY + 0.5)
        capture("ios-save-error-dark")
        button("inth.prefs.error.retry").tap()
        XCTAssertTrue(button("fixture.open-preferences").waitForExistence(timeout: 5))
        XCTAssertEqual(app.staticTexts["fixture.state.explicit-choice"].label, "recorded")
        for (name, size) in [("ax2", Self.ax2), ("ax5", Self.ax5)] {
            app.terminate(); launch(fail: true, appearance: "dark", arguments: size)
            let customize = button("inth.first-layer.customize")
            XCTAssertTrue(customize.waitForExistence(timeout: 10)); reveal(customize); customize.tap()
            let save = button("inth.prefs.save")
            XCTAssertTrue(save.waitForExistence(timeout: 5))
            // One compact pinned action, Save alone, with no scroll of its own, leaving most of the window to the page.
            XCTAssertTrue(footer.exists); XCTAssertFalse(app.scrollViews["inth.footer"].exists)
            XCTAssertTrue(save.isHittable)
            XCTAssertGreaterThanOrEqual(footer.frame.minY, app.frame.height * 0.7, "footer top \(footer.frame.minY) of \(app.frame.height)")
            // Reject all and Accept all sit in the page after the introduction, equal and stacked.
            let reject = button("inth.prefs.reject-all"), accept = button("inth.prefs.accept-all")
            reveal(reject); XCTAssertTrue(reject.isHittable)
            XCTAssertEqual(reject.frame.width, accept.frame.width, accuracy: 1)
            XCTAssertEqual(reject.frame.height, accept.frame.height, accuracy: 1)
            XCTAssertLessThanOrEqual(reject.frame.maxY, accept.frame.minY + 0.5)
            capture("ios-\(name)-preferences")
            // Read and change a later setting by ordinary scrolling, then save from the pinned bar.
            let measurement = app.switches["inth.prefs.category.measurement.switch"]
            reveal(measurement); measurement.tap(); XCTAssertEqual(measurement.value as? String, "1")
            capture("ios-\(name)-measurement")
            XCTAssertTrue(save.isHittable); save.tap()
            let retry = button("inth.prefs.error.retry")
            XCTAssertTrue(retry.waitForExistence(timeout: 5))
            // The page scrolls to the failure by itself: the whole message and Try again sit above the pinned Save.
            waitHittable(retry)
            let message = app.descendants(matching: .any)["inth.prefs.error"].firstMatch
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
            XCTAssertFalse(button("inth.prefs.save").exists)
            // The host list is lazy too; read its rows in page order.
            XCTAssertEqual(hostState("fixture.state.explicit-choice").label, "recorded")
            XCTAssertEqual(hostState("fixture.state.permission.measurement").label, "measurement: true")
        }
    }
    func test12LargestNonAccessibilitySizeKeepsThePinnedFooter() {
        launch(fail: true, arguments: Self.xxxl)
        let reject = button("inth.first-layer.reject-all"), accept = button("inth.first-layer.accept-all")
        XCTAssertTrue(reject.waitForExistence(timeout: 10))
        // The last non-accessibility size keeps the pinned footer, still not a scroll view, within half the window.
        XCTAssertTrue(footer.exists); XCTAssertFalse(app.scrollViews["inth.footer"].exists)
        XCTAssertTrue(reject.isHittable); XCTAssertTrue(accept.isHittable)
        XCTAssertLessThanOrEqual(footer.frame.height, app.frame.height * 0.5)
        capture("ios-xxxl-first-layer")
        button("inth.first-layer.customize").tap()
        let save = button("inth.prefs.save")
        XCTAssertTrue(save.waitForExistence(timeout: 5)); save.tap()
        let retry = button("inth.prefs.error.retry")
        XCTAssertTrue(retry.waitForExistence(timeout: 5)); XCTAssertTrue(retry.isHittable)
        XCTAssertFalse(app.scrollViews["inth.footer"].exists)
        XCTAssertLessThanOrEqual(footer.frame.height, app.frame.height * 0.5)
        XCTAssertLessThanOrEqual(retry.frame.maxY, button("inth.prefs.reject-all").frame.minY + 0.5)
        capture("ios-xxxl-save-error")
        retry.tap()
        XCTAssertTrue(button("fixture.open-preferences").waitForExistence(timeout: 5))
        XCTAssertEqual(app.staticTexts["fixture.state.explicit-choice"].label, "recorded")
    }
    func test13LargestTextIabNavigationSearchAndSave() {
        launch("fresh-online-iab", arguments: Self.ax5)
        let customize = button("inth.first-layer.customize")
        XCTAssertTrue(customize.waitForExistence(timeout: 10))
        XCTAssertFalse(footer.exists)
        let count = button("inth.first-layer.partner-count")
        reveal(count); XCTAssertTrue(count.isHittable); XCTAssertGreaterThanOrEqual(count.frame.height, 44)
        capture("ios-ax5-iab-first-layer")
        reveal(customize); customize.tap()
        let save = button("inth.iab.save")
        XCTAssertTrue(save.waitForExistence(timeout: 5)); XCTAssertTrue(save.isHittable)
        XCTAssertFalse(app.scrollViews["inth.footer"].exists)
        XCTAssertGreaterThanOrEqual(footer.frame.minY, app.frame.height * 0.7)
        let reject = button("inth.iab.reject-all"), accept = button("inth.iab.accept-all")
        reveal(reject); XCTAssertTrue(reject.isHittable)
        XCTAssertEqual(reject.frame.width, accept.frame.width, accuracy: 1)
        XCTAssertLessThanOrEqual(reject.frame.maxY, accept.frame.minY + 0.5)
        capture("ios-ax5-iab-preferences")
        let purpose = app.switches["inth.iab.purpose.7.consent"]
        reveal(purpose); purpose.tap(); XCTAssertEqual(purpose.value as? String, "1")
        let details = button("inth.iab.purpose.7.details"); reveal(details); details.tap()
        let viewPartners = button("inth.iab.purpose.7.view-partners"); reveal(viewPartners)
        XCTAssertGreaterThanOrEqual(viewPartners.frame.height, 44)
        capture("ios-ax5-iab-purpose-details")
        viewPartners.tap()
        let search = app.textFields["inth.iab.vendors.search"]
        XCTAssertTrue(search.waitForExistence(timeout: 3))
        XCTAssertTrue(button("inth.iab.vendors.filter.purpose.clear").exists)
        capture("ios-ax5-partner-list")
        search.tap(); search.typeText("elan")
        let vendor = button("inth.iab.vendors.vendor.1")
        XCTAssertTrue(vendor.waitForExistence(timeout: 3))
        capture("ios-ax5-partner-search")
        // Return puts the keyboard away; the result row is then reached like any other row.
        search.typeText("\n")
        reveal(vendor); vendor.tap()
        let consent = app.switches["inth.iab.vendor.1.consent"]
        XCTAssertTrue(consent.waitForExistence(timeout: 3)); reveal(consent); consent.tap()
        XCTAssertEqual(consent.value as? String, "1")
        capture("ios-ax5-partner-details")
        button("inth.iab.vendor.back").tap()
        XCTAssertTrue(app.staticTexts["inth.iab.vendors.vendor.1.status"].waitForExistence(timeout: 3))
        button("inth.iab.vendors.back").tap()
        // The special-feature title scales with the rest of the page; test15 tolerates the audit's Dynamic
        // Type finding on this row on that basis. It is about 20pt tall at the default size.
        let feature = button("inth.iab.special-feature.1.details"); reveal(feature)
        XCTAssertGreaterThan(feature.staticTexts.firstMatch.frame.height, 60, "special-feature title does not scale")
        let ac = button("inth.iab.other-partners"); reveal(ac); ac.tap()
        XCTAssertTrue(app.textFields["inth.ac.search"].waitForExistence(timeout: 3))
        let provider = app.switches["inth.ac.provider.10.switch"]
        reveal(provider); provider.tap(); XCTAssertEqual(provider.value as? String, "1")
        capture("ios-ax5-additional-consent")
        button("inth.ac.back").tap()
        XCTAssertTrue(save.waitForExistence(timeout: 3)); XCTAssertTrue(save.isHittable); save.tap()
        XCTAssertTrue(button("fixture.open-preferences").waitForExistence(timeout: 5))
        let summary = hostState("fixture.state.iab").label
        XCTAssertTrue(summary.contains("vendors=[1]"), summary)
    }
    // MARK: - Accessibility: automated audit and AX reading order (not VoiceOver)

    /// The accessibility element tree as XCTest sees it, in hierarchy order, written beside the
    /// captures so the reading order, names, roles and values can be read on the host.
    func dumpAccessibility(_ name: String) {
        guard let snapshot = try? app.snapshot() else { return }
        var rows: [[String: Any]] = []
        func walk(_ node: XCUIElementSnapshot, depth: Int) {
            let frame = node.frame
            let interesting = !node.label.isEmpty || !node.identifier.isEmpty || [.button, .switch, .textField, .searchField, .link, .staticText, .toggle, .image].contains(node.elementType)
            if interesting {
                rows.append(["depth": depth, "type": node.elementType.rawValue, "id": node.identifier, "label": node.label, "value": node.value.map { String(describing: $0) } ?? "", "enabled": node.isEnabled, "frame": [Int(frame.minX), Int(frame.minY), Int(frame.width), Int(frame.height)]])
            }
            for child in node.children { walk(child, depth: depth + 1) }
        }
        walk(snapshot, depth: 0)
        guard let dir = ProcessInfo.processInfo.environment["INTH_CAPTURE_DIR"], let data = try? JSONSerialization.data(withJSONObject: rows, options: [.prettyPrinted]) else { return }
        try? FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
        try? data.write(to: URL(fileURLWithPath: dir).appendingPathComponent("ax-" + name + ".json"))
    }
    /// Xcode's accessibility audit over the current screen. Every finding is printed and written beside the
    /// captures. The findings the accessibility review traced to the OS rather than the product are
    /// recognised by their geometry (see `documentedAuditFalsePositive`) and tolerated; anything else fails.
    /// `INTH_AUDIT_STRICT=1` in the runner's environment fails on the documented ones too.
    ///
    /// Contrast runs first, in a call of its own; the other categories then run together as they always did.
    /// The contrast category samples the pixels inside each text's frame, and two other categories move the
    /// page under it when they share its call: text-clipped scrolls the list about a thousand points, to a
    /// position that differs between runs, and Dynamic Type switches the content size up and back, which
    /// rebuilds the list. The sample then comes from one scroll position and the frame from another, and text
    /// that measures 5.76:1 or 17:1 on the capture ("IAB partners", 2026-10-30) is reported as failing. Alone
    /// on the settled screen, contrast has only ever reported text under the bar or the footer
    /// (`test20IabPreferencesContrastAuditIsolation`). The other categories keep one call: run after a
    /// separate Dynamic Type pass, text-clipped reports clipping that the combined call never did.
    /// `keepingState` leaves Dynamic Type out where the page's state must survive the audit; it is run on the
    /// other screens of the same test.
    func audit(_ name: String, keepingState: Bool = false) {
        capture(name); dumpAccessibility(name)
        guard #available(iOS 17.0, *) else { return }
        let strict = ProcessInfo.processInfo.environment["INTH_AUDIT_STRICT"] == "1"
        var issues: [String] = [], unexplained: [String] = []
        let rest: XCUIAccessibilityAuditType = keepingState ? .all.subtracting([.contrast, .dynamicType]) : .all.subtracting(.contrast)
        for types in [[.contrast], rest] as [XCUIAccessibilityAuditType] {
            do {
                try app.performAccessibilityAudit(for: types) { issue in
                    let line = "\(issue.auditType.rawValue): \(issue.compactDescription) | \(issue.detailedDescription) [\(issue.element.map { "\($0.elementType.rawValue) id=\($0.identifier) label=\($0.label) frame=\($0.frame)" } ?? "no element")]"
                    issues.append(line)
                    // Returning true tells XCTest the finding is handled; anything else it records as a failure itself.
                    let tolerated = !strict && self.documentedAuditFalsePositive(issue, screen: name)
                    if !tolerated { unexplained.append(line) }
                    return tolerated
                }
            } catch { unexplained.append("audit threw: \(error)") }
        }
        print("ax-audit \(name) issues=\(issues.count) unexplained=\(unexplained.count)")
        for issue in issues { print("ax-audit \(name) \(issue)") }
        if let dir = ProcessInfo.processInfo.environment["INTH_CAPTURE_DIR"] {
            try? issues.joined(separator: "\n").write(to: URL(fileURLWithPath: dir).appendingPathComponent("audit-" + name + ".txt"), atomically: true, encoding: .utf8)
        }
        XCTAssertTrue(unexplained.isEmpty, "accessibility audit \(name): \(unexplained.joined(separator: "; "))")
    }
    /// Findings of the iOS 27 audit that the accessibility review checked against the product and traced to
    /// the OS:
    /// - one hit-region finding on a first layer or Privacy Settings with the provider attribution showing: "Consent by Inth" is
    ///   a labelled, static attribution with no action that the audit treats as a control. Reported with no
    ///   element, so matched by screen and category and counted once
    ///   (`test17FirstLayerHitRegionAuditIsolation` isolates it: hidden attribution, clean audit);
    /// - contrast on text whose frame runs under the navigation bar or the pinned footer (or the keyboard):
    ///   the audit samples the pixels in the frame, and there the bar's blur or the footer's canvas covers
    ///   the text. Matched by the element's frame against the visible window, so a finding on text that is
    ///   wholly visible fails. Every theme pair computes at or above 4.66:1 (`a11y/pixel-contrast.py` in the
    ///   review), and text the audit has flagged while wholly visible measured 5.76:1 and 17:1 on the capture;
    /// - one contrast finding on the AX5 save error with no element: text beyond the window, where there is
    ///   no pinned footer and the frame cannot be read;
    /// - "may be clipped" on the UIKit search field, whose text is whole at the largest size in the captures;
    /// - Dynamic Type "partially unsupported" on the special-feature row of the IAB preferences, which this
    ///   audit starts with just under the footer. The audit steps the content size while the list keeps its
    ///   offset in points, so the rows above grow and push this row off the screen before the larger sizes
    ///   are measured (the run's screen recording shows it). The row uses the same text styles as every
    ///   other row and scales: at the largest size its title is 249pt tall against 20pt
    ///   (`test13LargestTextIabNavigationSearchAndSave` checks this). Started elsewhere, the audit gives
    ///   other rows the same finding: with the list at its top it names "This app" and "Strictly necessary".
    ///   Matched by the element's frame against that row's switch and its Details control.
    /// A finding of another kind, on another screen, or on a visible element fails the test.
    @available(iOS 17.0, *)
    func documentedAuditFalsePositive(_ issue: XCUIAccessibilityAuditIssue, screen: String) -> Bool {
        switch issue.auditType {
        case .hitRegion:
            // Privacy Settings carries the same attribution under its actions.
            let tag = screen.hasSuffix("first-layer") ? "inth.first-layer.branding" : "inth.prefs.branding"
            guard issue.element == nil else { return false }
            auditTolerated[screen, default: 0] += 1
            return auditTolerated[screen]! <= 1 && app.descendants(matching: .any)[tag].firstMatch.exists
        case .contrast:
            guard let element = issue.element else {
                guard screen == "ax-ax5-save-error" else { return false }
                auditTolerated[screen, default: 0] += 1
                return auditTolerated[screen]! <= 1
            }
            let frame = element.frame, window = visibleWindow
            let covered = !window.contains(frame)
            auditTolerated[screen + ".contrast", default: 0] += 1
            // The pixels at the moment of the report, so a finding can be measured on the host (region-contrast.py in the review).
            capture("\(screen)-contrast-\(auditTolerated[screen + ".contrast"]!)")
            print("ax-audit \(screen) contrast element frame=\(frame) window=\(window) \(covered ? "runs under the bar, footer or keyboard" : "wholly visible")")
            return covered
        case .textClipped:
            guard screen == "ax-partner-search-keyboard",
                  let element = issue.element,
                  element.elementType == .textField,
                  element.identifier == "inth.iab.vendors.search" else { return false }
            auditTolerated[screen, default: 0] += 1
            return auditTolerated[screen]! <= 1
        case .dynamicType:
            guard screen == "ax-iab-preferences", let element = issue.element else { return false }
            let row = [app.switches["inth.iab.special-feature.1.switch"], button("inth.iab.special-feature.1.details")]
            return row.contains { $0.exists && $0.frame.insetBy(dx: -1, dy: -1).contains(element.frame) }
        default:
            return false
        }
    }
    var auditTolerated: [String: Int] = [:]
    /// The part of the screen where page content is not covered: below the navigation bar and above the
    /// pinned footer or the keyboard, whichever is present.
    var visibleWindow: CGRect {
        let bar = app.navigationBars.firstMatch
        let top = bar.exists ? bar.frame.maxY : 0
        let keyboard = app.keyboards.firstMatch
        let bottom = keyboard.exists ? keyboard.frame.minY : footer.exists && footer.frame.minY > 150 ? footer.frame.minY : app.frame.maxY
        return CGRect(x: app.frame.minX, y: top, width: app.frame.width, height: bottom - top)
    }
    /// Every element with a label, ordered as the hierarchy exposes it. Used for duplicate and name checks.
    func labelled() -> [(type: XCUIElement.ElementType, id: String, label: String)] {
        guard let snapshot = try? app.snapshot() else { return [] }
        var out: [(XCUIElement.ElementType, String, String)] = []
        func walk(_ node: XCUIElementSnapshot) {
            if !node.label.isEmpty && node.frame.height > 0 { out.append((node.elementType, node.identifier, node.label)) }
            for child in node.children { walk(child) }
        }
        walk(snapshot); return out
    }
    func assertNamed(_ element: XCUIElement, _ what: String) {
        XCTAssertTrue(element.exists, what)
        XCTAssertFalse(element.label.isEmpty, "\(what) has no accessible name")
    }
    func test14AccessibilityAuditAtDefaultSize() {
        continueAfterFailure = true
        launch(fail: true)
        XCTAssertTrue(button("inth.first-layer.customize").waitForExistence(timeout: 10))
        // Names, roles and states on the first layer.
        for id in ["inth.first-layer.reject-all", "inth.first-layer.accept-all", "inth.first-layer.customize"] { assertNamed(button(id), id) }
        XCTAssertEqual(button("inth.first-layer.reject-all").label, "Reject All")
        XCTAssertEqual(button("inth.first-layer.accept-all").label, "Accept All")
        XCTAssertEqual(app.descendants(matching: .any)["inth.first-layer.branding"].firstMatch.label, "Consent by Inth")
        // The brand mark is decorative: the brand name is announced once, not once per image.
        let brandLabels = labelled().filter { $0.label == "Your brand here" }
        XCTAssertEqual(brandLabels.count, 1, "brand announced \(brandLabels.count) times: \(brandLabels)")
        audit("ax-first-layer")
        button("inth.first-layer.customize").tap()
        XCTAssertTrue(button("inth.prefs.save").waitForExistence(timeout: 5))
        let measurement = app.switches["inth.prefs.category.measurement.switch"]
        reveal(measurement)
        // Switch rows carry their category name and state.
        XCTAssertTrue(measurement.label.contains("Analytics"), measurement.label)
        XCTAssertEqual(measurement.value as? String, "0")
        let locked = app.descendants(matching: .any)["inth.prefs.category.necessary.locked"].firstMatch
        XCTAssertTrue(locked.label.contains("Strictly Necessary") && locked.label.contains("Always on"), locked.label)
        // Opened from the first layer, the bar's leading action goes back to it and is named so.
        XCTAssertEqual(button("inth.prefs.cancel").label, "Back")
        audit("ax-preferences")
        measurement.tap()
        button("inth.prefs.save").tap()
        XCTAssertTrue(button("inth.prefs.error.retry").waitForExistence(timeout: 5))
        // The failure is two elements: the message, then the retry button, named Try again.
        let message = app.descendants(matching: .any)["inth.prefs.error"].firstMatch
        XCTAssertEqual(message.label, "Couldn't save your choices. Nothing changed on this device.")
        XCTAssertEqual(button("inth.prefs.error.retry").label, "Try again")
        let messageLabels = labelled().filter { $0.label.contains("Couldn't save your choices") }
        XCTAssertEqual(messageLabels.count, 1, "failure message exposed \(messageLabels.count) times")
        audit("ax-save-error", keepingState: true)
        button("inth.prefs.error.retry").tap()
        XCTAssertTrue(button("fixture.open-preferences").waitForExistence(timeout: 5))
    }
    func test15AccessibilityAuditIabPartnerSearchAndLargestText() {
        continueAfterFailure = true
        launch("fresh-online-iab")
        XCTAssertTrue(button("inth.first-layer.customize").waitForExistence(timeout: 10))
        XCTAssertTrue(button("inth.first-layer.partner-count").label.range(of: #"^\d+ partners$"#, options: .regularExpression) != nil, button("inth.first-layer.partner-count").label)
        audit("ax-iab-first-layer")
        button("inth.first-layer.customize").tap()
        XCTAssertTrue(button("inth.iab.save").waitForExistence(timeout: 5))
        let details = button("inth.iab.purpose.7.details"); reveal(details)
        XCTAssertEqual(details.value as? String, "Collapsed"); details.tap(); XCTAssertEqual(details.value as? String, "Expanded")
        audit("ax-iab-preferences")
        let partners = button("inth.iab.partners"); reveal(partners); partners.tap()
        let search = app.textFields["inth.iab.vendors.search"]
        XCTAssertTrue(search.waitForExistence(timeout: 3))
        XCTAssertEqual(button("inth.iab.vendors.back").label, "Back")
        search.tap(); search.typeText("elan")
        XCTAssertTrue(button("inth.iab.vendors.vendor.1").waitForExistence(timeout: 3))
        XCTAssertTrue(app.keyboards.firstMatch.exists)
        audit("ax-partner-search-keyboard")
        // The audit can give the keyboard up; the result row is reachable either way.
        button("inth.iab.vendors.vendor.1").tap()
        XCTAssertTrue(app.switches["inth.iab.vendor.1.consent"].waitForExistence(timeout: 3))
        audit("ax-partner-details")
        // Largest accessibility size: the audit covers dynamic type and hit regions on the page layout.
        app.terminate(); launch(fail: true, arguments: Self.ax5)
        let customize = button("inth.first-layer.customize")
        XCTAssertTrue(customize.waitForExistence(timeout: 10))
        audit("ax-ax5-first-layer")
        reveal(customize); customize.tap()
        let save = button("inth.prefs.save")
        XCTAssertTrue(save.waitForExistence(timeout: 5)); save.tap()
        let retry = button("inth.prefs.error.retry")
        XCTAssertTrue(retry.waitForExistence(timeout: 5)); waitHittable(retry)
        XCTAssertEqual(retry.label, "Try again")
        audit("ax-ax5-save-error", keepingState: true)
        // Even without the Dynamic Type category the audit has activated this row's retry on iOS 27 at this
        // size (the save completed during the audit). The retry journey at this size is test11's; here the
        // end state only has to be consistent: the retry still works, or the audit's activation saved.
        if retry.exists { retry.tap() } else { print("ax-audit ax-ax5-save-error activated the retry during the audit") }
        XCTAssertTrue(button("fixture.open-preferences").waitForExistence(timeout: 5))
    }
    /// Drives VoiceOver itself when the simulator has it on (INTH_VOICEOVER=1 in the runner's
    /// environment): a single tap moves the cursor, a right flick steps through the reading order,
    /// a double tap activates. The cursor is captured after every step; the caption panel, when
    /// on, prints the spoken text inside the capture.
    func test16VoiceOverReadingOrderAndFocusAfterFailure() throws {
        guard ProcessInfo.processInfo.environment["INTH_VOICEOVER"] == "1" else { throw XCTSkip("VoiceOver is not on for this run") }
        continueAfterFailure = true
        launch(fail: true)
        // VoiceOver's own first-run gestures sheet sits over the app on a fresh simulator; its OK is
        // focused with one tap and activated with a double tap, like any control under VoiceOver.
        let sheetOK = XCUIApplication(bundleIdentifier: "com.apple.springboard").buttons["OK"]
        if sheetOK.waitForExistence(timeout: 3) { capture("vo-gestures-sheet"); sheetOK.tap(); usleep(600_000); sheetOK.doubleTap(); sleep(1) }
        XCTAssertTrue(button("inth.first-layer.customize").waitForExistence(timeout: 10))
        sleep(2); capture("vo-00-first-layer-arrival")
        for step in 1...9 { app.swipeRight(); usleep(900_000); capture(String(format: "vo-%02d-first-layer-next", step)) }
        button("inth.first-layer.customize").tap(); usleep(800_000); capture("vo-10-customize-focused")
        button("inth.first-layer.customize").doubleTap()
        XCTAssertTrue(button("inth.prefs.save").waitForExistence(timeout: 5)); sleep(2); capture("vo-11-preferences-arrival")
        // Arrival is the introduction; the title and Back sit one flick to the left of it.
        app.swipeLeft(); usleep(900_000); capture("vo-11a-preferences-previous")
        app.swipeRight(); usleep(900_000); capture("vo-11b-preferences-back-to-arrival")
        for step in 12...17 { app.swipeRight(); usleep(900_000); capture(String(format: "vo-%02d-preferences-next", step)) }
        button("inth.prefs.save").tap(); usleep(800_000); capture("vo-18-save-focused")
        button("inth.prefs.save").doubleTap()
        XCTAssertTrue(button("inth.prefs.error.retry").waitForExistence(timeout: 5)); sleep(2)
        capture("vo-19-after-failure")
        app.swipeLeft(); usleep(900_000); capture("vo-20-after-failure-previous")
        app.swipeRight(); usleep(900_000); capture("vo-21-after-failure-next")
        app.swipeRight(); usleep(900_000); capture("vo-22-after-failure-next")
        button("inth.prefs.error.retry").tap(); usleep(800_000); capture("vo-23-retry-focused")
        button("inth.prefs.error.retry").doubleTap()
        XCTAssertTrue(button("fixture.open-preferences").waitForExistence(timeout: 5)); sleep(1); capture("vo-24-saved")
    }
    /// VoiceOver on the failure row alone: where the cursor goes when the save is refused, what a finger
    /// on the word Try again meets after the cursor has been moved away from it, and that a double tap
    /// there retries. Captures only; the cursor is read on the host. INTH_VOICEOVER_AX5=1 runs it at the
    /// largest accessibility size, where the row sits in the page and Customize is reached by flicking.
    func test19VoiceOverFailureRowTouch() throws {
        guard ProcessInfo.processInfo.environment["INTH_VOICEOVER"] == "1" else { throw XCTSkip("VoiceOver is not on for this run") }
        continueAfterFailure = true
        let ax5 = ProcessInfo.processInfo.environment["INTH_VOICEOVER_AX5"] == "1"
        launch(fail: true, arguments: ax5 ? Self.ax5 : [])
        let sheetOK = XCUIApplication(bundleIdentifier: "com.apple.springboard").buttons["OK"]
        if sheetOK.waitForExistence(timeout: 3) { sheetOK.tap(); usleep(600_000); sheetOK.doubleTap(); sleep(1) }
        XCTAssertTrue(button("inth.first-layer.customize").waitForExistence(timeout: 10)); sleep(1)
        if ax5 {
            // Customize is at the end of a long page: back to the first element, seven flicks forward, which
            // scrolls it into view, then a double tap on it.
            for _ in 0..<12 { app.swipeLeft(); usleep(500_000) }
            for _ in 0..<7 { app.swipeRight(); usleep(700_000) }
            capture("vo-fail-ax5-customize-focused"); button("inth.first-layer.customize").doubleTap()
        } else {
            button("inth.first-layer.customize").tap(); usleep(800_000); button("inth.first-layer.customize").doubleTap()
        }
        XCTAssertTrue(button("inth.prefs.save").waitForExistence(timeout: 5)); sleep(2); capture("vo-fail-00-preferences-arrival")
        button("inth.prefs.save").tap(); usleep(800_000); button("inth.prefs.save").doubleTap()
        let retry = button("inth.prefs.error.retry")
        XCTAssertTrue(retry.waitForExistence(timeout: 5)); sleep(2); capture("vo-fail-01-after-failure")
        app.swipeRight(); usleep(900_000); capture("vo-fail-02-next")
        app.swipeLeft(); usleep(900_000); capture("vo-fail-03-previous")
        waitHittable(retry); retry.tap(); usleep(900_000); capture("vo-fail-04-try-again-touched")
        retry.doubleTap()
        XCTAssertTrue(button("fixture.open-preferences").waitForExistence(timeout: 5)); sleep(1); capture("vo-fail-05-saved")
    }
    /// VoiceOver on the IAB preferences: arrival after Customize, then the partner page the introduction
    /// opens, where the platform's own push decides the landing. Captures only; the cursor is read on the host.
    func test18VoiceOverIabPreferencesAndPushedPage() throws {
        guard ProcessInfo.processInfo.environment["INTH_VOICEOVER"] == "1" else { throw XCTSkip("VoiceOver is not on for this run") }
        continueAfterFailure = true
        launch("fresh-online-iab")
        let sheetOK = XCUIApplication(bundleIdentifier: "com.apple.springboard").buttons["OK"]
        if sheetOK.waitForExistence(timeout: 3) { sheetOK.tap(); usleep(600_000); sheetOK.doubleTap(); sleep(1) }
        XCTAssertTrue(button("inth.first-layer.customize").waitForExistence(timeout: 10)); sleep(1)
        button("inth.first-layer.customize").tap(); usleep(800_000); button("inth.first-layer.customize").doubleTap()
        XCTAssertTrue(button("inth.iab.save").waitForExistence(timeout: 5)); sleep(2); capture("vo-iab-00-preferences-arrival")
        app.swipeRight(); usleep(900_000); capture("vo-iab-01-preferences-next")
        let partners = button("inth.iab.partner-count")
        partners.tap(); usleep(800_000); capture("vo-iab-02-partner-count-focused")
        partners.doubleTap()
        XCTAssertTrue(app.textFields["inth.iab.vendors.search"].waitForExistence(timeout: 5)); sleep(2); capture("vo-iab-03-partners-arrival")
        for step in 4...6 { app.swipeRight(); usleep(900_000); capture(String(format: "vo-iab-%02d-partners-next", step)) }
        button("inth.iab.vendors.back").tap(); usleep(800_000); button("inth.iab.vendors.back").doubleTap()
        XCTAssertTrue(button("inth.iab.save").waitForExistence(timeout: 5)); sleep(2); capture("vo-iab-07-back-to-preferences")
    }
    /// Diagnostic behind the pass order in `audit`: from the state test15 audits as ax-iab-preferences, runs the
    /// categories one at a time and in combinations, printing the findings and the position of the "IAB
    /// partners" row after each, and capturing the screen when a contrast finding names an element, so the
    /// finding can be measured against pixels. Exploratory, like test17.
    func test20IabPreferencesContrastAuditIsolation() throws {
        guard ProcessInfo.processInfo.environment["INTH_AUDIT_EXPLORATORY"] == "1" else { throw XCTSkip("exploratory audit isolation; set INTH_AUDIT_EXPLORATORY=1") }
        continueAfterFailure = true
        guard #available(iOS 17.0, *) else { return }
        let rounds = Int(ProcessInfo.processInfo.environment["INTH_AUDIT_ROUNDS"] ?? "") ?? 2
        func frames(_ tag: String) {
            let partners = app.staticTexts["IAB partners"].firstMatch
            let row = button("inth.iab.partners")
            print("ax-diag \(tag) footer=\(footer.exists ? "\(footer.frame)" : "none") partnersText=\(partners.exists ? "\(partners.frame)" : "absent") partnersRow=\(row.exists ? "\(row.frame)" : "absent")")
        }
        func run(_ types: XCUIAccessibilityAuditType, _ tag: String) {
            var n = 0
            do {
                try app.performAccessibilityAudit(for: types) { issue in
                    n += 1
                    let desc = issue.element.map { "\($0.elementType.rawValue) id=\($0.identifier) label=\($0.label) frame=\($0.frame)" } ?? "no element"
                    print("ax-diag \(tag) issue \(n): \(issue.auditType.rawValue) \(issue.compactDescription) [\(desc)]")
                    if issue.auditType == .contrast, issue.element != nil { self.capture("\(tag)-issue-\(n)"); frames("\(tag)-issue-\(n)") }
                    return true
                }
            } catch { print("ax-diag \(tag) threw \(error)") }
            print("ax-diag \(tag) issues=\(n)")
            capture("\(tag)-after"); dumpAccessibility("\(tag)-after"); frames("\(tag)-after")
        }
        for round in 1...rounds {
            launch("fresh-online-iab")
            XCTAssertTrue(button("inth.first-layer.customize").waitForExistence(timeout: 10))
            button("inth.first-layer.customize").tap()
            XCTAssertTrue(button("inth.iab.save").waitForExistence(timeout: 5))
            let details = button("inth.iab.purpose.7.details"); reveal(details); details.tap()
            XCTAssertEqual(details.value as? String, "Expanded")
            let r = "diag-r\(round)"
            capture("\(r)-00-before"); dumpAccessibility("\(r)-00-before"); frames("\(r)-00-before")
            let sequence: [(XCUIAccessibilityAuditType, String)] = [
                (.contrast, "contrast"), (.elementDetection, "element-detection"), (.hitRegion, "hit-region"),
                (.sufficientElementDescription, "description"), (.textClipped, "text-clipped"), (.trait, "trait"),
                (.contrast, "contrast-after-static"), (.all.subtracting(.dynamicType), "static-all"),
                (.contrast, "contrast-after-static-all"), (.dynamicType, "dynamic-type"), (.contrast, "contrast-after-dynamic-type")]
            for (index, step) in sequence.enumerated() { run(step.0, String(format: "%@-%02d-%@", r, index + 1, step.1)) }
            app.terminate()
        }
    }
    /// Isolates the first-layer hit-region finding, which Xcode's audit reports without naming the node:
    /// the same audit with the provider attribution hidden, the brand hidden, and both.
    func test17FirstLayerHitRegionAuditIsolation() throws {
        guard ProcessInfo.processInfo.environment["INTH_AUDIT_EXPLORATORY"] == "1" else { throw XCTSkip("exploratory audit isolation; set INTH_AUDIT_EXPLORATORY=1") }
        continueAfterFailure = true
        guard #available(iOS 17.0, *) else { return }
        for (name, branding, identity) in [("stock", nil, nil), ("no-branding", "hidden", nil), ("no-identity", nil, "hidden"), ("neither", "hidden", "hidden")] as [(String, String?, String?)] {
            launch(branding: branding, identity: identity)
            XCTAssertTrue(button("inth.first-layer.customize").waitForExistence(timeout: 10))
            var issues: [String] = []
            do { try app.performAccessibilityAudit(for: [.hitRegion]) { issue in issues.append(issue.detailedDescription); return false } } catch { issues.append("threw: \(error)") }
            print("ax-hit-region \(name) issues=\(issues.count) \(issues)")
            capture("ax-hit-\(name)")
            app.terminate()
        }
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
        app.launchEnvironment = ["INTH_FIXTURE_SCENARIO": "protocol-backend", "INTH_FIXTURE_RESET": "1", "INTH_FIXTURE_BACKEND": "http://localhost:3000/api/self-host"]
        app.launch()
        let reject = app.buttons["inth.first-layer.reject-all"]
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
        app.launchEnvironment["INTH_FIXTURE_RESET"] = "0"
        app.launch()
        XCTAssertTrue(app.buttons["fixture.open-preferences"].waitForExistence(timeout: 10))
        XCTAssertFalse(app.buttons["inth.first-layer.accept-all"].exists)
        XCTAssertEqual(app.staticTexts["fixture.state.explicit-choice"].label, "recorded")
    }
}
