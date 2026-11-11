import Foundation
import XCTest

@testable import C15tCore

extension IABCommitTests {
    func testIdentityTransitionsPublishOneRevisionEach() async throws {
        let vector = try fixture()
        let core = try await boot(vector, configuration: vector.cases[0].configuration, store: InMemoryStore())
        let beforeIdentify = core.snapshot().revision
        core.identify(KernelUser(externalId: "u1"))
        XCTAssertEqual(core.snapshot().revision, beforeIdentify + 1)
        let beforeLogout = core.snapshot().revision
        core.logout()
        XCTAssertEqual(core.snapshot().revision, beforeLogout + 1)
        await core.waitUntilIdle()
    }

    func testBackwardClockRefusesAnImmediatelyInvalidActionWithoutWriting() async throws {
        let vector = try fixture()
        let clock = TestClock(vector.now)
        let store = InMemoryStore()
        let core = try await boot(vector, configuration: vector.cases[0].configuration, store: store, clock: clock)
        XCTAssertEqual(core.save(.all).status, .committed)
        await core.waitUntilIdle()
        let bytes = store.data(for: StorageKey.snapshot)
        let revision = core.snapshot().revision
        clock.advance(by: -600_001)
        for intent in [CommitIntent.all, .necessary] {
            let result = core.save(intent)
            XCTAssertEqual(result.status, .rejected)
            XCTAssertEqual(result.error?.code, "invalid-action-time")
            XCTAssertEqual(core.snapshot().revision, revision)
            XCTAssertEqual(store.data(for: StorageKey.snapshot), bytes)
        }
        let cold = try await boot(vector, configuration: vector.cases[0].configuration, store: store, clock: clock)
        let coldBytes = store.data(for: StorageKey.snapshot)
        XCTAssertEqual(cold.save(.all).error?.code, "invalid-action-time")
        XCTAssertEqual(store.data(for: StorageKey.snapshot), coldBytes)
        clock.advance(by: 600_001)
        XCTAssertEqual(cold.save(.necessary).status, .committed)
        XCTAssertNotNil(cold.iabConsent)
        await cold.waitUntilIdle()
    }

    func testIABResetPublishesAndStoresTheCompleteColdStartBaseline() async throws {
        let vector = try fixture()
        let clock = TestClock(vector.now)
        let store = InMemoryStore()
        let http = StubHTTP()
        var fields = C15tJSON.parse(Fixture.initBody(
            policyResolution: Fixture.matchedResolution(policy: Fixture.rule(model: "iab"))))!.objectValue!
        fields["gvl"] = try C15tJSON.parse(C15tJSON.encode(vector.gvl))
        fields["translations"] = .object(["language": .string("en"), "translations": .object(["common": .object(["acceptAll": .string("Accept")])])])
        http.initResponse = HTTPResponse(status: 200, body: try XCTUnwrap(C15tJSON.encode(.object(fields))))
        http.setSavesFail(true)
        let core = ConsentCore()
        core.bootstrap(CoreConfig(store: store, transport: Fixture.transport(http),
            consentCategories: [.marketing], iab: vector.cases[0].configuration,
            overrides: ConsentOverrides(country: nil, region: nil, language: "en", gpc: true), now: clock.reading,
            initRetry: .disabled, flushPendingOnBootstrap: false))
        await core.waitUntilIdle()
        XCTAssertNotNil(core.snapshot().location)
        XCTAssertNotNil(core.snapshot().translations)
        XCTAssertEqual(core.save(.all).status, .committed)
        await core.waitUntilIdle()
        let before = core.snapshot().revision
        clock.advance(by: 1_000)
        let seen = SendableBox<ConsentSnapshot?>(nil)
        let stored = SendableBox<StoredEnvelope?>(nil)
        let witness = ReviewSnapshotObserver { snapshot in
            seen.mutate { if $0 == nil { $0 = snapshot } }
            stored.mutate { if $0 == nil { $0 = store.data(for: StorageKey.snapshot).flatMap(StoredEnvelope.decode) } }
        }
        let subscription = core.onChange { witness.consentDidChange($0) }
        core.reset()
        subscription.cancel()
        let baseline = try XCTUnwrap(seen.value)
        XCTAssertEqual(baseline.revision, before + 1)
        XCTAssertEqual(baseline.model, .optIn)
        XCTAssertNil(baseline.location)
        XCTAssertNil(baseline.translations)
        XCTAssertNil(baseline.explicitChoice)
        XCTAssertNil(baseline.error)
        XCTAssertNil(baseline.iab)
        XCTAssertEqual(baseline.overrides, ConsentOverrides(country: nil, region: nil, language: "en", gpc: true))
        XCTAssertEqual(baseline.evaluatedAt, clock.now)
        XCTAssertTrue(baseline.privacySignals.gpc.active)
        XCTAssertEqual(baseline.consentCategories, [.necessary, .marketing])
        XCTAssertEqual(stored.value?.snapshot, baseline)
        XCTAssertTrue(core.hasStoredSnapshot)
        await core.waitUntilIdle()
    }
}

private final class ReviewSnapshotObserver: @unchecked Sendable {
    let receive: @Sendable (ConsentSnapshot) -> Void
    init(_ receive: @escaping @Sendable (ConsentSnapshot) -> Void) { self.receive = receive }
    func consentDidChange(_ snapshot: ConsentSnapshot) { receive(snapshot) }
}
