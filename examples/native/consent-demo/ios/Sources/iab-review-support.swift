import CoreFoundation
import Foundation

/// Non-secret reviewer setup. Range checks do not verify CMP registration or approval.
struct IABReviewProfile: Codable, Equatable, Sendable {
    let backendURL: URL
    let privacyPolicyURL: URL
    let cmpId: Int
    let cmpVersion: Int
    let publisherCountry: String
    let vendorIDs: [Int]?

    static let defaultsKey = "inth.demo.iab-review-profile.v1"

    init(backend: String, privacyPolicy: String, cmpId: String, cmpVersion: String, publisherCountry: String, vendorIDs: String = "") throws {
        backendURL = try Self.publicURL(backend, name: "Inth project URL")
        privacyPolicyURL = try Self.publicURL(privacyPolicy, name: "Privacy policy URL")
        guard let id = Int(cmpId.trimmingCharacters(in: .whitespacesAndNewlines)), (2...4095).contains(id) else {
            throw ValidationError("CMP ID must be a supplied integer from 2 to 4095.")
        }
        guard let version = Int(cmpVersion.trimmingCharacters(in: .whitespacesAndNewlines)), (0...4095).contains(version) else {
            throw ValidationError("CMP version must be an integer from 0 to 4095. This is the internal CMP version, not the SDK version.")
        }
        let country = publisherCountry.trimmingCharacters(in: .whitespacesAndNewlines)
        guard country.utf8.count == 2, country.utf8.allSatisfy({ (65...90).contains($0) }) else {
            throw ValidationError("Publisher country must be two uppercase ASCII letters.")
        }
        self.cmpId = id
        self.cmpVersion = version
        self.publisherCountry = country
        let scope = vendorIDs.trimmingCharacters(in: .whitespacesAndNewlines)
        if scope.isEmpty {
            self.vendorIDs = nil
        } else {
            let ids = try scope.split(separator: ",", omittingEmptySubsequences: false).map { raw -> Int in
                guard let id = Int(raw.trimmingCharacters(in: .whitespacesAndNewlines)), (1...65535).contains(id) else {
                    throw ValidationError("Vendor IDs must be comma-separated integers from 1 to 65535, or leave the field empty to use the served list.")
                }
                return id
            }
            guard Set(ids).count == ids.count else {
                throw ValidationError("Vendor IDs must not contain duplicates.")
            }
            self.vendorIDs = ids.sorted()
        }
    }

    private static func publicURL(_ raw: String, name: String) throws -> URL {
        guard let parts = URLComponents(string: raw.trimmingCharacters(in: .whitespacesAndNewlines)),
            parts.scheme?.lowercased() == "https", let host = parts.host, !host.isEmpty,
            parts.user == nil, parts.password == nil, parts.query == nil, parts.fragment == nil,
            let url = parts.url else {
            throw ValidationError("\(name) must be an HTTPS URL without credentials, a query or a fragment.")
        }
        return url
    }

    func save(in defaults: UserDefaults = .standard) throws {
        defaults.set(try JSONEncoder().encode(self), forKey: Self.defaultsKey)
    }

    static func load(from defaults: UserDefaults = .standard) -> Self? {
        guard let data = defaults.data(forKey: defaultsKey), let saved = try? JSONDecoder().decode(Self.self, from: data) else { return nil }
        // Validate persisted data too, so a modified profile cannot bypass setup checks.
        return try? Self(backend: saved.backendURL.absoluteString, privacyPolicy: saved.privacyPolicyURL.absoluteString,
            cmpId: String(saved.cmpId), cmpVersion: String(saved.cmpVersion), publisherCountry: saved.publisherCountry,
            vendorIDs: saved.vendorIDs?.map(String.init).joined(separator: ",") ?? "")
    }

    static func forget(in defaults: UserDefaults = .standard) {
        defaults.removeObject(forKey: defaultsKey)
    }

    struct ValidationError: LocalizedError {
        let message: String
        init(_ message: String) { self.message = message }
        var errorDescription: String? { message }
    }
}

struct IABReviewStorageEntry: Identifiable, Equatable {
    let key: String
    let type: String
    let value: String?
    var id: String { key }

    /// Reads only the SDK's owned keys. No core state is used to reconstruct missing values.
    static func read(from defaults: UserDefaults, keys: [String]) -> [Self] {
        keys.sorted().compactMap { key in
            guard let value = defaults.object(forKey: key) else { return nil }
            if let string = value as? String { return Self(key: key, type: "String", value: string) }
            if let number = value as? NSNumber {
                let boolean = CFGetTypeID(number) == CFBooleanGetTypeID()
                let integral = ["c", "s", "i", "l", "q", "C", "S", "I", "L", "Q"].contains(String(cString: number.objCType))
                return Self(key: key, type: boolean ? "Bool" : integral ? "Int" : "Number", value: number.stringValue)
            }
            return Self(key: key, type: "unsupported", value: nil)
        }
    }
}

struct IABReviewGoogleVendor {
    let id: Int
    let name: String?
    let deleted: Bool
    let purposes: [Int]?
    let legIntPurposes: [Int]?
    let flexiblePurposes: [Int]?
}

struct IABReviewAdTechProvider {
    let id: Int
    let name: String
    let policyUrl: String
}

/// A deliberate export allowlist. Subjects, external IDs, receipts and full snapshots stay out.
struct IABReviewReport {
    let capturedAtMs: Int64
    let profile: IABReviewProfile
    let sdkVersion: String
    let appID: String
    let appVersion: String
    let appBuild: String
    let operatingSystem: String
    let model: String
    let policyPending: Bool
    let disclosedGVLVersion: Int?
    let disclosedPolicyVersion: Int?
    let committedTCString: String?
    let committedAdditionalConsent: String?
    let committedGVLVersion: Int?
    let committedPolicyVersion: Int?
    let iabStatus: String
    let googleVendor: IABReviewGoogleVendor?
    let additionalConsentStatus: String
    let adTechProviders: [IABReviewAdTechProvider]?
    let storage: [IABReviewStorageEntry]

