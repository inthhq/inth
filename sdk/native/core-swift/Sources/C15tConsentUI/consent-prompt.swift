#if canImport(C15tApple)
import C15tApple
#endif
#if canImport(C15tCore)
import C15tCore
#endif
import Combine
import Foundation
#if canImport(UIKit)
import UIKit
#endif
#if canImport(SwiftUI) && canImport(UIKit)
import SwiftUI
#endif

/// The app's consent prompt for one core, shared by every scene that shows it.
///
/// The `c15tConsent` modifiers and ``ConsentRootViewController`` attach a scene to it. However
/// many scenes attach, the prompt has one ``presenter``, so it opens at most once at a time,
/// keeps its draft when a scene disconnects and reconnects, and is not shown again for a prompt
/// the person already answered or dismissed. Only one attached scene draws it: the one that
/// attached first, or an active scene when the one drawing it leaves the foreground.
@MainActor
public final class ConsentPrompt: ObservableObject {
    /// The core this prompt follows.
    public let core: ConsentCore
    /// The presenter behind the prompt. Auto-present stays off until a scene attaches.
    public let presenter: ConsentPresenter
    /// Called each time a prompt or settings session closes, with how it ended. A step that has
    /// to follow the consent prompt, such as a platform permission request, starts here.
    public var onFinished: ((ConsentPresenterOutcome) -> Void)?

    @Published private(set) var host: UUID?
    @Published private(set) var hostActive = false

    private static var prompts: [ObjectIdentifier: ConsentPrompt] = [:]

    private init(core: ConsentCore) {
        self.core = core
        self.presenter = ConsentPresenter(core: core, autoPresent: false)
        presenter.onOutcome = { [weak self] outcome in self?.onFinished?(outcome) }
    }

    /// The prompt for `core`. Every call with the same core returns the same instance.
    public static func shared(for core: ConsentCore) -> ConsentPrompt {
        if let prompt = prompts[ObjectIdentifier(core)], prompt.core === core { return prompt }
        let prompt = ConsentPrompt(core: core)
        prompts[ObjectIdentifier(core)] = prompt
        return prompt
    }

    /// The prompt for the installed core, or `nil` before the app installs one.
    public static var current: ConsentPrompt? {
        guard let core = C15t.current else { return nil }
        return shared(for: core)
    }

    /// Open an owed prompt now. Does nothing while a prompt or settings session is open.
    public func presentPrompt() { presenter.presentPrompt() }

    /// Open privacy settings, also when no prompt is owed. Does nothing while a session is open.
    public func presentPreferences() { presenter.presentPreferences() }

    /// Let the scene behind `id` draw the prompt if nobody draws it, or if the scene drawing it
    /// left the foreground and this one is active.
    func attach(_ id: UUID, active: Bool, autoPresent: Bool) {
        guard host == nil || host == id || active && !hostActive else { return }
        if host != id { host = id }
        if hostActive != active { hostActive = active }
        if presenter.autoPresent != autoPresent { presenter.autoPresent = autoPresent }
    }

    /// The scene behind `id` went away. Another attached scene takes over.
    func detach(_ id: UUID) {
        guard host == id else { return }
        host = nil
        hostActive = false
    }
}

#if canImport(SwiftUI) && canImport(UIKit)
public extension View {
    /// Install c15t and add the stock consent prompt and settings to a SwiftUI root, in one call.
    ///
    /// The core is installed when the view first appears, and again after the device unlocks or
    /// the app becomes active if protected storage was unavailable. Once the core is ready the
    /// prompt presents by itself, once per owed prompt, and stays quiet while a stored choice is
    /// still valid. A new policy or an expired choice prompts again. Open settings from your own
    /// control with ``ConsentPrompt/presentPreferences()`` on ``ConsentPrompt/current``.
    ///
    /// ```swift
    /// WindowGroup {
    ///     ContentView().c15tConsent(
    ///         C15tAppleConfiguration(transport: .hosted(URL(string: "https://your-project.inth.app")!)),
    ///         privacyPolicyURL: URL(string: "https://example.com/privacy")!
    ///     )
    /// }
    /// ```
    /// - Parameters:
    ///   - configuration: How to install the core. An app that installed one already keeps it.
    ///   - privacyPolicyURL: The app's required privacy policy, opened in the system browser.
    ///   - theme: Appearance. `nil` uses ``ConsentTheme/current`` with the bundle's `Info.plist` values applied.
    ///   - autoPresent: `false` shows nothing until ``ConsentPrompt/presentPrompt()`` or
    ///     ``ConsentPrompt/presentPreferences()`` is called. Your settings screen still opens
    ///     ``ConsentPrompt/presentPreferences()``.
    @MainActor
    func c15tConsent(_ configuration: C15tAppleConfiguration, privacyPolicyURL: URL, theme: ConsentTheme? = nil,
                     autoPresent: Bool = true) -> some View {
        modifier(ConsentAttachment(resolve: { try? C15tApple.install(configuration) }, privacyPolicyURL: privacyPolicyURL,
                                   theme: theme, autoPresent: autoPresent, onNoticeFrameChange: nil))
    }

    /// Add the stock consent prompt and settings for a core the app installed itself, such as an
    /// IAB core from `C15tApple.install(_: CoreConfig)`. Behaves like the configuration form and
    /// attaches once a core is installed.
    @MainActor
    func c15tConsent(privacyPolicyURL: URL, theme: ConsentTheme? = nil, autoPresent: Bool = true) -> some View {
        modifier(ConsentAttachment(resolve: { C15t.current }, privacyPolicyURL: privacyPolicyURL,
                                   theme: theme, autoPresent: autoPresent, onNoticeFrameChange: nil))
    }
}

