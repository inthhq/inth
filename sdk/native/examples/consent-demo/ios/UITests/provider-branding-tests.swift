import XCTest

extension ConsentJourneyTests {
    private var attribution: XCUIElement {
        app.descendants(matching: .any)["c15t.first-layer.branding"].firstMatch
    }

    private func checkAttribution(_ provider: String, name: String, inline: Bool = false) {
        let customize = button("c15t.first-layer.customize")
        XCTAssertTrue(customize.waitForExistence(timeout: 10))
        let mark = attribution
        XCTAssertTrue(mark.waitForExistence(timeout: 5))
        XCTAssertEqual(app.descendants(matching: .any).matching(identifier: "c15t.first-layer.branding").count, 1)
        XCTAssertEqual(mark.label, "Secured by \(provider)")
        XCTAssertNotEqual(mark.elementType, .button)
        XCTAssertTrue(app.windows.firstMatch.frame.contains(mark.frame))
        let beside = mark.frame.minX >= customize.frame.maxX || mark.frame.maxX <= customize.frame.minX
        if inline {
            XCTAssertFalse(beside, "Accessibility text must retain the full inline attribution")
        } else if let expected = ProcessInfo.processInfo.environment["C15T_EXPECT_SIDE_BRANDING"] {
            XCTAssertEqual(beside, expected == "1", "Unexpected attribution placement")
        }
        if beside {
            XCTAssertEqual(mark.frame.midY, customize.frame.midY, accuracy: 0.5)
        } else {
            XCTAssertGreaterThanOrEqual(mark.frame.minY, customize.frame.maxY)
            XCTAssertLessThanOrEqual(mark.frame.maxX, customize.frame.maxX + 1)
        }
        let reject = button("c15t.first-layer.reject-all"), accept = button("c15t.first-layer.accept-all")
        XCTAssertEqual(reject.frame.width, accept.frame.width, accuracy: 0.5)
        XCTAssertEqual(reject.frame.height, accept.frame.height, accuracy: 0.5)
        XCTAssertTrue(customize.isHittable)
        print("branding-frame \(name) window=\(app.windows.firstMatch.frame) attribution=\(mark.frame) customize=\(customize.frame)")
        capture(name)
    }

    func test22ProviderAttributionAdaptsToWindow() {
        for provider in ["c15t", "inth"] {
            for appearance in ["light", "dark"] {
                launch(appearance: appearance, branding: provider)
                checkAttribution(provider == "inth" ? "Inth" : "c15t", name: "ios-branding-\(provider)-\(appearance)")
                XCTAssertTrue(button("c15t.first-layer.accept-all").isHittable)
                XCTAssertTrue(button("c15t.first-layer.reject-all").isHittable)
                button("c15t.first-layer.customize").tap()
                XCTAssertTrue(button("c15t.prefs.save").waitForExistence(timeout: 5))
                XCTAssertFalse(attribution.exists)
                app.terminate()
            }
        }
    }

    func test23AttributionKeepsInlineLayoutAtAccessibilityTextSizes() {
        launch(arguments: Self.ax5)
        XCTAssertTrue(button("c15t.first-layer.customize").waitForExistence(timeout: 10))
        reveal(attribution)
        checkAttribution("c15t", name: "ios-branding-accessibility", inline: true)
    }

    func test24AttributionAdaptsToRightToLeftLayout() {
        launch(branding: "inth", arguments: ["-AppleLanguages", "(ar)", "-AppleLocale", "ar_SA",
                                           "-NSForceRightToLeftWritingDirection", "YES"])
        checkAttribution("Inth", name: "ios-branding-rtl")
    }
}
