// Left out of a build with `c15t.nativeUI` false; see C15tReactNative.podspec.
#if !C15T_NO_NATIVE_UI
#if canImport(C15tCore)
import C15tCore
#endif
#if canImport(C15tConsentUI)
import C15tConsentUI
#endif
import Combine
import SwiftUI
import UIKit

/// One native host per RN runtime. The engine outlives this adapter.
@MainActor
final class C15tConsentHost {
    private var presenter: ConsentPresenter?
    private var overlay: ConsentPassthroughView?
    private var controller: UIHostingController<AnyView>?
    private var sessionID: String?
    private var outcome: ((ConsentHostOutcome) -> Void)?
    /// The open session shows standing settings rather than the owed prompt.
    private var sessionPreferences = false
    private var watch: AnyCancellable?
    /// Reports the decided outcome once the cover has animated away. Set while it is leaving.
    private var finishing: (() -> Void)?

    /// Whether anything of the open session is on screen or still saving.
    private var showing: Bool {
        guard let presenter else { return false }
        return presenter.presentationID != nil || presenter.noticeVisible || presenter.pending
    }

    func present(
        preferences: Bool,
        privacyPolicyURL: String,
        outcome: @escaping (ConsentHostOutcome) -> Void
    ) throws -> ConsentHostSession {
        guard let url = URL(string: privacyPolicyURL), url.scheme == "https", url.host != nil else {
            throw HostError.invalidPrivacyPolicy
        }
        // A session whose outcome is decided is only animating away: report it now and open anew.
        finishing?()
        // A repeated prompt request re-asks the open session, so a notice cleared and owed again shows.
        if sessionID != nil, !preferences { presenter?.presentPrompt() }
        if let sessionID = current() {
            return .alreadyPresented(sessionID: sessionID, presentation: sessionPreferences ? .preferences : .prompt)
        }
        guard let core = C15t.current else { throw HostError.noCore }
        let snapshot = core.snapshot()
        if !preferences && (snapshot.policyPending || snapshot.promptRequirement.kind == .none) {
            return .notRequired
        }
        guard let root = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene })
            .filter({ $0.activationState == .foregroundActive })
            .flatMap(\.windows).first(where: \.isKeyWindow)?.rootViewController else { throw HostError.noHost }
        var parent = root
        while let presented = parent.presentedViewController { parent = presented }
        let presenter = ConsentPresenter(core: core, autoPresent: false)
        if preferences { presenter.presentPreferences() } else { presenter.presentPrompt() }
        let id = presenter.presentationID?.uuidString ?? UUID().uuidString
        self.sessionID = id
        self.presenter = presenter
        self.outcome = outcome
        self.sessionPreferences = preferences
        // A notice cleared outside this session (`dismissNotice()`, a reset) leaves it showing
        // nothing and with no decision to close it: end it, so its outcome reaches JavaScript.
        watch = presenter.objectWillChange.sink { [weak self] _ in
            Task { @MainActor [weak self] in self?.endIfShowingNothing() }
        }
        let notice = !preferences && snapshot.promptRequirement.kind == .notice
        presenter.onOutcome = { [weak self] result in
            // A decided outcome stays decided: a later read of the empty session must not replace it.
            guard let self, self.sessionID == id, self.finishing == nil else { return }
            let revision = core.snapshot().revision
            let ended: ConsentHostOutcome
            if result == .dismissed {
                ended = presenter.snapshot.policyPending
                    ? .unavailable(sessionID: id, revision: revision)
                    : .dismissed(sessionID: id, revision: revision)
            } else if notice && !presenter.preferences {
                ended = .acknowledged(sessionID: id, revision: revision)
            } else {
                ended = .committed(sessionID: id, revision: revision)
            }
            // Report once the cover has animated away, so a step that follows the prompt, such as
            // the App Tracking Transparency alert, is not asked while the cover is still leaving.
            let finish = { [weak self] in
                self?.detach()
                outcome(ended)
            }
            if presenter.covering {
                self.finishing = finish
                presenter.onCoverDismissed = finish
            } else { finish() }
        }
        presenter.onAnnouncement = { UIAccessibility.post(notification: .announcement, argument: $0) }
        let overlay = ConsentPassthroughView(frame: parent.view.bounds)
        overlay.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        let controller = UIHostingController(rootView: AnyView(Color.clear.c15tConsent(presenter: presenter, privacyPolicyURL: url, onNoticeFrameChange: { [weak overlay] in overlay?.noticeFrame = $0 })))
        controller.view.backgroundColor = .clear
        controller.view.frame = parent.view.bounds
        controller.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        parent.addChild(controller)
        overlay.addSubview(controller.view)
        parent.view.addSubview(overlay)
        self.overlay = overlay
        controller.didMove(toParent: parent)
        self.controller = controller
        return .presented(sessionID: id, presentation: preferences ? .preferences : .prompt)
    }

    /// The open session, derived from what is on screen: a held session that shows nothing (its
    /// notice was cleared by `dismissNotice()` or a reset, with no decision to close it) is ended
    /// here with a dismissed outcome, so no request is answered with a session that is not visible.
    private func current() -> String? {
        // Closing: nothing of it is the person's to act on any more.
        if finishing != nil { return nil }
        if sessionID != nil, !showing { presenter?.onOutcome?(.dismissed) }
        return sessionID
    }

    private func endIfShowingNothing() { _ = current() }

    func close(sessionID: String) {
        guard current() == sessionID, let presenter, !presenter.pending else { return }
        presenter.requestClose()
    }

    func detach() {
        finishing = nil
        watch = nil
        outcome = nil
        sessionID = nil
        presenter?.onOutcome = nil
        presenter?.onCoverDismissed = nil
        controller?.willMove(toParent: nil)
        controller?.view.removeFromSuperview()
        controller?.removeFromParent()
        controller = nil
        overlay?.removeFromSuperview()
        overlay = nil
        presenter = nil
    }

    enum HostError: Error { case invalidPrivacyPolicy, noCore, noHost }
}

/// The notice accepts touches only inside its measured native bounds.
@MainActor
private final class ConsentPassthroughView: UIView {
    var noticeFrame = CGRect.zero
    override func point(inside point: CGPoint, with event: UIEvent?) -> Bool {
        noticeFrame.contains(convert(point, to: nil))
    }
}
#endif
