import Foundation
import XCTest
@testable import InthDemoReviewSupport

final class IABReviewSupportTests: XCTestCase {
    func testRequiresExplicitIdentityAndValidatesBounds() throws {
        XCTAssertThrowsError(try profile(id: ""))
        XCTAssertThrowsError(try profile(id: "1"))
        XCTAssertThrowsError(try profile(id: "4096"))
        XCTAssertThrowsError(try profile(version: "-1"))
        XCTAssertThrowsError(try profile(version: "4096"))
        XCTAssertEqual(try profile(id: "2", version: "0").cmpVersion, 0)
        XCTAssertEqual(try profile(id: "4095", version: "4095").cmpId, 4095)
        XCTAssertThrowsError(try profile(country: "gb"))
        XCTAssertThrowsError(try profile(country: "G1"))
        XCTAssertThrowsError(try profile(country: "ＧＢ"))
    }

    func testReviewURLsCannotPersistCredentialsOrTokens() throws {
        for value in ["http://review.example", "https://user:secret@review.example", "https://review.example?token=secret", "https://review.example#secret"] {
            XCTAssertThrowsError(try profile(backend: value), value)
            XCTAssertThrowsError(try profile(privacy: value), value)
        }
        XCTAssertEqual(try profile(backend: " https://review.example/project/ ").backendURL.absoluteString, "https://review.example/project/")
    }

    func testOptionalVendorScopePreservesServedListOrNormalizesExplicitIDs() throws {
        XCTAssertNil(try profile(vendors: " ").vendorIDs)
        XCTAssertEqual(try profile(vendors: "20, 2,65535").vendorIDs, [2, 20, 65535])
        for value in ["0", "65536", "-1", "1,", "1,,2", "20,20", "vendor"] {
            XCTAssertThrowsError(try profile(vendors: value), value)
        }
    }

    func testProfileRoundTripAndForgetPreservesOtherStorage() throws {
        try withDefaults { defaults in
            let saved = try profile(vendors: "20,2")
            defaults.set("untouched", forKey: "unrelated")
            try saved.save(in: defaults)
            XCTAssertEqual(IABReviewProfile.load(from: defaults), saved)
            IABReviewProfile.forget(in: defaults)
            XCTAssertNil(IABReviewProfile.load(from: defaults))
            XCTAssertEqual(defaults.string(forKey: "unrelated"), "untouched")
        }
    }

