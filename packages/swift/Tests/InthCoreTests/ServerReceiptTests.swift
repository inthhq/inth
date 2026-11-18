import Foundation
import XCTest

@_spi(InthInternal) @testable import InthCore

final class ServerReceiptTests: XCTestCase {
    private let choiceFingerprint = String(repeating: "a", count: 64)

    private func decision(_ value: Bool, at time: Int64) -> CategoryDecision {
        CategoryDecision(value: value, confirmedAt: time,
            basis: .choiceV1(fingerprint: choiceFingerprint))
    }

    private func choice(_ values: [OptionalConsentCategory: Bool], at time: Int64) -> ExplicitChoice {
        ExplicitChoice(categories: values.mapValues { decision($0, at: time) })
    }

    private func response(
        policy: JSONValue?, choice: ExplicitChoice? = nil, dismissal: NoticeDismissal? = nil
    ) throws -> HTTPResponse {
        var fields = try XCTUnwrap(InthJSON.parse(Fixture.initBody(policyResolution: policy))?.objectValue)
        var records: [String: JSONValue] = [:]
        if let choice { records["choice"] = try InthJSON.parse(InthJSON.encode(choice)) }
        if let dismissal { records["noticeDismissal"] = try InthJSON.parse(InthJSON.encode(dismissal)) }
        fields["records"] = .object(records)
        return HTTPResponse(status: 200, body: try XCTUnwrap(InthJSON.encode(.object(fields))))
    }

    func testConfiguredIABRestoresServerCategoryReceiptsUnderOptInPolicy() async throws {
        let vector = try IABCommitTests().fixture()
        let receipt = choice(Dictionary(uniqueKeysWithValues:
            OptionalConsentCategory.allCases.map { ($0, true) }), at: vector.now)
        for configured in [false, true] {
            let store = InMemoryStore()
            let http = StubHTTP()
            http.initResponse = try response(policy: Fixture.matchedResolution(), choice: receipt)
            let core = ConsentCore()
            core.bootstrap(CoreConfig(store: store, transport: Fixture.transport(http),
                iab: configured ? vector.cases[0].configuration : nil, now: { vector.now },
                initRetry: .disabled, flushPendingOnBootstrap: false))
            await core.waitUntilIdle()
            XCTAssertEqual(core.snapshot().explicitChoice, receipt, "configured: \(configured)")
            XCTAssertTrue(core.isAllowed(.marketing), "configured: \(configured)")
            XCTAssertEqual(core.snapshot().promptRequirement.kind, .none)
            XCTAssertNil(core.iabConsent())
            XCTAssertEqual(store.data(for: StorageKey.snapshot).flatMap(StoredEnvelope.decode)?.snapshot.explicitChoice, receipt)
        }
    }

    func testConfiguredIABMergesNewestCategoryReceiptOnRefresh() async throws {
        let vector = try IABCommitTests().fixture()
        let clock = TestClock(vector.now)
        let http = StubHTTP()
        http.setSavesFail(true)
        http.initResponse = try response(policy: Fixture.matchedResolution())
        let core = ConsentCore()
        core.bootstrap(CoreConfig(store: InMemoryStore(), transport: Fixture.transport(http),
            iab: vector.cases[0].configuration, now: clock.reading,
            initRetry: .disabled, flushPendingOnBootstrap: false))
        await core.waitUntilIdle()
        XCTAssertEqual(core.save(.custom([.marketing: false, .measurement: true])).status, .committed)
        await core.waitUntilIdle()
        let local = try XCTUnwrap(core.snapshot().explicitChoice)
        let incoming = ExplicitChoice(categories: [
            .marketing: decision(true, at: vector.now - 1),
            .measurement: decision(false, at: vector.now + 1),
            .experience: decision(true, at: vector.now),
        ])
        clock.advance(by: 1_000)
        http.initResponse = try response(policy: Fixture.matchedResolution(), choice: incoming)
        core.refresh()
        await core.waitUntilIdle()
        let merged = try XCTUnwrap(core.snapshot().explicitChoice)
        XCTAssertEqual(merged.categories[.marketing], local.categories[.marketing])
        XCTAssertEqual(merged.categories[.measurement], incoming.categories[.measurement])
        XCTAssertEqual(merged.categories[.experience], incoming.categories[.experience])
        XCTAssertFalse(core.isAllowed(.marketing))
        XCTAssertFalse(core.isAllowed(.measurement))
        XCTAssertTrue(core.isAllowed(.experience))
    }

