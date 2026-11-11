#if canImport(C15tCore)
import C15tCore
#endif
import Foundation

/// A Google Consent Mode v2 consent type and the c15t category that grants it.
///
/// The mapping is the web's (`@c15t/integrations`). `GoogleConsentModeTests` checks
/// it against `native/protocol/google-consent-mode/consent-mode-v2.json`, which is
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
