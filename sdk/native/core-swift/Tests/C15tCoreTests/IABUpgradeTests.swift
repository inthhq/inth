import Foundation
import XCTest
@testable import C15tCore

final class IABUpgradeTests: XCTestCase {
    func testPermissiveScopeNeverGrantsWithoutAuthorityAfterCommands() async throws {
        let http = StubHTTP()
        http.initResponse = Fixture.initResponse(policyResolution: Fixture.matchedResolution(
            policy: Fixture.rule(model: "iab", scope: ["marketing"], scopeMode: "permissive")))
        let core = ConsentCore()
        core.bootstrap(CoreConfig(store: InMemoryStore(), transport: Fixture.transport(http), initRetry: .disabled))
        await core.waitUntilIdle()
        XCTAssertFalse(core.snapshot().policyPending)
        core.dismissNotice()
        XCTAssertFalse(core.isAllowed(.measurement))
        core.setOverrides(ConsentOverrides(country: "GB", region: nil, language: "en"))
        XCTAssertFalse(core.isAllowed(.measurement))
        core.identify(KernelUser(externalId: "u1"))
        XCTAssertFalse(core.isAllowed(.measurement))
        await core.waitUntilIdle()
        core.logout()
        XCTAssertFalse(core.isAllowed(.measurement))
    }

    func testLegacyCategoryGrantFailsClosedAndCanBeWithdrawnWithoutIABConfig() async throws {
        let dump = try JSONSerialization.jsonObject(with: Data(contentsOf: IABCommitTests.fixtureURL.deletingLastPathComponent().appendingPathComponent("legacy-category-store.json"))) as! [String: String]
        let store = InMemoryStore()
        for (key, value) in dump { store.set(Data(base64Encoded: value), for: key) }
        let http = StubHTTP()
        http.initResponse = HTTPResponse(status: 200, body: Fixture.initBody(
            policyResolution: Fixture.matchedResolution(policy: Fixture.rule(model: "iab"))))
        let core = ConsentCore()
        core.bootstrap(CoreConfig(store: store, transport: Fixture.transport(http),
            now: { 1_758_100_000_000 + 60_000 }, initRetry: .disabled, flushPendingOnBootstrap: false))
        await core.waitUntilIdle()
        XCTAssertFalse(core.isAllowed(.marketing))
        XCTAssertEqual(core.save(.all).status, .rejected)
        let result = core.save(.necessary)
        XCTAssertEqual(result.status, .committed)
        await core.waitUntilIdle()
        XCTAssertFalse(core.isAllowed(.marketing), "a refused withdrawal leaves the old grant active")
    }

    func testConfiglessWithdrawalSurvivesRefusalResetAndRepeatedClock() async throws {
        let vector = try IABCommitTests().fixture()
        let store = InMemoryStore()
        let http = StubHTTP()
        http.initResponse = Fixture.initResponse(policyResolution: Fixture.matchedResolution(policy: Fixture.rule(model: "iab")))
        http.setSavesFail(true)
        http.saveFailureStatus = 400
        let core = ConsentCore()
        core.bootstrap(CoreConfig(store: store, transport: Fixture.transport(http), now: { vector.now }, initRetry: .disabled))
        await core.waitUntilIdle()
        XCTAssertEqual(core.save(.necessary).status, .committed)
        await core.waitUntilIdle()
        XCTAssertEqual(core.pendingSaveCount(), 1, "a refused withdrawal stays owed")
        let frozen = core.pendingSaveBodies().first
        XCTAssertEqual(core.save(.necessary).status, .committed)
        await core.waitUntilIdle()
        let times = core.pendingSaveBodies().compactMap { C15tJSON.parse($0)?["givenAt"]?.intValue }
        XCTAssertEqual(times, [vector.now, vector.now + 1])
        core.reset()
        await core.waitUntilIdle()
        XCTAssertTrue(core.pendingSaveBodies().contains { $0 == frozen })
        http.setSavesFail(false)
        core.flushPending()
        await core.waitUntilIdle()
        XCTAssertEqual(core.pendingSaveCount(), 0)
    }
}
