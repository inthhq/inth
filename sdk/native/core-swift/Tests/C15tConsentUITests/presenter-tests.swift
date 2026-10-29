import C15tCore
import Foundation
import XCTest
@testable import C15tConsentUI

final class PresenterTests: XCTestCase {
    @MainActor func testClosingUnresolvedSettingsDoesNotRecordAChoice() {
        let core = ConsentCore()
        core.bootstrap(CoreConfig(store: InMemoryStore()))
        let presenter = ConsentPresenter(core: core)
        presenter.presentPreferences()
        XCTAssertNotNil(presenter.presentationID)
        presenter.requestClose()
        XCTAssertNil(presenter.presentationID)
        XCTAssertNil(core.snapshot().explicitChoice)
    }

    @MainActor func testPendingCommitKeepsSessionAndRejectsDuplicateActions() async throws {
        let store = BlockingStore()
        let core = try await boot(store)
        let presenter = ConsentPresenter(core: core)
        let session = presenter.presentationID
        store.arm()
        presenter.commit(.accept)
        presenter.commit(.reject)
        presenter.presentPreferences()
        presenter.requestClose()
        XCTAssertTrue(presenter.pending)
        XCTAssertEqual(presenter.presentationID, session)
        XCTAssertFalse(presenter.preferences)
        let entered = await Task.detached { store.entered.wait(timeout: .now() + 5) == .success }.value
        XCTAssertTrue(entered)
        XCTAssertNil(core.snapshot().explicitChoice)
        store.resume.signal()
        await settle(presenter)
        XCTAssertFalse(presenter.pending)
        XCTAssertNil(presenter.presentationID)
        XCTAssertTrue(core.snapshot().effectivePermissions.marketing)
        // Count actual queued decisions, never revision arithmetic.
        XCTAssertEqual(core.pendingSaveCount(), 1)
    }

    @MainActor func testCompetingDecisionKeepsDraftUntilExplicitReload() async throws {
        let core = try await boot(InMemoryStore())
        let presenter = ConsentPresenter(core: core)
        presenter.customize()
        presenter.setCategory(.measurement, true)
        let committed = await Task.detached { core.save(.necessary).status == .committed }.value
        XCTAssertTrue(committed)
        presenter.commit(.save)
        await settle(presenter)
        XCTAssertTrue(presenter.stale)
        XCTAssertNotNil(presenter.presentationID)
        XCTAssertEqual(presenter.categories[.measurement], true)
        XCTAssertFalse(core.snapshot().effectivePermissions.measurement)
        presenter.loadDraft()
        XCTAssertFalse(presenter.stale)
        XCTAssertEqual(presenter.categories[.measurement], false)
    }

    @MainActor func testExpiredDisclosureReloadsAfterRetryCompletes() async throws {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        let body = try Data(contentsOf: root.appendingPathComponent("examples/consent-demo/fixtures/iab-init.json"))
        let clock = AdvancingClock()
        let core = ConsentCore()
        core.bootstrap(CoreConfig(store: InMemoryStore(),
            transport: HostedTransport(baseURL: URL(string: "https://fixture.invalid")!, client: Peer(body)),
            iab: IABConfiguration(cmpId: 53, cmpVersion: 7, publisherCountryCode: "GB"),
            iabListMaxAgeMs: 50, now: clock.read, initRetry: .disabled))
        await core.waitUntilIdle()
        let presenter = ConsentPresenter(core: core)
        presenter.customize()
        let original = try XCTUnwrap(presenter.disclosure).draft.revision
        clock.advance(100)
        XCTAssertTrue(presenter.listUnavailable)
        presenter.refresh()
        await core.waitUntilIdle()
        for _ in 0..<100 {
            if presenter.disclosure?.draft.revision != original { break }
            try await Task.sleep(for: .milliseconds(10))
        }
        XCTAssertFalse(presenter.listUnavailable)
        XCTAssertEqual(presenter.disclosure?.draft.revision, core.snapshot().revision)
        XCTAssertGreaterThan(core.snapshot().revision, original)
        XCTAssertNil(core.iabConsent())
    }

    @MainActor func testRetryPreservesDirtyExpiredListDraftUntilExplicitReload() async throws {
        let (core, clock) = try await bootIAB()
        let presenter = ConsentPresenter(core: core)
        presenter.customize()
        presenter.edit(\.purposeConsents, id: 7, enabled: true)
        let choices = presenter.choices
        clock.advance(60_001)
        XCTAssertTrue(presenter.listUnavailable)
        presenter.refresh()
        XCTAssertTrue(presenter.isDirty)
        XCTAssertEqual(presenter.choices, choices)
        await core.waitUntilIdle()
        for _ in 0..<100 {
            if !presenter.listUnavailable { break }
            try await Task.sleep(for: .milliseconds(10))
        }
        XCTAssertFalse(presenter.listUnavailable)
        XCTAssertTrue(presenter.stale)
        XCTAssertTrue(presenter.isDirty)
        XCTAssertEqual(presenter.choices, choices)
        presenter.loadDraft()
        XCTAssertFalse(presenter.stale)
        XCTAssertFalse(presenter.isDirty)
    }