    func testModifiedSavedProfileIsRevalidated() throws {
        try withDefaults { defaults in
            let saved = try profile()
            var data = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(saved)) as? [String: Any])
            data["backendURL"] = "https://review.example?token=secret"
            defaults.set(try JSONSerialization.data(withJSONObject: data), forKey: IABReviewProfile.defaultsKey)
            XCTAssertNil(IABReviewProfile.load(from: defaults))
        }
    }

    func testInspectorReadsRealTypesAndMissingValuesWithoutSynthesis() throws {
        try withDefaults { defaults in
            let keys = ["IABTCF_CmpSdkID", "IABTCF_TCString", "IABTCF_gdprApplies"]
            XCTAssertTrue(IABReviewStorageEntry.read(from: defaults, keys: keys).isEmpty)
            defaults.set(73, forKey: keys[0])
            defaults.set("actual-platform-value", forKey: keys[1])
            defaults.set(true, forKey: keys[2])
            defaults.set("must-not-export", forKey: "IABTCF_SubjectID")
            let rows = IABReviewStorageEntry.read(from: defaults, keys: keys)
            XCTAssertEqual(rows.first(where: { $0.key == keys[0] })?.type, "Int")
            XCTAssertEqual(rows.first(where: { $0.key == keys[1] })?.value, "actual-platform-value")
            XCTAssertEqual(rows.first(where: { $0.key == keys[2] })?.type, "Bool")
            XCTAssertFalse(rows.contains(where: { $0.value == "must-not-export" }))
            defaults.removeObject(forKey: keys[1])
            XCTAssertFalse(IABReviewStorageEntry.read(from: defaults, keys: keys).contains(where: { $0.key == keys[1] }))
        }
    }

    func testReportKeepsCoreAndPlatformEvidenceSeparate() throws {
        let report = try capture(tcString: "core-value", ac: "2~6012~dv.904",
            storage: [.init(key: "IABTCF_TCString", type: "String", value: "platform-value")])
        XCTAssertTrue(report.text.contains("Core TCString: core-value"))
        XCTAssertTrue(report.text.contains("Core Additional Consent: 2~6012~dv.904"))
        XCTAssertTrue(report.text.contains("IABTCF_TCString [String] = platform-value"))
        XCTAssertFalse(report.text.contains("subjectId"))
        XCTAssertFalse(report.text.contains("externalId"))
        XCTAssertFalse(report.text.contains("receipt"))
    }

    func testJSONEnvelopeHasExplicitNullsAndOneCaptureTime() throws {
        let report = try capture()
        let evidence = try jsonObject(report)
        XCTAssertEqual(Set(evidence.keys), Set(["schemaVersion", "platform", "capturedAtMs", "app", "sdkVersion", "configuration", "core", "disclosures", "storage"]))
        XCTAssertEqual(evidence["platform"] as? String, "ios")
        XCTAssertEqual(evidence["schemaVersion"] as? Int, 1)
        XCTAssertEqual((evidence["capturedAtMs"] as? NSNumber)?.int64Value, 1_793_577_600_123)
        let configuration = try XCTUnwrap(evidence["configuration"] as? [String: Any])
        XCTAssertTrue(configuration["vendorIds"] is NSNull)
        let core = try XCTUnwrap(evidence["core"] as? [String: Any])
        XCTAssertEqual(core["iabPolicy"] as? Bool, true)
        for key in ["tcString", "additionalConsent", "vendorListVersion", "policyVersion"] {
            XCTAssertTrue(core[key] is NSNull, key)
        }
        let disclosures = try XCTUnwrap(evidence["disclosures"] as? [String: Any])
        XCTAssertTrue(disclosures["googleVendor"] is NSNull)
        XCTAssertTrue(disclosures["adTechProviders"] is NSNull)
        XCTAssertEqual(disclosures["iabStatus"] as? String, "fresh")
        XCTAssertEqual(disclosures["additionalConsentStatus"] as? String, "missing")
        XCTAssertEqual(try report.json(), try report.json())
        XCTAssertEqual(report.text, report.text)
        XCTAssertTrue(report.text.contains("2026-11-02T00:00:00Z"))
    }

    func testJSONRetainsActualDisclosuresEvenWhileStaleWithoutInventingDeclarations() throws {
        let google = IABReviewGoogleVendor(id: 755, name: "Synthetic retained vendor", deleted: true,
            purposes: nil, legIntPurposes: [], flexiblePurposes: [2])
        let providers = [IABReviewAdTechProvider(id: 904, name: "Synthetic provider", policyUrl: "https://provider.example/privacy")]
        let report = try capture(tcString: "native-tc", ac: "2~~dv.904", google: google, acStatus: "stale", providers: providers,
            storage: [.init(key: "IABTCF_AddtlConsent", type: "String", value: "different-platform-ac")])
        let evidence = try jsonObject(report)
        let core = try XCTUnwrap(evidence["core"] as? [String: Any])
        XCTAssertEqual(core["additionalConsent"] as? String, "2~~dv.904")
        let disclosures = try XCTUnwrap(evidence["disclosures"] as? [String: Any])
        XCTAssertEqual(disclosures["additionalConsentStatus"] as? String, "stale")
        let vendor = try XCTUnwrap(disclosures["googleVendor"] as? [String: Any])
        XCTAssertEqual(vendor["id"] as? Int, 755)
        XCTAssertEqual(vendor["deleted"] as? Bool, true)
        XCTAssertTrue(vendor["purposes"] is NSNull)
        XCTAssertEqual(vendor["legIntPurposes"] as? [Int], [])
        XCTAssertEqual(vendor["flexiblePurposes"] as? [Int], [2])
        let retained = try XCTUnwrap(disclosures["adTechProviders"] as? [[String: Any]])
        XCTAssertEqual(retained.first?["id"] as? Int, 904)
        let storage = try XCTUnwrap(evidence["storage"] as? [[String: Any]])
        XCTAssertEqual(storage.first?["value"] as? String, "different-platform-ac")
        XCTAssertTrue(report.text.contains("Deleted: true"))
        XCTAssertTrue(report.text.contains("Additional Consent availability: stale"))
        XCTAssertTrue(report.text.contains("ATP 904: Synthetic provider"))
    }

    func testJSONDistinguishesAnUnavailableProviderListFromADeliberatelyEmptyList() throws {
        let unavailable = try jsonObject(capture(acStatus: "missing", providers: nil))
        let empty = try jsonObject(capture(acStatus: "fresh", providers: []))
        let missingDisclosures = try XCTUnwrap(unavailable["disclosures"] as? [String: Any])
        let emptyDisclosures = try XCTUnwrap(empty["disclosures"] as? [String: Any])
        XCTAssertTrue(missingDisclosures["adTechProviders"] is NSNull)
        XCTAssertEqual((emptyDisclosures["adTechProviders"] as? [Any])?.count, 0)
        XCTAssertEqual(missingDisclosures["additionalConsentStatus"] as? String, "missing")
        XCTAssertEqual(emptyDisclosures["additionalConsentStatus"] as? String, "fresh")
    }

    func testJSONPreservesRealPlatformTypesAndExcludesPrivateOrUnsupportedValues() throws {
        try withDefaults { defaults in
            let keys = ["IABTCF_CmpSdkID", "IABTCF_gdprApplies", "IABTCF_TCString", "IABTCF_PolicyVersion"]
            defaults.set("73", forKey: keys[0])
            defaults.set(true, forKey: keys[1])
            defaults.set(Data("private-record".utf8), forKey: keys[2])
            defaults.set(5.25, forKey: keys[3])
            defaults.set("private-subject", forKey: "subjectId")
            defaults.set("private-external", forKey: "IABTCF_ExternalID")
            let report = try capture(storage: IABReviewStorageEntry.read(from: defaults, keys: keys))
            let json = try report.json()
            let evidence = try jsonObject(report)
            let rows = try XCTUnwrap(evidence["storage"] as? [[String: Any]])
            XCTAssertEqual(rows.first(where: { $0["key"] as? String == keys[0] })?["type"] as? String, "String")
            XCTAssertEqual(rows.first(where: { $0["key"] as? String == keys[1] })?["type"] as? String, "Bool")
            XCTAssertEqual(rows.first(where: { $0["key"] as? String == keys[3] })?["type"] as? String, "Number")
            let unsupported = try XCTUnwrap(rows.first(where: { $0["key"] as? String == keys[2] }))
            XCTAssertEqual(unsupported["type"] as? String, "unsupported")
            XCTAssertTrue(unsupported["value"] is NSNull)
            for secret in ["private-record", "private-subject", "private-external", "subjectId", "externalId", "fingerprint", "receipt"] {
                XCTAssertFalse(json.contains(secret), secret)
            }
        }
    }

    private func capture(tcString: String? = nil, ac: String? = nil, google: IABReviewGoogleVendor? = nil, acStatus: String = "missing", providers: [IABReviewAdTechProvider]? = nil, storage: [IABReviewStorageEntry] = []) throws -> IABReviewReport {
        IABReviewReport(capturedAtMs: 1_793_577_600_123, profile: try profile(), sdkVersion: "0.1.0", appID: "review.app", appVersion: "1", appBuild: "2", operatingSystem: "test",
            model: "iab", policyPending: false, disclosedGVLVersion: 10, disclosedPolicyVersion: 5,
            committedTCString: tcString, committedAdditionalConsent: ac,
            committedGVLVersion: tcString == nil ? nil : 10, committedPolicyVersion: tcString == nil ? nil : 5,
            iabStatus: "fresh", googleVendor: google, additionalConsentStatus: acStatus, adTechProviders: providers, storage: storage)
    }

    private func jsonObject(_ report: IABReviewReport) throws -> [String: Any] {
        let json = try report.json()
        return try XCTUnwrap(JSONSerialization.jsonObject(with: Data(json.utf8)) as? [String: Any])
    }

    private func profile(backend: String = "https://review.example", privacy: String = "https://review.example/privacy", id: String = "73", version: String = "1", country: String = "GB", vendors: String = "") throws -> IABReviewProfile {
        try IABReviewProfile(backend: backend, privacyPolicy: privacy, cmpId: id, cmpVersion: version, publisherCountry: country, vendorIDs: vendors)
    }

    private func withDefaults(_ body: (UserDefaults) throws -> Void) throws {
        let suite = "inth-review-tests-" + UUID().uuidString
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        try body(defaults)
    }
}
