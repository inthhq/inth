import Foundation

/// A platform failure. Neither arm changes consent.
public enum InthTrackingError: Error, Equatable, Sendable {
    case notConfigured
    case unsupported
}

/// Optional ATT orchestration shared by native hosts and RN. It never mutates consent.
public struct InthTrackingController: Sendable {
    public let trackingPlatformStatus: @Sendable () -> InthTrackingPlatformStatus?

    /// Whether this binary carries a prompt string.
    public let trackingPromptStringPresent: @Sendable () -> Bool

    /// Shows Apple's dialog. Reached only when ``InthTrackingGate`` chose `.standard`.
    public let trackingPrompt: @Sendable (@escaping (InthTrackingPlatformStatus?) -> Void) -> Void

    /// Whether this runtime answers Apple's expanded European Union request.
    ///
    /// Injectable because the answer is a property of the running system and no test
    /// machine can have both halves of it. The two branches it selects are the two paths
    /// this package supports, so a test that drives both is driving the real decision and
    /// not a copy of it.
    public let trackingExpandedInterfaceAvailable: @Sendable () -> Bool

    /// Shows Apple's expanded request. Reached only when ``InthTrackingGate`` chose
    /// `.expanded`.
    ///
    /// Answers `false` when the call could not be made after all, which sends the request
    /// down ``trackingPrompt`` instead. Returning that boolean rather than assuming the
    /// capability probe is still true a moment later is what keeps a lazily linked App
    /// Tracking Transparency from turning into a tracking request that never resolves: the
    /// caller is told, in the same breath, that nothing was asked.
    ///
    /// `additionalInformationSelected` is `nil` when nothing will handle Apple's Additional
    /// Information button. Apple then shows no button.
    public let trackingExpandedPrompt: @Sendable (
        _ preferExpandedInterface: Bool,
        _ additionalInformationSelected: (() -> Void)?,
        _ completion: @escaping (InthTrackingPlatformStatus?) -> Void
    ) -> Bool

    public let trackingWaiters = InthTrackingWaiters()

    /// When this SDK last saw an `authorized` or `denied` answer. See ``InthTrackingAnswerLog``.
    public let answerLog: InthTrackingAnswerLog

    /// The clock the answer log is stamped with. Injectable so a test can move a year ahead.
    public let now: @Sendable () -> Date

    public init(
        trackingPlatformStatus: @escaping @Sendable () -> InthTrackingPlatformStatus? = { InthTracking.platformStatus() },
        trackingPromptStringPresent: @escaping @Sendable () -> Bool = { InthTracking.promptStringPresent() },
        trackingPrompt: @escaping @Sendable (@escaping (InthTrackingPlatformStatus?) -> Void) -> Void = { completion in InthTracking.requestPrompt(completion: completion) },
        trackingExpandedInterfaceAvailable: @escaping @Sendable () -> Bool = { InthTracking.expandedInterfaceAvailable() },
        trackingExpandedPrompt: @escaping @Sendable (
            _ preferExpandedInterface: Bool,
            _ additionalInformationSelected: (() -> Void)?,
            _ completion: @escaping (InthTrackingPlatformStatus?) -> Void
        ) -> Bool = { preferExpanded, additionalInformationSelected, completion in
            InthTracking.requestExpandedPrompt(
                preferExpandedInterface: preferExpanded,
                additionalInformationSelected: additionalInformationSelected,
                completion: completion
            )
        },
        answerLog: InthTrackingAnswerLog = .userDefaults(),
        now: @escaping @Sendable () -> Date = { Date() }
    ) {
        self.answerLog = answerLog
        self.now = now
        self.trackingPlatformStatus = trackingPlatformStatus
        self.trackingPromptStringPresent = trackingPromptStringPresent
        self.trackingPrompt = trackingPrompt
        self.trackingExpandedInterfaceAvailable = trackingExpandedInterfaceAvailable
        self.trackingExpandedPrompt = trackingExpandedPrompt
    }

    /// When this SDK last saw Apple answer `authorized` or `denied`, or `nil` while Apple has
    /// no such answer on file.
    ///
    /// An answer given before this log existed has no stored time. It is stamped now, so the
    /// yearly re-ask waits a full year from today rather than asking at once.
    public func lastAnswerDate() -> Date? {
        let status = trackingPlatformStatus()
        guard status == .authorized || status == .denied else { return nil }
        if let stored = answerLog.lastAnswerAt { return stored }
        let stamp = now()
        answerLog.record(stamp)
        return stamp
    }

