import Foundation
import XCTest

@testable import C15tCore

/// Independent reference bytes from @iabtechlabtcf/core 1.5.22.
final class IABAuthorityOracleTests: XCTestCase {
    struct Oracle: Decodable {
        struct Restriction: Decodable { let purposeId: Int; let type: Int; let vendorIds: [Int] }
        struct Case: Decodable {
            let id: String
            let gvl: GlobalVendorList?
            let tcString: String
            let createdDaysAgo: Int64?
            let purposeConsents: [Int]?
            let purposeLegitimateInterests: [Int]?
            let vendorConsents: [Int]?
            let vendorLegitimateInterests: [Int]?
            let restrictions: [Restriction]?
        }
        let gvl: GlobalVendorList
        let now: Int64
        let cases: [Case]
    }

    // TCF-CHECK: T6
    // TCF-CHECK: T8
    // TCF-CHECK: T10
    // TCF-CHECK: T11
    // TCF-CHECK: T13
    func testNativeMatchesReferenceOnGapsDeletedVendorsAndDays() throws {
        let oracle = try C15tJSON.decode(
            Oracle.self,
            from: Data(contentsOf: IABCommitTests.fixtureURL.deletingLastPathComponent().appendingPathComponent("authority-oracle.json")))
        for row in oracle.cases {
            let configuration = IABConfiguration(
                cmpId: 53, cmpVersion: 7, publisherCountryCode: "GB", numCustomPurposes: 0,
                publisherRestrictions: (row.restrictions ?? []).map {
                    IABPublisherRestriction(purposeId: $0.purposeId, type: $0.type, vendorIds: $0.vendorIds)
                })
            var choices = IABChoices()
            choices.purposeConsents = row.purposeConsents ?? []
            choices.purposeLegitimateInterests = row.purposeLegitimateInterests ?? []
            choices.vendorConsents = row.vendorConsents ?? []
            choices.vendorLegitimateInterests = row.vendorLegitimateInterests ?? []
            var previous: IABCommittedConsent?
            if let days = row.createdDaysAgo {
                previous = try IABAuthority.build(
                    configuration: configuration, choices: IABChoices(), gvl: row.gvl ?? oracle.gvl, subjectId: "sub_x",
                    externalId: nil, fingerprint: "f", actionAt: oracle.now - days * 86_400_000, previous: nil)
            }
            do {
                let built = try IABAuthority.build(
                    configuration: configuration, choices: choices, gvl: row.gvl ?? oracle.gvl, subjectId: "sub_x",
                    externalId: nil, fingerprint: "f", actionAt: oracle.now, previous: previous)
                XCTAssertEqual(built.tcString, row.tcString, row.id)
                // A decision first saved days earlier still writes Created == LastUpdated.
                guard case let .decoded(tc) = TcStringWireReader.read(built.tcString) else {
                    XCTFail("\(row.id): undecodable")
                    continue
                }
                XCTAssertEqual(tc.created, tc.lastUpdated, row.id)
                XCTAssertEqual(tc.lastUpdated.timeIntervalSince1970, Double(oracle.now / 86_400_000 * 86_400), row.id)
                if row.createdDaysAgo != nil { XCTAssertLessThan(built.createdAt, built.actionAt, row.id) }
            } catch {
                XCTFail("\(row.id): \(error)")
            }
        }
    }
}
