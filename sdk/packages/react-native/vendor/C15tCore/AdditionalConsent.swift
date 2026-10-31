import Foundation
import CryptoKit

/// A Google ATP disclosure from the backend's configured official provider list.
/// ATP IDs are separate from IAB vendor IDs and never imply ATT permission.
public struct AdTechProvider: Sendable, Codable, Equatable {
    public let id: Int
    public let name: String
    public let policyUrl: String
    public init(id: Int, name: String, policyUrl: String) {
        self.id = id; self.name = name; self.policyUrl = policyUrl
    }
}

/// One cached ATP disclosure. An absent list is unavailable; an empty list disables AC.
public struct AdditionalConsentList: Sendable, Codable, Equatable {
    public let providers: [AdTechProvider]
    public let fetchedAt: Int64

    func isCurrent(now: Int64, maxAge: Int64) -> Bool {
        fetchedAt >= 0 && now >= fetchedAt && now - fetchedAt < maxAge
    }
    var disclosureID: String? {
        guard let bytes = try? C15tJSON.encode(providers) else { return nil }
        return SHA256.hash(data: bytes).map { String(format: "%02x", $0) }.joined()
    }
}

/// Native Google Additional Consent v2 authoring. See Google's AC specification:
/// https://support.google.com/admanager/answer/9681920
public enum AdditionalConsent {
    /// Validate the backend's scoped list without accepting partially read disclosures.
    static func providers(_ value: JSONValue?) -> [AdTechProvider]? {
        guard let values = value?.arrayValue else { return nil }
        var result: [AdTechProvider] = []
        var ids = Set<Int>()
        for value in values {
            guard let id = value["id"]?.intValue, id > 0, id <= 9_007_199_254_740_991,
                let name = value["name"]?.stringValue?.trimmingCharacters(in: .whitespacesAndNewlines), !name.isEmpty,
                let url = value["policyUrl"]?.stringValue, let parsed = URL(string: url),
                ["http", "https"].contains(parsed.scheme?.lowercased() ?? ""), parsed.host != nil,
                ids.insert(Int(id)).inserted else { return nil }
            result.append(AdTechProvider(id: Int(id), name: name, policyUrl: url))
        }
        return result.sorted { $0.id < $1.id }
    }

    /// Encode confirmed provider choices. Selected IDs must be disclosed and unique.
    /// Purposes 1, 3 and 4 must all be consented before an ATP can be consented.
    public static func encode(consented: [Int], disclosed: [Int], purposeConsents: [Int]) throws -> String {
        let shown = Set(disclosed)
        guard shown.count == disclosed.count, shown.allSatisfy({ $0 > 0 && $0 <= 9_007_199_254_740_991 }),
            Set(consented).count == consented.count, Set(consented).isSubset(of: shown) else {
            throw CoreErrorInfo(code: "invalid-additional-consent", message: "ATP choices must belong to the disclosed Google list.")
        }
        let grants = Set([1, 3, 4]).isSubset(of: Set(purposeConsents)) ? Set(consented) : []
        return "2~" + grants.sorted().map(String.init).joined(separator: ".")
            + "~dv." + shown.subtracting(grants).sorted().map(String.init).joined(separator: ".")
    }
}
