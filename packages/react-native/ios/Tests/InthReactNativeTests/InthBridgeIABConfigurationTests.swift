@_spi(InthInternal) import InthCore
@_spi(InthInternal) import InthReactNativeBridge
import Foundation
import XCTest

/// The `com.c15t.iab.*` keys are how an RN or Expo app turns IAB TCF on without
/// installing the core itself. These tests read the plist the way the launch hook does.
final class InthBridgeIABConfigurationTests: XCTestCase {
    private typealias Key = InthBridgeConfiguration.InfoPlistKey

    override func setUp() {
        super.setUp()
        Inth.resetForTests()
        clearBus()
    }

    override func tearDown() {
        Inth.resetForTests()
        clearBus()
        super.tearDown()
    }

    func testAPlistWithoutIABKeysLeavesIABOff() {
        let plist: [String: Any] = [Key.storageMode: "memory", Key.backendURL: testProjectURL]
        let configuration = InthBridgeConfiguration.from(infoPlist: plist)
        XCTAssertNil(configuration.iab)
        XCTAssertNil(InthBridgeConfiguration.iabIssue(in: plist))
        let core = configuration.makeCoreConfiguration()
        XCTAssertNotNil(core)
        XCTAssertNil(core?.iab)
    }

    func testIABConsentLanguageFollowsTheResolvedLanguage() {
        func language(_ tag: String) -> String? {
            InthBridgeConfiguration.from(infoPlist: [
                Key.storageMode: "memory", Key.language: tag,
                Key.iabCmpId: NSNumber(value: 1234), Key.iabCmpVersion: NSNumber(value: 7),
                Key.iabPublisherCountryCode: "DE",
            ]).iab?.consentLanguage
        }
        // The language the backend serves disclosures in is the one the TC String declares.
        XCTAssertEqual(language("de-AT"), "DE")
        XCTAssertEqual(language("pt_BR"), "PT")
        // TCF carries two letters only, so a longer code keeps the default.
        XCTAssertEqual(language("fil"), "EN")
    }

    func testDeclaredIABSettingsReachTheCoreConfiguration() {
        let configuration = InthBridgeConfiguration.from(infoPlist: [
            Key.storageMode: "memory",
            Key.backendURL: testProjectURL,
            Key.iabCmpId: NSNumber(value: 1234),
            Key.iabCmpVersion: NSNumber(value: 7),
            Key.iabPublisherCountryCode: "de",
            Key.iabConsentScreen: "3",
        ])
        let expected = IABConfiguration(cmpId: 1234, cmpVersion: 7, publisherCountryCode: "DE", consentScreen: 3)
        XCTAssertEqual(configuration.iab, expected)
        XCTAssertEqual(configuration.makeCoreConfiguration()?.iab, expected)
    }

    func testTheConsentScreenDefaultsToTheCoreDefault() {
        let configuration = InthBridgeConfiguration.from(infoPlist: [
            Key.iabCmpId: "1234", Key.iabCmpVersion: "0", Key.iabPublisherCountryCode: "GB",
        ])
        XCTAssertEqual(configuration.iab?.consentScreen, 1)
        XCTAssertEqual(configuration.iab?.cmpVersion, 0)
    }

    func testAnIncompleteOrOutOfRangeDeclarationIsRefusedWhole() {
        let complete: [String: Any] = [
            Key.iabCmpId: 1234, Key.iabCmpVersion: 7, Key.iabPublisherCountryCode: "DE",
        ]
        var cases: [[String: Any]] = []
        for key in [Key.iabCmpId, Key.iabCmpVersion, Key.iabPublisherCountryCode] {
            var missing = complete
            missing[key] = nil
            cases.append(missing)
        }
        cases.append([Key.iabConsentScreen: 1])
        for (key, value) in [
            (Key.iabCmpId, 0 as Any), (Key.iabCmpId, 1), (Key.iabCmpId, 4096), (Key.iabCmpId, "abc"),
            (Key.iabCmpId, true), (Key.iabCmpId, 12.5),
            (Key.iabCmpVersion, -1), (Key.iabCmpVersion, 4096),
            (Key.iabPublisherCountryCode, "DEU"), (Key.iabPublisherCountryCode, "D1"),
            (Key.iabConsentScreen, 64),
        ] {
            var invalid = complete
            invalid[key] = value
            cases.append(invalid)
        }
        for plist in cases {
            XCTAssertNil(InthBridgeConfiguration.from(infoPlist: plist).iab, "\(plist)")
            let issue = InthBridgeConfiguration.iabIssue(in: plist)
            XCTAssertEqual(issue?.code, "INTH_CONFIGURATION_IAB_INVALID", "\(plist)")
        }
    }

    func testARefusedDeclarationStartsTheCoreWithoutACMPID() {
        XCTAssertTrue(startWithoutNetwork(infoPlist: [
            Key.storageMode: "memory",
            Key.backendURL: testProjectURL,
            Key.iabCmpId: 1,
            Key.iabCmpVersion: 7,
            Key.iabPublisherCountryCode: "DE",
        ]))
        XCTAssertNotNil(Inth.current, "category consent still starts")
        XCTAssertNil(UserDefaults.standard.object(forKey: TcStorageBusKeys.cmpSdkID))
    }

    func testTheLaunchHookPublishesTheDeclaredCMPIdentity() {
        // TCF-CHECK: T4
        XCTAssertTrue(startWithoutNetwork(infoPlist: [
            Key.storageMode: "memory",
            Key.backendURL: testProjectURL,
            Key.iabCmpId: 1234,
            Key.iabCmpVersion: 7,
            Key.iabPublisherCountryCode: "DE",
        ]))
        XCTAssertEqual(UserDefaults.standard.object(forKey: TcStorageBusKeys.cmpSdkID) as? Int, 1234)
        XCTAssertEqual(UserDefaults.standard.object(forKey: TcStorageBusKeys.cmpSdkVersion) as? Int, 7)
    }

    private func clearBus() {
        for key in TcStorageBusKeys.allNames { UserDefaults.standard.removeObject(forKey: key) }
    }
}
