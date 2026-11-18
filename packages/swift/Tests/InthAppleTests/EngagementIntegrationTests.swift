@_spi(InthInternal) import InthApple
@_spi(InthInternal) import InthCore
import Foundation
import XCTest

final class EngagementIntegrationTests: XCTestCase {
    // MARK: Braze

    func testBrazeStaysDisabledWhilePendingWithoutWritingAttributes() {
        let calls = VendorCalls()
        braze(ConsentCore(), calls).cancel()
        XCTAssertEqual(calls.all, ["enabled:false", "enabled:false"])
    }

    func testBrazeRecordsConsentOnGrantAndOnlyDisablesOnWithdrawal() async throws {
        let core = try await resolvedCore()
        let calls = VendorCalls()
        let integration = braze(core, calls)
        calls.drain()
        XCTAssertEqual(core.save(.all).status, .committed)
        XCTAssertEqual(calls.drain(), ["enabled:true", "ads:true"])
        XCTAssertEqual(core.save(.necessary).status, .committed)
        XCTAssertEqual(calls.drain(), ["enabled:false"])
        integration.cancel()
        XCTAssertEqual(calls.drain(), ["enabled:false"])
        await core.waitUntilIdle()
    }

    func testBrazeMarketingOnlyChangeWhileRunningRecordsAttributesOnly() async throws {
        let core = try await resolvedCore()
        let calls = VendorCalls()
        let integration = braze(core, calls, category: .experience)
        XCTAssertEqual(core.save(.custom([.experience: true])).status, .committed)
        XCTAssertEqual(calls.drain(), ["enabled:false", "enabled:true", "ads:false"])
        XCTAssertEqual(core.save(.custom([.marketing: true])).status, .committed)
        XCTAssertEqual(calls.drain(), ["ads:true"])
        XCTAssertEqual(core.save(.custom([.marketing: false])).status, .committed)
        XCTAssertEqual(calls.drain(), ["ads:false"], "Braze still runs, so the denial is written")
        XCTAssertEqual(core.save(.custom([.marketing: true])).status, .committed)
        calls.drain()
        integration.sync()
        XCTAssertEqual(calls.drain(), ["enabled:true", "ads:true"])
        integration.cancel()
        await core.waitUntilIdle()
    }

    // MARK: Branch

    func testBranchSetsNoAttributionWhilePendingAndOnCancel() {
        let calls = VendorCalls()
        branch(ConsentCore(), calls).cancel()
        XCTAssertEqual(calls.all, ["level:NONE", "dma:false", "level:NONE", "dma:false"])
    }

    func testBranchRaisesLevelAfterConsentAndLowersItFirst() async throws {
        let core = try await resolvedCore()
        let calls = VendorCalls()
        let integration = branch(core, calls)
        calls.drain()
        XCTAssertEqual(core.save(.all).status, .committed)
        XCTAssertEqual(calls.drain(), ["dma:true", "level:FULL"])
        XCTAssertEqual(core.save(.necessary).status, .committed)
        XCTAssertEqual(calls.drain(), ["level:NONE", "dma:false"])
        integration.cancel()
        await core.waitUntilIdle()
    }

    func testBranchMeasurementAloneIsMinimalAndMarketingOnlyChangeRaisesIt() async throws {
        let core = try await resolvedCore()
        let calls = VendorCalls()
        let integration = branch(core, calls)
        calls.drain()
        XCTAssertEqual(core.save(.custom([.measurement: true])).status, .committed)
        XCTAssertEqual(calls.drain(), ["level:MINIMAL", "dma:false"])
        XCTAssertEqual(core.save(.custom([.marketing: true])).status, .committed)
        XCTAssertEqual(calls.drain(), ["dma:true", "level:FULL"])
        XCTAssertEqual(core.save(.custom([.marketing: false])).status, .committed)
        XCTAssertEqual(calls.drain(), ["level:MINIMAL", "dma:false"])
        integration.cancel()
        await core.waitUntilIdle()
    }

    // MARK: Singular

