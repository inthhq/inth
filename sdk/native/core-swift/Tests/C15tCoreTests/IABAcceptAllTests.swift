import Foundation
import XCTest
@testable import C15tCore

/// Accept All grants only what the served list declares, as `applyBlanket` in
/// `packages/iab/src/index.ts` does (TCF Policies 5(3), 5(6) and 5(8)).
///
/// `native/protocol/iab/accept-all-declared-signals.json` holds a real served GVL (v183,
/// vendors 10, 21, 52, 91 and 755) and, per case, what the web's `acceptAll()` encodes for it.
final class IABAcceptAllTests: XCTestCase {
    struct Vector: Decodable {
        struct Case: Decodable {
            let id: String
            let publisherRestrictions: [IABPublisherRestriction]
            let acceptAll: IABChoices
        }
        let gvl: JSONValue
        let adTechProviders: JSONValue
        let cases: [Case]
    }

    static let fixtureURL = IABCommitTests.fixtureURL.deletingLastPathComponent()
        .appendingPathComponent("accept-all-declared-signals.json")

    func boot(_ vector: Vector, restrictions: [IABPublisherRestriction]) async throws -> ConsentCore {
        var fields = C15tJSON.parse(Fixture.initBody(
            policyResolution: Fixture.matchedResolution(policy: Fixture.rule(model: "iab"))))!.objectValue!
        fields["gvl"] = vector.gvl
        fields["adTechProviders"] = vector.adTechProviders
        let http = StubHTTP()
        http.initResponse = HTTPResponse(status: 200, body: try C15tJSON.encode(JSONValue.object(fields)))
        http.setSavesFail(true)
        let core = ConsentCore()
        core.bootstrap(CoreConfig(
            store: InMemoryStore(), transport: Fixture.transport(http),
            iab: IABConfiguration(cmpId: 53, cmpVersion: 7, publisherCountryCode: "GB",
                numCustomPurposes: 2, publisherRestrictions: restrictions),
            initRetry: .disabled, flushPendingOnBootstrap: false))
        await core.waitUntilIdle()
        return core
    }

    func testAcceptAllGrantsOnlyWhatSomeVendorDeclares() async throws {
        let vector = try C15tJSON.decode(Vector.self, from: Data(contentsOf: Self.fixtureURL))
        var checked: [String] = []
        for row in vector.cases {
            let core = try await boot(vector, restrictions: row.publisherRestrictions)
            // A headless Accept all stages what this answers, so it must be the same selection.
            XCTAssertEqual(core.iabAcceptAllChoices(), row.acceptAll, row.id)
            // A headless screen is refused while restrictions apply, so it must see them.
            XCTAssertEqual(core.iabPublisherRestrictions, row.publisherRestrictions, row.id)
            XCTAssertEqual(core.save(.all).status, .committed, row.id)
            let saved = try XCTUnwrap(core.iabConsent(), row.id)
            // Purposes 5, 6, 8 and 11 are in the list but no vendor declares them; vendors 10
            // and 91 declare no legitimate interest; no publisher purpose is shown, so none is
            // granted.
            XCTAssertEqual(saved.choices, row.acceptAll, row.id)

            guard case .decoded(let tc) = TcStringWireReader.read(saved.tcString) else {
                return XCTFail("\(row.id): the saved TC String does not decode")
            }
            func on(_ vector: TcIDVector?, through last: Int) -> [Int] {
                guard let vector else { return [] }
                return (1...last).filter(vector.contains)
            }
            XCTAssertEqual(on(tc.purposeConsents, through: 24), row.acceptAll.purposeConsents, row.id)
            XCTAssertEqual(on(tc.purposeLegitimateInterests, through: 24), row.acceptAll.purposeLegitimateInterests, row.id)
            XCTAssertEqual(on(tc.vendorConsents, through: 755), row.acceptAll.vendorConsents, row.id)
            XCTAssertEqual(on(tc.vendorLegitimateInterests, through: 755), row.acceptAll.vendorLegitimateInterests, row.id)
            XCTAssertEqual(on(tc.specialFeatureOptIns, through: 12), row.acceptAll.specialFeatureOptIns, row.id)
            XCTAssertEqual(on(tc.publisherSection?.publisherConsents, through: 24), [], row.id)
            XCTAssertEqual(on(tc.publisherSection?.publisherLegitimateInterests, through: 24), [], row.id)
            XCTAssertEqual(on(tc.publisherSection?.publisherCustomConsents, through: 2), [], row.id)
            checked.append(row.id)
        }
        XCTAssertEqual(checked, ["no-restrictions", "publisher-restrictions"])
    }
}
