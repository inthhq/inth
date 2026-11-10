#if canImport(C15tCore)
import C15tCore
#endif
import Foundation

/// Keeps the Braze SDK enabled only while one category allows it, and records
/// Google's DMA consent on the Braze user.
///
/// While the category is denied or pending, the helper sets `enabled` to `false`.
/// When it is granted, it sets `enabled` to `true` and then calls
/// `setGoogleAdsConsent`. Set Braze's `$google_ad_user_data` and
/// `$google_ad_personalization` custom attributes there, as Booleans, from
/// `adUserData` and `adPersonalization`. Braze forwards them to Google in Audience
/// Sync. Marketing grants both, and is the default category, as for the web's email
/// and messaging helpers. c15t does not link Braze.
///
/// When the category is withdrawn, the helper only disables Braze. It does not write
/// denied attributes first: Braze cancels in-flight requests when disabled and offers
/// no acknowledged flush, so the write could not be confirmed. Braze's servers keep the
/// last values sent. A marketing change while the category stays granted is written
/// normally. After `changeUser`, call ``sync()`` to record the attributes on the new user.
///
/// Retain this object for the SDK's lifetime. Calls run synchronously on the caller
/// or native consent notification queue.
public final class BrazeIntegration: @unchecked Sendable {
    private let binding: ConsentStateBinding<TrackingAndAds>

    /// - Parameters:
    ///   - core: The app's installed native engine.
    ///   - category: The permission that lets Braze run, defaulting to marketing.
    ///   - setEnabled: Sets the `enabled` property of the app's `Braze` instance.
    ///   - setGoogleAdsConsent: Sets the two custom attributes on the current user.
    public init(
        core: ConsentCore,
        category: OptionalConsentCategory = .marketing,
        setEnabled: @escaping @Sendable (Bool) -> Void,
        setGoogleAdsConsent: @escaping @Sendable (GoogleAdsConsent) -> Void
    ) {
        binding = trackingAndAdsBinding(core: core, category: category.category) { previous, state, current in
            if state.tracking {
                if previous?.tracking != true { setEnabled(true) }
                // A withdrawal during enable is applied next.
                let now = current()
                if now.tracking { setGoogleAdsConsent(now.ads) }
            } else {
                setEnabled(false)
            }
        }
    }

    /// Disables Braze and unsubscribes. Safe to call repeatedly.
    public func cancel() { binding.cancel() }

    /// Reapplies current consent, for example after `changeUser`.
    /// Does nothing after cancellation.
    public func sync() { binding.sync() }

    deinit { binding.cancel() }
}
