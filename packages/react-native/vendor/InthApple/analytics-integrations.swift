#if canImport(InthCore)
import InthCore
#endif
import Foundation

/// The four Consent Mode v2 types Firebase Analytics takes.
///
/// Measurement grants `analyticsStorage`; marketing grants `adStorage`, `adUserData`
/// and `adPersonalization`. See ``GoogleConsentMode``. Map these values to
/// Firebase's `ConsentType` and `ConsentStatus` in the app, where Firebase is
/// installed. Inth does not link or configure Firebase for you.
public struct FirebaseAnalyticsConsent: Equatable, Sendable {
    public let analyticsStorage: Bool
    public let adStorage: Bool
    public let adUserData: Bool
    public let adPersonalization: Bool

    public init(analyticsStorage: Bool, adStorage: Bool, adUserData: Bool, adPersonalization: Bool) {
        self.analyticsStorage = analyticsStorage
        self.adStorage = adStorage
        self.adUserData = adUserData
        self.adPersonalization = adPersonalization
    }

    /// Picks Firebase's four types out of a full Consent Mode state.
    public init(_ consent: [GoogleConsentType: Bool]) {
        self.init(
            analyticsStorage: consent[.analyticsStorage] ?? false,
            adStorage: consent[.adStorage] ?? false,
            adUserData: consent[.adUserData] ?? false,
            adPersonalization: consent[.adPersonalization] ?? false
        )
    }
}

/// Keeps Firebase Analytics consent and collection in sync with native consent.
///
/// Sends all four Consent Mode v2 types Firebase takes, with the web's mapping:
/// measurement grants analytics storage, marketing grants ad storage, ad user data
/// and ad personalization. Collection is on only while analytics storage is granted.
/// A pending policy denies every type and keeps collection off.
///
/// Install the core, set Firebase's `GOOGLE_ANALYTICS_DEFAULT_ALLOW_*` Info.plist keys
/// to `false` and configure Firebase with collection disabled before binding. Retain
/// this object for the SDK's lifetime. The initial state is applied before
/// initialization returns. Calls run synchronously on the caller or native consent
/// notification queue, and must not dispatch vendor changes asynchronously.
/// It does not implement IAB or ATT.
public final class FirebaseAnalyticsIntegration: @unchecked Sendable {
    private let binding: ConsentStateBinding<FirebaseAnalyticsConsent>

    /// - Parameters:
    ///   - core: The app's installed native engine.
    ///   - setConsent: Maps all four consent values into Firebase's consent API.
    ///   - setCollectionEnabled: Calls Firebase's collection-enable API.
    public init(
        core: ConsentCore,
        setConsent: @escaping @Sendable (FirebaseAnalyticsConsent) -> Void,
        setCollectionEnabled: @escaping @Sendable (Bool) -> Void
    ) {
        binding = ConsentStateBinding(
            core: core,
            categories: [.measurement, .marketing],
            read: { FirebaseAnalyticsConsent(GoogleConsentMode.consent($0)) }
        ) { _, _, current in
            // Consent is read when sent, so a call that returns late sends current state.
            setCollectionEnabled(false)
            setConsent(current())
            if current().analyticsStorage { setCollectionEnabled(true) }
        }
    }

    /// Stops collection, denies every Firebase consent type and unsubscribes.
    /// Safe to call repeatedly. Cancellation does not wait for an update blocked in a
    /// vendor call on another thread; that update reapplies the denial when it returns.
    public func cancel() { binding.cancel() }

    /// Reapplies current permission after app code resets Firebase's own settings.
    /// Does not record a choice. Does nothing after cancellation.
    public func sync() { binding.sync() }

    deinit { binding.cancel() }
}

/// Keeps PostHog capture in sync with one native category.
///
/// Configure PostHog with capture disabled before binding. Retain this object for
/// the SDK's lifetime. Calls run synchronously on the caller or native consent
/// notification queue. Configure feature-flag requests, replay and other PostHog
/// products separately; opt-in/out here controls the SDK's capture permission.
public final class PostHogIntegration: @unchecked Sendable {
    private let binding: ConsentStateBinding<Bool>

    /// - Parameters:
    ///   - core: The app's installed native engine.
    ///   - category: The permission controlling capture, defaulting to measurement.
    ///   - optIn: Calls the configured PostHog client's opt-in API synchronously.
    ///   - optOut: Calls the same client's opt-out API synchronously.
    public init(
        core: ConsentCore,
        category: OptionalConsentCategory = .measurement,
        optIn: @escaping @Sendable () -> Void,
        optOut: @escaping @Sendable () -> Void
    ) {
        binding = captureBinding(core: core, category: category.category, on: optIn, off: optOut)
    }

