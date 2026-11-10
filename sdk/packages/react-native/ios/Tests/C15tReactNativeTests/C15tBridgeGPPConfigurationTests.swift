import C15tCore
import C15tReactNativeBridge
import Foundation
import XCTest

/// The `com.c15t.gpp*` keys are how an RN or Expo app turns GPP on without installing the
/// core itself. These tests read the plist the way the launch hook does.
final class C15tBridgeGPPConfigurationTests: XCTestCase {
    private typealias Key = C15tBridgeConfiguration.InfoPlistKey

    func testGPPStaysOffWithoutTheSwitch() {
        XCTAssertNil(C15tBridgeConfiguration.declaredGPP(in: [:]))
        XCTAssertNil(C15tBridgeConfiguration.declaredGPP(in: [Key.gppOptOutCategories: ["marketing"]]))
        XCTAssertNil(C15tBridgeConfiguration.declaredGPP(in: [Key.gpp: false]))
    }

    func testAnAbsentOptOutListKeepsMarketing() {
        XCTAssertEqual(C15tBridgeConfiguration.declaredGPP(in: [Key.gpp: true])?.optOutCategories, [.marketing])
        XCTAssertEqual(C15tBridgeConfiguration.declaredGPPOptOutCategories(nil), [.marketing])
    }

    /// An empty list is a real answer: no category drives the sale, sharing and targeted
    /// advertising opt-outs, as `GPPOptions(optOutCategories: [])` and web's `[]` mean.
    func testAPresentEmptyOptOutListStaysEmpty() {
        let emptyArray: [String: Any] = [Key.gpp: true, Key.gppOptOutCategories: [String]()]
        XCTAssertEqual(C15tBridgeConfiguration.declaredGPP(in: emptyArray)?.optOutCategories, [])
        XCTAssertEqual(C15tBridgeConfiguration.declaredGPPOptOutCategories(NSArray()), [])
        XCTAssertEqual(C15tBridgeConfiguration.declaredGPPOptOutCategories("none"), [])
        XCTAssertEqual(C15tBridgeConfiguration.declaredGPPOptOutCategories(" "), [])
    }

    func testAPresentListIsReadAsGiven() {
        XCTAssertEqual(
            C15tBridgeConfiguration.declaredGPPOptOutCategories(["marketing", "measurement", "marketing"]),
            [.marketing, .measurement]
        )
        XCTAssertEqual(C15tBridgeConfiguration.declaredGPPOptOutCategories("measurement, marketing"), [.measurement, .marketing])
    }

    func testTheOptOutListReachesTheCoreConfiguration() {
        let configuration = C15tBridgeConfiguration.from(infoPlist: [
            Key.storageMode: "memory", Key.gpp: true, Key.gppOptOutCategories: [String](),
        ])
        XCTAssertEqual(configuration.gpp?.optOutCategories, [])
        XCTAssertEqual(configuration.makeCoreConfiguration()?.gpp?.optOutCategories, [])
    }
}
