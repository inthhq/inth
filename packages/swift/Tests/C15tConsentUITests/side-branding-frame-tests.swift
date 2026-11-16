import Foundation
import XCTest
@testable import C15tConsentUI

final class SideBrandingFrameTests: XCTestCase {
    let canvas = CGRect(x: 0, y: 0, width: 466, height: 678)
    let content = CGRect(x: 0, y: 0, width: 382, height: 678)
    let customize = CGRect(x: 24, y: 570, width: 334, height: 44)
    let brand = CGSize(width: 60, height: 34)

    func testAttributionAlignsWithCustomizeInEitherPhysicalColumn() throws {
        let right = try XCTUnwrap(SideBrandingFrame.resolve(canvas: canvas, content: content,
            anchor: customize, size: brand, onLeft: false, reserved: []))
        XCTAssertEqual(right.midY, customize.midY)
        XCTAssertGreaterThan(right.minX, content.maxX)
        let leftContent = content.offsetBy(dx: 84, dy: 0)
        let left = try XCTUnwrap(SideBrandingFrame.resolve(canvas: canvas, content: leftContent,
            anchor: customize.offsetBy(dx: 84, dy: 0), size: brand, onLeft: true, reserved: []))
        XCTAssertEqual(left.midY, right.midY)
        XCTAssertEqual(canvas.maxX - right.maxX, left.minX)
    }

    func testNormalPhoneAndInsufficientSpaceKeepInlineAttribution() {
        for safe in [canvas, CGRect(x: 0, y: 0, width: 460, height: 678), content] {
            let size = safe == content ? CGSize(width: 70, height: 34) : brand
            XCTAssertNil(SideBrandingFrame.resolve(canvas: canvas, content: safe,
                anchor: customize, size: size, onLeft: false, reserved: []))
        }
        XCTAssertNil(SideBrandingFrame.resolve(canvas: canvas, content: content,
            anchor: .zero, size: brand, onLeft: false, reserved: []))
    }

    func testActiveSystemRegionsForceFallbackAndClearRegionsRestorePlacement() throws {
        let frame = try XCTUnwrap(SideBrandingFrame.resolve(canvas: canvas, content: content,
            anchor: customize, size: brand, onLeft: false, reserved: []))
        let clock = CGRect(x: content.maxX, y: 0, width: 84, height: 100)
        XCTAssertNotNil(SideBrandingFrame.resolve(canvas: canvas, content: content,
            anchor: customize, size: brand, onLeft: false, reserved: [clock]))
        XCTAssertNil(SideBrandingFrame.resolve(canvas: canvas, content: content,
            anchor: customize, size: brand, onLeft: false, reserved: [clock, frame]))
        XCTAssertNotNil(SideBrandingFrame.resolve(canvas: canvas, content: content,
            anchor: customize, size: brand, onLeft: false, reserved: []))
    }

    func testContentFromBeforeAWindowResizeCannotPlaceAttributionOutsideTheWindow() {
        let shorterWindow = CGRect(x: 0, y: 0, width: 466, height: 500)
        XCTAssertNil(SideBrandingFrame.resolve(canvas: shorterWindow, content: content,
            anchor: customize, size: brand, onLeft: false, reserved: []))
    }
}
