import Foundation
import XCTest

@_spi(InthInternal) @testable import InthCore

/// Cold-launch, queue liveness and policy-transition regressions.
final class FoundationRepairTests: XCTestCase {
    typealias Vector = IABCommitTests.Vector

    func cold(_ vector: Vector, store: any ConsentStore, http: StubHTTP, user: KernelUser?) async throws -> ConsentCore {
        http.initResponse = HTTPResponse(status: 200, body: try IABDeliveryTests().initBody(vector))
        let core = ConsentCore()
        core.bootstrap(CoreConfig(
            store: store, transport: Fixture.transport(http), iab: vector.cases[0].configuration,
            user: user, now: { vector.now }, initRetry: .disabled, flushPendingOnBootstrap: false))
        await core.waitUntilIdle()
        return core
    }

    /// R1: the RN bridge builds CoreConfig with no user. A relaunch followed by
    /// identify(sameId) is the normal host pattern.
    func testRelaunchThenIdentifySameIdKeepsConsent() async throws {
        let vector = try IABCommitTests().fixture()
        let store = InMemoryStore()
        let http = StubHTTP()
        let first = try await cold(vector, store: store, http: http, user: KernelUser(externalId: "u1"))
        XCTAssertEqual(first.save(.all).status, .committed)
        await first.waitUntilIdle()
        XCTAssertNotNil(first.iabConsent())

        // Control: relaunch passing the same user in config.
        let control = InMemoryStore()
        for key in [StorageKey.subject, StorageKey.snapshot, StorageKey.pendingSaves] {
            control.set(store.data(for: key), for: key)
        }
        let withUser = try await cold(vector, store: control, http: StubHTTP(), user: KernelUser(externalId: "u1"))
        XCTAssertNotNil(withUser.iabConsent(), "control: relaunch with config user keeps consent")

        let relaunch = try await cold(vector, store: store, http: StubHTTP(), user: nil)
        let afterHydrate = relaunch.iabConsent()
        relaunch.identify(KernelUser(externalId: "u1"))
        await relaunch.waitUntilIdle()
        XCTAssertNotNil(afterHydrate, "R1a: relaunch without config user drops u1 consent at hydrate")
        XCTAssertNotNil(relaunch.iabConsent(), "R1b: identify(u1) after relaunch erases consent")
    }

    /// Repeated permanent refusals keep a single newest obligation for this owner.
    func testRepeatedRefusedWithdrawalsLeaveRoomForLaterActions() async throws {
        let vector = try IABCommitTests().fixture()
        let store = InMemoryStore()
        let http = StubHTTP()
        http.saveFailureStatus = 400
        http.setSavesFail(true)
        let core = try await cold(vector, store: store, http: http, user: nil)
        for _ in 0 ..< 64 {
            XCTAssertEqual(core.save(.necessary).status, .committed)
            await core.waitUntilIdle()
            XCTAssertEqual(core.pendingSaveCount(), 1)
        }
        http.saveFailureStatus = 503
        XCTAssertEqual(core.save(.all).status, .committed)
        await core.waitUntilIdle()
        XCTAssertEqual(core.pendingSaveCount(), 2, "a grant does not cancel an owed denial")
        XCTAssertEqual(core.save(.necessary).status, .committed)
        await core.waitUntilIdle()
        XCTAssertEqual(core.pendingSaveCount(), 1)
    }

