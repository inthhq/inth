#if canImport(InthCore)
import InthCore
#endif
import Foundation

/// Keeps the Adjust SDK enabled only while one category allows it, and sends
/// third-party sharing with Google's DMA options.
///
/// In `trackThirdPartySharing`, build `ADJThirdPartySharing(isEnabled: adUserData)`
/// and add the `google_dma` granular options: `eea` (yours to supply, since Inth's
/// policy model is not a legal jurisdiction flag), `ad_personalization` and
/// `ad_user_data`, each `"1"` or `"0"`. Then pass it to `Adjust.trackThirdPartySharing`.
/// Marketing grants both types, as on the web.
///
/// While the category is denied or pending, the helper calls `disable`. Adjust sends
/// nothing while disabled. When the category is granted, it calls `enable` once per
/// grant and then sends third-party sharing, because Adjust ignores calls made while
/// disabled. A consent change while Adjust runs sends third-party sharing again.
/// Connect it before `Adjust.initSdk`. Inth does not link Adjust.
///
/// Retain this object for the SDK's lifetime. Calls run synchronously on the caller
/// or native consent notification queue. It does not request ATT.
public final class AdjustIntegration: @unchecked Sendable {
    private let binding: ConsentStateBinding<TrackingAndAds>

    /// - Parameters:
    ///   - core: The app's installed native engine.
    ///   - category: The permission that lets Adjust run, defaulting to marketing.
    ///   - enable: Calls `Adjust.enable()`.
    ///   - disable: Calls `Adjust.disable()`.
    ///   - trackThirdPartySharing: Sends the consent with `Adjust.trackThirdPartySharing`.
    public init(
        core: ConsentCore,
        category: OptionalConsentCategory = .marketing,
        enable: @escaping @Sendable () -> Void,
        disable: @escaping @Sendable () -> Void,
        trackThirdPartySharing: @escaping @Sendable (GoogleAdsConsent) -> Void
    ) {
        binding = trackingAndAdsBinding(core: core, category: category.category) { previous, state, current in
            guard state.tracking else { return disable() }
            if previous?.tracking != true { enable() }
            // A withdrawal during enable is applied next, without sharing.
            let now = current()
            if now.tracking { trackThirdPartySharing(now.ads) }
        }
    }

    /// Disables Adjust and unsubscribes. Safe to call repeatedly.
    public func cancel() { binding.cancel() }

    /// Reapplies current consent after app code resets Adjust.
    /// Does nothing after cancellation.
    public func sync() { binding.sync() }

    deinit { binding.cancel() }
}
