@_spi(C15tInternal) import C15tCore
import Foundation
import XCTest
@testable import C15tConsentUI

/// The headless draft's rules, with no view: what an app-owned screen relies on.
@MainActor
final class HeadlessDraftTests: XCTestCase {
    func testCategoryRowsCarryCopyLockAndBinding() async throws {
        let core = try await headlessFixtureCore("category-init.json")
        let draft = ConsentDraft(core: core)
        let necessary = draft.category(.necessary)
        XCTAssertTrue(necessary.locked)
        XCTAssertEqual(necessary.lockedLabel, "Always on")
        XCTAssertFalse(necessary.isEnabled)
        let measurement = try XCTUnwrap(draft.categories.first { $0.category == .measurement })
        XCTAssertEqual(measurement.title, draft.copy.measurementTitle)
        XCTAssertFalse(measurement.locked)
        XCTAssertFalse(measurement.isOn)
        measurement.set(true)
        XCTAssertTrue(draft.category(.measurement).isOn)
        XCTAssertTrue(draft.isDirty)
        // An edit changes the draft only.
        XCTAssertFalse(core.isAllowed(.measurement))
    }

    func testASaveResultIsSpokenOnceBeforeTheScreenHearsIt() async throws {
        let core = try await headlessFixtureCore("category-init.json")
        let draft = ConsentDraft(core: core)
        var prompt: [String] = []
        var preferences: [String] = []
        // Two blocks share the draft, as the prompt and preferences do.
        _ = draft.addAnnouncer { prompt.append($0) }
        _ = draft.addAnnouncer { preferences.append($0) }
        var spokenBeforeResult = false
        let done = expectation(description: "saved")
        draft.save(.acceptAll) { _ in
            spokenBeforeResult = !preferences.isEmpty
            done.fulfill()
        }
        await fulfillment(of: [done], timeout: 5)
        // Spoken before the screen hears the result, so closing on success does not lose it.
        XCTAssertTrue(spokenBeforeResult)
        XCTAssertEqual(preferences, [draft.copy.choicesSaved])
        XCTAssertTrue(prompt.isEmpty)
    }

    // TCF-CHECK: T2
    func testTheOneTapRejectAllTurnsEveryConsentOff() async throws {
        let core = try await headlessFixtureCore("iab-init.json", iab: true)
        let draft = ConsentDraft(core: core)
        let accepted = await draft.save(.acceptAll)
        XCTAssertTrue(accepted)
        XCTAssertFalse(try XCTUnwrap(core.iabConsent()).choices.purposeConsents.isEmpty)
        let rejected = await draft.save(.rejectAll)
        XCTAssertTrue(rejected)
        let committed = try XCTUnwrap(core.iabConsent()).choices
        XCTAssertTrue(committed.purposeConsents.isEmpty && committed.vendorConsents.isEmpty && committed.specialFeatureOptIns.isEmpty)
    }

    func testASaveNamesTheRevisionTheDraftWasReadAt() async throws {
        let core = try await headlessFixtureCore("category-init.json")
        let first = ConsentDraft(core: core)
        let second = ConsentDraft(core: core)
        // An unsaved edit keeps the second draft from following the record.
        second.setCategory(.marketing, true)
        first.setCategory(.measurement, true)
        let saved = await first.save()
        XCTAssertTrue(saved)
        XCTAssertFalse(first.isDirty)
        let overtaken = await second.save()
        XCTAssertFalse(overtaken)
        XCTAssertEqual(second.errorCode, "concurrent-change")
        XCTAssertTrue(second.isStale)
        // The edit is still there to review, and nothing more is written until a reset.
        XCTAssertTrue(second.category(.marketing).isOn)
        XCTAssertFalse(second.category(.marketing).isEnabled)
        XCTAssertFalse(core.isAllowed(.marketing))
        let ignored = await second.save()
        XCTAssertFalse(ignored)
        second.reset()
        XCTAssertFalse(second.isStale)
        XCTAssertNil(second.errorCode)
        XCTAssertTrue(second.category(.measurement).isOn)
    }

