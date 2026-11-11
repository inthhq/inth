import C15tApple
import C15tCore
import Foundation
import XCTest

/// Vendor calls recorded as strings. `blockNext` blocks the call `skip` calls from now
/// until `release` is signalled, and returns a semaphore signalled when that call starts.
final class BlockingCalls: @unchecked Sendable {
    private let lock = NSLock()
    private var recorded: [String] = []
    private var hold: (skip: Int, release: DispatchSemaphore, entered: DispatchSemaphore)?

    var count: Int { lock.lock(); defer { lock.unlock() }; return recorded.count }

    func since(_ mark: Int) -> [String] {
        lock.lock(); defer { lock.unlock() }
        return Array(recorded.dropFirst(mark))
    }

    @discardableResult
    func blockNext(_ release: DispatchSemaphore, skip: Int = 0) -> DispatchSemaphore {
        lock.lock(); defer { lock.unlock() }
        let entered = DispatchSemaphore(value: 0)
        hold = (skip, release, entered)
        return entered
    }

    func call(_ name: String) {
        lock.lock()
        recorded.append(name)
        guard let current = hold else { lock.unlock(); return }
        if current.skip > 0 {
            hold = (current.skip - 1, current.release, current.entered)
            lock.unlock()
            return
        }
        hold = nil
        lock.unlock()
        current.entered.signal()
        _ = current.release.wait(timeout: .now() + 10)
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
        ("Braze", { core, r in
            let helper = BrazeIntegration(
                core: core,
                setEnabled: { r("enabled:\($0)") },
                setGoogleAdsConsent: { r("ads:\($0.adUserData)") })
            return ConnectedHelper(cancel: helper.cancel)
        }),
        ("Branch", { core, r in
            let helper = BranchIntegration(
                core: core,
                setConsumerProtectionAttributionLevel: { r("level:\($0.rawValue)") },
                setDMAParamsForEEA: { r("dma:\($0.adUserData)") })
            return ConnectedHelper(cancel: helper.cancel)
        }),
        ("Singular", { core, r in
            let helper = SingularIntegration(
                core: core,
                start: { r("start:\($0)"); return true },
                limitDataSharing: { r("limit:\($0)") },
                stopAllTracking: { r("stop") },
                resumeAllTracking: { r("resume") },
                trackingOptIn: { r("optIn") })
            return ConnectedHelper(cancel: helper.cancel)
        }),
        ("Amplitude", { core, r in
            let helper = AmplitudeIntegration(core: core) { r("optOut:\($0)") }
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

    /// The stop calls a withdrawal makes after a grant, the calls a first grant makes,
    /// those only a grant makes, and those only a regrant after withdrawal makes.
    private func profile(
        _ connect: (ConsentCore, @escaping @Sendable (String) -> Void) -> ConnectedHelper
    ) async throws -> (denied: [String], grant: [String], grantedOnly: Set<String>, regrantOnly: Set<String>) {
        let core = try await resolvedCore()
        let probe = BlockingCalls()
        let helper = connect(core) { probe.call($0) }
        let mark = probe.count
        XCTAssertEqual(core.save(.all).status, .committed)
        let grant = probe.since(mark)
        let withdrawalMark = probe.count
        XCTAssertEqual(core.save(.necessary).status, .committed)
        let denied = probe.since(withdrawalMark)
        let regrantMark = probe.count
        XCTAssertEqual(core.save(.all).status, .committed)
        let regrant = probe.since(regrantMark)
        helper.cancel()
        await core.waitUntilIdle()
        return (denied, grant, Set(grant).subtracting(denied), Set(regrant).subtracting(denied))
    }

    func testWithdrawalAppliesAtOnceWhileAnyGrantTimeVendorCallIsBlocked() async throws {
        for (name, connect) in helpers {
            let (denied, grant, grantedOnly, _) = try await profile(connect)
            XCTAssertFalse(grantedOnly.isEmpty, "\(name) must make a grant-only call")
            // Hold each grant-time call in turn, so every enabling call is shown to
            // re-read consent rather than trust a stale grant.
            for held in grant.indices {
                let core = try await resolvedCore()
                let calls = BlockingCalls()
                let helper = connect(core) { calls.call($0) }
                let release = DispatchSemaphore(value: 0)
                let entered = calls.blockNext(release, skip: held)
                let granted = DispatchSemaphore(value: 0)
                DispatchQueue.global().async {
                    _ = core.save(.all)
                    granted.signal()
                }
                XCTAssertEqual(entered.wait(timeout: .now() + 5), .success, "\(name) \(held)")

                let mark = calls.count
                let withdrawn = DispatchSemaphore(value: 0)
                DispatchQueue.global().async {
                    _ = core.save(.necessary)
                    withdrawn.signal()
                }
                XCTAssertEqual(
                    withdrawn.wait(timeout: .now() + 5), .success,
                    "\(name): withdrawal must not wait for grant call \(held)")
                XCTAssertEqual(
                    Array(calls.since(mark).filter { denied.contains($0) }.prefix(denied.count)), denied,
                    "\(name): every denial call ran, in order, while grant call \(held) was blocked")

                release.signal()
                XCTAssertEqual(granted.wait(timeout: .now() + 5), .success, "\(name) \(held)")
                let afterWithdrawal = calls.since(mark)
                XCTAssertEqual(
                    afterWithdrawal.filter { grantedOnly.contains($0) }, [],
                    "\(name): no grant-only call after withdrawal, holding grant call \(held)")
                XCTAssertEqual(
                    Array(afterWithdrawal.suffix(denied.count)), denied,
                    "\(name): the late grant is overwritten by denial")
                helper.cancel()
                await core.waitUntilIdle()
            }
        }
    }

    func testRegrantWaitsForABlockedPreemptingWithdrawalThenApplies() async throws {
        for (name, connect) in helpers {
            let (_, _, grantedOnly, regrantOnly) = try await profile(connect)
            let core = try await resolvedCore()
            let calls = BlockingCalls()
            let helper = connect(core) { calls.call($0) }
            let releaseGrant = DispatchSemaphore(value: 0)
            let grantEntered = calls.blockNext(releaseGrant)
            let granted = DispatchSemaphore(value: 0)
            DispatchQueue.global().async {
                _ = core.save(.all)
                granted.signal()
            }
            XCTAssertEqual(grantEntered.wait(timeout: .now() + 5), .success, name)

            let releaseWithdrawal = DispatchSemaphore(value: 0)
            let withdrawalEntered = calls.blockNext(releaseWithdrawal)
            let withdrawn = DispatchSemaphore(value: 0)
            DispatchQueue.global().async {
                _ = core.save(.necessary)
                withdrawn.signal()
            }
            XCTAssertEqual(withdrawalEntered.wait(timeout: .now() + 5), .success, name)

            releaseGrant.signal()
            XCTAssertEqual(granted.wait(timeout: .now() + 5), .success, name)
            let mark = calls.count
            let regranted = DispatchSemaphore(value: 0)
            DispatchQueue.global().async {
                _ = core.save(.all)
                regranted.signal()
            }
            XCTAssertEqual(
                regranted.wait(timeout: .now() + 5), .success,
                "\(name): the regrant must not wait for the blocked withdrawal")
            XCTAssertEqual(
                calls.since(mark).filter { grantedOnly.contains($0) }, [],
                "\(name): the regrant must not overtake the blocked withdrawal")

            releaseWithdrawal.signal()
            XCTAssertEqual(withdrawn.wait(timeout: .now() + 5), .success, name)
            let afterRelease = calls.since(mark)
            XCTAssertTrue(
                regrantOnly.isSubset(of: Set(afterRelease)),
                "\(name): the regrant applies once the withdrawal returns")
            let lastGrant = afterRelease.lastIndex { grantedOnly.contains($0) } ?? -1
            let lastDenial = afterRelease.lastIndex { !grantedOnly.contains($0) } ?? -1
            XCTAssertGreaterThan(lastGrant, lastDenial, "\(name): the vendor ends granted")
            helper.cancel()
            await core.waitUntilIdle()
        }
    }

    /// Helpers that take a category, connected under measurement. The others read a
    /// fixed set of categories and connect as in ``helpers``.
    private let measured: [String: (ConsentCore, @escaping @Sendable (String) -> Void) -> ConnectedHelper] = [
        "AppsFlyer": { core, r in
            let helper = AppsFlyerIntegration(
                core: core,
                category: .measurement,
                setConsentData: { r("consent:\($0.adUserData)") },
                setStopped: { r("stopped:\($0)") },
                start: { r("start") })
            return ConnectedHelper(cancel: helper.cancel)
        },
        "Adjust": { core, r in
            let helper = AdjustIntegration(
                core: core,
                category: .measurement,
                enable: { r("enable") },
                disable: { r("disable") },
                trackThirdPartySharing: { r("sharing:\($0.adUserData)") })
            return ConnectedHelper(cancel: helper.cancel)
        },
        "Braze": { core, r in
            let helper = BrazeIntegration(
                core: core,
                category: .measurement,
                setEnabled: { r("enabled:\($0)") },
                setGoogleAdsConsent: { r("ads:\($0.adUserData)") })
            return ConnectedHelper(cancel: helper.cancel)
        },
        "Singular": { core, r in
            let helper = SingularIntegration(
                core: core,
                category: .measurement,
                start: { r("start:\($0)"); return true },
                limitDataSharing: { r("limit:\($0)") },
                stopAllTracking: { r("stop") },
                resumeAllTracking: { r("resume") },
                trackingOptIn: { r("optIn") })
            return ConnectedHelper(cancel: helper.cancel)
        },
        "Meta App Events": { core, r in
            let helper = MetaAppEventsIntegration(
                core: core,
                category: .measurement,
                setAutoLogAppEventsEnabled: { r("autoLog:\($0)") },
                setAdvertiserIDCollectionEnabled: { r("advertiserId:\($0)") },
                setLimitedDataUse: { r("ldu:\($0)") })
            return ConnectedHelper(cancel: helper.cancel)
        },
    ]

    func testSecondWithdrawalRunsAtOnceAfterTheFirstPreemptingWithdrawalReturned() async throws {
        for (name, plain) in helpers {
            let connect = measured[name] ?? plain
            // The calls a withdrawal of measurement makes from a measurement-only grant.
            let probeCore = try await resolvedCore()
            let probe = BlockingCalls()
            let probeHelper = connect(probeCore) { probe.call($0) }
            var mark = probe.count
            XCTAssertEqual(probeCore.save(.custom([.measurement: true, .marketing: true])).status, .committed)
            let grant = probe.since(mark)
            XCTAssertEqual(probeCore.save(.custom([.marketing: false])).status, .committed)
            mark = probe.count
            XCTAssertEqual(probeCore.save(.custom([.measurement: false])).status, .committed)
            let stops = probe.since(mark)
            probeHelper.cancel()
            await probeCore.waitUntilIdle()

            // Hold each grant-time call in turn: withdraw marketing, let that
            // withdrawal return, then withdraw measurement.
            for held in grant.indices {
                let core = try await resolvedCore()
                let calls = BlockingCalls()
                let helper = connect(core) { calls.call($0) }
                let release = DispatchSemaphore(value: 0)
                let entered = calls.blockNext(release, skip: held)
                let granted = DispatchSemaphore(value: 0)
                DispatchQueue.global().async {
                    _ = core.save(.custom([.measurement: true, .marketing: true]))
                    granted.signal()
                }
                XCTAssertEqual(entered.wait(timeout: .now() + 5), .success, "\(name) \(held)")

                let first = DispatchSemaphore(value: 0)
                DispatchQueue.global().async {
                    _ = core.save(.custom([.marketing: false]))
                    first.signal()
                }
                XCTAssertEqual(
                    first.wait(timeout: .now() + 5), .success,
                    "\(name): the first withdrawal must not wait for grant call \(held)")
                let secondMark = calls.count
                let second = DispatchSemaphore(value: 0)
                DispatchQueue.global().async {
                    _ = core.save(.custom([.measurement: false]))
                    second.signal()
                }
                XCTAssertEqual(
                    second.wait(timeout: .now() + 5), .success,
                    "\(name): the second withdrawal must not wait for grant call \(held)")
                XCTAssertEqual(
                    Array(calls.since(secondMark).filter { stops.contains($0) }.prefix(stops.count)), stops,
                    "\(name): measurement's stop calls ran while grant call \(held) was blocked")
                release.signal()
                XCTAssertEqual(granted.wait(timeout: .now() + 5), .success, "\(name) \(held)")
                helper.cancel()
                await core.waitUntilIdle()
            }
        }
    }
}
