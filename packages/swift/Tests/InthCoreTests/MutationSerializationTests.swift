import Foundation
import XCTest

@_spi(InthInternal) @testable import InthCore

final class MutationSerializationTests: XCTestCase {
    final class BlockingStore: ConsentStore, @unchecked Sendable {
        let underlying = InMemoryStore()
        let entered = DispatchSemaphore(value: 0)
        let resume = DispatchSemaphore(value: 0)
        private let guardLock = NSLock()
        private var armed = false
        var refuse = false
        var readCallback: (() -> Void)?

        func arm() { guardLock.lock(); armed = true; guardLock.unlock() }
        func data(for key: String) -> Data? { underlying.data(for: key) }
        func set(_ data: Data?, for key: String) -> Bool {
            guardLock.lock()
            let block = armed && key == StorageKey.snapshot
            if block { armed = false }
            guardLock.unlock()
            if block {
                readCallback?()
                entered.signal()
                _ = resume.wait(timeout: .now() + 10)
                if refuse { return false }
            }
            return underlying.set(data, for: key)
        }
    }

    func testBlockedCommitKeepsHotReadsAvailableAndSerializesEveryMutation() async throws {
        let vector = try IABCommitTests().fixture()
        for operation in ["save", "identify", "logout", "reset", "overrides", "dismiss", "refresh", "hydrate"] {
            let store = BlockingStore()
            let http = StubHTTP()
            http.setSavesFail(true)
            let core = try await IABDeliveryTests().boot(vector, store: store, http: http,
                user: KernelUser(externalId: "u1"))
            let base = core.snapshot()
            store.arm()
            let first = Task.detached { core.save(.all, expectedRevision: base.revision) }
            XCTAssertEqual(store.entered.wait(timeout: .now() + 5), .success, operation)
            let reads = DispatchSemaphore(value: 0)
            DispatchQueue.global().async {
                _ = core.snapshot(); _ = core.isAllowed(.marketing); _ = core.decision(for: .marketing)
                _ = core.iabConsent(); _ = core.isIABAllowed(vendorId: 1, purposeId: 1, basis: .consent)
                let gate = core.gate(.marketing) { (_: Bool) in }
                gate.cancel()
                reads.signal()
            }
            let readable = reads.wait(timeout: .now() + 1)
            let started = DispatchSemaphore(value: 0)
            let second = Task.detached { () -> CommitResult? in
                started.signal()
                switch operation {
                case "save": return core.save(.necessary, expectedRevision: base.revision)
                case "identify": core.identify(KernelUser(externalId: "u2"))
                case "logout": core.logout()
                case "reset": core.reset()
                case "overrides": core.setOverrides(ConsentOverrides(country: nil, region: nil, language: "de"))
                case "dismiss": core.dismissNotice()
                case "refresh": core.refresh()
                case "hydrate": core.hydrate()
                default: break
                }
                return nil as CommitResult?
            }
            _ = started.wait(timeout: .now() + 1)
            store.resume.signal()
            XCTAssertEqual(readable, .success, "hot reads waited for disk: \(operation)")
            let committed = await first.value
            XCTAssertEqual(committed.status, .committed)
            let result = await second.value
            if operation == "save" { XCTAssertEqual(result?.error?.code, "concurrent-change") }
            await core.waitUntilIdle()
            let stored = try XCTUnwrap(store.data(for: StorageKey.snapshot).flatMap(StoredEnvelope.decode))
            XCTAssertEqual(stored.snapshot.revision, core.snapshot().revision, operation)
            if operation == "save" { XCTAssertEqual(stored.pendingSaves?.count, 1) }
            let cold = ConsentCore()
            cold.bootstrap(CoreConfig(store: store, iab: vector.cases[0].configuration,
                now: { vector.now }, initRetry: .disabled, flushPendingOnBootstrap: false))
            await cold.waitUntilIdle()
            XCTAssertEqual(cold.snapshot().explicitChoice, core.snapshot().explicitChoice, operation)
        }
    }