    func testARefusedWriteKeepsTheEditsAndRetrySendsThemAgain() async throws {
        let store = RefusingStore()
        let core = try await headlessFixtureCore("category-init.json", store: store)
        let draft = ConsentDraft(core: core)
        var announced: [String] = []
        draft.onAnnouncement = { announced.append($0) }
        draft.setCategory(.measurement, true)
        store.refuseNext = true
        let refused = await draft.save()
        XCTAssertFalse(refused)
        XCTAssertEqual(draft.errorMessage, draft.copy.saveFailed)
        XCTAssertEqual(draft.announcement, draft.copy.saveFailed)
        XCTAssertEqual(announced, [draft.copy.saveFailed])
        XCTAssertEqual(draft.failedAction, .save)
        XCTAssertFalse(draft.isStale)
        XCTAssertTrue(draft.category(.measurement).isOn)
        XCTAssertFalse(core.isAllowed(.measurement))
        let retried: Bool = await withCheckedContinuation { continuation in
            draft.retry { continuation.resume(returning: $0) }
        }
        XCTAssertTrue(retried)
        XCTAssertNil(draft.errorMessage)
        XCTAssertTrue(core.isAllowed(.measurement))
        XCTAssertEqual(announced.last, draft.copy.choicesSaved)
    }

    func testACleanDraftFollowsTheRecordAndASaveWithNothingToSayWritesNothing() async throws {
        let core = try await headlessFixtureCore("category-init.json")
        let draft = ConsentDraft(core: core)
        let other = ConsentDraft(core: core)
        let accepted = await other.save(.acceptAll)
        XCTAssertTrue(accepted)
        XCTAssertTrue(core.isAllowed(.marketing))
        // The change reaches the first draft on the main actor.
        for _ in 0..<500 where !draft.category(.marketing).isOn { try await Task.sleep(for: .milliseconds(10)) }
        XCTAssertTrue(draft.category(.marketing).isOn)
        XCTAssertFalse(draft.isDirty)
        let revision = core.snapshot().revision
        let result = await draft.save()
        XCTAssertTrue(result)
        XCTAssertEqual(core.snapshot().revision, revision)
    }

    // TCF-CHECK: P21
    func testAFirstIABDecisionOpensWithEveryConsentOff() async throws {
        let core = try await headlessFixtureCore("iab-init.json", iab: true)
        let iab = try XCTUnwrap(ConsentDraft(core: core).iab)
        XCTAssertFalse(iab.purposes.isEmpty)
        XCTAssertTrue(iab.purposes.allSatisfy { !$0.consent })
        XCTAssertTrue(iab.specialFeatures.allSatisfy { !$0.optIn })
        XCTAssertTrue(iab.vendors.allSatisfy { $0.consent != true })
        XCTAssertTrue(iab.adTechProviders.allSatisfy { !$0.consent })
        XCTAssertNil(iab.tcString)
    }

    // TCF-CHECK: T1, T2, P32
    func testRejectAllTurnsEveryConsentOffAndOnlyASaveWritesTheString() async throws {
        let core = try await headlessFixtureCore("iab-init.json", iab: true)
        let draft = ConsentDraft(core: core)
        draft.acceptAll()
        XCTAssertTrue(try XCTUnwrap(draft.iab).purposes.allSatisfy(\.consent))
        // Staging alone publishes nothing.
        XCTAssertNil(core.iabConsent())
        let accepted = await draft.save()
        XCTAssertTrue(accepted)
        XCTAssertNotNil(draft.iab?.tcString)
        draft.rejectAll()
        let staged = draft.choices
        XCTAssertTrue(staged.purposeConsents.isEmpty && staged.vendorConsents.isEmpty && staged.specialFeatureOptIns.isEmpty)
        XCTAssertTrue((staged.adTechProviderConsents ?? []).isEmpty && staged.customVendorConsents.isEmpty)
        let rejected = await draft.save()
        XCTAssertTrue(rejected)
        let committed = try XCTUnwrap(core.iabConsent()).choices
        XCTAssertTrue(committed.purposeConsents.isEmpty && committed.vendorConsents.isEmpty)
        XCTAssertFalse(core.isIABAllowed(vendorId: 1, purposeId: 1, basis: .consent))
    }

    // TCF-CHECK: P18, P23
    func testTurningLegitimateInterestOffRecordsAnObjection() async throws {
        let core = try await headlessFixtureCore("iab-init.json", iab: true)
        let draft = ConsentDraft(core: core)
        let iab = try XCTUnwrap(draft.iab)
        let purpose = try XCTUnwrap(iab.purposes.first { $0.legitimateInterest != nil })
        XCTAssertEqual(purpose.legitimateInterest, true)
        XCTAssertFalse(purpose.rightToObject.isEmpty)
        purpose.setLegitimateInterest(false)
        XCTAssertTrue(draft.choices.purposeObjections.contains(purpose.id))
        XCTAssertEqual(draft.iab?.purposes.first { $0.id == purpose.id }?.legitimateInterest, false)
        let vendor = try XCTUnwrap(iab.vendors.first { $0.legitimateInterest != nil })
        vendor.setLegitimateInterest(false)
        XCTAssertTrue(draft.choices.vendorObjections.contains(vendor.id))
        // Purposes 1 and 3 to 6 never take legitimate interest.
        iab.setPurposeLegitimateInterest(1, true)
        XCTAssertFalse(draft.choices.purposeLegitimateInterests.contains(1))
    }

