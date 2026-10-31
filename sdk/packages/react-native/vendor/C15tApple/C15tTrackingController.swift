import Foundation

/// A platform failure. Neither arm changes consent.
public enum C15tTrackingError: Error, Equatable, Sendable {
    case notConfigured
    case unsupported
}

/// Optional ATT orchestration shared by native hosts and RN. It never mutates consent.
public struct C15tTrackingController: Sendable {
    public let trackingPlatformStatus: @Sendable () -> C15tTrackingPlatformStatus?

    /// Whether this binary carries a prompt string.
    public let trackingPromptStringPresent: @Sendable () -> Bool

    /// Shows Apple's dialog. Reached only when ``C15tTrackingGate`` chose `.standard`.
    public let trackingPrompt: @Sendable (@escaping (C15tTrackingPlatformStatus?) -> Void) -> Void

    /// Whether this runtime answers Apple's expanded European Union request.
    ///
    /// Injectable because the answer is a property of the running system and no test
    /// machine can have both halves of it. The two branches it selects are the two paths
    /// this package supports, so a test that drives both is driving the real decision and
    /// not a copy of it.
    public let trackingExpandedInterfaceAvailable: @Sendable () -> Bool

    /// Shows Apple's expanded request. Reached only when ``C15tTrackingGate`` chose
    /// `.expanded`.
    ///
    /// Answers `false` when the call could not be made after all, which sends the request
    /// down ``trackingPrompt`` instead. Returning that boolean rather than assuming the
    /// capability probe is still true a moment later is what keeps a lazily linked App
    /// Tracking Transparency from turning into a tracking request that never resolves: the
    /// caller is told, in the same breath, that nothing was asked.
    public let trackingExpandedPrompt: @Sendable (
        _ preferExpandedInterface: Bool,
        _ additionalInformationSelected: @escaping () -> Void,
        _ completion: @escaping (C15tTrackingPlatformStatus?) -> Void
    ) -> Bool

    public let trackingWaiters = C15tTrackingWaiters()

    public init(
        trackingPlatformStatus: @escaping @Sendable () -> C15tTrackingPlatformStatus? = { C15tTracking.platformStatus() },
        trackingPromptStringPresent: @escaping @Sendable () -> Bool = { C15tTracking.promptStringPresent() },
        trackingPrompt: @escaping @Sendable (@escaping (C15tTrackingPlatformStatus?) -> Void) -> Void = { completion in C15tTracking.requestPrompt(completion: completion) },
        trackingExpandedInterfaceAvailable: @escaping @Sendable () -> Bool = { C15tTracking.expandedInterfaceAvailable() },
        trackingExpandedPrompt: @escaping @Sendable (
            _ preferExpandedInterface: Bool,
            _ additionalInformationSelected: @escaping () -> Void,
            _ completion: @escaping (C15tTrackingPlatformStatus?) -> Void
        ) -> Bool = { preferExpanded, additionalInformationSelected, completion in
            C15tTracking.requestExpandedPrompt(
                preferExpandedInterface: preferExpanded,
                additionalInformationSelected: additionalInformationSelected,
                completion: completion
            )
        }
    ) {
        self.trackingPlatformStatus = trackingPlatformStatus
        self.trackingPromptStringPresent = trackingPromptStringPresent
        self.trackingPrompt = trackingPrompt
        self.trackingExpandedInterfaceAvailable = trackingExpandedInterfaceAvailable
        self.trackingExpandedPrompt = trackingExpandedPrompt
    }

    /// Ask Apple explicitly, coalescing simultaneous requests into one prompt.
    public func request(_ completion: @escaping (Result<C15tTrackingRequestResult, C15tTrackingError>) -> Void) {
        switch C15tTrackingGate.request(
            platform: trackingPlatformStatus(),
            promptStringPresent: trackingPromptStringPresent(),
            expandedInterfaceAvailable: trackingExpandedInterfaceAvailable()
        ) {
        case let .answered(status):
            // Nothing was asked, so nothing is reported about a call: `restricted` is a
            // device policy that has already answered, and an arm this request never
            // requested a sheet for should not carry one.
            completion(
                .success(
                    C15tTrackingRequestResult(
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
            askApple(presentation: presentation)
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
    private func askApple(presentation: C15tTrackingPresentation) {
        let additionalInformationSelected = C15tTrackingFlag()

        // The call that ran arrives as an argument rather than being read off the gate's
        // choice, because the two can differ: an expanded request that the runtime declined
        // mid-flight finishes through the plain call, and a payload that still said
        // `expanded` would describe an attempt rather than what happened. The distinction is
        // the only thing a host has for telling "Apple had the expanded sheet and chose not
        // to use it" apart from "this binary never asked for it".
        let deliver: (C15tTrackingPresentation, C15tTrackingPlatformStatus?) -> Void = { [trackingWaiters] ran, answered in
            let result = C15tTrackingGate.requestResult(
                platform: answered,
                presentation: ran,
                additionalInformationSelected: additionalInformationSelected.isSet
            )
            // ATT was there when the gate checked and has nothing to report now. That is not
            // an answer, and `unsupported` would read as permission, so it is a failure.
            trackingWaiters.deliver(
                result.map { Result<C15tTrackingRequestResult, C15tTrackingError>.success($0) }
                    ?? .failure(.unsupported)
            )
        }

        if presentation == .expanded,
           trackingExpandedPrompt(
               true,
               { additionalInformationSelected.set() },
               { deliver(.expanded, $0) }
           ) {
            return
        }

        trackingPrompt { deliver(.standard, $0) }
    }

}
