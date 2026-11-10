#if canImport(C15tCore)
import C15tCore
#endif
import Foundation

/// Keeps Singular tracking and data sharing in sync with native consent.
///
/// While the category is denied or pending, the helper calls `stopAllTracking`, which
/// Singular keeps across launches. When it is granted, it calls `resumeAllTracking`
/// and `trackingOptIn` once per grant. `limitDataSharing` receives `true` unless
/// `adUserData` and `adPersonalization` are both granted; Singular passes it to Google
/// as the DMA consent signals. Marketing grants both and is the default category.
/// c15t does not link Singular.
///
/// Connect before `Singular.start` so the first session carries the limit, as
/// Singular recommends. Retain this object for the SDK's lifetime. Calls run
/// synchronously on the caller or native consent notification queue. It does not
/// request ATT.
public final class SingularIntegration: @unchecked Sendable {
    private let binding: ConsentStateBinding<TrackingAndAds>

    /// - Parameters:
    ///   - core: The app's installed native engine.
    ///   - category: The permission that lets Singular track, defaulting to marketing.
    ///   - limitDataSharing: Calls `Singular.limitDataSharing` with the given value.
    ///   - stopAllTracking: Calls `Singular.stopAllTracking()`.
    ///   - resumeAllTracking: Calls `Singular.resumeAllTracking()`.
    ///   - trackingOptIn: Calls `Singular.trackingOptIn()`.
    public init(
        core: ConsentCore,
        category: OptionalConsentCategory = .marketing,
        limitDataSharing: @escaping @Sendable (Bool) -> Void,
        stopAllTracking: @escaping @Sendable () -> Void,
        resumeAllTracking: @escaping @Sendable () -> Void,
        trackingOptIn: @escaping @Sendable () -> Void
    ) {
        binding = trackingAndAdsBinding(core: core, category: category.category) { previous, state, current in
            let limit = !(state.ads.adUserData && state.ads.adPersonalization)
            if state.tracking {
                limitDataSharing(limit)
                if previous?.tracking != true && current().tracking {
                    resumeAllTracking()
                    if current().tracking { trackingOptIn() }
                }
            } else {
                stopAllTracking()
                limitDataSharing(limit)
            }
        }
    }

    /// Stops all tracking and unsubscribes. Safe to call repeatedly.
    public func cancel() { binding.cancel() }

    /// Reapplies current consent, opting in again if allowed.
    /// Does nothing after cancellation.
    public func sync() { binding.sync() }

    deinit { binding.cancel() }
}