    // TCF-CHECK: P3, P6, P7, P8, P9, P12, P16, P19, P25, P30
    func testTheDisclosureRowsCarryWhatTheScreensMustShow() async throws {
        let core = try await headlessFixtureCore("iab-init.json", iab: true)
        let iab = try XCTUnwrap(ConsentDraft(core: core).iab)
        let first = iab.firstLayer
        XCTAssertEqual(first.partnerCount, iab.disclosure.bannerSummary.vendorCount)
        XCTAssertTrue(first.description.contains(first.partnersLink))
        XCTAssertEqual(first.description, first.descriptionLead + first.partnersLink + first.descriptionTail)
        XCTAssertTrue(!first.summary.isEmpty && !first.scope.isEmpty && !first.withdraw.isEmpty)
        // Providers are their own list with their own heading, apart from IAB vendors.
        XCTAssertEqual(iab.adTechProviders.map(\.id), (iab.disclosure.adTechProviders ?? []).map(\.id))
        XCTAssertTrue(!iab.adTechProviders.isEmpty && !iab.adTechProvidersHeading.isEmpty)
        XCTAssertTrue(iab.adTechProviders.allSatisfy { provider in !iab.vendors.contains { $0.name == provider.name } })
        let purpose = try XCTUnwrap(iab.purposes.first)
        XCTAssertEqual(purpose.consentPartnerCount, iab.disclosure.partnerCounts(purposeId: purpose.id).consent)
        XCTAssertTrue(purpose.partnersNote.contains(String(purpose.consentPartnerCount)))
        let vendor = try XCTUnwrap(iab.vendors.first)
        XCTAssertEqual(vendor.disclosure, iab.disclosure.vendors[vendor.id])
        XCTAssertEqual(vendor.details.consentPurposes.count, vendor.disclosure.consentPurposes.count)
        XCTAssertNotNil(vendor.details.privacyPolicy)
        XCTAssertTrue(!vendor.details.retention.isEmpty && !vendor.details.storage.isEmpty)
        XCTAssertNotNil(iab.consentStorage)
    }
}

/// A store whose next snapshot write can be made to fail.
final class RefusingStore: ConsentStore, @unchecked Sendable {
    private let base = InMemoryStore()
    private let lock = NSLock()
    private var refuse = false
    var refuseNext: Bool {
        get { lock.lock(); defer { lock.unlock() }; return refuse }
        set { lock.lock(); refuse = newValue; lock.unlock() }
    }
    func data(for key: String) -> Data? { base.data(for: key) }
    func set(_ value: Data?, for key: String) -> Bool {
        if key == StorageKey.snapshot {
            lock.lock()
            let refused = refuse
            refuse = false
            lock.unlock()
            if refused { return false }
        }
        return base.set(value, for: key)
    }
}

/// Boots a core on one of the demo's `/init` fixtures.
func headlessFixtureCore(_ fixture: String, store: any ConsentStore = InMemoryStore(), iab: Bool = false) async throws -> ConsentCore {
    struct Peer: HTTPTransport {
        let body: Data
        func send(_ request: HTTPRequest) async throws -> HTTPResponse {
            request.method == .get
                ? HTTPResponse(status: 200, headers: ["x-c15t-policy-contract": "1"], body: body)
                : HTTPResponse(status: 503)
        }
    }
    let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
    let body = try Data(contentsOf: root.appendingPathComponent("../examples/native/consent-demo/fixtures/\(fixture)"))
    let core = ConsentCore()
    core.bootstrap(CoreConfig(store: store,
        transport: HostedTransport(baseURL: URL(string: "https://fixture.invalid")!, client: Peer(body: body)),
        iab: iab ? IABConfiguration(cmpId: 53, cmpVersion: 7, publisherCountryCode: "GB") : nil, initRetry: .disabled))
    await core.waitUntilIdle()
    return core
}
