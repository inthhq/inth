#if canImport(C15tCore)
import C15tCore
#endif
#if canImport(C15tConsentUI)
import C15tConsentUI
#endif
import SwiftUI
import UIKit

/// One native host per RN runtime. The engine outlives this adapter.
@MainActor
final class C15tConsentHost {
    private var presenter: ConsentPresenter?
    private var controller: UIHostingController<AnyView>?
    private var sessionID: String?
    private var outcome: ((String) -> Void)?

    func present(preferences: Bool, privacyPolicyURL: String, outcome: @escaping (String) -> Void) throws -> String {
        guard let url = URL(string: privacyPolicyURL), url.scheme == "https", url.host != nil else {
            throw HostError.invalidPrivacyPolicy
        }
        if let sessionID { return encode(["sessionId": sessionID, "status": "already-presented"]) }
        guard let core = C15t.current else { throw HostError.noCore }
        let snapshot = core.snapshot()
        if !preferences && (snapshot.policyPending || snapshot.promptRequirement.kind == .none) {
            return encode(["sessionId": NSNull(), "status": "not-required"])
        }
        guard let root = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene })
            .filter({ $0.activationState == .foregroundActive })
            .flatMap(\.windows).first(where: \.isKeyWindow)?.rootViewController else { throw HostError.noHost }
        var parent = root
        while let presented = parent.presentedViewController { parent = presented }
        let presenter = ConsentPresenter(core: core, automaticPresentation: false)
        if preferences { presenter.presentPreferences() } else { presenter.presentPrompt() }
        let id = presenter.presentationID?.uuidString ?? UUID().uuidString
        self.sessionID = id
        self.presenter = presenter
        self.outcome = outcome
        let notice = !preferences && snapshot.promptRequirement.kind == .notice
        presenter.onOutcome = { [weak self] result in
            guard let self, self.sessionID == id else { return }
            let kind = result == .dismissed ? (snapshot.policyPending ? "unavailable" : "dismissed") : (notice ? "acknowledged" : "committed")
            let payload = self.encode(["sessionId": id, "kind": kind, "revision": core.snapshot().revision])
            self.detach()
            outcome(payload)
        }
        presenter.onAnnouncement = { UIAccessibility.post(notification: .announcement, argument: $0) }
        let controller = UIHostingController(rootView: AnyView(Color.clear.c15tConsent(presenter: presenter, privacyPolicyURL: url)))
        controller.view.backgroundColor = .clear
        controller.view.frame = parent.view.bounds
        controller.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        parent.addChild(controller)
        parent.view.addSubview(controller.view)
        controller.didMove(toParent: parent)
        self.controller = controller
        return encode(["sessionId": id, "status": "presented"])
    }

    func close(sessionID: String) {
        guard self.sessionID == sessionID, let presenter, !presenter.pending else { return }
        if let id = presenter.presentationID { presenter.requestClose(sessionID: id) }
    }

    func detach() {
        outcome = nil
        sessionID = nil
        presenter?.onOutcome = nil
        controller?.willMove(toParent: nil)
        controller?.view.removeFromSuperview()
        controller?.removeFromParent()
        controller = nil
        presenter = nil
    }

    private func encode(_ value: [String: Any]) -> String {
        String(data: try! JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]), encoding: .utf8)!
    }
    enum HostError: Error { case invalidPrivacyPolicy, noCore, noHost }
}
