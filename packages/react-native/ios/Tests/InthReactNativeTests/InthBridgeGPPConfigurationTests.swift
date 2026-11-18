@_spi(InthInternal) import InthCore
@_spi(InthInternal) import InthReactNativeBridge
import Foundation
import XCTest

/// The `com.c15t.gpp*` keys are how an RN or Expo app turns GPP on without installing the
/// core itself. These tests read the plist the way the launch hook does.
final class InthBridgeGPPConfigurationTests: XCTestCase {
    private typealias Key = InthBridgeConfiguration.InfoPlistKey

    func testGPPStaysOffWithoutTheSwitch() {
        XCTAssertNil(InthBridgeConfiguration.declaredGPP(in: [:]))
        XCTAssertNil(InthBridgeConfiguration.declaredGPP(in: [Key.gppOptOutCategories: ["marketing"]]))
        XCTAssertNil(InthBridgeConfiguration.declaredGPP(in: [Key.gpp: false]))
    }

    func testAnAbsentOptOutListKeepsMarketing() {
        XCTAssertEqual(InthBridgeConfiguration.declaredGPP(in: [Key.gpp: true])?.optOutCategories, [.marketing])
        XCTAssertEqual(InthBridgeConfiguration.declaredGPPOptOutCategories(nil), [.marketing])
    }

    /// An empty list is a real answer: no category drives the sale, sharing and targeted
    /// advertising opt-outs, as `GPPOptions(optOutCategories: [])` and web's `[]` mean.
    func testAPresentEmptyOptOutListStaysEmpty() {
        let emptyArray: [String: Any] = [Key.gpp: true, Key.gppOptOutCategories: [String]()]
        XCTAssertEqual(InthBridgeConfiguration.declaredGPP(in: emptyArray)?.optOutCategories, [])
        XCTAssertEqual(InthBridgeConfiguration.declaredGPPOptOutCategories(NSArray()), [])
        XCTAssertEqual(InthBridgeConfiguration.declaredGPPOptOutCategories("none"), [])
        XCTAssertEqual(InthBridgeConfiguration.declaredGPPOptOutCategories(" "), [])
    }

    func testAPresentListIsReadAsGiven() {
        XCTAssertEqual(
            InthBridgeConfiguration.declaredGPPOptOutCategories(["marketing", "measurement", "marketing"]),
            [.marketing, .measurement]
        )
        XCTAssertEqual(InthBridgeConfiguration.declaredGPPOptOutCategories("measurement, marketing"), [.measurement, .marketing])
    }

    func testTheOptOutListReachesTheCoreConfiguration() {
        let configuration = InthBridgeConfiguration.from(infoPlist: [
            Key.storageMode: "memory", Key.backendURL: testProjectURL,
            Key.gpp: true, Key.gppOptOutCategories: [String](),
        ])
        XCTAssertEqual(configuration.gpp?.optOutCategories, [])
        XCTAssertEqual(configuration.makeCoreConfiguration()?.gpp?.optOutCategories, [])
    }
}
