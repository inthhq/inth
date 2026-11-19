// Left out of a build with `inth.nativeUI` false; see InthReactNative.podspec.
#if !INTH_NO_NATIVE_UI
#if canImport(InthCore)
import InthCore
#endif
#if canImport(InthConsentUI)
import InthConsentUI
#endif
#if canImport(InthReactNativeBridge)
import InthReactNativeBridge
#endif
import SwiftUI
import UIKit

/// One native host per RN runtime. The engine outlives this adapter.
///
/// The native `ConsentPrompt` decides when a prompt is owed and opens it, through
/// `ConsentHostDriver`, as it does for a SwiftUI app. This adapter only draws: it lays the
/// prompt over the key window of the foreground scene, and maps what the driver reports onto the
/// bridge's types.
@MainActor
final class InthConsentHost {
    enum HostError: Error { case invalidPrivacyPolicy, noCore, noHost }

    private let driver: ConsentHostDriver
    private var activation: NSObjectProtocol?

    /// Every event JavaScript hears from the presenter: the name and its JSON body.
    var emit: ((_ event: String, _ payload: String) -> Void)? {
        didSet { wire() }
    }

    init() {
        driver = ConsentHostDriver(canvas: Canvas())
        // A scene that becomes active can take what could not be shown before.
        activation = NotificationCenter.default.addObserver(
            forName: UIScene.didActivateNotification, object: nil, queue: .main
        ) { [weak self] _ in
            Task { @MainActor [weak self] in self?.driver.retry() }
        }
    }

    private func wire() {
        driver.onPresented = { [weak self] id, shows, automatic in
            self?.emit?(InthPayload.eventPresenterPresented, InthPayload.consentHostPresented(
                sessionID: id, presentation: Self.presentation(shows), automatic: automatic))
        }
        driver.onUnavailable = { [weak self] message in
            self?.emit?(InthPayload.eventPresenterUnavailable, InthPayload.presenterUnavailable(
                code: "INTH_PRESENTER_UNAVAILABLE", message: message))
        }
        driver.onOutcome = { [weak self] id, ending, revision in
            let outcome: ConsentHostOutcome
            switch ending {
            case .committed: outcome = .committed(sessionID: id, revision: revision)
            case .acknowledged: outcome = .acknowledged(sessionID: id, revision: revision)
            case .dismissed: outcome = .dismissed(sessionID: id, revision: revision)
            case .unavailable: outcome = .unavailable(sessionID: id, revision: revision)
            }
            self?.emit?(InthPayload.eventPresenterOutcome, InthPayload.consentHostOutcome(outcome))
        }
    }

    private static func presentation(_ shows: ConsentHostDriver.Shows) -> ConsentHostPresentation {
        shows == .preferences ? .preferences : .prompt
    }

    /// Hand the prompt the provider's settings. The prompt decides when one is owed.
    func configure(autoPresent: Bool, privacyPolicyURL: String?) throws {
        guard let core = Inth.current else { throw HostError.noCore }
        do {
            try driver.configure(core: core, autoPresent: autoPresent, privacyPolicyURL: privacyPolicyURL)
        } catch ConsentHostDriver.Refusal.invalidPrivacyPolicy {
            throw HostError.invalidPrivacyPolicy
        }
    }

    /// Open a prompt or settings the app asked for.
    func present(preferences: Bool, privacyPolicyURL: String) throws -> ConsentHostSession {
        guard let core = Inth.current else { throw HostError.noCore }
        let answer: ConsentHostDriver.Answer
        do {
            answer = try driver.present(core: core, preferences: preferences, privacyPolicyURL: privacyPolicyURL)
        } catch ConsentHostDriver.Refusal.invalidPrivacyPolicy {
            throw HostError.invalidPrivacyPolicy
        } catch {
            throw HostError.noHost
        }
        switch answer {
        case let .presented(id, shows): return .presented(sessionID: id, presentation: Self.presentation(shows))
        case let .alreadyPresented(id, shows): return .alreadyPresented(sessionID: id, presentation: Self.presentation(shows))
        case .notRequired: return .notRequired
        }
    }

    func close(sessionID: String) { driver.close(sessionID: sessionID) }

    /// After `Inth` installed a new core, move the prompt to it.
    func follow(_ core: ConsentCore) { driver.follow(core) }

    func detach() {
        driver.detach()
        emit = nil
        if let activation { NotificationCenter.default.removeObserver(activation) }
        activation = nil
    }

    /// Lays the prompt over the topmost view controller of the foreground scene's key window.
    private final class Canvas: ConsentHostCanvas {
        private var overlay: ConsentPassthroughView?
        private var controller: UIHostingController<AnyView>?
        private weak var presenter: ConsentPresenter?

        func show(_ presenter: ConsentPresenter, privacyPolicyURL: URL) throws {
            // Still in a window, and nothing of the app's is above it, or its own cover is up: keep
            // it, so a cover it presented is not torn down.
            if let overlay, overlay.window != nil, self.presenter === presenter,
               presenter.covering || controller?.parent?.presentedViewController == nil { return }
            guard let root = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene })
                .filter({ $0.activationState == .foregroundActive })
                .flatMap(\.windows).first(where: \.isKeyWindow)?.rootViewController else { throw HostError.noHost }
            hide()
            var parent = root
            while let presented = parent.presentedViewController { parent = presented }
            let overlay = ConsentPassthroughView(frame: parent.view.bounds)
            overlay.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            presenter.onAnnouncement = { UIAccessibility.post(notification: .announcement, argument: $0) }
            let controller = UIHostingController(rootView: AnyView(Color.clear.inthConsent(
                presenter: presenter, privacyPolicyURL: privacyPolicyURL,
                onNoticeFrameChange: { [weak overlay] in overlay?.noticeFrame = $0 })))
            controller.view.backgroundColor = .clear
            controller.view.frame = parent.view.bounds
            controller.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            parent.addChild(controller)
            overlay.addSubview(controller.view)
            parent.view.addSubview(overlay)
            controller.didMove(toParent: parent)
            self.overlay = overlay
            self.controller = controller
            self.presenter = presenter
        }

        func hide() {
            controller?.willMove(toParent: nil)
            controller?.view.removeFromSuperview()
            controller?.removeFromParent()
            controller = nil
            overlay?.removeFromSuperview()
            overlay = nil
            presenter = nil
        }
    }
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
