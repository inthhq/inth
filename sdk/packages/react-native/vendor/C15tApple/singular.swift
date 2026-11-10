#if canImport(C15tCore)
import C15tCore
#endif
import Foundation

/// Starts Singular only once one category allows it, and keeps its tracking and data
/// sharing in sync with native consent.
///
/// Singular's privacy calls need a started SDK, and `Singular.start` begins a session
/// at once, so the helper owns starting. Do not call `Singular.start` yourself. On
/// the first grant, the helper calls `start` with the data-sharing limit; call
/// `Singular.limitDataSharing` with it and then `Singular.start` there. It then calls
/// `resumeAllTracking` and `trackingOptIn` once per grant. While the category has
/// never been granted in this process, the helper makes no Singular call, because
/// Singular is not running. After it has started, withdrawal calls `stopAllTracking`,
/// which Singular keeps across launches.
///
/// `limitDataSharing` receives `true` unless `adUserData` and `adPersonalization` are
/// both granted; Singular passes it to Google as the DMA consent signals. Marketing
/// grants both and is the default category. c15t does not link Singular. Retain this
/// object for the SDK's lifetime. Calls run synchronously on the caller or native
/// consent notification queue. It does not request ATT.
public final class SingularIntegration: @unchecked Sendable {
    private let binding: ConsentStateBinding<TrackingAndAds>

    /// - Parameters:
    ///   - core: The app's installed native engine.
    ///   - category: The permission that lets Singular track, defaulting to marketing.
    ///   - start: Starts Singular with the given data-sharing limit. Called once.
    ///   - limitDataSharing: Calls `Singular.limitDataSharing` with the given value.
    ///   - stopAllTracking: Calls `Singular.stopAllTracking()`.
    ///   - resumeAllTracking: Calls `Singular.resumeAllTracking()`.
    ///   - trackingOptIn: Calls `Singular.trackingOptIn()`.
    public init(
        core: ConsentCore,
        category: OptionalConsentCategory = .marketing,
        start: @escaping @Sendable (_ limitDataSharing: Bool) -> Void,
        limitDataSharing: @escaping @Sendable (Bool) -> Void,
        stopAllTracking: @escaping @Sendable () -> Void,
        resumeAllTracking: @escaping @Sendable () -> Void,
        trackingOptIn: @escaping @Sendable () -> Void
    ) {
        let started = StartedFlag()
        binding = trackingAndAdsBinding(core: core, category: category.category) { previous, state, current in
            if state.tracking {
                // Set before start runs, so a withdrawal during start stops what it began.
                if current().tracking && started.claim() {
                    start(!(state.ads.adUserData && state.ads.adPersonalization))
                }
                // Each call that follows reads current consent; a withdrawal is applied next.
                let now = current()
                guard now.tracking else { return }
                limitDataSharing(!(now.ads.adUserData && now.ads.adPersonalization))
                if previous?.tracking != true && current().tracking {
                    resumeAllTracking()
                    if current().tracking { trackingOptIn() }
                }
            } else if started.value {
                stopAllTracking()
                limitDataSharing(!(state.ads.adUserData && state.ads.adPersonalization))
            }
        }
    }

    /// Stops all tracking if Singular started, and unsubscribes. Safe to call repeatedly.
    public func cancel() { binding.cancel() }

    /// Reapplies current consent, opting in again if allowed.
    /// Does nothing after cancellation.
    public func sync() { binding.sync() }

    deinit { binding.cancel() }
}

/// Whether Singular was started, readable from any thread.
private final class StartedFlag: @unchecked Sendable {
    private let lock = NSLock()
    private var started = false

    var value: Bool {
        lock.lock()
        defer { lock.unlock() }
        return started
    }

    /// Marks Singular started. Returns `true` only for the first caller.
    func claim() -> Bool {
        lock.lock()
        defer { lock.unlock() }
        guard !started else { return false }
        started = true
        return true
    }
}
