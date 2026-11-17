import XCTest

@_spi(C15tInternal) @testable import C15tCore

final class PublisherRestrictionRangesTests: XCTestCase {
    func testSparseDisclosedVendorsDoNotRestrictNumericGaps() throws {
        try assertRoundTrip(disclosed: [1, 3], restricted: [1, 3], ranges: [
            TcIDRun(start: 1, end: 1, isRange: false), TcIDRun(start: 3, end: 3, isRange: false),
        ])
    }

    func testUnselectedDisclosedVendorsDoNotEnterARestriction() throws {
        try assertRoundTrip(disclosed: [1, 2, 3], restricted: [1, 3], ranges: [
            TcIDRun(start: 1, end: 1, isRange: false), TcIDRun(start: 3, end: 3, isRange: false),
        ])
    }

    func testNumericallyConsecutiveVendorsStillShareARange() throws {
        try assertRoundTrip(disclosed: [1, 2, 3], restricted: [3, 1, 2], ranges: [
            TcIDRun(start: 1, end: 3, isRange: true),
        ])
    }

    func testMixedRunsStopAtEachNumericGap() throws {
        try assertRoundTrip(disclosed: [1, 2, 4, 5, 7], restricted: [7, 2, 5, 1, 4], ranges: [
            TcIDRun(start: 1, end: 2, isRange: true), TcIDRun(start: 4, end: 5, isRange: true),
            TcIDRun(start: 7, end: 7, isRange: false),
        ])
    }

    private func assertRoundTrip(disclosed: [Int], restricted: [Int], ranges: [TcIDRun]) throws {
        let gvl = GlobalVendorList(
            vendorListVersion: 10, tcfPolicyVersion: 5,
            purposes: [1: GVLDefinition(id: 1), 2: GVLDefinition(id: 2)],
            vendors: Dictionary(uniqueKeysWithValues: disclosed.map {
                ($0, GVLVendor(id: $0, purposes: [1, 2], legIntPurposes: [2], flexiblePurposes: [2]))
            }))
        var choices = IABChoices()
        choices.purposeConsents = [1]
        choices.vendorConsents = disclosed
        for type in 0...2 {
            let config = IABConfiguration(cmpId: 53, cmpVersion: 7, publisherCountryCode: "GB",
                publisherRestrictions: [IABPublisherRestriction(purposeId: 2, type: type, vendorIds: restricted)])
            let built = try IABAuthority.build(
                configuration: config, choices: choices, gvl: gvl, subjectId: "sub_test",
                externalId: nil, fingerprint: "test", actionAt: 1_700_000_000_000, previous: nil)
            guard case .decoded(let decoded) = TcStringWireReader.read(built.tcString) else {
                return XCTFail("Committed TC string must decode")
            }
            let restriction = try XCTUnwrap(decoded.publisherRestrictions.first)
            XCTAssertEqual(decoded.publisherRestrictions.count, 1)
            print("type=\(type) disclosed=\(disclosed) configured=\(restricted) decoded=\(restriction.vendorIds.sorted()) ranges=\(restriction.entries)")
            XCTAssertEqual(restriction.vendorIds.sorted(), restricted.sorted())
            XCTAssertEqual(restriction.entries, ranges)
            XCTAssertEqual(restriction.purposeId, 2)
            XCTAssertEqual(restriction.restrictionType.rawValue, type)
            XCTAssertEqual(built.configuration, config)
            XCTAssertEqual(built.choices, choices)
            XCTAssertEqual(decoded.cmpId, config.cmpId)
            XCTAssertEqual(decoded.cmpVersion, config.cmpVersion)
            XCTAssertEqual(decoded.purposeConsents.ids, Set(choices.purposeConsents))
        }
    }
}