    var text: String {
        let rows = storage.map { "\($0.key) [\($0.type)] = \($0.value ?? "null")" }
        let google: [String]
        if let vendor = googleVendor {
            google = [
                "Loaded GVL vendor \(vendor.id): \(vendor.name ?? "unavailable")",
                "Deleted: \(vendor.deleted)",
                "Declared consent purposes: \(vendor.purposes.map(String.init(describing:)) ?? "unavailable")",
                "Declared legitimate-interest purposes: \(vendor.legIntPurposes.map(String.init(describing:)) ?? "unavailable")",
                "Declared flexible purposes: \(vendor.flexiblePurposes.map(String.init(describing:)) ?? "unavailable")",
            ]
        } else { google = ["Loaded GVL vendor 755: absent"] }
        let providers = adTechProviders.map { list in
            list.isEmpty ? ["Retained ATP disclosures: deliberately empty"]
                : list.map { "ATP \($0.id): \($0.name), \($0.policyUrl)" }
        } ?? ["Retained ATP disclosures: unavailable"]
        return ([
            "Inth mobile IAB review report",
            "Captured at: \(ISO8601DateFormatter().string(from: Date(timeIntervalSince1970: Double(capturedAtMs) / 1000)))",
            "This report does not establish CMP registration, certification or ad-serving eligibility.",
            "Capture reads are not atomic. Refresh after a transition or an unexpected mismatch.",
            "GVL fields reflect the loaded native disclosure view.",
            "Project: \(profile.backendURL.absoluteString)",
            "Privacy policy: \(profile.privacyPolicyURL.absoluteString)",
            "Configured CMP ID: \(profile.cmpId)",
            "Configured CMP version: \(profile.cmpVersion)",
            "Publisher country: \(profile.publisherCountry)",
            "Vendor scope: \(profile.vendorIDs?.map(String.init).joined(separator: ",") ?? "backend-served list, no local vendor filter")",
            "SDK: \(sdkVersion)",
            "App: \(appID) \(appVersion) (\(appBuild))",
            "OS: \(operatingSystem)",
            "Policy model: \(model)",
            "Policy pending: \(policyPending)",
            "Disclosed GVL version: \(disclosedGVLVersion.map(String.init) ?? "none")",
            "Disclosed policy version: \(disclosedPolicyVersion.map(String.init) ?? "none")",
            "Committed GVL version: \(committedGVLVersion.map(String.init) ?? "none")",
            "Committed policy version: \(committedPolicyVersion.map(String.init) ?? "none")",
            "Core TCString: \(committedTCString ?? "none, no current native authority")",
            "Core Additional Consent: \(committedAdditionalConsent ?? "none, no current native authority")",
            "IAB availability: \(iabStatus)",
        ] + google + [
            "Additional Consent availability: \(additionalConsentStatus)",
            "Retained disclosures do not authorize grants while missing or stale.",
        ] + providers + [
            "",
            "Actual UserDefaults.standard IABTCF values:",
        ] + (rows.isEmpty ? ["No owned IABTCF keys are present."] : rows)).joined(separator: "\n")
    }

    /// Machine evidence uses the same captured values as the human report.
    func json() throws -> String {
        func valueOrNull<Value>(_ value: Value?) -> Any {
            if let value { return value }
            return NSNull()
        }
        let google = googleVendor.map { vendor -> [String: Any] in
            ["id": vendor.id, "name": valueOrNull(vendor.name), "deleted": vendor.deleted,
             "purposes": valueOrNull(vendor.purposes), "legIntPurposes": valueOrNull(vendor.legIntPurposes),
             "flexiblePurposes": valueOrNull(vendor.flexiblePurposes)]
        }
        let providers = adTechProviders?.map { provider -> [String: Any] in
            ["id": provider.id, "name": provider.name, "policyUrl": provider.policyUrl]
        }
        let evidence: [String: Any] = [
            "schemaVersion": 1,
            "platform": "ios",
            "capturedAtMs": capturedAtMs,
            "app": ["id": appID, "version": appVersion, "build": appBuild],
            "sdkVersion": sdkVersion,
            "configuration": [
                "cmpId": profile.cmpId, "cmpVersion": profile.cmpVersion,
                "publisherCountry": profile.publisherCountry,
                "vendorIds": valueOrNull(profile.vendorIDs),
            ],
            "core": [
                "policyPending": policyPending, "iabPolicy": model == "iab",
                "tcString": valueOrNull(committedTCString),
                "additionalConsent": valueOrNull(committedAdditionalConsent),
                "vendorListVersion": valueOrNull(committedGVLVersion),
                "policyVersion": valueOrNull(committedPolicyVersion),
            ],
            "disclosures": [
                "vendorListVersion": valueOrNull(disclosedGVLVersion),
                "policyVersion": valueOrNull(disclosedPolicyVersion),
                "iabStatus": iabStatus, "googleVendor": valueOrNull(google),
                "additionalConsentStatus": additionalConsentStatus,
                "adTechProviders": valueOrNull(providers),
            ],
            "storage": storage.map { entry -> [String: Any] in
                ["key": entry.key, "type": entry.type, "value": valueOrNull(entry.value)]
            },
        ]
        let data = try JSONSerialization.data(withJSONObject: evidence, options: [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes])
        return String(decoding: data, as: UTF8.self)
    }
}
