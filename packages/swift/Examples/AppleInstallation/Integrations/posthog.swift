// #region docs:swift-posthog-binding title="PostHogOwner.swift"
import InthApple
import InthCore

final class PostHogOwner {
    private let consent: PostHogIntegration

    init(
        core: ConsentCore,
        optIn: @escaping @Sendable () -> Void,
        optOut: @escaping @Sendable () -> Void
    ) {
        consent = PostHogIntegration(core: core, optIn: optIn, optOut: optOut)
    }

    func stop() { consent.cancel() }
    func syncAfterReset() { consent.sync() }
}
// #endregion docs:swift-posthog-binding