/// The shared prompt once a core is available.
@MainActor
final class ConsentAttachmentModel: ObservableObject {
    @Published private(set) var prompt: ConsentPrompt?

    func attach(_ resolve: @MainActor () -> ConsentCore?) {
        guard prompt == nil, let core = resolve() else { return }
        prompt = ConsentPrompt.shared(for: core)
    }
}

/// Resolves the core, retrying when protected data or the app becomes available, then hosts
/// the shared prompt above `content`.
struct ConsentAttachment: ViewModifier {
    let resolve: @MainActor () -> ConsentCore?
    let privacyPolicyURL: URL
    let theme: ConsentTheme?
    let autoPresent: Bool
    let onNoticeFrameChange: ((CGRect) -> Void)?
    @StateObject private var model = ConsentAttachmentModel()

    func body(content: Content) -> some View {
        content
            .overlay {
                if let prompt = model.prompt {
                    ConsentPromptHost(prompt: prompt, privacyPolicyURL: privacyPolicyURL, theme: theme,
                                      autoPresent: autoPresent, onNoticeFrameChange: onNoticeFrameChange)
                }
            }
            .onAppear { model.attach(resolve) }
            .onReceive(NotificationCenter.default.publisher(for: UIApplication.protectedDataDidBecomeAvailableNotification)) { _ in
                model.attach(resolve)
            }
            .onReceive(NotificationCenter.default.publisher(for: UIApplication.didBecomeActiveNotification)) { _ in
                model.attach(resolve)
            }
    }
}

/// One scene's claim on the shared prompt. Draws it only while the claim holds.
private struct ConsentPromptHost: View {
    @ObservedObject var prompt: ConsentPrompt
    let privacyPolicyURL: URL
    let theme: ConsentTheme?
    let autoPresent: Bool
    let onNoticeFrameChange: ((CGRect) -> Void)?
    @State private var id = UUID()
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        Group {
            if prompt.host == id {
                Color.clear.c15tConsent(presenter: prompt.presenter, privacyPolicyURL: privacyPolicyURL, theme: theme,
                                        onNoticeFrameChange: onNoticeFrameChange)
            } else {
                Color.clear
            }
        }
        .allowsHitTesting(prompt.host == id)
        .onAppear(perform: claim)
        .onDisappear { prompt.detach(id) }
        .onChange(of: scenePhase) { _ in claim() }
        .onChange(of: prompt.host) { _ in claim() }
        .onChange(of: prompt.hostActive) { _ in claim() }
        .onChange(of: autoPresent) { _ in claim() }
    }

    private func claim() {
        prompt.attach(id, active: scenePhase == .active, autoPresent: autoPresent)
    }
}

/// The stock consent prompt and settings for a UIKit app, in one call.
///
/// Make it the window's root and hand it your own root view controller. It installs the core
/// the way the SwiftUI `c15tConsent` modifier does and keeps the prompt above your content.
/// Touches outside the notice card reach your views.
///
/// ```swift
/// window.rootViewController = ConsentRootViewController(
///     root: MainViewController(),
///     configuration: C15tAppleConfiguration(transport: .hosted(URL(string: "https://your-project.inth.app")!)),
///     privacyPolicyURL: URL(string: "https://example.com/privacy")!
/// )
/// ```
@MainActor
public final class ConsentRootViewController: UIViewController {
    /// The app's own root, shown underneath the prompt.
    public let root: UIViewController
    private let overlay: UIHostingController<AnyView>
    private let passthrough: ConsentPassthroughView

    /// - Parameters:
    ///   - root: The app's own root view controller.
    ///   - configuration: How to install the core. `nil` attaches to the core the app installed.
    ///   - privacyPolicyURL: The app's required privacy policy, opened in the system browser.
    ///   - theme: Appearance. `nil` uses ``ConsentTheme/current``.
    ///   - autoPresent: `false` shows nothing until ``ConsentPrompt/presentPrompt()`` or
    ///     ``ConsentPrompt/presentPreferences()`` is called.
    public init(root: UIViewController, configuration: C15tAppleConfiguration? = nil, privacyPolicyURL: URL,
                theme: ConsentTheme? = nil, autoPresent: Bool = true) {
        self.root = root
        let passthrough = ConsentPassthroughView()
        self.passthrough = passthrough
        let resolve: @MainActor () -> ConsentCore?
        if let configuration {
            resolve = { try? C15tApple.install(configuration) }
        } else {
            resolve = { C15t.current }
        }
        overlay = UIHostingController(rootView: AnyView(Color.clear.modifier(ConsentAttachment(
            resolve: resolve, privacyPolicyURL: privacyPolicyURL, theme: theme, autoPresent: autoPresent,
            onNoticeFrameChange: { [weak passthrough] in passthrough?.noticeFrame = $0 }))))
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    override public func viewDidLoad() {
        super.viewDidLoad()
        embed(root, in: view)
        passthrough.frame = view.bounds
        passthrough.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(passthrough)
        overlay.view.backgroundColor = .clear
        embed(overlay, in: passthrough)
    }

    override public var childForStatusBarStyle: UIViewController? { root }
    override public var childForStatusBarHidden: UIViewController? { root }
    override public var childForHomeIndicatorAutoHidden: UIViewController? { root }

    private func embed(_ child: UIViewController, in container: UIView) {
        addChild(child)
        child.view.frame = container.bounds
        child.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        container.addSubview(child.view)
        child.didMove(toParent: self)
    }
}

/// Accepts touches only inside the notice card's measured bounds, in window coordinates.
@MainActor
private final class ConsentPassthroughView: UIView {
    var noticeFrame = CGRect.zero
    override func point(inside point: CGPoint, with event: UIEvent?) -> Bool {
        noticeFrame.contains(convert(point, to: nil))
    }
}
#endif