    /// R4: a category-model withdrawal queued before the policy switches to IAB.
    func testCategoryWithdrawalSurvivesSwitchToIAB() async throws {
        let vector = try IABCommitTests().fixture()
        let store = InMemoryStore()
        let http = StubHTTP()
        http.initResponse = HTTPResponse(status: 200, body: Fixture.initBody(
            policyResolution: Fixture.matchedResolution(policy: Fixture.rule(model: "opt-in"))))
        let core = ConsentCore()
        core.bootstrap(CoreConfig(
            store: store, transport: Fixture.transport(http), iab: vector.cases[0].configuration,
            now: { vector.now }, initRetry: .disabled, flushPendingOnBootstrap: false))
        await core.waitUntilIdle()
        XCTAssertEqual(core.save(.all).status, .committed)
        await core.waitUntilIdle()
        http.setSavesFail(true)
        XCTAssertEqual(core.save(.necessary).status, .committed)
        await core.waitUntilIdle()
        XCTAssertEqual(core.pendingSaveCount(), 1, "precondition: category withdrawal queued")
        let frozen = try XCTUnwrap(core.pendingSaveBodies().last)
        http.initResponse = HTTPResponse(status: 200, body: try IABDeliveryTests().initBody(vector))
        core.refresh()
        await core.waitUntilIdle()
        XCTAssertEqual(core.pendingSaveCount(), 1, "R4: category withdrawal dropped when the policy becomes IAB")
        XCTAssertEqual(core.pendingSaveBodies(), [frozen])
        let relaunched = try await cold(vector, store: store, http: http, user: nil)
        http.setSavesFail(false)
        let before = http.recordedSaveRequests.count
        relaunched.flushPending()
        await relaunched.waitUntilIdle()
        XCTAssertEqual(http.recordedSaveRequests.dropFirst(before).map(\.body), [frozen])
    }

    /// R5: identify on a category-model policy in an app that configures IAB.
    func testIdentifyKeepsCategoryChoiceUnderNonIABPolicy() async throws {
        let vector = try IABCommitTests().fixture()
        for configured in [true, false] {
            let store = InMemoryStore()
            let http = StubHTTP()
            http.setSavesFail(true)
            http.initResponse = HTTPResponse(status: 200, body: Fixture.initBody(
                policyResolution: Fixture.matchedResolution(policy: Fixture.rule(model: "opt-in"))))
            let core = ConsentCore()
            core.bootstrap(CoreConfig(
                store: store, transport: Fixture.transport(http), iab: configured ? vector.cases[0].configuration : nil,
                now: { vector.now }, initRetry: .disabled, flushPendingOnBootstrap: false))
            await core.waitUntilIdle()
            XCTAssertEqual(core.save(.necessary).status, .committed)
            await core.waitUntilIdle()
            let withdrawal = try XCTUnwrap(core.pendingSaveBodies().last)
            XCTAssertEqual(core.save(.all).status, .committed)
            await core.waitUntilIdle()
            core.identify(KernelUser(externalId: "u1"))
            await core.waitUntilIdle()
            XCTAssertNotNil(core.snapshot().explicitChoice)
            XCTAssertTrue(core.isAllowed(.marketing))
            XCTAssertTrue(core.pendingSaveBodies().contains(withdrawal))
        }
    }

    func testOfflineDenialsCoalesceAcrossRestartAndConfiguredIdentityWins() async throws {
        let vector = try IABCommitTests().fixture()
        let store = InMemoryStore()
        let http = StubHTTP()
        http.setSavesFail(true)
        var core = try await cold(vector, store: store, http: http, user: KernelUser(externalId: "u1"))
        for _ in 0 ..< 32 {
            XCTAssertEqual(core.save(.necessary).status, .committed)
            await core.waitUntilIdle()
        }
        let newest = try XCTUnwrap(core.pendingSaveBodies().last)
        core = try await cold(vector, store: store, http: http, user: nil)
        XCTAssertEqual(core.pendingSaveBodies(), [newest])
        core.identify(KernelUser(externalId: "u1"))
        await core.waitUntilIdle()
        XCTAssertNotNil(core.iabConsent())
        let different = try await cold(vector, store: store, http: http, user: KernelUser(externalId: "u2"))
        XCTAssertNil(different.iabConsent())
        XCTAssertEqual(different.pendingSaveBodies(), [newest])
        different.logout()
        await different.waitUntilIdle()
        let loggedOut = try await cold(vector, store: store, http: http, user: nil)
        XCTAssertNil(loggedOut.snapshot().subject?.externalId)
        XCTAssertNil(loggedOut.iabConsent())
    }

