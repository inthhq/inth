// #region docs:swift-firebase-analytics-binding title="FirebaseAnalyticsOwner.swift"
import InthApple
import InthCore

final class FirebaseAnalyticsOwner {
    private let consent: FirebaseAnalyticsIntegration

    init(
        core: ConsentCore,
        setConsent: @escaping @Sendable (FirebaseAnalyticsConsent) -> Void,
        setCollectionEnabled: @escaping @Sendable (Bool) -> Void
    ) {
        consent = FirebaseAnalyticsIntegration(
            core: core,
            setConsent: setConsent,
            setCollectionEnabled: setCollectionEnabled
        )
    }

    func stop() { consent.cancel() }
    func syncAfterReset() { consent.sync() }
}
// #endregion docs:swift-firebase-analytics-binding
