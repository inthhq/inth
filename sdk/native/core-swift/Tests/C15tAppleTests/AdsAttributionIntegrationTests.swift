@_spi(C15tInternal) import C15tApple
@_spi(C15tInternal) import C15tCore
import Foundation
import XCTest

final class AdsAttributionIntegrationTests: XCTestCase {
    // MARK: AdMob

    func testAdMobDeniesWhilePendingAndOnCancel() {
        let calls = VendorCalls()
        let integration = AdMobIntegration(core: ConsentCore()) { calls.append(ads($0)) }
        integration.cancel()
        XCTAssertEqual(calls.all, ["ads:false", "ads:false"])
    }

    func testAdMobFollowsMarketingAndIgnoresMeasurementOnlyChanges() async throws {
        let core = try await resolvedCore()
        let calls = VendorCalls()
        let integration = AdMobIntegration(core: core) { calls.append(ads($0)) }
        XCTAssertEqual(core.save(.custom([.measurement: true])).status, .committed)
        XCTAssertEqual(core.save(.custom([.marketing: true])).status, .committed)
        XCTAssertEqual(core.save(.custom([.marketing: false])).status, .committed)
        XCTAssertEqual(calls.drain(), ["ads:false", "ads:true", "ads:false"])
        integration.sync()
        XCTAssertEqual(calls.drain(), ["ads:false"])
        integration.cancel()
        await core.waitUntilIdle()
    }

    // MARK: AppsFlyer

    func testAppsFlyerStaysStoppedWhilePendingAndOnCancel() {
        let calls = VendorCalls()
        appsFlyer(ConsentCore(), calls).cancel()
        XCTAssertEqual(calls.all, ["stopped:true", "consent:false", "stopped:true", "consent:false"])
    }

    func testAppsFlyerStartsOnGrantAndStopsFirstOnWithdrawal() async throws {
        let core = try await resolvedCore()
        let calls = VendorCalls()
        let integration = appsFlyer(core, calls)
        calls.drain()
        XCTAssertEqual(core.save(.all).status, .committed)
        XCTAssertEqual(calls.drain(), ["consent:true", "stopped:false", "start"])
        XCTAssertEqual(core.save(.necessary).status, .committed)
        XCTAssertEqual(calls.drain(), ["stopped:true", "consent:false"])
        integration.cancel()
        await core.waitUntilIdle()
    }

    func testAppsFlyerMarketingOnlyChangeWhileRunningDoesNotStartAgain() async throws {
        let core = try await resolvedCore()
        let calls = VendorCalls()
        let integration = appsFlyer(core, calls, category: .measurement)
        XCTAssertEqual(core.save(.custom([.measurement: true])).status, .committed)
        calls.drain()
        XCTAssertEqual(core.save(.custom([.marketing: true])).status, .committed)
        XCTAssertEqual(calls.drain(), ["consent:true"])
        XCTAssertEqual(core.save(.custom([.marketing: false])).status, .committed)
        XCTAssertEqual(calls.drain(), ["consent:false"])
        integration.sync()
        XCTAssertEqual(calls.drain(), ["consent:false", "stopped:false", "start"])
        integration.cancel()
        await core.waitUntilIdle()
    }

    // MARK: Adjust

    func testAdjustStaysDisabledWhilePendingAndOnCancel() {
        let calls = VendorCalls()
        adjust(ConsentCore(), calls).cancel()
        XCTAssertEqual(calls.all, ["disable", "disable"])
    }

    func testAdjustEnablesThenSharesAndWithdrawalOnlyDisables() async throws {
        let core = try await resolvedCore()
        let calls = VendorCalls()
        let integration = adjust(core, calls)
        calls.drain()
        XCTAssertEqual(core.save(.all).status, .committed)
        XCTAssertEqual(calls.drain(), ["enable", "sharing:true"])
        XCTAssertEqual(core.save(.necessary).status, .committed)
        XCTAssertEqual(calls.drain(), ["disable"])
        integration.cancel()
        await core.waitUntilIdle()
    }

