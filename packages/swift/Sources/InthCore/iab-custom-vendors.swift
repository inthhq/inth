import Foundation

/// A custom vendor: a partner the publisher declares under IAB TCF that is not on the Global
/// Vendor List. `NonIABVendor` in `@inth/sdk-schema` (`packages/sdk/schema/src/shared/non-iab-vendor.model.ts`),
/// served by `/init` as `customVendors`.
///
/// The stock screens list it beside the registered vendors and it gets its own consent and
/// legitimate-interest choices, kept in ``IABChoices/customVendorConsents`` and
/// ``IABChoices/customVendorLegitimateInterests``. The TC String never carries it: it has
/// only IAB vendor ids.
public struct IABCustomVendor: Sendable, Codable, Equatable {
    /// The id as the web keys its consent maps, `String(vendor.id)`: a numeric id becomes its
    /// decimal form.
    public let id: String
    public let name: String
    public let privacyPolicyUrl: String
    /// TCF purposes it asks consent for.
    public let purposes: [Int]
    /// TCF purposes it claims under legitimate interest.
    public let legIntPurposes: [Int]
    public let specialFeatures: [Int]
    public let features: [Int]
    public let dataCategories: [Int]
    public let description: String?
    public let cookieMaxAgeSeconds: Int?
    public let dataRetentionDays: Int?
    public let usesCookies: Bool
    public let usesNonCookieAccess: Bool

    public init(
        id: String, name: String, privacyPolicyUrl: String, purposes: [Int],
        legIntPurposes: [Int] = [], specialFeatures: [Int] = [], features: [Int] = [],
        dataCategories: [Int] = [], description: String? = nil, cookieMaxAgeSeconds: Int? = nil,
        dataRetentionDays: Int? = nil, usesCookies: Bool = false, usesNonCookieAccess: Bool = false
    ) {
        self.id = id
        self.name = name
        self.privacyPolicyUrl = privacyPolicyUrl
        self.purposes = purposes
        self.legIntPurposes = legIntPurposes
        self.specialFeatures = specialFeatures
        self.features = features
        self.dataCategories = dataCategories
        self.description = description
        self.cookieMaxAgeSeconds = cookieMaxAgeSeconds
        self.dataRetentionDays = dataRetentionDays
        self.usesCookies = usesCookies
        self.usesNonCookieAccess = usesNonCookieAccess
    }

    /// Read `/init`'s `customVendors` with `nonIABVendorSchema`'s rules. `nil` when any entry
    /// breaks them or two entries share an id: a list read in part would disclose a partner
    /// set nobody configured, so the core holds none instead, as for ad tech providers.
    static func list(_ value: JSONValue?) -> [IABCustomVendor]? {
        guard let entries = value?.arrayValue else { return nil }
        var ids = Set<String>()
        var result: [IABCustomVendor] = []
        for entry in entries {
            guard let vendor = IABCustomVendor(entry), ids.insert(vendor.id).inserted else { return nil }
            result.append(vendor)
        }
        return result
    }

