// #region docs:swift-sentry-replay-binding title="SentryReplayOwner.swift"
import InthApple
import InthCore

final class SentryReplayOwner {
    private let consent: SentryReplayIntegration

    init(
        core: ConsentCore,
        start: @escaping @Sendable () -> Void,
        stop: @escaping @Sendable () -> Void
    ) {
        consent = SentryReplayIntegration(core: core, start: start, stop: stop)
    }

    func stop() { consent.cancel() }
    func syncAfterReset() { consent.sync() }
}
// #endregion docs:swift-sentry-replay-binding
