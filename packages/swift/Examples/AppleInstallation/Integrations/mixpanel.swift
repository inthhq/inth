// #region docs:swift-mixpanel-binding title="MixpanelOwner.swift"
import C15tApple
import C15tCore

final class MixpanelOwner {
    private let consent: MixpanelIntegration

    init(
        core: ConsentCore,
        optInTracking: @escaping @Sendable () -> Void,
        optOutTracking: @escaping @Sendable () -> Void
    ) {
        consent = MixpanelIntegration(
            core: core,
            optInTracking: optInTracking,
            optOutTracking: optOutTracking
        )
    }

    func stop() { consent.cancel() }
    func syncAfterCompletedReset() { consent.sync() }
}
// #endregion docs:swift-mixpanel-binding
