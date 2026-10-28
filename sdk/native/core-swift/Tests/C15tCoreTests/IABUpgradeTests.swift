import Foundation
import XCTest
@testable import C15tCore

final class IABUpgradeTests: XCTestCase {
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
}
