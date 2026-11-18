#if canImport(InthCore)
import InthCore
#endif
import Foundation

/// Keeps Google Mobile Ads (AdMob) privacy settings in sync with native consent.
///
/// Sends the three Consent Mode advertising types, which marketing grants, as on the
/// web. Map them in `setConsent`: when `adStorage` is denied, set
/// `gad_has_consent_for_cookies` to `0` in `UserDefaults.standard`, which turns on
/// limited ads; remove the key when it is granted. When `adPersonalization` or
/// `adUserData` is denied, set `MobileAds.shared.requestConfiguration
/// .publisherPrivacyPersonalizationState` to `.disabled` and `gad_rdp` to `true`;
/// set `.enabled` and remove the key when both are granted. Inth does not link
/// Google Mobile Ads.
///
/// In the EEA, UK and Switzerland, Google serves personalized or non-personalized ads
/// only with a TC string from a Google-certified CMP. These settings do not replace
/// that. Under an IAB policy, the native core writes the `IABTCF_` keys Google reads.
///
/// Retain this object for the SDK's lifetime. The initial state is applied before
/// initialization returns. Calls run synchronously on the caller or native consent
/// notification queue. It does not request ATT.
public final class AdMobIntegration: @unchecked Sendable {
    private let binding: ConsentStateBinding<GoogleAdsConsent>

    /// - Parameters:
    ///   - core: The app's installed native engine.
    ///   - setConsent: Applies the advertising types to Google Mobile Ads.
    public init(core: ConsentCore, setConsent: @escaping @Sendable (GoogleAdsConsent) -> Void) {
        binding = ConsentStateBinding(
            core: core,
            categories: [.marketing],
            read: { GoogleAdsConsent(GoogleConsentMode.consent($0)) }
        ) { _, consent, _ in setConsent(consent) }
    }

    /// Denies every advertising type and unsubscribes. Safe to call repeatedly.
    public func cancel() { binding.cancel() }

    /// Reapplies current consent after app code resets these settings.
    /// Does not record a choice. Does nothing after cancellation.
    public func sync() { binding.sync() }

    deinit { binding.cancel() }
}
