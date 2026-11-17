import UIKit
import Vision
import XCTest

final class ReadOnlyLayoutTests: XCTestCase {
    private var app: XCUIApplication!

    override func setUp() { continueAfterFailure = false }

    func testRequiredCategoryKeepsHorizontalStatusAtDefaultText() throws {
        try checkCategory("necessary", title: ["Strictly", "Necessary"], status: "Always on", accessibility: false)
    }

    func testRequiredCategoryWordsRemainReadableAtLargestText() throws {
        try checkCategory("necessary", title: ["Strictly", "Necessary"], status: "Always on", accessibility: true)
    }

    func testRestrictedCategoryPutsStatusAfterItsLabelAtLargestText() throws {
        try checkCategory("marketing", title: ["Marketing", "signal"], status: "Off", accessibility: true, scenario: "gpc-on")
    }

    private func checkCategory(_ category: String, title: [String], status: String, accessibility: Bool, scenario: String = "fresh-online") throws {
        app = XCUIApplication()
        app.launchEnvironment = ["C15T_FIXTURE_SCENARIO": scenario, "C15T_FIXTURE_RESET": "1"]
        app.launchArguments = ["-UIPreferredContentSizeCategoryName", accessibility ? "UICTContentSizeCategoryAccessibilityXXXL" : "UICTContentSizeCategoryL"]
        app.launch()
        let customize = app.buttons[scenario == "gpc-on" ? "fixture.open-preferences" : "inth.first-layer.customize"]
        XCTAssertTrue(customize.waitForExistence(timeout: 10))
        for _ in 0..<12 where !customize.isHittable { app.swipeUp() }
        XCTAssertTrue(customize.isHittable)
        customize.tap()
        let save = app.buttons["inth.prefs.save"]
        XCTAssertTrue(save.waitForExistence(timeout: 5))
        let suffix = scenario == "gpc-on" ? "restricted" : "locked"
        let row = app.descendants(matching: .any)["inth.prefs.category.\(category).\(suffix)"].firstMatch
        for _ in 0..<20 where !row.exists {
            let window = app.frame
            let top = app.navigationBars["Privacy Settings"].frame.maxY
            let bottom = save.frame.minY - 20
            print("gpc-reveal viewport top=\(top) bottom=\(bottom) save=\(save.frame)")
            let start = app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: window.midX, dy: bottom))
            let end = app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: window.midX, dy: (top + bottom) / 2))
            start.press(forDuration: 0.1, thenDragTo: end, withVelocity: .slow, thenHoldForDuration: 0.3)
        }
        XCTAssertTrue(row.waitForExistence(timeout: 5))
        XCTAssertTrue(title.allSatisfy { row.label.contains($0) } && row.label.contains(status), row.label)
        XCTAssertFalse(app.switches["inth.prefs.category.\(category).switch"].exists)

        // The category deliberately combines its accessibility children. Read the rendered words,
        // then express their positions relative to the row across its single scrolling list.
        let words = title + [status]
        var found: [String: CGRect] = [:]
        var offCandidates: [CGRect] = []
        for step in 0..<40 {
            let window = app.frame
            let bar = app.navigationBars.firstMatch
            let visible = CGRect(x: window.minX, y: bar.exists ? bar.frame.maxY : window.minY,
                width: window.width, height: (save.frame.minY - (bar.exists ? bar.frame.maxY : window.minY)))
            let rowFrame = row.frame
            if rowFrame.intersects(visible) {
                let screenshot = app.screenshot()
                let attachment = XCTAttachment(screenshot: screenshot)
                attachment.name = "read-only-\(category)-\(accessibility ? "ax5" : "default")-\(step)"
                attachment.lifetime = .keepAlways
                add(attachment)
                let request = VNRecognizeTextRequest()
                request.recognitionLevel = .accurate
                request.recognitionLanguages = ["en-US"]
                request.usesLanguageCorrection = false
                let image = try XCTUnwrap(screenshot.image.cgImage)
                try VNImageRequestHandler(cgImage: image).perform([request])
                for observation in request.results ?? [] {
                    guard let text = observation.topCandidates(1).first else { continue }
                    print("read-only-ocr \(category) step=\(step) text=\(text.string)")
                    for word in words where found[word] == nil {
                        if word == "Off" && text.string.trimmingCharacters(in: .whitespacesAndNewlines) != "Off" { continue }
                        guard let range = text.string.range(of: "\\b" + NSRegularExpression.escapedPattern(for: word) + "\\b", options: [.regularExpression, .caseInsensitive]),
                              let rectangle = try text.boundingBox(for: range) else { continue }
                        let normalized = rectangle.boundingBox
                        let box = CGRect(x: window.minX + normalized.minX * window.width,
                            y: window.minY + (1 - normalized.maxY) * window.height,
                            width: normalized.width * window.width, height: normalized.height * window.height)
                        if rowFrame.intersection(visible).contains(box) {
                            let relative = box.offsetBy(dx: -rowFrame.minX, dy: -rowFrame.minY)
                            if word == "Off" { offCandidates.append(relative) } else { found[word] = relative }
                        }
                    }
                }
            }
            if let noteEnd = found["signal"], let status = offCandidates.first(where: { $0.minY > noteEnd.maxY }) { found["Off"] = status }
            if words.allSatisfy({ found[$0] != nil }) { break }
            if rowFrame.maxY < visible.minY { break }
            let start = app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: window.midX, dy: visible.maxY - 20))
            let end = app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: window.midX, dy: visible.midY))
            start.press(forDuration: 0.1, thenDragTo: end, withVelocity: .slow, thenHoldForDuration: 0.3)
        }
        for word in words { XCTAssertNotNil(found[word], "The rendered category must contain the complete word or phrase '\(word)'. Found \(found.keys.sorted())") }
        let titleBoxes = try title.map { try XCTUnwrap(found[$0]) }
        let titleFrame = titleBoxes.reduce(CGRect.null) { $0.union($1) }
        let statusFrame = try XCTUnwrap(found[status])
        print("read-only-layout \(category) accessibility=\(accessibility) title=\(titleFrame) status=\(statusFrame)")
        if accessibility {
            XCTAssertGreaterThan(statusFrame.minY, titleFrame.maxY, "At accessibility text sizes, the status must follow the readable title.")
        } else {
            XCTAssertLessThan(statusFrame.minY, titleFrame.maxY, "At default text size, the status remains beside the title.")
            XCTAssertGreaterThan(statusFrame.maxY, titleFrame.minY)
        }
        XCTAssertTrue(save.isHittable, "Save stays reachable while the preferences list scrolls.")
    }
}
