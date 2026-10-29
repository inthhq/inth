import Foundation
import XCTest

@testable import C15tCore

extension IABCommitTests {
    func testStaleListKeepsDormantConsentAcrossRetryAndRestartUntilIdenticalRefresh() async throws {
        let vector = try fixture()
        let store = InMemoryStore()
        let first = try await boot(vector, configuration: vector.cases[0].configuration, store: store)
        XCTAssertEqual(first.save(.all).status, .committed)
        await first.waitUntilIdle()
        let saved = try XCTUnwrap(first.iabConsent())
        let choice = first.snapshot().explicitChoice
        let body = first.pendingSaveBodies()
        let clock = TestClock(vector.now)
        let http = StubHTTP()
        http.initResponse = HTTPResponse(status: 503, body: Data("{}".utf8))
        http.setSavesFail(true)
        let core = ConsentCore()
        core.bootstrap(CoreConfig(store: store, transport: Fixture.transport(http),
            iab: vector.cases[0].configuration, iabListMaxAgeMs: 100,
            now: clock.reading, initRetry: .disabled, flushPendingOnBootstrap: false))
        await core.waitUntilIdle()
        let expired = expectation(description: "list deadline denies the existing gate")
        let gate = core.gate(OptionalConsentCategory.marketing) { allowed in
            if !allowed { expired.fulfill() }
        }
        clock.advance(by: 100)
        await fulfillment(of: [expired], timeout: 1)
        gate.cancel()
        XCTAssertNil(core.iabConsent())
        XCTAssertNil(core.openIABDraft())
        XCTAssertFalse(core.isAllowed(.marketing))
        XCTAssertEqual(core.snapshot().explicitChoice, choice)
        XCTAssertEqual(core.pendingSaveBodies(), body)
        let staleRevision = core.snapshot().revision
        core.refresh()
        core.flushPending()
        await core.waitUntilIdle()
        XCTAssertEqual(core.snapshot().revision, staleRevision, "another offline retry changes no authority")
        XCTAssertEqual(core.pendingSaveBodies(), body)
        let envelope = try XCTUnwrap(store.data(for: StorageKey.snapshot).flatMap(StoredEnvelope.decode))
        XCTAssertEqual(envelope.iabConsent, saved)
        XCTAssertFalse(envelope.snapshot.effectivePermissions.marketing)

        let cold = ConsentCore()
        cold.bootstrap(CoreConfig(store: store, transport: Fixture.transport(http),
            iab: vector.cases[0].configuration, iabListMaxAgeMs: 100,
            now: clock.reading, initRetry: .disabled, flushPendingOnBootstrap: false))
        await cold.waitUntilIdle()
        XCTAssertFalse(cold.isAllowed(.marketing))
        XCTAssertEqual(cold.pendingSaveBodies(), body)
        var fields = C15tJSON.parse(Fixture.initBody(policyResolution:
            Fixture.matchedResolution(policy: Fixture.rule(model: "iab"))))!.objectValue!
        fields["gvl"] = try C15tJSON.parse(C15tJSON.encode(vector.gvl))
        http.initResponse = HTTPResponse(status: 200, body: try C15tJSON.encode(JSONValue.object(fields)))
        cold.refresh()
        await cold.waitUntilIdle()
        XCTAssertEqual(cold.iabConsent(), saved)
        XCTAssertEqual(cold.snapshot().explicitChoice, choice)
        XCTAssertTrue(cold.isAllowed(.marketing))
        XCTAssertEqual(cold.pendingSaveBodies(), body, "refresh must not regenerate the original action")
    }
}