    func testAdjustMarketingOnlyChangeWhileRunningSharesAgain() async throws {
        let core = try await resolvedCore()
        let calls = VendorCalls()
        let integration = adjust(core, calls, category: .measurement)
        XCTAssertEqual(core.save(.custom([.measurement: true])).status, .committed)
        XCTAssertEqual(calls.drain(), ["disable", "enable", "sharing:false"])
        XCTAssertEqual(core.save(.custom([.marketing: true])).status, .committed)
        XCTAssertEqual(calls.drain(), ["sharing:true"])
        XCTAssertEqual(core.save(.custom([.marketing: false])).status, .committed)
        XCTAssertEqual(calls.drain(), ["sharing:false"])
        integration.cancel()
        XCTAssertEqual(calls.drain(), ["disable"])
        await core.waitUntilIdle()
    }

    func testAdjustWithdrawalDuringEnableDisablesWithoutSharing() async throws {
        let core = try await resolvedCore()
        let calls = VendorCalls()
        let integration = AdjustIntegration(
            core: core,
            enable: {
                calls.append("enable")
                XCTAssertEqual(core.save(.necessary).status, .committed)
            },
            disable: { calls.append("disable") },
            trackThirdPartySharing: { calls.append("sharing:\($0.adUserData)") }
        )
        calls.drain()
        XCTAssertEqual(core.save(.all).status, .committed)
        XCTAssertEqual(calls.drain(), ["enable", "disable"])
        integration.cancel()
        await core.waitUntilIdle()
    }

    // MARK: Meta

    private let metaDenied = ["autoLog:false", "advertiserId:false", "ldu:true"]
    private let metaGranted = ["ldu:false", "advertiserId:true", "autoLog:true"]

    func testMetaTurnsCollectionOffWhilePendingAndOnCancel() {
        let calls = VendorCalls()
        meta(ConsentCore(), calls).cancel()
        XCTAssertEqual(calls.all, metaDenied + metaDenied)
    }

    func testMetaFollowsMarketingAndIgnoresMeasurementOnlyChanges() async throws {
        let core = try await resolvedCore()
        let calls = VendorCalls()
        let integration = meta(core, calls)
        XCTAssertEqual(calls.drain(), metaDenied)
        XCTAssertEqual(core.save(.custom([.measurement: true])).status, .committed)
        XCTAssertEqual(calls.drain(), [])
        XCTAssertEqual(core.save(.custom([.marketing: true])).status, .committed)
        XCTAssertEqual(calls.drain(), metaGranted)
        XCTAssertEqual(core.save(.custom([.marketing: false])).status, .committed)
        XCTAssertEqual(calls.drain(), metaDenied)
        integration.cancel()
        await core.waitUntilIdle()
    }

    // MARK: Helpers

    private func appsFlyer(_ core: ConsentCore, _ calls: VendorCalls, category: OptionalConsentCategory = .marketing) -> AppsFlyerIntegration {
        AppsFlyerIntegration(
            core: core,
            category: category,
            setConsentData: { calls.append("consent:\($0.adUserData)") },
            setStopped: { calls.append("stopped:\($0)") },
            start: { calls.append("start") }
        )
    }

    private func adjust(_ core: ConsentCore, _ calls: VendorCalls, category: OptionalConsentCategory = .marketing) -> AdjustIntegration {
        AdjustIntegration(
            core: core,
            category: category,
            enable: { calls.append("enable") },
            disable: { calls.append("disable") },
            trackThirdPartySharing: { calls.append("sharing:\($0.adUserData)") }
        )
    }

    private func meta(_ core: ConsentCore, _ calls: VendorCalls) -> MetaAppEventsIntegration {
        MetaAppEventsIntegration(
            core: core,
            setAutoLogAppEventsEnabled: { calls.append("autoLog:\($0)") },
            setAdvertiserIDCollectionEnabled: { calls.append("advertiserId:\($0)") },
            setLimitedDataUse: { calls.append("ldu:\($0)") }
        )
    }
}

private func ads(_ consent: GoogleAdsConsent) -> String {
    XCTAssertTrue(consent == .granted || consent == .denied, "marketing grants all three types together")
    return "ads:\(consent.adStorage)"
}
