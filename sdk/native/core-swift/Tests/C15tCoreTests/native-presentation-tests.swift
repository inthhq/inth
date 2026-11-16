import Foundation
import XCTest
@_spi(C15tInternal) @testable import C15tCore

final class NativePresentationTests: XCTestCase {
    final class RefusingStore: ConsentStore, @unchecked Sendable {
        let base = InMemoryStore()
        var refuse = false
        func data(for key: String) -> Data? { base.data(for: key) }
        func set(_ value: Data?, for key: String) -> Bool { refuse && key == StorageKey.snapshot ? false : base.set(value, for: key) }
    }
    func testNoticeRefusalKeepsObligationAndRetryPersistsWithoutGranting() async {
        let store = RefusingStore(), http = StubHTTP(), clock = TestClock()
        http.initResponse = Fixture.initResponse(policyResolution: Fixture.matchedResolution(policy: Fixture.rule(model: "opt-out", prompt: "notice", rights: ["disclosure", "preferences", "opt-out"])))
        let core = ConsentCore()
        await core.bootstrapAndSettle(Fixture.configured(store: store, transport: Fixture.transport(http), clock: clock))
        let before = core.snapshot()
        let bytes = store.data(for: StorageKey.snapshot)
        XCTAssertEqual(before.promptRequirement.kind, .notice)
        store.refuse = true
        core.dismissNotice()
        XCTAssertEqual(core.snapshot(), before)
        XCTAssertEqual(store.data(for: StorageKey.snapshot), bytes)
        store.refuse = false
        core.dismissNotice()
        XCTAssertEqual(core.snapshot().promptRequirement.kind, .none)
        XCTAssertEqual(core.snapshot().effectivePermissions, before.effectivePermissions)
        XCTAssertNil(core.snapshot().explicitChoice)
        let cold = ConsentCore()
        cold.bootstrap(CoreConfig(store: store, now: clock.reading))
        XCTAssertEqual(cold.snapshot().promptRequirement.kind, .none)
    }
    func testPublisherRestrictionsProjectEachBasisAndSuppressProhibitedLI() {
        let vendor = GVLVendor(id: 12, purposes: [1, 3, 4, 7, 8], legIntPurposes: [7, 8, 9], flexiblePurposes: [7, 8, 9])
        let config = IABConfiguration(cmpId: 53, cmpVersion: 7, publisherCountryCode: "GB", publisherRestrictions: [
            .init(purposeId: 7, type: 0, vendorIds: [12]),
            .init(purposeId: 8, type: 2, vendorIds: [12]),
            .init(purposeId: 9, type: 1, vendorIds: [12]),
        ])
        let projected = config.disclosure(for: vendor)
        XCTAssertEqual(projected.consentPurposes, [1, 3, 4, 9])
        XCTAssertEqual(projected.legitimateInterestPurposes, [8])
        XCTAssertEqual(projected.notAllowedPurposes, [7])
    }
    func testNativePresentationStartsWithoutLISignalAndKeepsAuthorityUntouched() async throws {
        let helper = IABCommitTests()
        let vector = try helper.fixture()
        let core = try await helper.boot(vector, configuration: vector.cases[0].configuration, store: InMemoryStore())
        let projection = try XCTUnwrap(core.iabPresentation())
        XCTAssertEqual(projection.draft.revision, core.snapshot().revision)
        XCTAssertTrue(projection.draft.choices.purposeLegitimateInterests.isEmpty)
        XCTAssertTrue(projection.draft.choices.vendorLegitimateInterests.isEmpty)
        var draft = projection.draft
        draft.choices.purposeConsents = [1]
        XCTAssertTrue(core.iabPresentation()!.draft.choices.purposeConsents.isEmpty)
        XCTAssertNil(core.iabConsent())
    }
}