    /// Ask Apple explicitly, coalescing simultaneous requests into one prompt.
    ///
    /// - Parameters:
    ///   - onAdditionalInformation: Runs on the main thread when the person taps Additional
    ///     Information on Apple's EU sheet, to show the app's own controls. `nil`, the default,
    ///     means nothing would handle the tap, so Apple shows no button. The request still
    ///     resolves with stage `additionalInformation` after a tap.
    ///   - completion: The outcome.
    public func request(onAdditionalInformation: (@Sendable () -> Void)? = nil,
                        _ completion: @escaping (Result<InthTrackingRequestResult, InthTrackingError>) -> Void) {
        let before = trackingPlatformStatus()
        switch InthTrackingGate.request(
            platform: before,
            promptStringPresent: trackingPromptStringPresent(),
            expandedInterfaceAvailable: trackingExpandedInterfaceAvailable()
        ) {
        case let .answered(status):
            // Nothing was asked, so nothing is reported about a call: `restricted` is a
            // device policy that has already answered, and an arm this request never
            // requested a sheet for should not carry one.
            completion(
                .success(
                    InthTrackingRequestResult(
                        status: status,
                        stage: .final,
                        presentation: nil
                    )
                )
            )
        case let .refused(refusal):
            completion(.failure(refusal == .noPromptString ? .notConfigured : .unsupported))
        case let .prompt(presentation):
            guard trackingWaiters.acquire(completion) else { return }
            askApple(presentation: presentation, before: before, onAdditionalInformation: onAdditionalInformation)
        }
    }

    /// Make the Apple call the gate chose, and answer everyone attached to this flight.
    ///
    /// The expanded request is tried first when the gate asked for it, and a refusal to make
    /// that call is not a failure: it means the runtime would not answer for the capability
    /// a moment ago, and ``trackingPrompt`` is available on every system this package
    /// supports. Falling back there is the difference between a subject who is asked
    /// slightly less richly and a request that hangs with nobody coming back.
    ///
    /// The flag, and not a captured `var`, carries the Additional Information tap because
    /// Apple runs that closure after this function has returned and on a thread it chooses.
    private func askApple(presentation: InthTrackingPresentation, before: InthTrackingPlatformStatus?,
                          onAdditionalInformation: (@Sendable () -> Void)?) {
        let additionalInformationSelected = InthTrackingFlag()

        // The call that ran arrives as an argument rather than being read off the gate's
        // choice, because the two can differ: an expanded request that the runtime declined
        // mid-flight finishes through the plain call, and a payload that still said
        // `expanded` would describe an attempt rather than what happened. The distinction is
        // the only thing a host has for telling "Apple had the expanded sheet and chose not
        // to use it" apart from "this binary never asked for it".
        let deliver: (InthTrackingPresentation, InthTrackingPlatformStatus?) -> Void = { [trackingWaiters, answerLog, now] ran, answered in
            // A final answer starts the year Apple counts before it may ask again in the EU. On a
            // re-ask (Apple had answered before) the stamp moves only when the status changed:
            // Apple returns the stored answer without showing anything until its own year is up,
            // and that silent return must not restart our year. "Shown and answered the same" is
            // indistinguishable from "not shown", so that case keeps the old stamp too; the cost
            // is one silent call per launch until the status changes.
            let reask = before == .authorized || before == .denied
            if answered == .authorized || answered == .denied, !additionalInformationSelected.isSet,
               !reask || answered != before {
                answerLog.record(now())
            }
            let result = InthTrackingGate.requestResult(
                platform: answered,
                presentation: ran,
                additionalInformationSelected: additionalInformationSelected.isSet
            )
            // ATT was there when the gate checked and has nothing to report now. That is not
            // an answer, and `unsupported` would read as permission, so it is a failure.
            trackingWaiters.deliver(
                result.map { Result<InthTrackingRequestResult, InthTrackingError>.success($0) }
                    ?? .failure(.unsupported)
            )
        }

        if presentation == .expanded,
           trackingExpandedPrompt(
               true,
               onAdditionalInformation.map { handler -> () -> Void in
                   {
                       additionalInformationSelected.set()
                       DispatchQueue.main.async { handler() }
                   }
               },
               { deliver(.expanded, $0) }
           ) {
            return
        }

        trackingPrompt { deliver(.standard, $0) }
    }

}
