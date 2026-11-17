#if canImport(InthApple)
import InthApple
#endif
#if canImport(InthCore)
import InthCore
#endif
import Foundation

/// When the stock consent UI asks for App Tracking Transparency.
///
/// Sequencing runs only when the app can show Apple's alert, which means `Info.plist` carries
/// `NSUserTrackingUsageDescription`, and only while Apple's answer is still not determined
/// (or, with ``ConsentTrackingReprompt/yearly``, a year after the last answer). Apple's answer
/// never changes stored consent, and stored consent never stands in for it.
public enum ConsentTrackingRequest: String, Sendable, CaseIterable {
    /// The consent prompt first, then Apple's alert once the prompt has fully closed, and only
    /// while marketing is granted. Also asks at launch when a stored choice grants marketing
    /// and Apple was never asked. The default.
    case afterConsent
    /// Apple's alert first, then the consent prompt, whether it opens by itself or from
    /// ``ConsentPrompt/presentPrompt()``. A launch that owes no prompt asks at launch. Settings
    /// the person opens are not delayed, and nothing is asked once marketing is refused.
    case beforeConsent
    /// Nothing automatic. Call `InthApple.tracking.request(_:)` yourself.
    case manual
}

/// Whether the stock consent UI asks Apple again after the person has answered.
///
/// In the European Union Apple lets an app show its alert again one year after the previous
/// answer, either way. Apple keeps that date and offers no query for it, so the SDK calls the
/// request and Apple decides: it prompts if the person is eligible, and otherwise returns the
/// stored answer at once without showing anything. Outside the EU nothing is shown.
public enum ConsentTrackingReprompt: String, Sendable, CaseIterable {
    /// Ask only while Apple's answer is not determined. The default.
    case never
    /// Also call the request once per launch when the answer is `authorized` or `denied`,
    /// marketing is granted, and a year has passed since the SDK last saw an answer.
    case yearly
}

/// Where in the prompt flow a tracking request would run.
enum ConsentTrackingStage: Equatable, Sendable {
    /// At launch, before the consent prompt may present.
    case beforePrompt
    /// After a prompt or settings session closed, or at launch when no prompt is owed.
    case afterPrompt
}

/// Everything the tracking rule reads, gathered at the moment it decides.
struct ConsentTrackingInputs: Equatable, Sendable {
    /// Apple's current answer, `nil` where there is no App Tracking Transparency.
    var platform: InthTrackingPlatformStatus?
    /// `Info.plist` carries `NSUserTrackingUsageDescription`.
    var promptStringPresent: Bool
    /// The marketing decision. Under an IAB TCF policy it is `granted` only while the TC
    /// String also grants `marketing` (see `InthTrackingConsent`).
    var marketing: ConsentDecision
    /// A stored choice refuses marketing, or a stored TC String does not consent to its
    /// purposes. Apple asks apps not to show its alert to people who opted out.
    var marketingRefused: Bool
    /// ``ConsentTrackingReprompt/yearly`` is on, a year has passed since the SDK last saw an
    /// answer, and this launch has not called the request for it yet.
    var repromptDue = false
}

/// The year the yearly re-ask waits, as Apple counts it for the EU: 365 days.
let consentTrackingRepromptInterval: TimeInterval = 365 * 24 * 60 * 60

extension ConsentTrackingRequest {
    /// Whether to call Apple's request at `stage`. Pure, so every branch is testable on a Mac.
    func shouldAsk(at stage: ConsentTrackingStage, _ inputs: ConsentTrackingInputs) -> Bool {
        guard self != .manual, inputs.promptStringPresent, !inputs.marketingRefused else { return false }
        switch inputs.platform {
        case .notDetermined:
            switch (self, stage) {
            case (.beforeConsent, .beforePrompt): return true
            case (.afterConsent, .afterPrompt): return inputs.marketing == .granted
            default: return false
            }
        case .authorized, .denied:
            // Apple decides whether the person is eligible again; outside the EU nothing shows.
            return inputs.repromptDue && inputs.marketing == .granted
        default:
            return false
        }
    }

    /// The rule as it stood before ``ConsentTrackingInputs``, for the rule table.
    func shouldAsk(at stage: ConsentTrackingStage, platform: InthTrackingPlatformStatus?,
                   promptStringPresent: Bool, marketing: ConsentDecision, marketingRefused: Bool) -> Bool {
        shouldAsk(at: stage, ConsentTrackingInputs(platform: platform, promptStringPresent: promptStringPresent,
                                                   marketing: marketing, marketingRefused: marketingRefused))
    }
}

extension ConsentTrackingReprompt {
    /// Whether a year has passed since `lastAnswer`. `nil` (no answer on file) is never due.
    func isDue(lastAnswer: Date?, now: Date) -> Bool {
        guard self == .yearly, let lastAnswer else { return false }
        return now.timeIntervalSince(lastAnswer) >= consentTrackingRepromptInterval
    }
}
