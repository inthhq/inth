#if canImport(C15tCore)
import C15tCore
#endif
import Foundation

/// Keeps AppsFlyer running only while one category allows it, and sends Google's DMA
/// consent through AppsFlyer's consent API.
///
/// Map ``GoogleAdsConsent`` to `AppsFlyerConsent` in `setConsentData`:
/// `hasConsentForDataUsage` from `adUserData`, `hasConsentForAdsPersonalization` from
/// `adPersonalization` and `hasConsentForAdStorage` from `adStorage`.
/// `isUserSubjectToGDPR` is yours to supply: c15t's policy model is not a legal
/// jurisdiction flag. Marketing grants all three types, as on the web.
///
/// Written against AppsFlyer iOS SDK 6. SDK 7 starts sessions only from its
/// session-ready listener, which this helper does not coordinate.
///
/// Do not call AppsFlyer's `start()` yourself. While the category is denied or
/// pending, the helper sets `isStopped` to `true`. When it is granted, it sets
/// `isStopped` to `false` and then calls `start`. A change that keeps the category
/// granted sends the new consent data without starting again. c15t does not link
/// AppsFlyer.
///
/// Retain this object for the SDK's lifetime. Calls run synchronously on the caller
/// or native consent notification queue. It does not request ATT.
public final class AppsFlyerIntegration: @unchecked Sendable {
    private let binding: ConsentStateBinding<TrackingAndAds>

    /// - Parameters:
    ///   - core: The app's installed native engine.
    ///   - category: The permission that lets AppsFlyer run, defaulting to marketing.
    ///   - setConsentData: Passes the consent to `AppsFlyerLib.shared().setConsentData`.
    ///   - setStopped: Sets `AppsFlyerLib.shared().isStopped`.
    ///   - start: Calls `AppsFlyerLib.shared().start()`.
    public init(
        core: ConsentCore,
        category: OptionalConsentCategory = .marketing,
        setConsentData: @escaping @Sendable (GoogleAdsConsent) -> Void,
        setStopped: @escaping @Sendable (Bool) -> Void,
        start: @escaping @Sendable () -> Void
    ) {
        binding = trackingAndAdsBinding(core: core, category: category.category) { previous, state, current in
            if state.tracking {
                setConsentData(state.ads)
                if previous?.tracking != true && current().tracking {
                    setStopped(false)
                    if current().tracking { start() }
                }
            } else {
                setStopped(true)
                setConsentData(state.ads)
            }
        }
    }

    /// Stops AppsFlyer and unsubscribes. Safe to call repeatedly.
    public func cancel() { binding.cancel() }

    /// Reapplies current consent, starting AppsFlyer again if allowed.
    /// Does nothing after cancellation.
    public func sync() { binding.sync() }

    deinit { binding.cancel() }
}