    func testFrozenOwnersAndDomainsDoNotCoalesceAtCapacity() async throws {
        let vector = try IABCommitTests().fixture()
        let store = InMemoryStore()
        let http = StubHTTP()
        http.setSavesFail(true)
        let core = try await cold(vector, store: store, http: http, user: nil)
        XCTAssertEqual(core.save(.necessary).status, .committed)
        await core.waitUntilIdle()
        let envelope = try XCTUnwrap(store.data(for: StorageKey.snapshot).flatMap(StoredEnvelope.decode))
        let original = try XCTUnwrap(envelope.pendingSaves?.last?.body)
        let queue = PendingSaveQueue(store: store, now: { vector.now })
        func body(_ owner: Int, _ domain: Int, subject: String? = nil, marker: String = "") throws -> Data {
            var fields = try XCTUnwrap(InthJSON.parse(original)?.objectValue)
            fields["externalSubjectId"] = .string("u\(owner)")
            fields["domain"] = .string("d\(domain).example.test")
            fields["givenAt"] = .number(Double(vector.now + Int64(marker.count)))
            if let subject { fields["subjectId"] = .string(subject) }
            return try InthJSON.encode(JSONValue.object(fields))
        }
        // Replace initial anonymous body, then fill with distinct owner/domain pairs.
        queue.clear()
        var bodies: [Data] = []
        for i in 0 ..< 20 {
            let frozen = try body(i / 2, i % 2)
            bodies.append(frozen)
            XCTAssertNotNil(queue.commit(envelope, body: frozen, subjectId: envelope.snapshot.subject!.id, actionAt: vector.now))
        }
        let newest = try body(0, 0, marker: "newest")
        XCTAssertNotNil(queue.commit(envelope, body: newest, subjectId: envelope.snapshot.subject!.id, actionAt: vector.now + 6))
        XCTAssertEqual(queue.entries().map(\.body), Array(bodies.dropFirst()) + [newest])
        let before = store.data(for: StorageKey.snapshot)
        XCTAssertNil(queue.commit(envelope, body: try body(10, 0), subjectId: envelope.snapshot.subject!.id, actionAt: vector.now))
        XCTAssertNil(queue.commit(envelope, body: try body(0, 0, subject: "sub_other"), subjectId: "sub_other", actionAt: vector.now))
        XCTAssertEqual(store.data(for: StorageKey.snapshot), before)
        let relaunchedQueue = PendingSaveQueue(store: store, now: { vector.now })
        XCTAssertEqual(relaunchedQueue.entries().map(\.body), Array(bodies.dropFirst()) + [newest])
    }

    func testCategoryGrantDoesNotBecomeProtectedWithdrawalOnIABRefresh() async throws {
        let vector = try IABCommitTests().fixture()
        let http = StubHTTP()
        http.setSavesFail(true)
        http.initResponse = HTTPResponse(status: 200, body: Fixture.initBody(
            policyResolution: Fixture.matchedResolution(policy: Fixture.rule(model: "opt-in"))))
        let core = ConsentCore()
        core.bootstrap(CoreConfig(store: InMemoryStore(), transport: Fixture.transport(http),
            iab: vector.cases[0].configuration, now: { vector.now }, initRetry: .disabled,
            flushPendingOnBootstrap: false))
        await core.waitUntilIdle()
        XCTAssertEqual(core.save(.all).status, .committed)
        await core.waitUntilIdle()
        XCTAssertEqual(core.pendingSaveCount(), 1)
        XCTAssertFalse(ConsentDelivery.isWithdrawal(core.pendingSaveBodies()[0]))
        http.initResponse = HTTPResponse(status: 200, body: try IABDeliveryTests().initBody(vector))
        core.refresh()
        await core.waitUntilIdle()
        XCTAssertEqual(core.pendingSaveCount(), 0)
    }
}
