import C15tApple
import C15tCore
import Foundation
import XCTest

/// Vendor calls recorded as strings. The next call after `blockNext` blocks until released.
final class BlockingCalls: @unchecked Sendable {
    private let lock = NSLock()
    private var recorded: [String] = []
    private var release: DispatchSemaphore?
    let entered = DispatchSemaphore(value: 0)

    var count: Int { lock.lock(); defer { lock.unlock() }; return recorded.count }

    func since(_ mark: Int) -> [String] {
        lock.lock(); defer { lock.unlock() }
        return Array(recorded.dropFirst(mark))
    }

    func blockNext(_ release: DispatchSemaphore) {
        lock.lock(); defer { lock.unlock() }
        self.release = release
    }

    func call(_ name: String) {
        lock.lock()
        recorded.append(name)
        let gate = release
        release = nil
        lock.unlock()
        guard let gate else { return }
        entered.signal()
        _ = gate.wait(timeout: .now() + 10)
    }
}

/// An object that keeps a helper alive and cancels it.
struct ConnectedHelper {
    let cancel: () -> Void
}

final class WithdrawalPreemptionTests: XCTestCase {
    private let helpers: [(String, (ConsentCore, @escaping @Sendable (String) -> Void) -> ConnectedHelper)] = [
        ("Firebase", { core, r in
            let helper = FirebaseAnalyticsIntegration(
                core: core,
                setConsent: { r("consent:\($0.analyticsStorage):\($0.adStorage)") },
                setCollectionEnabled: { r("collection:\($0)") })
            return ConnectedHelper(cancel: helper.cancel)
        }),
        ("PostHog", { core, r in
            let helper = PostHogIntegration(core: core, optIn: { r("optIn") }, optOut: { r("optOut") })
            return ConnectedHelper(cancel: helper.cancel)
        }),
        ("Mixpanel", { core, r in
            let helper = MixpanelIntegration(core: core, optInTracking: { r("optIn") }, optOutTracking: { r("optOut") })
            return ConnectedHelper(cancel: helper.cancel)
        }),
        ("Sentry Replay", { core, r in
            let helper = SentryReplayIntegration(core: core, start: { r("start") }, stop: { r("stop") })
            return ConnectedHelper(cancel: helper.cancel)
        }),
        ("AdMob", { core, r in
            let helper = AdMobIntegration(core: core) { r("ads:\($0.adStorage)") }
            return ConnectedHelper(cancel: helper.cancel)
        }),
        ("AppsFlyer", { core, r in
            let helper = AppsFlyerIntegration(
                core: core,
                setConsentData: { r("consent:\($0.adUserData)") },
                setStopped: { r("stopped:\($0)") },
                start: { r("start") })
            return ConnectedHelper(cancel: helper.cancel)
        }),
        ("Adjust", { core, r in
            let helper = AdjustIntegration(
                core: core,
                enable: { r("enable") },
                disable: { r("disable") },
                trackThirdPartySharing: { r("sharing:\($0.adUserData)") })
            return ConnectedHelper(cancel: helper.cancel)
        }),
        ("Meta App Events", { core, r in
            let helper = MetaAppEventsIntegration(
                core: core,
                setAutoLogAppEventsEnabled: { r("autoLog:\($0)") },
                setAdvertiserIDCollectionEnabled: { r("advertiserId:\($0)") },
                setLimitedDataUse: { r("ldu:\($0)") })
            return ConnectedHelper(cancel: helper.cancel)
        }),
    ]

    func testWithdrawalAppliesAtOnceWhileAGrantTimeVendorCallIsBlocked() async throws {
        for (name, connect) in helpers {
            // The calls a helper makes for denial, and those only a grant makes.
            let probeCore = try await resolvedCore()
            let probe = BlockingCalls()
            let probeHelper = connect(probeCore) { probe.call($0) }
            let denied = probe.since(0)
            let probeMark = probe.count
            XCTAssertEqual(probeCore.save(.all).status, .committed)
            let grantedOnly = Set(probe.since(probeMark)).subtracting(denied)
            probeHelper.cancel()
            XCTAssertFalse(grantedOnly.isEmpty, "\(name) must make a grant-only call")

            let core = try await resolvedCore()
            let calls = BlockingCalls()
            let helper = connect(core) { calls.call($0) }
            let release = DispatchSemaphore(value: 0)
            calls.blockNext(release)
            let granted = DispatchSemaphore(value: 0)
            DispatchQueue.global().async {
                _ = core.save(.all)
                granted.signal()
            }
            XCTAssertEqual(calls.entered.wait(timeout: .now() + 5), .success, name)

            let mark = calls.count
            let withdrawn = DispatchSemaphore(value: 0)
            DispatchQueue.global().async {
                _ = core.save(.necessary)
                withdrawn.signal()
            }
            XCTAssertEqual(withdrawn.wait(timeout: .now() + 5), .success, "\(name): withdrawal must not wait for the blocked grant")
            let beforeRelease = calls.since(mark)
            XCTAssertEqual(
                Array(beforeRelease.filter { denied.contains($0) }.prefix(denied.count)), denied,
                "\(name): every denial call ran, in order, before the grant returned")

            release.signal()
            XCTAssertEqual(granted.wait(timeout: .now() + 5), .success, name)
            let afterWithdrawal = calls.since(mark)
            XCTAssertEqual(afterWithdrawal.filter { grantedOnly.contains($0) }, [], "\(name): no grant-only call after withdrawal")
            XCTAssertEqual(Array(afterWithdrawal.suffix(denied.count)), denied, "\(name): the late grant is overwritten by denial")
            helper.cancel()
            await core.waitUntilIdle()
        }
    }
}
