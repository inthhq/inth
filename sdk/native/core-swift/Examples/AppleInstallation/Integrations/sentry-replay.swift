// #region docs:swift-sentry-replay-binding title="SentryReplayOwner.swift"
import C15tApple
import C15tCore

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
