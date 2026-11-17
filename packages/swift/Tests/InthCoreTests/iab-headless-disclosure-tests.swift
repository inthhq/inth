import Foundation
import XCTest
@_spi(InthInternal) @testable import InthCore

/// What a React Native screen drawing its own TCF UI is given and what its commit writes, under
/// publisher restrictions and Google Additional Consent providers.
///
/// `packages/native-protocol/iab/headless-disclosure-cases.json` is generated from the web code
/// (`packages/sdk/iab/src/__tests__/native-headless-disclosure.test.ts`). Kotlin's
/// `IabHeadlessDisclosureTest` asserts the same values.
final class IABHeadlessDisclosureTests: XCTestCase {
    struct Vector: Decodable {
        struct Disclosure: Decodable {
            struct Vendor: Decodable, Equatable {
                let consentPurposes: [Int]
                let consentRequiredPurposes: [Int]
                let legitimateInterestPurposes: [Int]
                let legitimateInterestRequiredPurposes: [Int]
                let notAllowedPurposes: [Int]
            }
            struct Counts: Decodable, Equatable {
                let consentPartnerCount: Int
                let legitimateInterestPartnerCount: Int
            }
            struct Summary: Decodable, Equatable {
                let vendorCount: Int
                let displayItems: [String]
                let remainingCount: Int
            }
            let adTechProviderPurposeIds: [Int]
            let adTechProviders: [AdTechProvider]
            let bannerSummary: Summary
            let declaredPurposeIds: [Int]
            let declaredSpecialFeatureIds: [Int]
            let language: String
            let purposes: [String: Counts]
            let vendors: [String: Vendor]
        }
        struct Case: Decodable {
            let id: String
            let choices: IABChoices
            let tcString: String
            let addtlConsent: String?
        }
        struct Conflict: Decodable {
            let id: String
            let choices: IABChoices
            let conflicts: [String]
        }
        let vendorList: String
        let now: Int64
        let configuration: IABConfiguration
        let disclosure: Disclosure
        let acceptAll: IABChoices
        let cases: [Case]
        let conflicts: [Conflict]
        let customVendors: JSONValue
    }

    struct VendorList: Decodable {
        let gvl: JSONValue
        let adTechProviders: JSONValue
    }

    static let directory = IABCommitTests.fixtureURL.deletingLastPathComponent()

    func vector() throws -> (Vector, VendorList) {
        let vector = try InthJSON.decode(
            Vector.self, from: Data(contentsOf: Self.directory.appendingPathComponent("headless-disclosure-cases.json")))
        let list = try InthJSON.decode(
            VendorList.self, from: Data(contentsOf: Self.directory.appendingPathComponent(vector.vendorList)))
        return (vector, list)
    }

    func boot(_ vector: Vector, _ list: VendorList) async throws -> ConsentCore {
        var fields = InthJSON.parse(Fixture.initBody(
            policyResolution: Fixture.matchedResolution(policy: Fixture.rule(model: "iab"))))!.objectValue!
        fields["gvl"] = list.gvl
        fields["adTechProviders"] = list.adTechProviders
        fields["customVendors"] = vector.customVendors
        let http = StubHTTP()
        http.initResponse = HTTPResponse(status: 200, body: try InthJSON.encode(JSONValue.object(fields)))
        http.setSavesFail(true)
        let core = ConsentCore()
        let now = vector.now
        core.bootstrap(CoreConfig(
            store: InMemoryStore(), transport: Fixture.transport(http), iab: vector.configuration,
            now: { now }, initRetry: .disabled, flushPendingOnBootstrap: false))
        await core.waitUntilIdle()
        return core
    }

    func testThePresentationCarriesTheDisclosureACustomScreenMustShow() async throws {
        let (vector, list) = try vector()
        let core = try await boot(vector, list)
        let presentation = try XCTUnwrap(core.iabPresentation())
        let expected = vector.disclosure

        XCTAssertTrue(presentation.canEdit)
        XCTAssertEqual(Set(presentation.vendors.keys.map(String.init)), Set(expected.vendors.keys))
        for (id, disclosure) in presentation.vendors {
            XCTAssertEqual(Vector.Disclosure.Vendor(
                consentPurposes: disclosure.consentPurposes,
                consentRequiredPurposes: disclosure.consentRequiredPurposes,
                legitimateInterestPurposes: disclosure.legitimateInterestPurposes,
                legitimateInterestRequiredPurposes: disclosure.legitimateInterestRequiredPurposes,
                notAllowedPurposes: disclosure.notAllowedPurposes), expected.vendors[String(id)], "vendor \(id)")
        }
        XCTAssertEqual(presentation.declaredPurposeIds, expected.declaredPurposeIds)
        XCTAssertEqual(presentation.declaredSpecialFeatureIds, expected.declaredSpecialFeatureIds)
        for id in presentation.declaredPurposeIds {
            let counts = presentation.partnerCounts(purposeId: id)
            XCTAssertEqual(Vector.Disclosure.Counts(
                consentPartnerCount: counts.consent, legitimateInterestPartnerCount: counts.legitimateInterest),
                expected.purposes[String(id)], "purpose \(id)")
        }
        XCTAssertEqual(presentation.adTechProviders, expected.adTechProviders)
        XCTAssertEqual(presentation.adTechProviderPurposeIds, expected.adTechProviderPurposeIds)
        XCTAssertEqual(Vector.Disclosure.Summary(
            vendorCount: presentation.bannerSummary.vendorCount,
            displayItems: presentation.bannerSummary.displayItems,
            remainingCount: presentation.bannerSummary.remainingCount), expected.bannerSummary)
        XCTAssertEqual(presentation.language, expected.language)
        XCTAssertEqual(presentation.customVendors.map(\.id),
            vector.customVendors.arrayValue?.compactMap { $0.objectValue?["id"]?.stringValue })
        XCTAssertEqual(core.iabAcceptAllChoices(), vector.acceptAll)
    }

    func testTheStockSaveWritesTheFixtureStrings() async throws {
        let (vector, list) = try vector()
        for row in vector.cases {
            let core = try await boot(vector, list)
            let draft = try XCTUnwrap(core.openIABDraft(), row.id)
            XCTAssertEqual(core.saveIAB(IABDraft(revision: draft.revision, choices: row.choices), categories: [:]).status,
                .committed, row.id)
            let saved = try XCTUnwrap(core.iabConsent(), row.id)
            XCTAssertEqual(saved.choices.customVendorConsents, row.choices.customVendorConsents, row.id)
            XCTAssertEqual(saved.tcString, row.tcString, row.id)
            XCTAssertEqual(saved.addtlConsent, row.addtlConsent, row.id)
            XCTAssertEqual(core.iabPresentation()?.restrictionConflicts(row.choices), [], row.id)
        }
    }

    func testRestrictionConflictsNameTheVendorSignalsARestrictionRulesOut() async throws {
        let (vector, list) = try vector()
        let core = try await boot(vector, list)
        let presentation = try XCTUnwrap(core.iabPresentation())
        for row in vector.conflicts {
            XCTAssertEqual(presentation.restrictionConflicts(row.choices), row.conflicts, row.id)
        }
    }
}
