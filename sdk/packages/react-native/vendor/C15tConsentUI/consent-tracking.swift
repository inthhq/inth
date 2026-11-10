#if canImport(C15tApple)
import C15tApple
#endif
#if canImport(C15tCore)
import C15tCore
#endif
import Foundation

/// When the stock consent UI asks for App Tracking Transparency.
///
/// Sequencing runs only when the app can show Apple's alert, which means `Info.plist` carries
/// `NSUserTrackingUsageDescription`, and only while Apple's answer is still not determined.
/// Apple's answer never changes stored consent, and stored consent never stands in for it.
public enum ConsentTrackingRequest: String, Sendable, CaseIterable {
    /// The consent prompt first, then Apple's alert once the prompt has fully closed, and only
    /// while marketing is granted. Also asks at launch when a stored choice grants marketing
    /// and Apple was never asked. The default.
    case afterConsent
    /// Apple's alert first, then the consent prompt, whether it opens by itself or from
    /// ``ConsentPrompt/presentPrompt()``. Settings the person opens are not delayed, and nothing
    /// is asked once a stored choice refuses marketing.
    case beforeConsent
    /// Nothing automatic. Call `C15tApple.tracking.request(_:)` yourself.
    case manual
}

/// Where in the prompt flow a tracking request would run.
enum ConsentTrackingStage: Equatable, Sendable {
    /// At launch, before the consent prompt may present.
    case beforePrompt
    /// After a prompt or settings session closed, or at launch when no prompt is owed.
    case afterPrompt
}

extension ConsentTrackingRequest {
    /// Whether to show Apple's alert at `stage`. Pure, so every branch is testable on a Mac.
    /// - Parameters:
    ///   - stage: Where the flow is.
    ///   - platform: Apple's current answer, `nil` where there is no App Tracking Transparency.
    ///   - promptStringPresent: Whether `Info.plist` carries `NSUserTrackingUsageDescription`.
    ///   - marketing: The marketing decision from the current snapshot.
    ///   - marketingRefused: The person's stored choice refuses marketing. Apple asks apps not to
    ///     show its alert to people who opted out in a separate control, so no order asks then.
    func shouldAsk(at stage: ConsentTrackingStage, platform: C15tTrackingPlatformStatus?,
                   promptStringPresent: Bool, marketing: ConsentDecision, marketingRefused: Bool) -> Bool {
        guard promptStringPresent, platform == .notDetermined, !marketingRefused else { return false }
        switch (self, stage) {
        case (.beforeConsent, .beforePrompt): return true
        case (.afterConsent, .afterPrompt): return marketing == .granted
        default: return false
        }
    }
}