    func testSingularNeverStartsOrIsCalledWhileConsentWasNeverGranted() async throws {
        let calls = VendorCalls()
        singular(ConsentCore(), calls).cancel()
        let core = try await resolvedCore()
        let integration = singular(core, calls)
        XCTAssertEqual(core.save(.necessary).status, .committed)
        integration.cancel()
        XCTAssertEqual(calls.all, [], "Singular's privacy calls need a started SDK, so none are made")
        await core.waitUntilIdle()
    }

    func testSingularStartsOnceOnTheFirstGrantThenOptsInAndStopsOnWithdrawal() async throws {
        let core = try await resolvedCore()
        let calls = VendorCalls()
        let integration = singular(core, calls)
        XCTAssertEqual(core.save(.all).status, .committed)
        XCTAssertEqual(calls.drain(), ["start:false", "limit:false", "resume", "optIn"])
        XCTAssertEqual(core.save(.necessary).status, .committed)
        XCTAssertEqual(calls.drain(), ["stop", "limit:true"])
        XCTAssertEqual(core.save(.all).status, .committed)
        XCTAssertEqual(calls.drain(), ["limit:false", "resume", "optIn"], "Singular starts once per process")
        integration.cancel()
        XCTAssertEqual(calls.drain(), ["stop", "limit:true"])
        await core.waitUntilIdle()
    }

    func testSingularFailedStartMakesNoTrackingCallAndIsRetried() async throws {
        let core = try await resolvedCore()
        let calls = VendorCalls()
        let outcomes = StartOutcomes([false, true])
        let integration = SingularIntegration(
            core: core,
            start: { calls.append("start:\($0)"); return outcomes.next() },
            limitDataSharing: { calls.append("limit:\($0)") },
            stopAllTracking: { calls.append("stop") },
            resumeAllTracking: { calls.append("resume") },
            trackingOptIn: { calls.append("optIn") }
        )
        XCTAssertEqual(core.save(.all).status, .committed)
        XCTAssertEqual(calls.drain(), ["start:false"], "a start that returns false makes no tracking call")
        integration.sync()
        XCTAssertEqual(calls.drain(), ["start:false", "limit:false", "resume", "optIn"])
        XCTAssertEqual(core.save(.necessary).status, .committed)
        XCTAssertEqual(calls.drain(), ["stop", "limit:true"])
        integration.cancel()
        await core.waitUntilIdle()
    }

    func testSingularWithdrawalAfterAFailedStartStillStops() async throws {
        let core = try await resolvedCore()
        let calls = VendorCalls()
        let integration = SingularIntegration(
            core: core,
            start: { calls.append("start:\($0)"); return false },
            limitDataSharing: { calls.append("limit:\($0)") },
            stopAllTracking: { calls.append("stop") },
            resumeAllTracking: { calls.append("resume") },
            trackingOptIn: { calls.append("optIn") }
        )
        XCTAssertEqual(core.save(.all).status, .committed)
        XCTAssertEqual(core.save(.necessary).status, .committed)
        XCTAssertEqual(calls.all, ["start:false", "stop", "limit:true"])
        integration.cancel()
        await core.waitUntilIdle()
    }

    func testSingularFailedStartAtConstructionIsRetriedAndWithdrawalStillStops() async throws {
        let core = try await resolvedCore()
        XCTAssertEqual(core.save(.all).status, .committed)
        let calls = VendorCalls()
        let outcomes = StartOutcomes([false, true])
        // Launch with stored consent: construction applies it, and the first start fails.
        let integration = SingularIntegration(
            core: core,
            start: { calls.append("start:\($0)"); return outcomes.next() },
            limitDataSharing: { calls.append("limit:\($0)") },
            stopAllTracking: { calls.append("stop") },
            resumeAllTracking: { calls.append("resume") },
            trackingOptIn: { calls.append("optIn") }
        )
        XCTAssertEqual(calls.drain(), ["start:false"], "a failed start makes no tracking call")
        integration.sync()
        XCTAssertEqual(calls.drain(), ["start:false", "limit:false", "resume", "optIn"])
        XCTAssertEqual(core.save(.necessary).status, .committed)
        XCTAssertEqual(calls.drain(), ["stop", "limit:true"])
        integration.cancel()
        await core.waitUntilIdle()
    }

