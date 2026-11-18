import UIKit
import Vision
import XCTest

final class PreferencesAlignmentTests: XCTestCase {
    private var app: XCUIApplication!

    override func setUp() { continueAfterFailure = false }

    func testCategoryIntroductionUsesCardGrid() throws {
        try checkPreferences(iab: false, accessibility: false)
    }

    func testIABIntroductionUsesCardGrid() throws {
        try checkPreferences(iab: true, accessibility: false)
    }

    func testCategoryAccessibilityRowsUseCardGrid() throws {
        try checkPreferences(iab: false, accessibility: true)
    }

    func testIABAccessibilityRowsUseCardGrid() throws {
        try checkPreferences(iab: true, accessibility: true)
    }

    private func checkPreferences(iab: Bool, accessibility: Bool) throws {
        app = XCUIApplication()
        app.launchEnvironment = [
            "C15T_FIXTURE_SCENARIO": iab ? "iab-fresh" : "fresh-online",
            "C15T_FIXTURE_RESET": "1",
        ]
        app.launchArguments = ["-UIPreferredContentSizeCategoryName",
            accessibility ? "UICTContentSizeCategoryAccessibilityXXXL" : "UICTContentSizeCategoryL"]
        app.launch()
        let customize = app.buttons["inth.first-layer.customize"]
        XCTAssertTrue(customize.waitForExistence(timeout: 10))
        reveal(customize)
        customize.tap()

        let prefix = iab ? "c15t.iab" : "inth.prefs"
        let save = app.buttons[prefix + ".save"]
        for presentation in ["fullscreen", "standing"] {
            XCTAssertTrue(save.waitForExistence(timeout: 5))
            let intro = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@",
                iab ? "We and our partners store" : "Choose which kinds of data use")).firstMatch
            XCTAssertTrue(intro.waitForExistence(timeout: 5))
            let screenshot = renderedScreenshot()
            capture("\(iab ? "iab" : "category")-\(accessibility ? "ax5" : "default")-\(presentation)-intro", screenshot: screenshot)
            // SwiftUI exposes the whole clear cell as the text's accessibility frame,
            // including its insets. Measure the rendered first word to catch indentation.
            let introFrame = try renderedWord(iab ? "We" : "Choose", within: intro.frame, screenshot: screenshot)

            // A standing sheet leaves the host list in the hierarchy. Identify the actual
            // preferences card by its required category, never by the first cell in the app.
            let card = app.cells.containing(.any, identifier: "inth.prefs.category.necessary.locked").firstMatch
            reveal(card, save: save)
            XCTAssertTrue(card.exists)
            let cardFrame = card.frame
            print("preferences-grid \(prefix) \(presentation) ax5=\(accessibility) intro=\(introFrame) card=\(cardFrame)")
            capture("\(iab ? "iab" : "category")-\(accessibility ? "ax5" : "default")-\(presentation)-card")
            XCTAssertEqual(introFrame.minX, cardFrame.minX, accuracy: 3,
                "The unboxed introduction must align with the card's outer leading edge.")

            let reject = app.buttons[prefix + ".reject-all"]
            let accept = app.buttons[prefix + ".accept-all"]
            if accessibility { reveal(reject, save: save, backwards: true) }
            let rejectFrame = reject.frame
            XCTAssertTrue(reject.isEnabled && reject.isHittable)
            if accessibility { reveal(accept, save: save) }
            let acceptFrame = accept.frame
            XCTAssertTrue(accept.isEnabled && accept.isHittable)
            XCTAssertEqual(rejectFrame.width, acceptFrame.width, accuracy: 1)
            XCTAssertEqual(rejectFrame.height, acceptFrame.height, accuracy: 1)
            if accessibility {
                let decisions = rejectFrame.union(acceptFrame)
                XCTAssertEqual(decisions.minX, cardFrame.minX, accuracy: 1)
                XCTAssertEqual(decisions.maxX, cardFrame.maxX, accuracy: 1)
            }
            print("preferences-decisions \(prefix) \(presentation) reject=\(rejectFrame) accept=\(acceptFrame) save=\(save.frame)")
            capture("\(iab ? "iab" : "category")-\(accessibility ? "ax5" : "default")-\(presentation)-decisions")
            XCTAssertTrue(save.isHittable, "Save stays reachable while preferences scroll.")
            save.tap()
            let open = app.buttons["fixture.open-preferences"]
            XCTAssertTrue(open.waitForExistence(timeout: 5))
            if presentation == "fullscreen" {
                reveal(open)
                open.tap()
            }
        }
    }

    private func reveal(_ element: XCUIElement, save: XCUIElement? = nil, backwards: Bool = false) {
        for _ in 0..<30 {
            let top = app.navigationBars["Privacy Settings"].exists
                ? app.navigationBars["Privacy Settings"].frame.maxY + 8 : app.frame.minY + 100
            let bottom: CGFloat
            if let save, save.exists {
                let footer = app.otherElements["inth.footer"]
                bottom = footer.exists ? footer.frame.minY - 12 : save.frame.minY - 20
            } else { bottom = app.frame.maxY - 40 }
            let visible = element.exists && element.frame.height > 0
            if visible && element.isHittable && element.frame.midY > top && element.frame.midY < bottom { return }
            let delta = visible ? element.frame.midY - (top + bottom) / 2 : backwards ? -(bottom - top) : bottom - top
            let distance = min(abs(delta), bottom - top - 40)
            let from = delta < 0 ? top + 20 : bottom - 20
            let to = delta < 0 ? from + distance : from - distance
            let start = app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: app.frame.midX, dy: from))
            let end = app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: app.frame.midX, dy: to))
            start.press(forDuration: 0.1, thenDragTo: end, withVelocity: .slow, thenHoldForDuration: 0.3)
        }
        XCTFail("Preferences element was not reachable: \(element)")
    }

    private func renderedWord(_ word: String, within row: CGRect, screenshot: UIImage) throws -> CGRect {
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.recognitionLanguages = ["en-US"]
        request.usesLanguageCorrection = false
        request.usesCPUOnly = true
        try VNImageRequestHandler(cgImage: XCTUnwrap(screenshot.cgImage)).perform([request])
        for observation in request.results ?? [] {
            guard let text = observation.topCandidates(1).first,
                  text.string.hasPrefix(word),
                  let range = text.string.range(of: word),
                  let box = try text.boundingBox(for: range)?.boundingBox else { continue }
            let frame = CGRect(x: app.frame.minX + box.minX * app.frame.width,
                y: app.frame.minY + (1 - box.maxY) * app.frame.height,
                width: box.width * app.frame.width, height: box.height * app.frame.height)
            if row.insetBy(dx: -3, dy: -3).contains(frame) { return frame }
        }
        XCTFail("The rendered introduction must contain '\(word)' inside \(row).")
        throw NSError(domain: "PreferencesAlignmentTests", code: 1)
    }

    private func renderedScreenshot() -> UIImage {
        // App screenshots crop a landscape window before applying its orientation.
        // Normalize a full-screen capture so pixels and element frames share coordinates.
        let image = XCUIScreen.main.screenshot().image
        return UIGraphicsImageRenderer(size: image.size).image { _ in image.draw(at: .zero) }
    }

    private func capture(_ name: String, screenshot: UIImage? = nil) {
        let attachment = XCTAttachment(image: screenshot ?? renderedScreenshot())
        attachment.name = "preferences-grid-" + name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
