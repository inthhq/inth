import CryptoKit
import Foundation

/// Build-authored policy authority. This is not a consent receipt or a refresh timestamp.
///
/// A manifest bundled for one backend stays usable after `expiresAt`: an offline device
/// still shows the prompt and records choices from it, and the core emits
/// ``CoreEvent/policyStale(_:)``. Nothing is granted until the person chooses.
public struct BundledPolicyAuthority: Sendable, Codable, Equatable {
    public let endpoint: String
    public let issuedAt: Int64
    public let expiresAt: Int64
    public let manifestRevision: String
    public let requiresAtp: Bool

    /// Bound to `endpoint` and already issued. Expiry does not end usability.
    func isUsable(endpoint: String?, now: Int64) -> Bool {
        endpoint?.trimmingCharacters(in: CharacterSet(charactersIn: "/")) == self.endpoint
            && issuedAt >= 0 && now >= issuedAt && expiresAt > issuedAt
    }

    /// Past `expiresAt`. A stale manifest still prompts, and the core emits `policyStale`.
    public func isStale(now: Int64) -> Bool { now >= expiresAt }
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
        guard authority.isUsable(endpoint: self.endpoint, now: now) else { return nil }
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
            true
        else { return nil }
        // An unmatched location gets the backend's own outcome, not silence: `no-match`
        // runs the safe fallback. `insufficient-inputs` applies no bundle and stays
        // pending, as the Kotlin core does.
        let outcome = Self.matchOutcome(packs, country: overrides.country, region: overrides.region)
        let policyResolution: JSONValue
        var bundleTranslations: TranslationsBundle?
        switch outcome {
        case .insufficientInputs:
            return nil
        case .noMatch:
            policyResolution = Self.unmatchedWire(outcome)
        case let .matched(index, matchedBy):
            guard var wire = packs[index]["policyResolution"]?.objectValue,
                let translations = packs[index]["translations"]?.objectValue
            else { return nil }
            wire["matchedBy"] = .string(matchedBy)
            policyResolution = .object(wire)
            let language =
                overrides.language.lowercased().split(separator: "-").first.map(String.init)
                ?? fallbackLanguage
            guard let copy = translations[language] ?? translations[fallbackLanguage],
                let copyLanguage = copy["language"]?.stringValue,
                let text = copy["translations"]?.objectValue
            else { return nil }
            bundleTranslations = TranslationsBundle(language: copyLanguage, translations: .object(text))
        }
        let disclosure = value["disclosures"]
        let gvl = GlobalVendorList.read(from: disclosure?["gvl"]?["data"])
        let providers = AdditionalConsent.providers(disclosure?["atp"]?["providers"])
        let gvlAt = disclosure?["gvl"]?["fetchedAt"]?.intValue
        let atpAt = disclosure?["atp"]?["fetchedAt"]?.intValue
        return Selection(
            authority: authority,
            response: InitResponse(
                policyResolution: policyResolution,
                location: LocationContext(
                    countryCode: overrides.country, regionCode: overrides.region),
                translations: bundleTranslations,
                gvl: gvl, adTechProviders: providers),
            gvlFetchedAt: gvlAt.flatMap { $0 >= 0 && $0 <= issued ? $0 : nil },
            atpFetchedAt: atpAt.flatMap { $0 >= 0 && $0 <= issued ? $0 : nil })
    }

    /// What `matchPolicyRules` in `@c15t/schema` answers for a location.
    enum MatchOutcome: Equatable {
        case matched(index: Int, matchedBy: String)
        /// A known location no rule covers. The core runs the safe fallback.
        case noMatch
        /// The location needs a region, or is unknown with no rule for it.
        case insufficientInputs
    }

    /// The wire `writePolicyResolutionWire` produces for an unmatched outcome.
    static func unmatchedWire(_ outcome: MatchOutcome) -> JSONValue {
        if outcome == .insufficientInputs {
            return .object([
                "policy": .null, "reason": .string("insufficient-inputs"),
                "status": .string("failed"), "version": .integer(1),
            ])
        }
        return .object(["policy": .null, "status": .string("no-match"), "version": .integer(1)])
    }

    static func match(_ packs: [JSONValue], country: String?, region: String?) -> (Int, String)? {
        if case let .matched(index, matchedBy) = matchOutcome(packs, country: country, region: region) {
            return (index, matchedBy)
        }
        return nil
    }

    // Mirrors schema matchPolicyRules, outcomes included. Locale is deliberately absent
    // from legal matching.
    static func matchOutcome(_ packs: [JSONValue], country: String?, region: String?) -> MatchOutcome {
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
                return .matched(index: index, matchedBy: "region")
            }
            if let index = first({ hasCountry($0, "countries") }) {
                return .matched(index: index, matchedBy: "country")
            }
            if region == nil {
                if let index = first({ hasCountry($0, "regionFallbacks") }) {
                    return .matched(index: index, matchedBy: "fallback")
                }
                if first({
                    $0["regions"]?.arrayValue?.contains {
                        countryCode($0["country"]?.stringValue) == country
                    } == true
                }) != nil {
                    return fallback.map { .matched(index: $0, matchedBy: "fallback") } ?? .insufficientInputs
                }
            }
        } else if let fallback {
            return .matched(index: fallback, matchedBy: "fallback")
        }
        if let index = first({ $0["isDefault"]?.boolValue == true }) {
            return .matched(index: index, matchedBy: "default")
        }
        return country == nil ? .insufficientInputs : .noMatch
    }
}

extension String {
    fileprivate var nilIfEmpty: String? { isEmpty ? nil : self }
}