    @MainActor func testExpiredListReopenKeepsReadablePartnersAndRefusesNewGrants() async throws {
        let (core, clock) = try await bootIAB()
        let vendors = try XCTUnwrap(core.iabPresentation()).vendors
        clock.advance(60_001)
        let presenter = ConsentPresenter(core: core)
        presenter.presentPreferences()
        XCTAssertEqual(presenter.disclosure?.vendors, vendors)
        XCTAssertEqual(presenter.disclosure?.canEdit, false)
        XCTAssertTrue(presenter.listUnavailable)
        XCTAssertNil(core.openIABDraft())
        XCTAssertNotEqual(core.save(.all).status, .committed)
        XCTAssertFalse(core.snapshot().effectivePermissions.marketing)
    }

    @MainActor func testPartnerStatusIncludesSavedLIAndDistinguishesPartialSelection() async throws {
        let (core, _) = try await bootIAB()
        let presenter = ConsentPresenter(core: core)
        presenter.customize()
        XCTAssertEqual(presenter.partnerStatus(1), "Off")
        presenter.editLI(purpose: true, id: 7, enabled: true)
        presenter.editLI(purpose: false, id: 1, enabled: true)
        presenter.commit(.save)
        await settle(presenter)
        XCTAssertNil(presenter.errorCode)
        XCTAssertTrue(core.isIABAllowed(vendorId: 1, purposeId: 7, basis: .legitimateInterest))
        presenter.presentPreferences()
        XCTAssertEqual(presenter.partnerStatus(1), "Partly on")
        presenter.edit(\.vendorConsents, id: 1, enabled: true)
        for purpose in [1, 3, 4, 7] { presenter.edit(\.purposeConsents, id: purpose, enabled: true) }
        XCTAssertEqual(presenter.partnerStatus(1), "On")
        presenter.edit(\.purposeObjections, id: 7, enabled: true)
        XCTAssertEqual(presenter.partnerStatus(1), "Partly on")
        presenter.edit(\.vendorConsents, id: 1, enabled: false)
        XCTAssertEqual(presenter.partnerStatus(1), "Off")
    }

    private func bootIAB() async throws -> (ConsentCore, AdvancingClock) {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        let body = try Data(contentsOf: root.appendingPathComponent("examples/consent-demo/fixtures/iab-init.json"))
        let clock = AdvancingClock()
        let core = ConsentCore()
        core.bootstrap(CoreConfig(store: InMemoryStore(),
            transport: HostedTransport(baseURL: URL(string: "https://fixture.invalid")!, client: Peer(body)),
            iab: IABConfiguration(cmpId: 53, cmpVersion: 7, publisherCountryCode: "GB"),
            iabListMaxAgeMs: 60_000, now: clock.read, initRetry: .disabled))
        await core.waitUntilIdle()
        return (core, clock)
    }

    private final class AdvancingClock: @unchecked Sendable {
        private let lock = NSLock()
        private var value = Int64(Date().timeIntervalSince1970 * 1000)
        func read() -> Int64 { lock.lock(); defer { lock.unlock() }; return value }
        func advance(_ delta: Int64) { lock.lock(); value += delta; lock.unlock() }
    }

    @MainActor private func settle(_ presenter: ConsentPresenter) async {
        for _ in 0..<500 {
            if !presenter.pending { return }
            try? await Task.sleep(for: .milliseconds(10))
        }
        XCTFail("Native commit did not settle")
    }

    private func boot(_ store: any ConsentStore) async throws -> ConsentCore {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        let body = try Data(contentsOf: root.appendingPathComponent("examples/consent-demo/fixtures/category-init.json"))
        let core = ConsentCore()
        core.bootstrap(CoreConfig(store: store, transport: HostedTransport(baseURL: URL(string: "https://fixture.invalid")!, client: Peer(body)), initRetry: .disabled))
        await core.waitUntilIdle()
        return core
    }

    private struct Peer: HTTPTransport {
        let body: Data
        init(_ body: Data) { self.body = body }
        func send(_ request: HTTPRequest) async throws -> HTTPResponse {
            request.method == .get
                ? HTTPResponse(status: 200, headers: ["x-c15t-policy-contract": "1"], body: body)
                : HTTPResponse(status: 503)
        }
    }

    private final class BlockingStore: ConsentStore, @unchecked Sendable {
        let base = InMemoryStore()
        let entered = DispatchSemaphore(value: 0)
        let resume = DispatchSemaphore(value: 0)
        private let lock = NSLock()
        private var armed = false
        func arm() { lock.lock(); armed = true; lock.unlock() }
        func data(for key: String) -> Data? { base.data(for: key) }
        func set(_ value: Data?, for key: String) -> Bool {
            lock.lock()
            let block = armed && key == StorageKey.snapshot
            if block { armed = false }
            lock.unlock()
            if block { entered.signal(); guard resume.wait(timeout: .now() + 10) == .success else { return false } }
            return base.set(value, for: key)
        }
    }
}
