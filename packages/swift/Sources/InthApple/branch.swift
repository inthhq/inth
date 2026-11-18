#if canImport(InthCore)
import InthCore
#endif
import Foundation

/// The Branch consumer protection attribution level ``BranchIntegration`` sets.
/// Map each to Branch's `BranchAttributionLevel` case of the same name.
public enum BranchAttribution: String, Sendable, Equatable {
    /// Marketing is granted: advertising and device identifiers.
    case full = "FULL"
    /// Only measurement is granted: device identifiers, no advertising frameworks.
    case minimal = "MINIMAL"
    /// Neither is granted: deterministic deep linking only.
    case none = "NONE"
}

/// Keeps Branch's attribution level and Google DMA parameters in sync with consent.
///
/// Marketing sets ``BranchAttribution/full``. Measurement alone sets
/// ``BranchAttribution/minimal``, Branch's analytics-only level. Anything else,
/// including pending consent, sets ``BranchAttribution/none``, which keeps deep links
/// working. In `setDMAParamsForEEA`, call Branch's method of the same name with your
/// own EEA flag, since Inth's policy model is not a legal jurisdiction flag, then
/// `adPersonalization` and `adUserData`. Marketing grants both, as on the web. Inth
/// does not link Branch.
///
/// Connect before Branch initializes its session so the first request carries the
/// level. Retain this object for the SDK's lifetime. Calls run synchronously on the
/// caller or native consent notification queue.
public final class BranchIntegration: @unchecked Sendable {
    private struct State: Equatable {
        let level: BranchAttribution
        let ads: GoogleAdsConsent
    }

    private let binding: ConsentStateBinding<State>

    /// - Parameters:
    ///   - core: The app's installed native engine.
    ///   - setConsumerProtectionAttributionLevel: Calls Branch's method of the same name.
    ///   - setDMAParamsForEEA: Calls Branch's method of the same name.
    public init(
        core: ConsentCore,
        setConsumerProtectionAttributionLevel: @escaping @Sendable (BranchAttribution) -> Void,
        setDMAParamsForEEA: @escaping @Sendable (GoogleAdsConsent) -> Void
    ) {
        binding = ConsentStateBinding(
            core: core,
            categories: [.marketing, .measurement],
            read: { isGranted in
                State(
                    level: isGranted(.marketing) ? .full : isGranted(.measurement) ? .minimal : .none,
                    ads: GoogleAdsConsent(GoogleConsentMode.consent(isGranted))
                )
            }
        ) { _, state, current in
            // Lower the level before sending denials; send grants before raising it.
            if state.level == .full {
                setDMAParamsForEEA(state.ads)
                setConsumerProtectionAttributionLevel(current().level)
            } else {
                setConsumerProtectionAttributionLevel(state.level)
                setDMAParamsForEEA(state.ads)
            }
        }
    }

    /// Sets ``BranchAttribution/none`` and unsubscribes. Safe to call repeatedly.
    public func cancel() { binding.cancel() }

    /// Reapplies current consent after app code changes Branch's settings.
    /// Does nothing after cancellation.
    public func sync() { binding.sync() }

    deinit { binding.cancel() }
}
