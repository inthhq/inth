import C15tApple
import C15tCore
import Foundation
import XCTest

/// The web's Consent Mode v2 mapping, through
/// `native/protocol/google-consent-mode/consent-mode-v2.json`. Regenerate it with
/// `bun scripts/generate-google-consent-mode-fixture.ts`.
final class GoogleConsentModeTests: XCTestCase {
    struct Fixture: Decodable {
        struct TypeEntry: Decodable {
            let type: String
            let category: String
        }
        struct Case: Decodable {
            let id: String
            let consents: [String: Bool]
            let expected: [String: String]
        }
        let types: [TypeEntry]
        let mapping: [String: [String]]
        let cases: [Case]
    }

    static let fixtureURL = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        .appendingPathComponent("protocol/google-consent-mode/consent-mode-v2.json")

    private func fixture() throws -> Fixture {
        try JSONDecoder().decode(Fixture.self, from: Data(contentsOf: Self.fixtureURL))
    }

    func testTypesAndCategoriesMatchTheWebInOrder() throws {
        let expected = try fixture().types.map { "\($0.type):\($0.category)" }
        XCTAssertEqual(GoogleConsentType.allCases.map { "\($0.rawValue):\($0.category.rawValue)" }, expected)
    }

    func testMappingGroupsTypesByCategoryAsTheWebDoes() throws {
        let expected = try fixture().mapping
        var actual: [String: [String]] = [:]
        for (category, types) in GoogleConsentMode.mapping {
            actual[category.rawValue] = types.map(\.rawValue)
        }
        XCTAssertEqual(actual, expected)
    }

    func testEveryConsentCombinationSendsWhatTheWebSends() throws {
        let cases = try fixture().cases
        XCTAssertEqual(cases.count, 16, "every consent combination is read")
        for vector in cases {
            let consent = GoogleConsentMode.consent { vector.consents[$0.rawValue] ?? false }
            var actual: [String: String] = [:]
            for (type, granted) in consent {
                actual[type.rawValue] = granted ? "granted" : "denied"
            }
            XCTAssertEqual(actual, vector.expected, vector.id)
        }
    }
}