    func testSingularWithdrawalAfterAFailedStartAtConstructionStillStops() async throws {
        let core = try await resolvedCore()
        XCTAssertEqual(core.save(.all).status, .committed)
        let calls = VendorCalls()
        let integration = SingularIntegration(
            core: core,
            start: { calls.append("start:\($0)"); return false },
            limitDataSharing: { calls.append("limit:\($0)") },
            stopAllTracking: { calls.append("stop") },
            resumeAllTracking: { calls.append("resume") },
            trackingOptIn: { calls.append("optIn") }
        )
        XCTAssertEqual(core.save(.necessary).status, .committed)
        XCTAssertEqual(calls.all, ["start:false", "stop", "limit:true"])
        integration.cancel()
        await core.waitUntilIdle()
    }

    func testSingularMarketingOnlyChangeWhileTrackingChangesOnlyTheLimit() async throws {
        let core = try await resolvedCore()
        let calls = VendorCalls()
        let integration = singular(core, calls, category: .measurement)
        XCTAssertEqual(core.save(.custom([.measurement: true])).status, .committed)
        XCTAssertEqual(calls.drain(), ["start:true", "limit:true", "resume", "optIn"])
        XCTAssertEqual(core.save(.custom([.marketing: true])).status, .committed)
        XCTAssertEqual(calls.drain(), ["limit:false"])
        XCTAssertEqual(core.save(.custom([.marketing: false])).status, .committed)
        XCTAssertEqual(calls.drain(), ["limit:true"])
        integration.cancel()
        await core.waitUntilIdle()
    }

    // MARK: Amplitude

    func testAmplitudeOptsOutWhilePendingAndFollowsMeasurementOnly() async throws {
        let pending = VendorCalls()
        AmplitudeIntegration(core: ConsentCore()) { pending.append("optOut:\($0)") }.cancel()
        XCTAssertEqual(pending.all, ["optOut:true", "optOut:true"])

        let core = try await resolvedCore()
        let calls = VendorCalls()
        let integration = AmplitudeIntegration(core: core) { calls.append("optOut:\($0)") }
        XCTAssertEqual(core.save(.custom([.measurement: true])).status, .committed)
        XCTAssertEqual(core.save(.custom([.marketing: true])).status, .committed)
        XCTAssertEqual(core.save(.necessary).status, .committed)
        XCTAssertEqual(calls.drain(), ["optOut:true", "optOut:false", "optOut:true"])
        integration.cancel()
        await core.waitUntilIdle()
    }

    // MARK: Helpers

    private func braze(_ core: ConsentCore, _ calls: VendorCalls, category: OptionalConsentCategory = .marketing) -> BrazeIntegration {
        BrazeIntegration(
            core: core,
            category: category,
            setEnabled: { calls.append("enabled:\($0)") },
            setGoogleAdsConsent: { calls.append("ads:\($0.adUserData)") }
        )
    }

    private func branch(_ core: ConsentCore, _ calls: VendorCalls) -> BranchIntegration {
        BranchIntegration(
            core: core,
            setConsumerProtectionAttributionLevel: { calls.append("level:\($0.rawValue)") },
            setDMAParamsForEEA: { calls.append("dma:\($0.adPersonalization)") }
        )
    }

    private func singular(_ core: ConsentCore, _ calls: VendorCalls, category: OptionalConsentCategory = .marketing) -> SingularIntegration {
        SingularIntegration(
            core: core,
            category: category,
            start: { calls.append("start:\($0)"); return true },
            limitDataSharing: { calls.append("limit:\($0)") },
            stopAllTracking: { calls.append("stop") },
            resumeAllTracking: { calls.append("resume") },
            trackingOptIn: { calls.append("optIn") }
        )
    }
}

/// Start results handed out in order, safe from any thread.
private final class StartOutcomes: @unchecked Sendable {
    private let lock = NSLock()
    private var remaining: [Bool]
    init(_ outcomes: [Bool]) { remaining = outcomes }
    func next() -> Bool {
        lock.lock(); defer { lock.unlock() }
        return remaining.isEmpty ? true : remaining.removeFirst()
    }
}
