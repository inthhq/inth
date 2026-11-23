#if canImport(InthCore)
import InthCore
#endif
import Foundation

/// What App Tracking Transparency sequencing reads from IAB TCF consent.
///
/// Under an IAB TCF policy the Inth `marketing` category and the TC String are recorded side by
/// side. Tracking needs both, so the sequence asks Apple only while the TC String grants
/// `marketing` and someone could actually track. This decides only whether the SDK asks Apple.
/// It does not decide whether a vendor may read the advertising identifier: purpose 1, that
/// vendor's consent and the ATT answer do.
///
/// The purpose half is the web derivation, not a second one: `CONSENT_TO_IAB_PURPOSE_MAP.marketing`
/// and `iabPurposesToInthConsents` in `packages/sdk/iab/src/tcf/purpose-mapping.model.ts`, with the purposes
/// some vendor processes on consent deciding, as `consentBasisPurposes` in
/// `packages/sdk/iab/src/index.ts` passes them: registered vendors, custom (non-IAB) vendors and listed
/// ad tech providers (``IABPurposeCategories``). `packages/native-protocol/att/iab-marketing.json` runs the
/// same cases against both.
public enum InthTrackingConsent {
    /// The TCF purposes the `marketing` category stands for: 2, 3 and 4.
    public static let iabMarketingPurposes: Set<Int> = [2, 3, 4]

    /// The purposes Google's ad tech providers need, which the web adds to the consent basis.
    static let adTechProviderPurposes: Set<Int> = [1, 3, 4]

    /// The TC String facts the rule reads.
    public struct IABInput: Equatable, Sendable {
        /// The TC String's purpose consents.
        public var purposeConsents: Set<Int>
        /// Each registered vendor's purposes on consent, after publisher restrictions.
        public var vendorConsentPurposes: [Int: Set<Int>]
        /// Vendors the TC String grants consent.
        public var vendorConsents: Set<Int>
        /// The list carries Google ad tech providers.
        public var adTechProvidersListed: Bool
        /// Ad tech providers the person consented to.
        public var adTechProviderConsents: Set<Int>
        /// Each custom (non-IAB) vendor's purposes on consent, by id.
        public var customVendorConsentPurposes: [String: Set<Int>]
        /// Custom vendors the person consented to.
        public var customVendorConsents: Set<String>

        public init(purposeConsents: Set<Int>, vendorConsentPurposes: [Int: Set<Int>], vendorConsents: Set<Int>,
                    adTechProvidersListed: Bool = false, adTechProviderConsents: Set<Int> = [],
                    customVendorConsentPurposes: [String: Set<Int>] = [:], customVendorConsents: Set<String> = []) {
            self.purposeConsents = purposeConsents
            self.vendorConsentPurposes = vendorConsentPurposes
            self.vendorConsents = vendorConsents
            self.adTechProvidersListed = adTechProvidersListed
            self.adTechProviderConsents = adTechProviderConsents
            self.customVendorConsentPurposes = customVendorConsentPurposes
            self.customVendorConsents = customVendorConsents
        }

        /// Purposes some vendor processes on consent, as the web's `consentBasisPurposes`.
        var consentBasis: Set<Int> {
            var basis = Set(vendorConsentPurposes.values.flatMap { $0 })
                .union(customVendorConsentPurposes.values.flatMap { $0 })
            if adTechProvidersListed { basis.formUnion(InthTrackingConsent.adTechProviderPurposes) }
            return basis
        }

        /// The marketing purposes that decide: those some vendor asks consent for, or all of
        /// them when none is, so legitimate interest alone never grants the category.
        var decidingPurposes: Set<Int> { IABPurposeCategories.deciding(.marketing, basis: consentBasis) }
    }

    /// The purpose half: whether the TC String grants `marketing` the way
    /// `iabPurposesToInthConsents` does.
    public static func iabMarketingPurposesConsented(_ input: IABInput) -> Bool {
        input.decidingPurposes.isSubset(of: input.purposeConsents)
    }