    /// Opts out and unsubscribes. Safe to call repeatedly.
    public func cancel() { binding.cancel() }

    /// Reapplies current permission after app code resets PostHog's own settings.
    /// Does not record a choice. Does nothing after cancellation.
    public func sync() { binding.sync() }

    deinit { binding.cancel() }
}

/// Submits Mixpanel tracking permission changes in native consent order.
///
/// Initialize the same Mixpanel instance with `optOutTrackingByDefault: true`
/// before binding, and retain this helper for the analytics lifetime. Mixpanel
/// applies its public opt-in/out commands on an internal queue. These callbacks
/// must submit commands directly, without another asynchronous dispatch. Returning
/// from this helper means the commands were submitted, not that Mixpanel finished
/// them or that an in-flight request was cancelled.
///
/// Unchanged consent does not resubmit commands. Mixpanel emits `$opt_in` when
/// `optInTracking` runs, including initial binding to a grant and explicit `sync()`.
/// Its opt-out also clears local identity. Feature flags and replay need separate
/// configuration; this helper does not provide IAB or ATT authorization.
public final class MixpanelIntegration: @unchecked Sendable {
    private let binding: ConsentStateBinding<Bool>

    /// - Parameters:
    ///   - core: The app's installed native engine.
    ///   - category: The permission controlling tracking, defaulting to measurement.
    ///   - optInTracking: Submits the configured Mixpanel instance's opt-in command.
    ///   - optOutTracking: Submits the same instance's opt-out command.
    public init(
        core: ConsentCore,
        category: OptionalConsentCategory = .measurement,
        optInTracking: @escaping @Sendable () -> Void,
        optOutTracking: @escaping @Sendable () -> Void
    ) {
        binding = captureBinding(core: core, category: category.category, on: optInTracking, off: optOutTracking)
    }

    /// Submits opt-out and unsubscribes. Safe to call repeatedly.
    /// Mixpanel's internal work can continue after this method returns.
    public func cancel() { binding.cancel() }

    /// Resubmits current permission after a completed vendor reset.
    /// A grant emits Mixpanel's opt-in event. Does nothing after cancellation.
    public func sync() { binding.sync() }

    deinit { binding.cancel() }
}

/// Controls Sentry Session Replay without changing the app's diagnostics policy.
///
/// Configure both replay sample rates to zero before starting Sentry. Retain this
/// helper for the replay lifetime and call the public replay start/stop methods
/// directly in its callbacks. Manual start bypasses Sentry's replay sample rates.
/// Sentry applies these commands asynchronously in call order; helper completion
/// means command submission, not completion of capture or delivery.
///
/// Stop prevents new recording once Sentry applies it, but can finalize a segment
/// captured before the stop. Existing uploads and recovery data can still deliver.
/// This helper does not call flush, delete recordings, configure masking, or gate
/// errors, tracing, profiling, screenshots and other Sentry products.
public final class SentryReplayIntegration: @unchecked Sendable {
    private let binding: ConsentStateBinding<Bool>

    /// - Parameters:
    ///   - core: The app's installed native engine.
    ///   - category: The permission controlling replay, defaulting to measurement.
    ///   - start: Submits `SentrySDK.replay.start()` using Sentry Cocoa 9.27 or later.
    ///   - stop: Submits `SentrySDK.replay.stop()` from the same configured SDK.
    public init(
        core: ConsentCore,
        category: OptionalConsentCategory = .measurement,
        start: @escaping @Sendable () -> Void,
        stop: @escaping @Sendable () -> Void
    ) {
        binding = captureBinding(core: core, category: category.category, on: start, off: stop)
    }

    /// Submits replay stop and unsubscribes. Safe to call repeatedly.
    /// Sentry's internal work can continue after this method returns.
    public func cancel() { binding.cancel() }

    /// Reapplies permission after Sentry configuration or replay reset.
    /// Does not record a choice. Does nothing after cancellation.
    public func sync() { binding.sync() }

    deinit { binding.cancel() }
}

