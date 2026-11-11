import C15tCore
import Combine
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

    /// The same requirement owed again while an answer commits: the answer settled the prompt it was
    /// given, so the one owed again presents after it. The save is held in the store until the main
    /// actor is busy, then the core resets before the commit's continuation can run.
    @MainActor func testThePromptOwedAgainDuringItsCommitPresentsAfterIt() async throws {
        let store = BlockingStore()
        let core = try await boot(store)
        let presenter = ConsentPresenter(core: core)
        let first = try XCTUnwrap(presenter.presentationID)
        store.arm()
        presenter.commit(.accept)
        let entered = await Task.detached { store.entered.wait(timeout: .now() + 5) == .success }.value
        XCTAssertTrue(entered)
        // Hold the main actor from here, so the commit cannot finish before the reset.
        store.resume.signal()
        for _ in 0..<500 where core.snapshot().explicitChoice == nil { Thread.sleep(forTimeInterval: 0.01) }
        XCTAssertNotNil(core.snapshot().explicitChoice)
        core.reset()
        for _ in 0..<500 where core.snapshot().promptRequirement.kind != .choice { Thread.sleep(forTimeInterval: 0.01) }
        XCTAssertEqual(core.snapshot().promptRequirement.kind, .choice)
        await settle(presenter)
        for _ in 0..<500 where presenter.presentationID == nil { try? await Task.sleep(for: .milliseconds(10)) }
        XCTAssertNotNil(presenter.presentationID, "the prompt owed again presents")
        XCTAssertNotEqual(presenter.presentationID, first)
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
        // Only the first action is in flight; the ignored duplicate never becomes the pending one.
        XCTAssertEqual(presenter.pendingAction, .accept)
        XCTAssertEqual(presenter.presentationID, session)
        XCTAssertFalse(presenter.preferences)
        let entered = await Task.detached { store.entered.wait(timeout: .now() + 5) == .success }.value
        XCTAssertTrue(entered)
        XCTAssertNil(core.snapshot().explicitChoice)
        store.resume.signal()
        await settle(presenter)
        XCTAssertFalse(presenter.pending)
        XCTAssertNil(presenter.pendingAction)
        XCTAssertNil(presenter.presentationID)
        XCTAssertTrue(core.snapshot().effectivePermissions.marketing)
        // Count actual queued decisions, never revision arithmetic.
        XCTAssertEqual(core.pendingSaveCount(), 1)
    }

    @MainActor func testUnchangedSnapshotAndReloadPublishNothing() async throws {
        let core = try await boot(InMemoryStore())
        let presenter = ConsentPresenter(core: core)
        // An open, clean prompt: the state in which a new snapshot reloads the draft.
        XCTAssertNotNil(presenter.presentationID)
        var changes = 0
        let observation = presenter.objectWillChange.sink { changes += 1 }
        defer { observation.cancel() }
        presenter.receive(core.snapshot())
        try await Task.sleep(for: .milliseconds(50))
        presenter.loadDraft()
        XCTAssertEqual(changes, 0, "the same snapshot and an identical draft re-render nothing")
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
        // A first-time user's legitimate interest starts not objected to.
        XCTAssertEqual(presenter.partnerStatus(1), "Partly on")
        presenter.editLI(purpose: false, id: 1, enabled: false)
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

    @MainActor func testExplicitHostKeepsDraftAndIgnoresObsoleteClose() async throws {
        let core = try await boot(InMemoryStore())
        let presenter = ConsentPresenter(core: core, autoPresent: false)
        XCTAssertNil(presenter.presentationID)
        presenter.presentPrompt()
        let prompt = try XCTUnwrap(presenter.presentationID)
        presenter.presentPreferences()
        XCTAssertEqual(presenter.presentationID, prompt)
        presenter.requestClose(sessionID: prompt)
        XCTAssertNil(presenter.presentationID)
        XCTAssertNil(core.snapshot().explicitChoice)
        presenter.presentPreferences()
        let settings = try XCTUnwrap(presenter.presentationID)
        presenter.setCategory(.measurement, true)
        presenter.presentPrompt()
        presenter.presentPreferences()
        presenter.requestClose(sessionID: prompt)
        XCTAssertEqual(presenter.presentationID, settings)
        XCTAssertTrue(presenter.isDirty)
        XCTAssertEqual(presenter.categories[.measurement], true)
        presenter.requestClose(sessionID: settings)
        XCTAssertTrue(presenter.confirmDiscard)
        XCTAssertNotNil(presenter.presentationID)
        XCTAssertNil(core.snapshot().explicitChoice)
    }

    @MainActor func testRefusedWriteKeepsDraftAndRetryEmitsOneOutcome() async throws {
        let store = RefusingStore()
        let core = try await boot(store)
        let presenter = ConsentPresenter(core: core, autoPresent: false)
        presenter.presentPreferences()
        let session = presenter.presentationID
        var outcomes = 0
        presenter.onOutcome = { _ in outcomes += 1 }
        presenter.setCategory(.measurement, true)
        store.refuseNext = true
        presenter.commit(.save)
        await settle(presenter)
        XCTAssertNotNil(presenter.errorCode)
        // The failed action is named, so a page can show the failure beside the control that failed.
        XCTAssertEqual(presenter.failedAction, .save)
        XCTAssertEqual(presenter.presentationID, session)
        XCTAssertEqual(presenter.categories[.measurement], true)
        XCTAssertFalse(core.snapshot().effectivePermissions.measurement)
        XCTAssertEqual(outcomes, 0)
        presenter.retry()
        await settle(presenter)
        XCTAssertNil(presenter.errorCode)
        XCTAssertNil(presenter.failedAction)
        XCTAssertTrue(core.snapshot().effectivePermissions.measurement)
        XCTAssertEqual(outcomes, 1)
        XCTAssertEqual(core.pendingSaveCount(), 1)
    }

    @MainActor func testOpenSettingsCanWithdrawAfterBundledPolicyExpires() async throws {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        let vector = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: root.appendingPathComponent("protocol/bundled-policy/parity.json"))) as? [String: Any])
        let resource = try JSONSerialization.data(withJSONObject: XCTUnwrap(vector["resource"]))
        let clock = AdvancingClock(vector["now"] as! Int64)
        let core = ConsentCore()
        core.bootstrap(CoreConfig(store: InMemoryStore(), bundledPolicy: BundledPolicyResource(data: resource, endpoint: vector["endpoint"] as! String), consentCategories: ConsentCategory.allCases, now: clock.read, initRetry: .disabled))
        XCTAssertEqual(core.save(.all).status, .committed)
        let presenter = ConsentPresenter(core: core, autoPresent: false)
        presenter.presentPreferences()
        let session = presenter.presentationID
        clock.advance(604_800_000)
        XCTAssertFalse(core.snapshot().policyPending)
        XCTAssertTrue(core.isPolicyStale)
        presenter.loadDraft()
        XCTAssertEqual(presenter.presentationID, session)
        XCTAssertNotNil(core.bundledPolicyInfo)
        presenter.commit(.reject)
        await settle(presenter)
        XCTAssertNil(presenter.errorCode)
        XCTAssertNil(presenter.presentationID)
        XCTAssertFalse(core.snapshot().policyPending)
        XCTAssertFalse(core.snapshot().effectivePermissions.measurement)
        XCTAssertTrue(core.snapshot().explicitChoice?.categories.values.allSatisfy { !$0.value } == true)
    }

    private final class RefusingStore: ConsentStore, @unchecked Sendable {
        let base = InMemoryStore()
        var refuseNext = false
        func data(for key: String) -> Data? { base.data(for: key) }
        func set(_ value: Data?, for key: String) -> Bool {
            if key == StorageKey.snapshot && refuseNext { refuseNext = false; return false }
            return base.set(value, for: key)
        }
    }

    private final class AdvancingClock: @unchecked Sendable {
        private let lock = NSLock()
        private var value: Int64
        init(_ value: Int64 = Int64(Date().timeIntervalSince1970 * 1000)) { self.value = value }
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

    /// Category mode speaks the policy's language, from `@c15t/translations`, not English literals.
    @MainActor func testCategoryCopyFollowsThePolicyLanguage() async throws {
        let core = try await boot(InMemoryStore(), language: "de")
        let presenter = ConsentPresenter(core: core)
        let german = ConsentCopy.forLanguage("de")
        XCTAssertFalse(presenter.iab)
        XCTAssertNotEqual(german.acceptAll, ConsentCopy.forLanguage("en").acceptAll)
        XCTAssertEqual(presenter.copy, german)
        XCTAssertEqual(presenter.iabCopy, IABCopy.forLanguage("de"))
        XCTAssertEqual(presenter.decisionLabels, DecisionLabels(copy: german))
        // The header identity is UIKit-only, and `swift test` runs this suite on macOS.
        #if canImport(SwiftUI) && canImport(UIKit)
        XCTAssertEqual(ResolvedIdentity.resolve(ConsentTheme.Brand(), provider: .c15t, placeholder: presenter.copy.brandPlaceholder).name,
            german.brandPlaceholder)
        #endif
    }

    private func boot(_ store: any ConsentStore, language: String = "en") async throws -> ConsentCore {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        let body = try Data(contentsOf: root.appendingPathComponent("examples/consent-demo/fixtures/category-init.json"))
        let core = ConsentCore()
        core.bootstrap(CoreConfig(store: store, transport: HostedTransport(baseURL: URL(string: "https://fixture.invalid")!, client: Peer(body)),
            overrides: .default(language: language), initRetry: .disabled))
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

    @MainActor func testFailureStaysVisibleWhileARetryIsPending() async throws {
        let store = RefusingStore()
        let core = try await boot(store)
        let presenter = ConsentPresenter(core: core, autoPresent: false)
        presenter.presentPreferences()
        presenter.setCategory(.measurement, true)
        store.refuseNext = true
        presenter.commit(.save)
        await settle(presenter)
        XCTAssertEqual(presenter.errorMessage, "Couldn't save your choices. Nothing changed on this device.")
        store.refuseNext = true
        presenter.retry()
        // The row stays put while the retry runs; only an outcome replaces it, so nothing reflows under the thumb.
        XCTAssertTrue(presenter.pending)
        XCTAssertNotNil(presenter.errorCode)
        await settle(presenter)
        XCTAssertNotNil(presenter.errorCode)
        presenter.retry()
        await settle(presenter)
        XCTAssertNil(presenter.errorCode)
        XCTAssertNil(presenter.presentationID)
        XCTAssertTrue(core.snapshot().effectivePermissions.measurement)
    }

    @MainActor func testProviderPrerequisitesFollowTheDraftAndNamePurposes() async throws {
        let (core, _) = try await bootIAB()
        let presenter = ConsentPresenter(core: core)
        presenter.customize()
        XCTAssertFalse(presenter.providerPrerequisitesMet)
        XCTAssertEqual(presenter.providerPrerequisiteNames, ["Store and access information on a device",
            "Create profiles for personalised advertising", "Use profiles to select personalised advertising"])
        for purpose in [1, 3, 4] { presenter.edit(\.purposeConsents, id: purpose, enabled: true) }
        XCTAssertTrue(presenter.providerPrerequisitesMet)
    }
}