    func testConfiguredIABRestoresServerNoticeDismissalUnderOptOutPolicy() async throws {
        let vector = try IABCommitTests().fixture()
        let dismissal = NoticeDismissal(dismissedAt: vector.now, fingerprint: String(repeating: "b", count: 64))
        let store = InMemoryStore()
        let http = StubHTTP()
        http.initResponse = try response(policy: Fixture.matchedResolution(policy:
            Fixture.rule(model: "opt-out", prompt: "notice", rights: ["disclosure", "preferences", "opt-out"])),
            dismissal: dismissal)
        let core = ConsentCore()
        core.bootstrap(CoreConfig(store: store, transport: Fixture.transport(http),
            iab: vector.cases[0].configuration, now: { vector.now },
            initRetry: .disabled, flushPendingOnBootstrap: false))
        await core.waitUntilIdle()
        XCTAssertFalse(core.snapshot().policyPending)
        XCTAssertEqual(core.snapshot().promptRequirement.kind, .none)
        XCTAssertEqual(store.data(for: StorageKey.snapshot).flatMap(StoredEnvelope.decode)?.noticeDismissal, dismissal)
    }

    func testServerCategoryReceiptsSurviveTransitionAwayFromNativeIAB() async throws {
        let vector = try IABCommitTests().fixture()
        let clock = TestClock(vector.now)
        let http = StubHTTP()
        let store = InMemoryStore()
        let core = try await IABCommitTests().boot(vector,
            configuration: vector.cases[0].configuration, store: store, http: http, clock: clock)
        XCTAssertEqual(core.save(.necessary).status, .committed)
        await core.waitUntilIdle()
        XCTAssertNotNil(core.iabConsent())
        let withdrawal = try XCTUnwrap(core.pendingSaveBodies().first)
        clock.advance(by: 1_000)
        let receipt = choice(Dictionary(uniqueKeysWithValues:
            OptionalConsentCategory.allCases.map { ($0, true) }), at: clock.now)
        http.initResponse = try response(policy: Fixture.matchedResolution(), choice: receipt)
        core.refresh()
        await core.waitUntilIdle()
        XCTAssertNil(core.iabConsent())
        XCTAssertEqual(core.snapshot().explicitChoice, receipt)
        XCTAssertTrue(core.isAllowed(.marketing))
        XCTAssertEqual(core.snapshot().promptRequirement.kind, .none)
        XCTAssertEqual(core.pendingSaveBodies(), [withdrawal])
        XCTAssertEqual(store.data(for: StorageKey.snapshot).flatMap(StoredEnvelope.decode)?.snapshot.explicitChoice, receipt)
    }

    func testServerCategoryReceiptsCannotCreateOrReplaceNativeIABAuthority() async throws {
        let vector = try IABCommitTests().fixture()
        let http = StubHTTP()
        http.setSavesFail(true)
        http.initResponse = try response(policy: Fixture.matchedResolution(policy: Fixture.rule(model: "iab")),
            choice: choice([.marketing: true], at: vector.now))
        let core = ConsentCore()
        core.bootstrap(CoreConfig(store: InMemoryStore(), transport: Fixture.transport(http),
            iab: vector.cases[0].configuration, now: { vector.now },
            initRetry: .disabled, flushPendingOnBootstrap: false))
        await core.waitUntilIdle()
        XCTAssertNil(core.snapshot().explicitChoice)
        XCTAssertNil(core.iabConsent())
        XCTAssertFalse(core.isAllowed(.marketing))
        XCTAssertEqual(core.snapshot().promptRequirement.kind, .choice)

        var fields = try XCTUnwrap(InthJSON.parse(http.initResponse.body)?.objectValue)
        fields["gvl"] = try InthJSON.parse(InthJSON.encode(vector.gvl))
        http.initResponse = HTTPResponse(status: 200, body: try XCTUnwrap(InthJSON.encode(.object(fields))))
        core.refresh()
        await core.waitUntilIdle()
        XCTAssertEqual(core.save(.necessary).status, .committed)
        await core.waitUntilIdle()
        let authority = try XCTUnwrap(core.iabConsent())
        let receipt = core.snapshot().explicitChoice
        core.refresh()
        await core.waitUntilIdle()
        XCTAssertEqual(core.iabConsent(), authority)
        XCTAssertEqual(core.snapshot().explicitChoice, receipt)
        XCTAssertFalse(core.isAllowed(.marketing))
    }

    func testConfiguredIABDoesNotImportReceiptsWithoutAReadablePolicy() async throws {
        let vector = try IABCommitTests().fixture()
        for policy in [nil, JSONValue.object(["version": .integer(999)])] {
            let http = StubHTTP()
            http.initResponse = try response(policy: policy, choice: choice([.marketing: true], at: vector.now))
            let core = ConsentCore()
            core.bootstrap(CoreConfig(store: InMemoryStore(), transport: Fixture.transport(http),
                iab: vector.cases[0].configuration, now: { vector.now },
                initRetry: .disabled, flushPendingOnBootstrap: false))
            await core.waitUntilIdle()
            XCTAssertTrue(core.snapshot().policyPending)
            XCTAssertNil(core.snapshot().explicitChoice)
            XCTAssertFalse(core.isAllowed(.marketing))
            http.initResponse = try response(policy: Fixture.matchedResolution())
            core.refresh()
            await core.waitUntilIdle()
            XCTAssertNil(core.snapshot().explicitChoice)
            XCTAssertFalse(core.isAllowed(.marketing))
        }
    }
}
