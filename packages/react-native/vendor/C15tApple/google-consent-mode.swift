#if canImport(C15tCore)
import C15tCore
#endif
import Foundation

/// A Google Consent Mode v2 consent type and the c15t category that grants it.
///
/// The mapping is the web's (`@c15t/integrations`). `GoogleConsentModeTests` checks
/// it against `packages/native-protocol/google-consent-mode/consent-mode-v2.json`, which is
/// generated from the web module, so a change on the web fails here until this copy
/// follows. The raw value is the type's name in Google's APIs, such as `ad_storage`.
public enum GoogleConsentType: String, CaseIterable, Sendable, Hashable {
    case adStorage = "ad_storage"
    case adUserData = "ad_user_data"
    case adPersonalization = "ad_personalization"
    case analyticsStorage = "analytics_storage"
    case functionalityStorage = "functionality_storage"
    case personalizationStorage = "personalization_storage"
    case securityStorage = "security_storage"

    /// The c15t category that grants this type.
    public var category: ConsentCategory {
        switch self {
        case .adStorage, .adUserData, .adPersonalization: return .marketing
        case .analyticsStorage: return .measurement
        case .functionalityStorage: return .functionality
        case .personalizationStorage: return .experience
        case .securityStorage: return .necessary
        }
    }
}

/// Google Consent Mode v2 state from c15t consent, for vendor helpers and app code.
///
/// A type is granted when the category that grants it is granted. A pending policy
/// denies every optional category, so it denies every type except `security_storage`.
public enum GoogleConsentMode {
    /// Each c15t category and the types it grants, in ``GoogleConsentType`` order.
    public static var mapping: [ConsentCategory: [GoogleConsentType]] {
        Dictionary(grouping: GoogleConsentType.allCases, by: \.category)
    }

    /// Resolves every type from a category reader.
    ///
    /// - Parameter isGranted: Whether a c15t category is granted.
    /// - Returns: Every ``GoogleConsentType``, granted (`true`) or denied (`false`).
    public static func consent(_ isGranted: (ConsentCategory) -> Bool) -> [GoogleConsentType: Bool] {
        var result: [GoogleConsentType: Bool] = [:]
        for type in GoogleConsentType.allCases {
            result[type] = isGranted(type.category)
        }
        return result
    }

    /// Resolves every type from the core's current decisions.
    ///
    /// - Parameter core: The installed native engine.
    /// - Returns: Every ``GoogleConsentType``, granted (`true`) or denied (`false`).
    public static func consent(from core: ConsentCore) -> [GoogleConsentType: Bool] {
        consent { core.decision(for: $0) == .granted }
    }
}

/// The three Consent Mode v2 advertising types, for vendor helpers that forward
/// Google's EEA consent signals.
///
/// All three follow marketing, as on the web. See ``GoogleConsentMode``.
public struct GoogleAdsConsent: Equatable, Sendable {
    /// `ad_storage`: advertising identifiers and storage on the device.
    public let adStorage: Bool
    /// `ad_user_data`: sending user data to Google for advertising.
    public let adUserData: Bool
    /// `ad_personalization`: personalized advertising.
    public let adPersonalization: Bool

    public init(adStorage: Bool, adUserData: Bool, adPersonalization: Bool) {
        self.adStorage = adStorage
        self.adUserData = adUserData
        self.adPersonalization = adPersonalization
    }

    /// Picks the advertising types out of a full Consent Mode state.
    public init(_ consent: [GoogleConsentType: Bool]) {
        self.init(
            adStorage: consent[.adStorage] ?? false,
            adUserData: consent[.adUserData] ?? false,
            adPersonalization: consent[.adPersonalization] ?? false
        )
    }
}

/// Whether a vendor may run under its category, with the advertising types.
struct TrackingAndAds: Equatable {
    let tracking: Bool
    let ads: GoogleAdsConsent
}

/// Binds a vendor that runs under `category` and also takes the advertising types.
func trackingAndAdsBinding(
    core: ConsentCore,
    category: ConsentCategory,
    apply: @escaping (_ previous: TrackingAndAds?, _ state: TrackingAndAds, _ current: () -> TrackingAndAds) -> Void
) -> ConsentStateBinding<TrackingAndAds> {
    ConsentStateBinding(
        core: core,
        categories: category == .marketing ? [.marketing] : [category, .marketing],
        read: { TrackingAndAds(tracking: $0(category), ads: GoogleAdsConsent(GoogleConsentMode.consent($0))) },
        apply: apply
    )
}
