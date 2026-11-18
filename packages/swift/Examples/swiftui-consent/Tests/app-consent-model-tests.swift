@_spi(InthInternal) import InthApple
@_spi(InthInternal) import InthCore
import Foundation
import XCTest
@testable import InthSwiftUI

@MainActor
final class AppConsentModelTests: XCTestCase {
    func testPendingPolicyNeverStartsMeasurement() async {
        let core = ConsentCore()
        core.bootstrap(CoreConfig(store: InMemoryStore(), transport: DemoTransport(unavailable: true), initRetry: .disabled))
        let model = AppConsentModel(stockUI: false) { core }
        await core.waitUntilIdle()
        XCTAssertFalse(model.ready)
        XCTAssertEqual(model.decision, .pending)
        XCTAssertFalse(model.measurement.isCollecting)
        model.recordTap()
        XCTAssertEqual(model.eventCount, 0)
        XCTAssertNil(model.presenter)
    }

    func testGrantStartsAndWithdrawalStopsActualWork() async throws {
        let core = await boot()
        let model = AppConsentModel(stockUI: true) { core }
        XCTAssertNotNil(model.presenter)
        XCTAssertTrue(model.presenter?.core === core)
        XCTAssertFalse(model.measurement.isCollecting)
        var draft = CategoryDraft(snapshot: core.snapshot())
        draft.measurement = true
        XCTAssertEqual(draft.commit(to: core).status, .committed)
        XCTAssertTrue(model.measurement.isCollecting)
        model.recordTap()
        XCTAssertEqual(model.eventCount, 1)
        XCTAssertEqual(core.save(.necessary).status, .committed)
        XCTAssertFalse(model.measurement.isCollecting)
        model.recordTap()
        XCTAssertEqual(model.eventCount, 1)
        try await observe(model) { $0.snapshot?.explicitChoice != nil && $0.decision == .denied }
        XCTAssertFalse(model.snapshot?.effectivePermissions.measurement ?? true)
    }

    func testFailedWriteKeepsDraftAndDoesNotStartMeasurement() async {
        let store = FailingStore()
        let core = await boot(store: store)
        let model = AppConsentModel(stockUI: false) { core }
        var draft = CategoryDraft(snapshot: core.snapshot())
        draft.measurement = true
        store.refuseWrites = true
        let result = draft.commit(to: core)
        XCTAssertEqual(result.status, .rejected)
        XCTAssertEqual(result.error?.code, "queue-write-failed")
        XCTAssertTrue(draft.measurement)
        XCTAssertFalse(model.measurement.isCollecting)
        XCTAssertNil(core.snapshot().explicitChoice)
        XCTAssertEqual(core.pendingSaveCount(), 0)
        store.refuseWrites = false
        XCTAssertEqual(draft.commit(to: core).status, .committed)
        XCTAssertTrue(model.measurement.isCollecting)
    }

    func testStaleDraftCannotOverwriteAWithdrawal() async {
        let core = await boot()
        var draft = CategoryDraft(snapshot: core.snapshot())
        draft.measurement = true
        XCTAssertEqual(core.save(.necessary).status, .committed)
        let result = draft.commit(to: core)
        XCTAssertEqual(result.status, .rejected)
        XCTAssertEqual(result.error?.code, "concurrent-change")
        XCTAssertFalse(core.isAllowed(.measurement))
    }

    func testSavedStateHydratesWithoutAvailablePolicyTransport() async {
        let store = InMemoryStore()
        let first = await boot(store: store)
        XCTAssertEqual(first.save(.all).status, .committed)
        await first.waitUntilIdle()
        let restored = ConsentCore()
        restored.bootstrap(CoreConfig(store: store, transport: DemoTransport(unavailable: true), consentCategories: [.necessary, .measurement], initRetry: .disabled))
        let model = AppConsentModel(stockUI: false) { restored }
        XCTAssertTrue(model.ready)
        XCTAssertEqual(model.decision, .granted)
        XCTAssertTrue(model.measurement.isCollecting)
        XCTAssertNotNil(model.snapshot?.explicitChoice)
        XCTAssertEqual(model.queuedSaves, 1)
        await restored.waitUntilIdle()
        XCTAssertEqual(restored.pendingSaveCount(), 1)
    }

    func testProtectedStorageRetryKeepsWorkOffUntilInstallSucceeds() async {
        let core = await boot()
        var attempts = 0
        let model = AppConsentModel(stockUI: false) {
            attempts += 1
            if attempts == 1 { throw InthAppleInstallationError.protectedStorageUnavailable }
            return core
        }
        XCTAssertNil(model.core)
        XCTAssertFalse(model.measurement.isCollecting)
        XCTAssertEqual(model.decision, .pending)
        model.retryProtectedStorage()
        XCTAssertTrue(model.core === core)
        XCTAssertNil(model.installationError)
        model.retryProtectedStorage()
        XCTAssertEqual(attempts, 2)
    }

    func testModelTeardownStopsAndUnsubscribesMeasurement() async {
        let core = await boot()
        XCTAssertEqual(core.save(.all).status, .committed)
        var model: AppConsentModel? = AppConsentModel(stockUI: false) { core }
        let service = model!.measurement
        XCTAssertTrue(service.isCollecting)
        model = nil
        XCTAssertFalse(service.isCollecting)
        core.save(.necessary)
        core.save(.all)
        XCTAssertFalse(service.isCollecting)
    }

    func testHostedConfigurationNeverFallsBackToDemoOnBadInput() throws {
        XCTAssertThrowsError(try SampleConfiguration(backend: "bad-url", privacy: nil, headless: false, demoUnavailable: false))
        XCTAssertThrowsError(try SampleConfiguration(backend: "https://your-project.inth.app", privacy: nil, headless: false, demoUnavailable: false))
        let configured = try SampleConfiguration(backend: "https://your-project.inth.app", privacy: "https://example.com/privacy", headless: false, demoUnavailable: false)
        XCTAssertFalse(configured.isDemo)
    }

    private func boot(store: any ConsentStore = InMemoryStore()) async -> ConsentCore {
        let core = ConsentCore()
        core.bootstrap(CoreConfig(store: store, transport: DemoTransport(), consentCategories: [.necessary, .measurement], initRetry: .disabled))
        await core.waitUntilIdle()
        XCTAssertTrue(core.isReady(), core.snapshot().error?.message ?? "The demo policy did not resolve.")
        return core
    }

    private func observe(_ model: AppConsentModel, predicate: (AppConsentModel) -> Bool) async throws {
        for _ in 0..<100 {
            if predicate(model) { return }
            try await Task.sleep(for: .milliseconds(10))
        }
        XCTFail("The model did not publish the expected consent state.")
    }
}

private final class FailingStore: ConsentStore, @unchecked Sendable {
    private let base = InMemoryStore()
    private let lock = NSLock()
    private var refusing = false
    var refuseWrites: Bool {
        get { lock.lock(); defer { lock.unlock() }; return refusing }
        set { lock.lock(); defer { lock.unlock() }; refusing = newValue }
    }
    func data(for key: String) -> Data? { base.data(for: key) }
    func read(for key: String) throws -> Data? { try base.read(for: key) }
    func set(_ data: Data?, for key: String) -> Bool {
        guard !refuseWrites else { return false }
        return base.set(data, for: key)
    }
}
