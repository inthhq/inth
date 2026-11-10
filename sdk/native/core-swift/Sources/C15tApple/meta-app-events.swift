#if canImport(C15tCore)
import C15tCore
#endif
import Foundation

/// Keeps the Meta (Facebook) SDK's automatic App Events, advertiser ID collection and
/// Limited Data Use in sync with one native category.
///
/// While the category is denied or pending, the helper turns off automatic App Events
/// and advertiser ID collection and turns on Limited Data Use. When it is granted, it
/// turns Limited Data Use off and both settings on. Set
/// `Settings.shared.isAutoLogAppEventsEnabled` and
/// `Settings.shared.isAdvertiserIDCollectionEnabled`. For `setLimitedDataUse`, call
/// `Settings.shared.setDataProcessingOptions(["LDU"], country: 0, state: 0)` when it
/// is `true`, so Meta applies it by location, and `setDataProcessingOptions([])`
/// when it is `false`. Marketing is the default, as for the web's Meta Pixel. c15t
/// does not link the Meta SDK.
///
/// Set `FacebookAutoLogAppEventsEnabled` and `FacebookAdvertiserIDCollectionEnabled`
/// to `false` in `Info.plist` so nothing runs before the helper connects. Events the
/// app logs itself need their own consent check. The Meta SDK 17 and later reads ATT
/// itself on iOS 17 and later; this helper does not request or set it. Retain this
/// object for the SDK's lifetime. Calls run synchronously on the caller or native
/// consent notification queue.
public final class MetaAppEventsIntegration: @unchecked Sendable {
    private let binding: ConsentStateBinding<Bool>

    /// - Parameters:
    ///   - core: The app's installed native engine.
    ///   - category: The permission controlling Meta, defaulting to marketing.
    ///   - setAutoLogAppEventsEnabled: Turns automatic App Events on or off.
    ///   - setAdvertiserIDCollectionEnabled: Turns advertiser ID collection on or off.
    ///   - setLimitedDataUse: Turns Limited Data Use on or off.
    public init(
        core: ConsentCore,
        category: OptionalConsentCategory = .marketing,
        setAutoLogAppEventsEnabled: @escaping @Sendable (Bool) -> Void,
        setAdvertiserIDCollectionEnabled: @escaping @Sendable (Bool) -> Void,
        setLimitedDataUse: @escaping @Sendable (Bool) -> Void
    ) {
        binding = categoryBinding(core: core, category: category.category) { allowed, stillAllowed in
            if allowed && stillAllowed() {
                setLimitedDataUse(false)
                setAdvertiserIDCollectionEnabled(true)
                setAutoLogAppEventsEnabled(true)
            } else {
                setAutoLogAppEventsEnabled(false)
                setAdvertiserIDCollectionEnabled(false)
                setLimitedDataUse(true)
            }
        }
    }

    /// Turns collection off and unsubscribes. Safe to call repeatedly.
    public func cancel() { binding.cancel() }

    /// Reapplies current consent after app code changes these settings.
    /// Does nothing after cancellation.
    public func sync() { binding.sync() }

    deinit { binding.cancel() }
}
