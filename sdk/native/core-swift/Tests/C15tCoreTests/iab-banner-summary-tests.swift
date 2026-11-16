import Foundation
import XCTest

@_spi(C15tInternal) @testable import C15tCore

/// The first-layer summary against the web's `resolveIABBannerSummary`, through
/// `native/protocol/iab/banner-summary-*.json`. Regenerate the fixtures with
/// `bun scripts/generate-iab-banner-summary-fixtures.ts`.
final class IABBannerSummaryTests: XCTestCase {
    struct Fixture: Decodable {
        struct Input: Decodable {
            let gvl: GlobalVendorList
            let vendorIds: [Int]?
            let adTechProviderCount: Int
            let customVendorCount: Int
        }
        struct Expected: Decodable {
            let vendorCount: Int
            let displayItems: [String]
            let remainingCount: Int
            let declaredPurposeIds: [Int]
            let declaredSpecialFeatureIds: [Int]
        }
        let id: String
        let input: Input
        let expected: Expected
    }

    static func fixtures() throws -> [Fixture] {
        let directory = IABCommitTests.fixtureURL.deletingLastPathComponent()
        let files = try FileManager.default.contentsOfDirectory(atPath: directory.path)
            .filter { $0.hasPrefix("banner-summary-") && $0.hasSuffix(".json") }
            .sorted()
        return try files.map { try C15tJSON.decode(Fixture.self, from: Data(contentsOf: directory.appendingPathComponent($0))) }
    }

    // TCF-CHECK: P7
    // TCF-CHECK: P12
    func testSummaryMatchesTheWebOnEverySharedFixture() throws {
        let fixtures = try Self.fixtures()
        XCTAssertEqual(fixtures.count, 7, "every banner-summary fixture is read")
        for fixture in fixtures {
            let list = fixture.input.gvl.narrowed(toVendorIds: fixture.input.vendorIds)
            let summary = IABBannerSummary.resolve(
                list: list, adTechProviderCount: fixture.input.adTechProviderCount,
                customVendorCount: fixture.input.customVendorCount)
            XCTAssertEqual(
                summary,
                IABBannerSummary(
                    vendorCount: fixture.expected.vendorCount, displayItems: fixture.expected.displayItems,
                    remainingCount: fixture.expected.remainingCount),
                fixture.id)
            XCTAssertEqual(
                list.declaredPurposeIds(adTechProviderCount: fixture.input.adTechProviderCount),
                fixture.expected.declaredPurposeIds, fixture.id)
            XCTAssertEqual(list.declaredSpecialFeatureIds(), fixture.expected.declaredSpecialFeatureIds, fixture.id)
        }
    }

    // TCF-CHECK: P7
    // TCF-CHECK: P12
    func testPresentationCarriesTheSummaryStorageLimitAndLanguage() async throws {
        let helper = IABCommitTests()
        let vector = try helper.fixture()
        let core = try await helper.boot(vector, configuration: vector.cases[0].configuration, store: InMemoryStore())
        let presentation = try XCTUnwrap(core.iabPresentation())
        XCTAssertEqual(
            presentation.bannerSummary,
            IABBannerSummary.resolve(list: presentation.list, adTechProviderCount: presentation.adTechProviders?.count ?? 0))
        XCTAssertEqual(presentation.bannerSummary.vendorCount, presentation.vendors.count)
        XCTAssertEqual(presentation.declaredPurposeIds, presentation.list.declaredPurposeIds(adTechProviderCount: 0))
        XCTAssertEqual(presentation.declaredSpecialFeatureIds, presentation.list.declaredSpecialFeatureIds())
        // `Fixture.rule` keeps a choice for 31_536_000_000 ms.
        XCTAssertEqual(presentation.consentStorageMaxDays, 365)
        XCTAssertEqual(presentation.language, "EN")
    }

    func testStorageDaysRoundUpAndOnlyAMissingLimitIsNil() {
        XCTAssertEqual(IABPresentation.days(ms: 31_536_000_000), 365)
        XCTAssertEqual(IABPresentation.days(ms: 3_600_000), 1)
        XCTAssertEqual(IABPresentation.days(ms: 86_400_001), 2)
        XCTAssertNil(IABPresentation.days(ms: nil))
        XCTAssertNil(IABPresentation.days(ms: 0))
    }
}