    private init?(_ value: JSONValue) {
        guard let fields = value.objectValue else { return nil }
        func ids(_ key: String, _ range: ClosedRange<Int>, required: Bool = false) -> [Int]? {
            guard let raw = fields[key], !raw.isNull else { return required ? nil : [] }
            guard let items = raw.arrayValue else { return nil }
            var result: [Int] = []
            for item in items {
                guard let id = item.intValue, range.contains(Int(id)) else { return nil }
                result.append(Int(id))
            }
            return result
        }
        func positive(_ key: String) -> Int?? {
            guard let raw = fields[key], !raw.isNull else { return .some(nil) }
            guard let number = raw.intValue, number >= 1, number <= Int64(Int32.max) else { return nil }
            return .some(Int(number))
        }
        func flag(_ key: String) -> Bool? {
            guard let raw = fields[key], !raw.isNull else { return false }
            return raw.boolValue
        }
        let id: String
        switch fields["id"] {
        case let .string(text)?: id = text
        case let raw?:
            guard let number = raw.intValue else { return nil }
            id = String(number)
        case nil: return nil
        }
        guard let name = fields["name"]?.stringValue,
              let url = fields["privacyPolicyUrl"]?.stringValue, let parsed = URL(string: url),
              parsed.scheme?.isEmpty == false,
              let purposes = ids("purposes", 1...11, required: true),
              let legIntPurposes = ids("legIntPurposes", 1...11),
              let specialFeatures = ids("specialFeatures", 1...2),
              let features = ids("features", 1...3),
              let dataCategories = ids("dataCategories", 1...11),
              let cookieMaxAge = positive("cookieMaxAgeSeconds"),
              let retention = positive("dataRetentionDays"),
              let usesCookies = flag("usesCookies"),
              let usesNonCookieAccess = flag("usesNonCookieAccess")
        else { return nil }
        let description: String?
        switch fields["description"] {
        case nil, .null?: description = nil
        case let .string(text)?: description = text
        default: return nil
        }
        self.init(
            id: id, name: name, privacyPolicyUrl: url, purposes: purposes, legIntPurposes: legIntPurposes,
            specialFeatures: specialFeatures, features: features, dataCategories: dataCategories,
            description: description, cookieMaxAgeSeconds: cookieMaxAge, dataRetentionDays: retention,
            usesCookies: usesCookies, usesNonCookieAccess: usesNonCookieAccess)
    }
}

/// The Inth categories an IAB TCF decision grants, by the web's derivation:
/// `iabPurposesToInthConsents` and `CONSENT_TO_IAB_PURPOSE_MAP` in
/// `packages/sdk/iab/src/tcf/purpose-mapping.model.ts`, with the purposes some vendor processes on consent
/// deciding, as `consentBasisPurposes` in `packages/sdk/iab/src/index.ts` passes them. Registered
/// vendors after publisher restrictions, custom vendors and listed ad tech providers all count
/// toward that basis. `packages/native-protocol/iab/purpose-categories.json` runs the same cases on web,
/// Swift and Kotlin.
public enum IABPurposeCategories {
    /// `CONSENT_TO_IAB_PURPOSE_MAP` without `necessary`, which is always granted.
    public static let purposes: [OptionalConsentCategory: [Int]] = [
        .experience: [5, 6], .functionality: [10, 11], .marketing: [2, 3, 4], .measurement: [7, 8, 9],
    ]

    /// Purposes some vendor processes on consent: each registered vendor's consent purposes after
    /// publisher restrictions, each custom vendor's purposes, and 1, 3 and 4 when ad tech
    /// providers are listed.
    public static func consentBasis(
        vendorConsentPurposes: [[Int]], customVendors: [IABCustomVendor], adTechProvidersListed: Bool
    ) -> Set<Int> {
        var basis = Set(vendorConsentPurposes.joined()).union(customVendors.flatMap(\.purposes))
        if adTechProvidersListed { basis.formUnion(GlobalVendorList.adTechProviderPurposeIds) }
        return basis
    }

    /// The purposes that decide `category`: those in `basis`, or all of them when none is, so
    /// legitimate interest alone never grants a category.
    public static func deciding(_ category: OptionalConsentCategory, basis: Set<Int>) -> Set<Int> {
        let all = Set(purposes[category] ?? [])
        let deciding = all.intersection(basis)
        return deciding.isEmpty ? all : deciding
    }

    /// Every optional category, granted when all of its deciding purposes are consented.
    public static func categories(purposeConsents: Set<Int>, basis: Set<Int>) -> [OptionalConsentCategory: Bool] {
        Dictionary(uniqueKeysWithValues: purposes.keys.map { category in
            (category, deciding(category, basis: basis).isSubset(of: purposeConsents))
        })
    }
}
