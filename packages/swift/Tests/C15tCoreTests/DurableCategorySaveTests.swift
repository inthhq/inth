import Foundation
import XCTest

@_spi(C15tInternal) @testable import C15tCore

final class DurableCategorySaveTests: XCTestCase {
    private final class SnapshotFailStore: ConsentStore, @unchecked Sendable {
        let underlying = InMemoryStore()
        var refusesSnapshot = false
        var onSnapshotWrite: (() -> Void)?

        func data(for key: String) -> Data? { underlying.data(for: key) }

        func set(_ data: Data?, for key: String) -> Bool {
            if key == StorageKey.snapshot {
                onSnapshotWrite?()
                if refusesSnapshot { return false }
            }
            return underlying.set(data, for: key)
        }
    }

    private final class Observer: @unchecked Sendable {
        private(set) var snapshots: [ConsentSnapshot] = []
        func consentDidChange(_ snapshot: ConsentSnapshot) { snapshots.append(snapshot) }
    }

    func testRefusedSnapshotDoesNotPublishGrantOrLeaveDeliveryBehind() async throws {
        let store = SnapshotFailStore()
        let http = StubHTTP()
        let clock = TestClock()
        http.initResponse = Fixture.initResponse(policyResolution: Fixture.matchedResolution())
        let core = ConsentCore()
        await core.bootstrapAndSettle(Fixture.configured(
            store: store, transport: Fixture.transport(http), clock: clock))
        XCTAssertEqual(core.save(.necessary).status, .committed)
        await core.waitUntilIdle()
        let before = core.snapshot()
        let storedBefore = store.data(for: StorageKey.snapshot)
        let sentBefore = http.recordedSaveRequests.count
        let observer = Observer()
        let subscription = core.onChange { observer.consentDidChange($0) }
        defer { subscription.cancel() }
        store.refusesSnapshot = true
        store.onSnapshotWrite = { XCTAssertEqual(core.snapshot(), before, "reads must not see an uncommitted grant") }

        let result = core.save(.all)

        XCTAssertEqual(result.status, .rejected)
        XCTAssertEqual(result.error?.code, "queue-write-failed")
        XCTAssertEqual(result.revision, before.revision)
        XCTAssertEqual(result.permissions, before.effectivePermissions)
        XCTAssertEqual(core.snapshot(), before)
        XCTAssertTrue(observer.snapshots.isEmpty)
        XCTAssertEqual(store.data(for: StorageKey.snapshot), storedBefore)
        XCTAssertEqual(core.pendingSaveCount(), 0)
        await core.waitUntilIdle()
        XCTAssertEqual(http.recordedSaveRequests.count, sentBefore)

        store.refusesSnapshot = false
        store.onSnapshotWrite = nil
        core.flushPending()
        await core.waitUntilIdle()
        XCTAssertEqual(http.recordedSaveRequests.count, sentBefore, "a refused grant must not be sent on a later flush")
        let cold = ConsentCore()
        await cold.bootstrapAndSettle(Fixture.configured(
            store: store, transport: Fixture.transport(http), clock: clock))
        XCTAssertEqual(cold.snapshot().explicitChoice, before.explicitChoice)
        XCTAssertFalse(cold.isAllowed(.marketing))
        XCTAssertEqual(http.recordedSaveRequests.count, sentBefore, "restart must not replay a refused grant")
    }

    func testRefusedSnapshotDoesNotAcknowledgeAnEmptyChoicePrompt() async {
        let store = SnapshotFailStore()
        let http = StubHTTP()
        let clock = TestClock()
        http.initResponse = Fixture.initResponse(policyResolution: Fixture.matchedResolution())
        let core = ConsentCore()
        await core.bootstrapAndSettle(Fixture.configured(
            store: store, transport: Fixture.transport(http), clock: clock, categories: [.necessary]))
        let before = core.snapshot()
        XCTAssertEqual(before.promptRequirement.kind, .choice)
        store.refusesSnapshot = true

        let result = core.save(.all)

        XCTAssertEqual(result.status, .rejected)
        XCTAssertEqual(result.error?.code, "queue-write-failed")
        XCTAssertEqual(core.snapshot(), before)
        XCTAssertNil(store.data(for: StorageKey.snapshot).flatMap(StoredEnvelope.decode)?.noticeDismissal)
        await core.waitUntilIdle()
        XCTAssertTrue(http.recordedSaveRequests.isEmpty)
        XCTAssertEqual(core.pendingSaveCount(), 0)
    }

    func testSuccessfulSaveBecomesVisibleAfterTheCombinedWrite() async {
        let store = SnapshotFailStore()
        let http = StubHTTP()
        let clock = TestClock()
        http.initResponse = Fixture.initResponse(policyResolution: Fixture.matchedResolution())
        let core = ConsentCore()
        await core.bootstrapAndSettle(Fixture.configured(
            store: store, transport: Fixture.transport(http), clock: clock))
        let before = core.snapshot()
        http.holdsSaves = true
        store.onSnapshotWrite = {
            XCTAssertEqual(core.snapshot(), before, "readers keep the previous decision until the write succeeds")
        }

        let result = core.save(.all)

        store.onSnapshotWrite = nil
        XCTAssertEqual(result.status, .committed)
        XCTAssertTrue(core.isAllowed(.marketing))
        let saved = store.data(for: StorageKey.snapshot).flatMap(StoredEnvelope.decode)
        XCTAssertEqual(saved?.snapshot, core.snapshot())
        XCTAssertEqual(saved?.pendingSaves?.count, 1)
        http.releaseSaves()
        await core.waitUntilIdle()
    }