    func testStoreCallbackReadsAndFailedCommitLeaveNoGhostOnRestart() async throws {
        let vector = try IABCommitTests().fixture()
        let store = BlockingStore()
        let core = try await IABDeliveryTests().boot(vector, store: store, http: StubHTTP())
        let before = store.data(for: StorageKey.snapshot)
        let callbackRead = DispatchSemaphore(value: 0)
        store.readCallback = {
            // Execute on a different thread too: reentrant monitors must not mask the bug.
            DispatchQueue.global().async {
                _ = core.snapshot(); _ = core.iabConsent()
                _ = core.isIABAllowed(vendorId: 1, purposeId: 1, basis: .consent)
                callbackRead.signal()
            }
            let completed = callbackRead.wait(timeout: .now() + 1)
            XCTAssertEqual(completed, .success)
            if completed == .success {
                _ = core.snapshot(); _ = core.iabConsent()
                _ = core.isIABAllowed(vendorId: 1, purposeId: 1, basis: .consent)
            }
        }
        store.refuse = true
        store.arm()
        let save = Task.detached { core.save(.all) }
        _ = store.entered.wait(timeout: .now() + 5)
        store.resume.signal()
        let refused = await save.value
        XCTAssertEqual(refused.error?.code, "queue-write-failed")
        XCTAssertEqual(store.data(for: StorageKey.snapshot), before)
        XCTAssertEqual(core.pendingSaveCount(), 0)
        let cold = ConsentCore()
        cold.bootstrap(CoreConfig(store: store, iab: vector.cases[0].configuration,
            now: { vector.now }, initRetry: .disabled, flushPendingOnBootstrap: false))
        await cold.waitUntilIdle()
        XCTAssertNil(cold.iabConsent())
        XCTAssertEqual(cold.pendingSaveCount(), 0)
    }

    func testReplacementAndCleanupDoNotHoldStateLock() async throws {
        let vector = try IABCommitTests().fixture()
        for operation in ["identify", "logout", "reset", "refresh", "hydrate"] {
            let store = BlockingStore()
            let http = StubHTTP()
            http.setSavesFail(true)
            let core = try await IABDeliveryTests().boot(vector, store: store, http: http,
                user: KernelUser(externalId: "u1"))
            XCTAssertEqual(core.save(.all).status, .committed)
            await core.waitUntilIdle()
            http.initResponse = HTTPResponse(status: 200, body: try IABDeliveryTests().initBody(vector, listVersion: 43))
            if operation == "hydrate" {
                var raw = try XCTUnwrap(InthJSON.parse(store.data(for: StorageKey.snapshot)!)?.objectValue)
                raw["iabConsent"] = .null
                store.underlying.set(try InthJSON.encode(JSONValue.object(raw)), for: StorageKey.snapshot)
            }
            store.arm()
            let work = Task.detached {
                switch operation {
                case "identify": core.identify(KernelUser(externalId: "u2"))
                case "logout": core.logout()
                case "reset": core.reset()
                case "refresh": core.refresh()
                case "hydrate": core.hydrate()
                default: break
                }
            }
            XCTAssertEqual(store.entered.wait(timeout: .now() + 5), .success)
            let reads = DispatchSemaphore(value: 0)
            DispatchQueue.global().async {
                _ = core.snapshot(); _ = core.isAllowed(.marketing); _ = core.iabConsent()
                _ = core.isIABAllowed(vendorId: 1, purposeId: 1, basis: .consent)
                reads.signal()
            }
            let readable = reads.wait(timeout: .now() + 1)
            store.resume.signal()
            XCTAssertEqual(readable, .success, operation)
            await work.value
            await core.waitUntilIdle()
            XCTAssertEqual(core.pendingSaveCount(), 0, "stale grants must be removed: \(operation)")
        }
    }

    func testFailedCommitOrdersFollowingActionWithoutLeavingRejectedBody() async throws {
        let vector = try IABCommitTests().fixture()
        let store = BlockingStore()
        let http = StubHTTP()
        http.setSavesFail(true)
        let core = try await IABDeliveryTests().boot(vector, store: store, http: http)
        let revision = core.snapshot().revision
        store.refuse = true
        store.arm()
        let first = Task.detached { core.save(.all, expectedRevision: revision) }
        XCTAssertEqual(store.entered.wait(timeout: .now() + 5), .success)
        let nextStarted = DispatchSemaphore(value: 0)
        let second = Task.detached {
            nextStarted.signal()
            return core.save(.necessary, expectedRevision: revision)
        }
        _ = nextStarted.wait(timeout: .now() + 1)
        store.resume.signal()
        let refused = await first.value
        let committed = await second.value
        XCTAssertEqual(refused.error?.code, "queue-write-failed")
        XCTAssertEqual(committed.status, .committed)
        await core.waitUntilIdle()
        XCTAssertEqual(core.pendingSaveCount(), 1)
        XCTAssertTrue(core.pendingSaveBodies().allSatisfy { ConsentDelivery.isWithdrawal($0) })
        let cold = ConsentCore()
        cold.bootstrap(CoreConfig(store: store, iab: vector.cases[0].configuration,
            now: { vector.now }, initRetry: .disabled, flushPendingOnBootstrap: false))
        await cold.waitUntilIdle()
        XCTAssertEqual(cold.iabConsent()?.tcString, core.iabConsent()?.tcString)
        XCTAssertEqual(cold.pendingSaveBodies(), core.pendingSaveBodies())
    }
}
