import CryptoKit
import Foundation

/// Build-authored policy authority. This is not a consent receipt or a refresh timestamp.
public struct BundledPolicyAuthority: Sendable, Codable, Equatable {
    public let endpoint: String
    public let issuedAt: Int64
    public let expiresAt: Int64
    public let manifestRevision: String
    public let requiresAtp: Bool

    func isCurrent(endpoint: String?, now: Int64) -> Bool {
        endpoint?.trimmingCharacters(in: CharacterSet(charactersIn: "/")) == self.endpoint
            && issuedAt >= 0 && now >= issuedAt && now < expiresAt && expiresAt > issuedAt
    }

    func hasExpired(endpoint: String?, now: Int64) -> Bool {
        endpoint?.trimmingCharacters(in: CharacterSet(charactersIn: "/")) == self.endpoint
            && issuedAt >= 0 && expiresAt > issuedAt && now >= expiresAt
    }
}

/// A build export loaded synchronously before JavaScript. The configured endpoint must match.
/// Invalid resources contribute no policy. Hosted transport remains installed independently.
public struct BundledPolicyResource: Sendable {
    public let data: Data
    public let endpoint: String

    public init(data: Data, endpoint: String) {
        self.data = data
        self.endpoint = endpoint
    }

    /// Read an app resource. No network request or timestamp renewal occurs here.
    public init?(url: URL, endpoint: String) {
        guard let data = try? Data(contentsOf: url) else { return nil }
        self.init(data: data, endpoint: endpoint)
    }

    struct Selection {
        let authority: BundledPolicyAuthority
        let response: InitResponse
        let gvlFetchedAt: Int64?
        let atpFetchedAt: Int64?
    }

    func resolve(overrides: ConsentOverrides, now: Int64) -> Selection? {
        guard let wrapper = C15tJSON.parse(data), let payload = wrapper["payload"]?.stringValue,
            wrapper.objectValue?.count == 2,
            wrapper["sha256"]?.stringValue
                == SHA256.hash(data: Data(payload.utf8)).map({ String(format: "%02x", $0) })
                .joined(),
            let value = C15tJSON.parse(Data(payload.utf8)), value["schemaVersion"]?.intValue == 1,
            let endpoint = value["endpoint"]?.stringValue, let issued = value["issuedAt"]?.intValue,
            let expiry = value["expiresAt"]?.intValue,
            let revision = value["manifestRevision"]?.stringValue,
            !revision.isEmpty, let packs = value["policyPacks"]?.arrayValue, !packs.isEmpty,
            let fallbackLanguage = value["defaultLanguage"]?.stringValue,
            Set(value.objectValue!.keys).isSubset(of: [
                "schemaVersion", "endpoint", "manifestRevision", "tenantId", "issuedAt",
                "expiresAt", "defaultLanguage", "requiresAtp", "policyPacks", "disclosures",
            ])
        else { return nil }
        let authority = BundledPolicyAuthority(
            endpoint: endpoint, issuedAt: issued, expiresAt: expiry, manifestRevision: revision,
            requiresAtp: value["requiresAtp"]?.boolValue == true)
        guard authority.isCurrent(endpoint: self.endpoint, now: now) else { return nil }
        // Validate every wire, including unmatched packs, before selecting one.
        for pack in packs {
            guard case .resolved = PolicyWireReader.read(pack["policyResolution"]),
                pack["match"]?.objectValue != nil
            else { return nil }
        }
        guard let unknown = Self.match(packs, country: nil, region: nil),
            case .resolved(let conservative) = PolicyWireReader.read(
                packs[unknown.0]["policyResolution"]),
            [.optIn, .iab].contains(conservative.policy.model),
            conservative.policy.prompt == .choice,
            packs[unknown.0]["policyResolution"]?["policy"]?["preselectedCategories"]?.arrayValue?
                .isEmpty == true,
            let selected = Self.match(packs, country: overrides.country, region: overrides.region),
            var wire = packs[selected.0]["policyResolution"]?.objectValue,
            let translations = packs[selected.0]["translations"]?.objectValue
        else { return nil }
        wire["matchedBy"] = .string(selected.1)
        let language =
            overrides.language.lowercased().split(separator: "-").first.map(String.init)
            ?? fallbackLanguage
        guard let copy = translations[language] ?? translations[fallbackLanguage],
            let copyLanguage = copy["language"]?.stringValue,
            let text = copy["translations"]?.objectValue
        else { return nil }
        let disclosure = value["disclosures"]
        let gvl = GlobalVendorList.read(from: disclosure?["gvl"]?["data"])
        let providers = AdditionalConsent.providers(disclosure?["atp"]?["providers"])
        let gvlAt = disclosure?["gvl"]?["fetchedAt"]?.intValue
        let atpAt = disclosure?["atp"]?["fetchedAt"]?.intValue
        return Selection(
            authority: authority,
            response: InitResponse(
                policyResolution: .object(wire),
                location: LocationContext(
                    countryCode: overrides.country, regionCode: overrides.region),
                translations: TranslationsBundle(
                    language: copyLanguage, translations: .object(text)),
                gvl: gvl, adTechProviders: providers),
            gvlFetchedAt: gvlAt.flatMap { $0 >= 0 && $0 <= issued ? $0 : nil },
            atpFetchedAt: atpAt.flatMap { $0 >= 0 && $0 <= issued ? $0 : nil })
    }

    // Mirrors schema matchPolicyRules. Locale is deliberately absent from legal matching.
    private static func match(_ packs: [JSONValue], country: String?, region: String?) -> (
        Int, String
    )? {
        func countryCode(_ value: String?) -> String? {
            value?.trimmingCharacters(in: .whitespacesAndNewlines).uppercased().nilIfEmpty
        }
        func regionCode(_ value: String?) -> String? {
            countryCode(value?.split(separator: "-").last.map(String.init))
        }
        let country = countryCode(country)
        let region = regionCode(region)
        func first(_ predicate: (JSONValue) -> Bool) -> Int? {
            packs.firstIndex { predicate($0["match"] ?? .null) }
        }
        func hasCountry(_ match: JSONValue, _ key: String) -> Bool {
            match[key]?.arrayValue?.contains { countryCode($0.stringValue) == country } == true
        }
        let fallback = first { $0["fallback"]?.boolValue == true }
        if let country {
            if let region,
                let index = first({
                    $0["regions"]?.arrayValue?.contains {
                        countryCode($0["country"]?.stringValue) == country
                            && regionCode($0["region"]?.stringValue) == region
                    } == true
                })
            {
                return (index, "region")
            }
            if let index = first({ hasCountry($0, "countries") }) { return (index, "country") }
            if region == nil {
                if let index = first({ hasCountry($0, "regionFallbacks") }) {
                    return (index, "fallback")
                }
                if first({
                    $0["regions"]?.arrayValue?.contains {
                        countryCode($0["country"]?.stringValue) == country
                    } == true
                }) != nil {
                    return fallback.map { ($0, "fallback") }
                }
            }
        } else if let fallback {
            return (fallback, "fallback")
        }
        return first { $0["isDefault"]?.boolValue == true }.map { ($0, "default") }
    }
}

extension String {
    fileprivate var nilIfEmpty: String? { isEmpty ? nil : self }
}
