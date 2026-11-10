#if canImport(C15tCore)
import C15tCore
#endif
import Foundation

/// Keeps Amplitude Analytics opt-out in sync with one native category.
///
/// Create Amplitude with `optOut: true` in its `Configuration`, then pass a closure
/// that sets `optOut` on the same instance. Amplitude drops events while opted out
/// and does not persist the setting, so connect this helper on every launch. Pending,
/// denied and cancelled states opt out. c15t does not link Amplitude, and this helper
/// does not configure session replay or other Amplitude products.
///
/// Retain this object for the SDK's lifetime. Calls run synchronously on the caller
/// or native consent notification queue.
public final class AmplitudeIntegration: @unchecked Sendable {
    private let binding: ConsentStateBinding<Bool>

    /// - Parameters:
    ///   - core: The app's installed native engine.
    ///   - category: The permission controlling tracking, defaulting to measurement.
    ///   - setOptOut: Sets Amplitude's `optOut`.
    public init(
        core: ConsentCore,
        category: OptionalConsentCategory = .measurement,
        setOptOut: @escaping @Sendable (Bool) -> Void
    ) {
        binding = categoryBinding(core: core, category: category.category) { allowed, stillAllowed in
            setOptOut(!(allowed && stillAllowed()))
        }
    }

    /// Opts out and unsubscribes. Safe to call repeatedly.
    public func cancel() { binding.cancel() }

    /// Reapplies current consent after app code resets Amplitude.
    /// Does nothing after cancellation.
    public func sync() { binding.sync() }

    deinit { binding.cancel() }
}