/// Watches `categories` and applies vendor state whenever it changes.
///
/// `read` derives the vendor's state from category decisions, through a reader that
/// denies everything once cancelled. `apply` receives the state it last applied, the
/// state to apply and a way to read current state again. The last state is `nil` on
/// the first call and after `sync()` or `cancel()`, so a vendor whose start call must
/// run once per grant can tell a new grant from an unrelated change.
///
/// One update holds the turn at a time, on the thread that publishes it, and vendor
/// calls run outside the lock. A withdrawal never waits for them: when a category the
/// update holding the turn grants is withdrawn on another thread, that thread takes
/// the turn and applies the withdrawal at once, even while the overtaken update is
/// blocked inside a vendor call. Other changes, including a regrant, are picked up by
/// whichever update holds the turn when its call returns, so they apply after the
/// withdrawal. An overtaken update records nothing when it returns; it asks for
/// current state to be reapplied, so a grant that completes late cannot leave the
/// vendor enabled.
final class ConsentStateBinding<State: Equatable>: @unchecked Sendable {
    private let core: ConsentCore
    private let read: ((ConsentCategory) -> Bool) -> State
    private let apply: (_ previous: State?, _ state: State, _ current: () -> State) -> Void
    private let lock = NSLock()
    private var subscriptions: [ConsentSubscription] = []
    private var active = true
    private var lastApplied: State?
    private var applier: Thread?
    private var target: State?
    private var targetGranted: Set<ConsentCategory> = []

    init(
        core: ConsentCore,
        categories: [ConsentCategory],
        read: @escaping ((ConsentCategory) -> Bool) -> State,
        apply: @escaping (_ previous: State?, _ state: State, _ current: () -> State) -> Void
    ) {
        self.core = core
        self.read = read
        self.apply = apply
        for category in categories {
            let subscription = core.gate(category) { [weak self] (_: ConsentDecision) in
                self?.refresh()
            }
            lock.lock()
            subscriptions.append(subscription)
            lock.unlock()
        }
    }

    func cancel() {
        lock.lock()
        guard active else { lock.unlock(); return }
        active = false
        let previous = subscriptions
        subscriptions = []
        lastApplied = nil
        lock.unlock()
        refresh()
        for subscription in previous { subscription.cancel() }
    }

    func sync() {
        lock.lock()
        guard active else { lock.unlock(); return }
        lastApplied = nil
        lock.unlock()
        refresh()
    }

    /// Current state and the categories it grants. Call with `lock` held.
    private func readLocked() -> (state: State, granted: Set<ConsentCategory>) {
        var granted = Set<ConsentCategory>()
        let state = read { category in
            let allowed = active && core.decision(for: category) == .granted
            if allowed { granted.insert(category) }
            return allowed
        }
        return (state, granted)
    }

    /// Current state. What the update holding the turn reads, it may enable, so its
    /// categories join the turn's granted set even before the publication that
    /// granted them reaches this binding.
    private var current: State {
        lock.lock()
        defer { lock.unlock() }
        let (state, granted) = readLocked()
        if applier === Thread.current { targetGranted.formUnion(granted) }
        return state
    }

    private func refresh() {
        let me = Thread.current
        while true {
            lock.lock()
            let (next, granted) = readLocked()
            let previous: State?
            if let running = applier {
                // Reentrant, or nothing the update holding the turn may have enabled
                // was withdrawn: it picks this change up when its vendor call returns.
                // It reads current state before each enabling call, so it may enable
                // anything granted while it holds the turn.
                if running === me || granted.isSuperset(of: targetGranted) {
                    targetGranted.formUnion(granted)
                    lock.unlock()
                    return
                }
                // A withdrawal takes the turn at once.
                previous = target
            } else {
                guard lastApplied != next else {
                    lock.unlock()
                    return
                }
                previous = lastApplied
            }
            lastApplied = next
            target = next
            targetGranted = granted
            applier = me
            lock.unlock()
            apply(previous, next) { current }
            lock.lock()
            let again: Bool
            if applier === me {
                applier = nil
                // Pick up changes made while the call ran.
                again = true
            } else {
                // A withdrawal overtook this update while its call ran, so its result
                // is stale. Reapply current state once the turn is free.
                lastApplied = nil
                again = applier == nil
            }
            lock.unlock()
            if !again { return }
        }
    }
}

/// Binds one optional category to a vendor's on/off calls. `apply` receives whether
/// the category was granted and a way to check that it still is.
func categoryBinding(
    core: ConsentCore,
    category: ConsentCategory,
    apply: @escaping @Sendable (_ allowed: Bool, _ stillAllowed: () -> Bool) -> Void
) -> ConsentStateBinding<Bool> {
    ConsentStateBinding(core: core, categories: [category], read: { $0(category) }) { _, allowed, current in
        apply(allowed, current)
    }
}

/// Binds one optional category to an on/off call: `on` only while it is granted.
func captureBinding(
    core: ConsentCore,
    category: ConsentCategory,
    on: @escaping @Sendable () -> Void,
    off: @escaping @Sendable () -> Void
) -> ConsentStateBinding<Bool> {
    categoryBinding(core: core, category: category) { allowed, stillAllowed in
        if allowed && stillAllowed() { on() } else { off() }
    }
}