    func testCategoryCommitMigratesLegacyQueueWithoutRewritingOwedBodies() async throws {
        let store = InMemoryStore()
        let http = StubHTTP()
        let clock = TestClock()
        http.initResponse = Fixture.initResponse(policyResolution: Fixture.matchedResolution())
        http.setSavesFail(true)
        let core = ConsentCore()
        await core.bootstrapAndSettle(Fixture.configured(
            store: store, transport: Fixture.transport(http), clock: clock))
        XCTAssertEqual(core.save(.all).status, .committed)
        await core.waitUntilIdle()
        let queue = PendingSaveQueue(store: store, now: clock.reading)
        let original = try XCTUnwrap(queue.entries().first)

        var legacy = try XCTUnwrap(store.data(for: StorageKey.snapshot).flatMap(StoredEnvelope.decode))
        legacy.pendingSaves = nil
        XCTAssertTrue(store.encode(legacy, for: StorageKey.snapshot))
        XCTAssertTrue(store.encode([original], for: StorageKey.pendingSaves))
        clock.advance(by: 1)

        XCTAssertEqual(core.save(.custom([.marketing: false])).status, .committed)
        await core.waitUntilIdle()
        let envelope = try XCTUnwrap(store.data(for: StorageKey.snapshot).flatMap(StoredEnvelope.decode))
        let pending = try XCTUnwrap(envelope.pendingSaves)
        XCTAssertEqual(pending.count, 2)
        XCTAssertEqual(pending.first, original, "migrating the queue must preserve frozen body and retry accounting")
        XCTAssertEqual(envelope.snapshot.explicitChoice, core.snapshot().explicitChoice)
        XCTAssertFalse(envelope.snapshot.effectivePermissions.marketing)
        XCTAssertTrue(envelope.snapshot.effectivePermissions.experience)

        let sentBeforeRestart = http.recordedSaveRequests.count
        http.setSavesFail(false)
        let cold = ConsentCore()
        await cold.bootstrapAndSettle(Fixture.configured(
            store: store, transport: Fixture.transport(http), clock: clock))
        XCTAssertEqual(cold.pendingSaveCount(), 0)
        XCTAssertEqual(
            http.recordedSaveRequests.dropFirst(sentBeforeRestart).compactMap(\.body),
            pending.map(\.body),
            "each legacy and new obligation is delivered once with identical bytes")
        XCTAssertFalse(cold.isAllowed(.marketing))
    }

    func testExtraQueueMetadataPreservesTheDecisionAndFrozenDeliveryBody() async throws {
        let store = InMemoryStore()
        let http = StubHTTP()
        let clock = TestClock()
        http.initResponse = Fixture.initResponse(policyResolution: Fixture.matchedResolution())
        http.setSavesFail(true)
        let core = ConsentCore()
        await core.bootstrapAndSettle(Fixture.configured(
            store: store, transport: Fixture.transport(http), clock: clock))
        XCTAssertEqual(core.save(.all).status, .committed)
        await core.waitUntilIdle()
        let before = core.snapshot()
        let body = try XCTUnwrap(http.lastSaveBody)
        var raw = try XCTUnwrap(store.data(for: StorageKey.snapshot).flatMap(C15tJSON.parse)?.objectValue)
        var entries = try XCTUnwrap(raw["pendingSaves"]?.arrayValue)
        var entry = try XCTUnwrap(entries.first?.objectValue)
        entry["futureQueueMetadata"] = .object(["version": .integer(2)])
        entries[0] = .object(entry)
        raw["pendingSaves"] = .array(entries)
        let extended = try XCTUnwrap(C15tJSON.encode(.object(raw)))
        XCTAssertTrue(store.set(extended, for: StorageKey.snapshot))

        http.setSavesFail(false)
        let cold = ConsentCore()
        await cold.bootstrapAndSettle(Fixture.configured(
            store: store, transport: Fixture.transport(http), clock: clock))
        XCTAssertEqual(cold.snapshot().explicitChoice, before.explicitChoice)
        XCTAssertTrue(cold.isAllowed(.marketing))
        XCTAssertEqual(http.recordedSaveRequests.compactMap(\.body), [body, body])
        XCTAssertEqual(cold.pendingSaveCount(), 0)

        var snapshot = try XCTUnwrap(raw["snapshot"]?.objectValue)
        snapshot["futureAuthority"] = .bool(true)
        raw["snapshot"] = .object(snapshot)
        XCTAssertNil(StoredEnvelope.decode(try XCTUnwrap(C15tJSON.encode(.object(raw)))),
            "tolerating queue metadata must not tolerate unknown consent authority")
    }
}
