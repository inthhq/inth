import C15tApple
import C15tCore
import Foundation
import XCTest

/// `C15tAppleConfiguration.iab` is how a host, including the RN auto-bootstrap, turns IAB TCF on.
final class IABConfigurationTests: XCTestCase {
    private let iab = IABConfiguration(cmpId: 1234, cmpVersion: 7, publisherCountryCode: "DE", consentScreen: 3)

    override func setUp() {
        super.setUp()
        C15tApple.shutdown()
        C15t.resetForTests()
        clearBus()
    }

    override func tearDown() {
        C15tApple.shutdown()
        C15t.resetForTests()
        clearBus()
        super.tearDown()
    }

    func testCoreConfigurationCarriesTheDeclaredIABSettings() throws {
        let configured = C15tAppleConfiguration(transport: .offline, storage: .memory, iab: iab)
        XCTAssertEqual(try configured.makeCoreConfiguration().iab, iab)
        XCTAssertNil(try C15tAppleConfiguration(transport: .offline, storage: .memory).makeCoreConfiguration().iab)
    }

    func testOutOfRangeSettingsRefuseInstallationBeforeAnyCMPIDIsWritten() {
        let invalid = [
            IABConfiguration(cmpId: 0, cmpVersion: 1, publisherCountryCode: "DE"),
            IABConfiguration(cmpId: 1, cmpVersion: 1, publisherCountryCode: "DE"),
            IABConfiguration(cmpId: 4096, cmpVersion: 1, publisherCountryCode: "DE"),
            IABConfiguration(cmpId: 1234, cmpVersion: -1, publisherCountryCode: "DE"),
            IABConfiguration(cmpId: 1234, cmpVersion: 4096, publisherCountryCode: "DE"),
            IABConfiguration(cmpId: 1234, cmpVersion: 1, publisherCountryCode: "de"),
            IABConfiguration(cmpId: 1234, cmpVersion: 1, publisherCountryCode: "DEU"),
            IABConfiguration(cmpId: 1234, cmpVersion: 1, publisherCountryCode: "DE", consentScreen: 64),
        ]
        for configuration in invalid {
            XCTAssertNotNil(C15tApple.iabIssue(configuration), "\(configuration)")
            XCTAssertThrowsError(try C15tApple.install(
                C15tAppleConfiguration(transport: .offline, storage: .memory, iab: configuration)
            ), "\(configuration)") {
                XCTAssertEqual($0 as? C15tAppleInstallationError, .invalidIABConfiguration)
            }
            XCTAssertNil(C15t.current)
            XCTAssertNil(UserDefaults.standard.object(forKey: TcStorageBusKeys.cmpSdkID))
        }
        XCTAssertNil(C15tApple.iabIssue(IABConfiguration(cmpId: 2, cmpVersion: 0, publisherCountryCode: "GB")))
        XCTAssertNil(C15tApple.iabIssue(IABConfiguration(cmpId: 4095, cmpVersion: 4095, publisherCountryCode: "GB")))
    }

    func testInstalledCorePublishesTheCMPIdentityToStandardUserDefaults() async throws {
        // TCF-CHECK: T4
        let core = try C15tApple.install(C15tAppleConfiguration(transport: .disabled, storage: .memory, iab: iab))
        await core.waitUntilIdle()
        let defaults = UserDefaults.standard
        XCTAssertEqual(defaults.object(forKey: TcStorageBusKeys.cmpSdkID) as? Int, 1234)
        XCTAssertEqual(defaults.object(forKey: TcStorageBusKeys.cmpSdkVersion) as? Int, 7)
    }

    func testInstallWithoutIABWritesNoCMPIdentity() async throws {
        let core = try C15tApple.install(C15tAppleConfiguration(transport: .disabled, storage: .memory))
        await core.waitUntilIdle()
        XCTAssertNil(UserDefaults.standard.object(forKey: TcStorageBusKeys.cmpSdkID))
        XCTAssertNil(UserDefaults.standard.object(forKey: TcStorageBusKeys.cmpSdkVersion))
    }

    private func clearBus() {
        for key in TcStorageBusKeys.allNames { UserDefaults.standard.removeObject(forKey: key) }
    }
}
