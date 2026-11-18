import UIKit
import Vision
import XCTest

extension ConsentJourneyTests {
    private var attribution: XCUIElement {
        app.descendants(matching: .any)["inth.first-layer.branding"].firstMatch
    }

    private func revealAttribution() {
        let window = app.windows.firstMatch
        for _ in 0..<20 {
            if attribution.exists && attribution.isHittable,
               window.frame.insetBy(dx: 0, dy: 40).contains(attribution.frame) { return }
            let start = window.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.8))
            let end = window.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.3))
            start.press(forDuration: 0.1, thenDragTo: end, withVelocity: .slow, thenHoldForDuration: 0.3)
        }
        XCTFail("The inline footer attribution must be reachable in the visible window.")
    }

    private func checkRenderedAttributionCount(_ count: Int, name: String) throws {
        // Count rendered text too: an overlay can draw a duplicate absent from the AX tree.
        var renderedMarks: [[VNRecognizedTextObservation]] = []
        // A device can have more than one display. Find the app by its visible control,
        // so a blank inactive main screen cannot pass the hidden-branding check.
        for (index, screen) in XCUIScreen.screens.enumerated() {
            let image = screen.screenshot().image
            let screenshot = UIGraphicsImageRenderer(size: image.size).image { _ in image.draw(at: .zero) }
            let request = VNRecognizeTextRequest()
            request.recognitionLevel = .accurate
            request.recognitionLanguages = ["en-US"]
            request.usesLanguageCorrection = false
            request.usesCPUOnly = true
            try VNImageRequestHandler(cgImage: XCTUnwrap(screenshot.cgImage)).perform([request])
            let text = (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }
            print("rendered-branding \(name) screen=\(index) window=\(app.windows.firstMatch.frame) text=\(text)")
            guard text.contains(where: { $0.localizedCaseInsensitiveContains("Customize") }) else { continue }
            let attachment = XCTAttachment(image: screenshot)
            attachment.name = name + "-rendered"
            attachment.lifetime = .keepAlways
            add(attachment)
            renderedMarks.append((request.results ?? []).filter {
                $0.topCandidates(1).first?.string.filter { !$0.isWhitespace }
                    .localizedCaseInsensitiveContains("securedby") == true
            })
        }
        XCTAssertEqual(renderedMarks.count, 1, "The capture must show the app's Customize control on exactly one display.")
        let marks = try XCTUnwrap(renderedMarks.first)
        XCTAssertEqual(marks.count, count, "Exactly \(count) footer attributions must be visible in the rendered window.")
    }

    private func checkAttribution(_ provider: String, name: String, inline: Bool = false) throws {
        let customize = button("inth.first-layer.customize")
        XCTAssertTrue(customize.waitForExistence(timeout: 10))
        let mark = attribution
        XCTAssertTrue(mark.waitForExistence(timeout: 5))
        try checkRenderedAttributionCount(1, name: name)
        XCTAssertEqual(app.descendants(matching: .any).matching(identifier: "inth.first-layer.branding").count, 1)
        XCTAssertEqual(mark.label, "Secured by \(provider)")
        XCTAssertNotEqual(mark.elementType, .button)
        XCTAssertTrue(app.windows.firstMatch.frame.contains(mark.frame))
        let beside = mark.frame.minX >= customize.frame.maxX || mark.frame.maxX <= customize.frame.minX
        if inline {
            XCTAssertFalse(beside, "This configuration must retain the full inline attribution")
        } else if let expected = ProcessInfo.processInfo.environment["C15T_EXPECT_SIDE_BRANDING"] {
            XCTAssertEqual(beside, expected == "1", "Unexpected attribution placement")
        }
        if beside {
            XCTAssertEqual(mark.frame.midY, customize.frame.midY, accuracy: 0.5)
        } else {
            XCTAssertGreaterThanOrEqual(mark.frame.minY, customize.frame.maxY)
            XCTAssertLessThanOrEqual(mark.frame.maxX, customize.frame.maxX + 1)
        }
        let reject = button("inth.first-layer.reject-all"), accept = button("inth.first-layer.accept-all")
        XCTAssertEqual(reject.frame.width, accept.frame.width, accuracy: 0.5)
        XCTAssertEqual(reject.frame.height, accept.frame.height, accuracy: 0.5)
        XCTAssertTrue(customize.isHittable)
        print("branding-frame \(name) window=\(app.windows.firstMatch.frame) attribution=\(mark.frame) customize=\(customize.frame)")
        capture(name)
    }

    func test22ProviderAttributionAdaptsToWindow() throws {
        for provider in ["c15t", "inth"] {
            for appearance in ["light", "dark"] {
                launch(appearance: appearance, branding: provider)
                try checkAttribution(provider == "inth" ? "Inth" : "c15t", name: "ios-branding-\(provider)-\(appearance)")
                XCTAssertTrue(button("inth.first-layer.accept-all").isHittable)
                XCTAssertTrue(button("inth.first-layer.reject-all").isHittable)
                button("inth.first-layer.customize").tap()
                XCTAssertTrue(button("inth.prefs.save").waitForExistence(timeout: 5))
                XCTAssertFalse(attribution.exists)
                app.terminate()
            }
        }
    }

    func test23AttributionKeepsInlineLayoutAtAccessibilityTextSizes() throws {
        for provider in ["c15t", "inth"] {
            launch(branding: provider, arguments: Self.ax5)
            XCTAssertTrue(button("inth.first-layer.customize").waitForExistence(timeout: 10))
            revealAttribution()
            try checkAttribution(provider == "inth" ? "Inth" : "c15t", name: "ios-branding-accessibility-\(provider)", inline: true)
            app.terminate()
        }
    }

    func test24AttributionAdaptsToRightToLeftLayout() throws {
        launch(branding: "inth", arguments: ["-AppleLanguages", "(ar)", "-AppleLocale", "ar_SA",
                                           "-NSForceRightToLeftWritingDirection", "YES"])
        try checkAttribution("Inth", name: "ios-branding-rtl")
    }

    func test25HiddenAttributionDoesNotRender() throws {
        launch(branding: "hidden")
        XCTAssertTrue(button("inth.first-layer.customize").waitForExistence(timeout: 10))
        try checkRenderedAttributionCount(0, name: "ios-branding-hidden")
        XCTAssertFalse(attribution.exists)
        XCTAssertTrue(app.staticTexts["inth.first-layer.brand"].exists)
    }

    func test26AttributionStaysExclusiveWhenReturningFromPreferences() throws {
        launch(branding: "inth")
        try checkAttribution("Inth", name: "ios-branding-before-preferences")
        button("inth.first-layer.customize").tap()
        let back = button("inth.prefs.cancel")
        XCTAssertTrue(back.waitForExistence(timeout: 5))
        back.tap()
        try checkAttribution("Inth", name: "ios-branding-after-preferences")
    }

    func test27AttributionStaysExclusiveAcrossLiveDisplayTransitions() throws {
        guard let targets = ProcessInfo.processInfo.environment["C15T_LIVE_DISPLAY_TRANSITIONS"] else {
            throw XCTSkip("Requires two fold/unfold transitions through the device's supported controls.")
        }
        let widths = targets.split(separator: ",").compactMap { Double($0) }
        XCTAssertEqual(widths.count, 2, "Provide the two settled viewport widths, such as 466,951.")
        guard widths.count == 2 else { return }
        launch(branding: "inth")
        try checkAttribution("Inth", name: "ios-branding-before-display-transition")
        let initialSize = app.windows.firstMatch.frame.size
        XCTAssertGreaterThan(abs(widths[0] - Double(initialSize.width)), 100)
        XCTAssertEqual(widths[1], Double(initialSize.width), accuracy: 1)
        for phase in 1...2 {
            let previousSize = app.windows.firstMatch.frame.size
            let expectedWidth = widths[phase - 1]
            print("branding-transition-ready phase=\(phase) window=\(previousSize) expectedWidth=\(expectedWidth)")
            let resized = NSPredicate { _, _ in
                let size = self.app.windows.firstMatch.frame.size
                return abs(size.width - expectedWidth) < 1
            }
            let changed = XCTNSPredicateExpectation(predicate: resized, object: app)
            XCTAssertEqual(XCTWaiter.wait(for: [changed], timeout: 120), .completed,
                           "Change the display pose without foregrounding or relaunching the app.")
            try checkAttribution("Inth", name: "ios-branding-after-display-transition-\(phase)")
        }
        XCTAssertEqual(app.windows.firstMatch.frame.width, initialSize.width, accuracy: 1)
        XCTAssertEqual(app.windows.firstMatch.frame.height, initialSize.height, accuracy: 1)
    }

    func test28WideProviderRetainsInlineAttribution() throws {
        let rtl = ["-AppleLanguages", "(ar)", "-AppleLocale", "ar_SA",
                   "-NSForceRightToLeftWritingDirection", "YES"]
        for arguments in [[], rtl] {
            launch(branding: "wide-custom", arguments: arguments)
            try checkAttribution("Example Privacy Platform",
                                 name: arguments.isEmpty ? "ios-branding-wide-provider" : "ios-branding-wide-provider-rtl",
                                 inline: true)
            let customize = button("inth.first-layer.customize").frame
            if arguments.isEmpty {
                XCTAssertEqual(attribution.frame.maxX, customize.maxX, accuracy: 0.5)
            } else {
                XCTAssertEqual(attribution.frame.minX, customize.minX, accuracy: 0.5)
            }
            app.terminate()
        }
    }
}
