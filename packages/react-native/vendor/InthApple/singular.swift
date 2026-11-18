#if canImport(InthCore)
import InthCore
#endif
import Foundation

/// Starts Singular only once one category allows it, and keeps its tracking and data
/// sharing in sync with native consent.
///
/// Singular's privacy calls need a started SDK, and `Singular.start` begins a session
/// at once, so the helper owns starting. Do not call `Singular.start` yourself. On
/// the first grant, the helper calls `start` with the data-sharing limit; call
/// `Singular.limitDataSharing` with it, then return what `Singular.start` returns. If
/// it returns `false`, the helper makes no tracking call and tries `start` again on
/// the next update or ``sync()``; restricting calls still follow consent while it may
/// have started. Once Singular started, the helper calls `resumeAllTracking` and
/// `trackingOptIn` once per grant. While the category has
/// never been granted in this process, the helper makes no Singular call, because
/// Singular is not running. After it has started, withdrawal calls `stopAllTracking`,
/// which Singular keeps across launches.
///
/// `limitDataSharing` receives `true` unless `adUserData` and `adPersonalization` are
/// both granted; Singular passes it to Google as the DMA consent signals. Marketing
/// grants both and is the default category. Inth does not link Singular. Retain this
/// object for the SDK's lifetime. Calls run synchronously on the caller or native
/// consent notification queue. It does not request ATT.
public final class SingularIntegration: @unchecked Sendable {
    private let binding: ConsentStateBinding<TrackingAndAds>

    /// - Parameters:
    ///   - core: The app's installed native engine.
    ///   - category: The permission that lets Singular track, defaulting to marketing.
    ///   - start: Starts Singular with the given data-sharing limit and returns whether
    ///     it started. Called until it returns `true`.
    ///   - limitDataSharing: Calls `Singular.limitDataSharing` with the given value.
    ///   - stopAllTracking: Calls `Singular.stopAllTracking()`.
    ///   - resumeAllTracking: Calls `Singular.resumeAllTracking()`.
    ///   - trackingOptIn: Calls `Singular.trackingOptIn()`.
    public init(
        core: ConsentCore,
        category: OptionalConsentCategory = .marketing,
        start: @escaping @Sendable (_ limitDataSharing: Bool) -> Bool,
        limitDataSharing: @escaping @Sendable (Bool) -> Void,
        stopAllTracking: @escaping @Sendable () -> Void,
        resumeAllTracking: @escaping @Sendable () -> Void,
        trackingOptIn: @escaping @Sendable () -> Void
    ) {
        let progress = StartProgress()
        binding = trackingAndAdsBinding(core: core, category: category.category) { previous, state, current in
            if state.tracking {
                // Restricting comes first, so a start in flight or failing cannot delay it.
                var limited = false
                if progress.mayHaveStarted && limits(current().ads) {
                    limitDataSharing(true)
                    limited = true
                }
                if current().tracking && progress.beginStart() {
                    progress.finishStart(started: start(limits(state.ads)))
                }
                // Each call that follows reads current consent; a withdrawal is applied next.
                let now = current()
                guard now.tracking && progress.started else { return }
                let limit = limits(now.ads)
                if !(limit && limited) { limitDataSharing(limit) }
                if previous?.tracking != true && current().tracking {
                    resumeAllTracking()
                    if current().tracking { trackingOptIn() }
                }
            } else if progress.mayHaveStarted {
                stopAllTracking()
                limitDataSharing(true)
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

/// Whether Singular must limit data sharing: unless both DMA signals are granted.
private func limits(_ ads: GoogleAdsConsent) -> Bool {
    !(ads.adUserData && ads.adPersonalization)
}

/// How far starting Singular got, readable from any thread.
private final class StartProgress: @unchecked Sendable {
    private let lock = NSLock()
    private var attempted = false
    private var inFlight = false
    private var succeeded = false

    /// Whether `start` ever ran, so Singular may be running.
    var mayHaveStarted: Bool { lock.lock(); defer { lock.unlock() }; return attempted }

    /// Whether `start` reported success.
    var started: Bool { lock.lock(); defer { lock.unlock() }; return succeeded }

    /// Claims a start. Returns `false` while one is in flight or after one succeeded.
    func beginStart() -> Bool {
        lock.lock(); defer { lock.unlock() }
        guard !succeeded && !inFlight else { return false }
        attempted = true
        inFlight = true
        return true
    }

    func finishStart(started: Bool) {
        lock.lock(); defer { lock.unlock() }
        inFlight = false
        succeeded = started
    }
}