    /// Whether the TC String grants `marketing` and someone could track: the purpose half, and
    /// at least one consented vendor that asks consent for a deciding marketing purpose, or a
    /// consented Google ad tech provider. A consented custom (non-IAB) vendor counts the same way
    /// as a registered one. With every such vendor refused nobody could track, so it counts as a
    /// refusal.
    public static func iabMarketingConsented(_ input: IABInput) -> Bool {
        guard iabMarketingPurposesConsented(input) else { return false }
        let deciding = input.decidingPurposes
        let vendor = input.vendorConsents.contains { id in
            !(input.vendorConsentPurposes[id] ?? []).isDisjoint(with: deciding)
        }
        let custom = input.customVendorConsents.contains { id in
            !(input.customVendorConsentPurposes[id] ?? []).isDisjoint(with: deciding)
        }
        return vendor || custom || input.adTechProvidersListed && !input.adTechProviderConsents.isEmpty
    }

    /// Whether `core`'s committed TC String grants `marketing` with someone who could track, or
    /// `nil` when there is no current TC String (no IAB policy, nothing saved yet, or a list that
    /// can no longer be read). Computed once per snapshot revision: it builds the IAB
    /// presentation, which is too heavy for every snapshot.
    public static func iabMarketingConsented(_ core: ConsentCore) -> Bool? {
        let snapshot = core.snapshot()
        guard snapshot.model == .iab else { return nil }
        if let hit = cache.value(for: core, revision: snapshot.revision) { return hit }
        let value = compute(core)
        cache.store(value, for: core, revision: snapshot.revision)
        return value
    }

    /// How many times the IAB answer was computed rather than read from the cache. For tests.
    static var computations: Int { cache.computations }

    private static func compute(_ core: ConsentCore) -> Bool? {
        cache.counted()
        guard let consent = core.iabConsent(), let presentation = core.iabPresentation() else { return nil }
        let input = IABInput(
            purposeConsents: Set(consent.choices.purposeConsents),
            vendorConsentPurposes: presentation.vendors.mapValues { Set($0.consentPurposes) },
            vendorConsents: Set(consent.choices.vendorConsents),
            adTechProvidersListed: presentation.adTechProviders?.isEmpty == false,
            adTechProviderConsents: Set(consent.choices.adTechProviderConsents ?? []),
            customVendorConsentPurposes: Dictionary(
                presentation.customVendors.map { ($0.id, Set($0.purposes)) }, uniquingKeysWith: { first, _ in first }),
            customVendorConsents: Set(consent.choices.customVendorConsents))
        return iabMarketingConsented(input)
    }

    private static let cache = Cache()

    /// The last answer per core, keyed by snapshot revision. Locked: the React Native bridge
    /// encodes snapshots off the main thread.
    private final class Cache: @unchecked Sendable {
        private struct Entry {
            weak var core: ConsentCore?
            let revision: Int
            let value: Bool?
        }
        private let lock = NSLock()
        private var entries: [ObjectIdentifier: Entry] = [:]
        private var count = 0

        var computations: Int { lock.withLock { count } }
        func counted() { lock.withLock { count += 1 } }

        /// The stored answer, or `nil` when none is stored for this core at this revision. A
        /// stored `nil` answer (no TC String) comes back as `.some(nil)`.
        func value(for core: ConsentCore, revision: Int) -> Bool?? {
            lock.withLock {
                guard let entry = entries[ObjectIdentifier(core)], entry.core === core,
                      entry.revision == revision else { return nil }
                return .some(entry.value)
            }
        }

        func store(_ value: Bool?, for core: ConsentCore, revision: Int) {
            lock.withLock {
                entries = entries.filter { $0.value.core != nil }
                entries[ObjectIdentifier(core)] = Entry(core: core, revision: revision, value: value)
            }
        }
    }
}
