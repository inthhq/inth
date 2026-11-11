#if canImport(C15tCore)
import C15tCore
#endif
import Foundation

/// What App Tracking Transparency sequencing reads from IAB TCF consent.
///
/// Under an IAB TCF policy the c15t `marketing` category and the TC String are recorded side by
/// side. Tracking needs both, so the sequence asks Apple only while the TC String also consents
/// to the purposes `marketing` stands for. This is the web derivation, not a second one:
/// `C15T_TO_IAB_PURPOSE_MAP.marketing` and `iabPurposesToC15tConsents` in
/// `packages/iab/src/tcf/purpose-mapping.ts`, with the purposes some vendor processes on consent
/// deciding, as `consentBasisPurposes` in `packages/iab/src/index.ts` passes them.
public enum C15tTrackingConsent {
    /// The TCF purposes the `marketing` category stands for: 2, 3 and 4.
    /// `scripts/consent-tracking-iab-purposes.test.ts` keeps this equal to the web map.
    public static let iabMarketingPurposes: Set<Int> = [2, 3, 4]

    /// The purposes Google's ad tech providers need, which the web adds to the consent basis.
    static let adTechProviderPurposes: Set<Int> = [1, 3, 4]

    /// Whether `purposeConsents` grants `marketing`, the way `iabPurposesToC15tConsents` does.
    ///
    /// Only the marketing purposes some vendor processes on consent decide, because a purpose
    /// nobody asks consent for has no switch the person could turn on. When none of them is in
    /// that basis, all of them decide, so legitimate interest alone never grants the category.
    /// - Parameters:
    ///   - purposeConsents: The TC String's purpose consents.
    ///   - consentBasis: Purposes some vendor processes on consent after publisher restrictions,
    ///     with the ad tech providers' purposes when the list has providers.
    public static func iabMarketingConsented(purposeConsents: Set<Int>, consentBasis: Set<Int>) -> Bool {
        let deciding = iabMarketingPurposes.intersection(consentBasis)
        return (deciding.isEmpty ? iabMarketingPurposes : deciding).isSubset(of: purposeConsents)
    }

    /// Whether `core`'s committed TC String grants `marketing`, or `nil` when there is no current
    /// TC String (no IAB policy, nothing saved yet, or a list that can no longer be read).
    public static func iabMarketingConsented(_ core: ConsentCore) -> Bool? {
        guard core.snapshot().model == .iab, let consent = core.iabConsent(),
              let presentation = core.iabPresentation() else { return nil }
        var basis = Set(presentation.vendors.values.flatMap(\.consentPurposes))
        if presentation.adTechProviders?.isEmpty == false { basis.formUnion(adTechProviderPurposes) }
        return iabMarketingConsented(purposeConsents: Set(consent.choices.purposeConsents), consentBasis: basis)
    }
}
