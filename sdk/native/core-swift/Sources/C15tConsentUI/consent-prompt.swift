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

    private init(core: ConsentCore) {
        self.core = core
        self.presenter = ConsentPresenter(core: core, autoPresent: false)
        presenter.onOutcome = { [weak self] outcome in self?.onFinished?(outcome) }
    }

    /// The prompt for `core`. Every call with the same core returns the same instance while it
    /// lives. The installed core keeps its prompt; a core the app built without installing it keeps
    /// its prompt while a scene or the app holds it.
    public static func shared(for core: ConsentCore) -> ConsentPrompt {
        let id = ObjectIdentifier(core)
        let prompt: ConsentPrompt
        if let existing = PromptRegistry.shared.lookup(id), existing.core === core {
            prompt = existing
        } else {
            prompt = ConsentPrompt(core: core)
        }
        PromptRegistry.shared.store(prompt, id: id, installed: C15t.current === core)
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
        // A session that opened by itself for another scene is not this one's to draw if it
        // opted out.
        if host != id, !autoPresent { presenter.withdrawAutomaticSession() }
        if host != id { host = id }
        if hostActive != active { hostActive = active }
        if presenter.autoPresent != autoPresent { presenter.autoPresent = autoPresent }
    }

    /// The scene behind `id` went away. Another attached scene takes over. Until one does, nothing
    /// presents by itself, so a scene that attaches later with `autoPresent: false` finds nothing open.
    func detach(_ id: UUID) {
        guard host == id else { return }
        host = nil
        hostActive = false
        presenter.autoPresent = false
    }
}

/// Each core's prompt. A prompt points back at its core, so the registry holds prompts weakly and
/// can never keep a core alive. The installed core's prompt is also held strongly, so its session
/// and what the person dismissed survive a moment with no scene attached, until the runtime drops
/// that core. Locked, because the runtime reports a dropped core from any thread.
private final class PromptRegistry: @unchecked Sendable {
    static let shared = PromptRegistry()

    private final class WeakPrompt {
        weak var prompt: ConsentPrompt?
        init(_ prompt: ConsentPrompt) { self.prompt = prompt }
    }

    private let lock = NSLock()
    private var prompts: [ObjectIdentifier: WeakPrompt] = [:]
    private var installed: (id: ObjectIdentifier, prompt: ConsentPrompt)?

    private init() {
        C15t.onUninstall { core in PromptRegistry.shared.drop(ObjectIdentifier(core)) }
    }

    func lookup(_ id: ObjectIdentifier) -> ConsentPrompt? {
        lock.lock()
        defer { lock.unlock() }
        return prompts[id]?.prompt
    }

    func store(_ prompt: ConsentPrompt, id: ObjectIdentifier, installed isInstalled: Bool) {
        lock.lock()
        defer { lock.unlock() }
        if prompts[id]?.prompt !== prompt {
            prompts = prompts.filter { $0.value.prompt != nil }
            prompts[id] = WeakPrompt(prompt)
        }
        if isInstalled { installed = (id, prompt) }
    }

    func drop(_ id: ObjectIdentifier) {
        lock.lock()
        prompts[id] = nil
        // Released after unlocking, in case this was the last reference.
        let released = installed?.id == id ? installed : nil
        if released != nil { installed = nil }
        lock.unlock()
        _ = released
    }
}

/// Where the notice card takes touches over a UIKit root.
///
/// It is asked at hit-test time and accepts a point only while the scene behind `hostID` draws
/// the prompt and the notice is actually showing, so a card that was acknowledged, cleared or
/// handed to another scene leaves no area that swallows the app's touches.
@MainActor
final class NoticeTouchRegion {
    /// The scene this region belongs to.
    let hostID: UUID
    /// The prompt that scene attached to, once a core is available.
    weak var prompt: ConsentPrompt?
    /// The card's last measured bounds, in window coordinates.
    var frame: CGRect = .zero

    init(hostID: UUID) { self.hostID = hostID }

    /// Whether a touch at `point`, in window coordinates, belongs to the notice card.
    func contains(_ point: CGPoint) -> Bool {
        guard let prompt, prompt.host == hostID, prompt.presenter.noticeVisible else { return false }
        return frame.contains(point)
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

    func attach(_ resolve: @MainActor () -> ConsentCore?, onAttach: ((ConsentPrompt) -> Void)?) {
        guard prompt == nil, let core = resolve() else { return }
        let shared = ConsentPrompt.shared(for: core)
        prompt = shared
        onAttach?(shared)
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
    /// The scene's id for host claims. A UIKit root passes its own so its touch region can ask.
    var hostID: UUID? = nil
    /// Called once with the shared prompt this scene attached to.
    var onAttach: ((ConsentPrompt) -> Void)? = nil
    @StateObject private var model = ConsentAttachmentModel()
    @State private var ownID = UUID()

    func body(content: Content) -> some View {
        content
            .overlay {
                if let prompt = model.prompt {
                    ConsentPromptHost(prompt: prompt, id: hostID ?? ownID, privacyPolicyURL: privacyPolicyURL,
                                      theme: theme, autoPresent: autoPresent, onNoticeFrameChange: onNoticeFrameChange)
                }
            }
            .onAppear { model.attach(resolve, onAttach: onAttach) }
            .onReceive(NotificationCenter.default.publisher(for: UIApplication.protectedDataDidBecomeAvailableNotification)) { _ in
                model.attach(resolve, onAttach: onAttach)
            }
            .onReceive(NotificationCenter.default.publisher(for: UIApplication.didBecomeActiveNotification)) { _ in
                model.attach(resolve, onAttach: onAttach)
            }
    }
}

/// One scene's claim on the shared prompt. Draws it only while the claim holds.
private struct ConsentPromptHost: View {
    @ObservedObject var prompt: ConsentPrompt
    let id: UUID
    let privacyPolicyURL: URL
    let theme: ConsentTheme?
    let autoPresent: Bool
    let onNoticeFrameChange: ((CGRect) -> Void)?
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
    private let region: NoticeTouchRegion

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
        let region = NoticeTouchRegion(hostID: UUID())
        let passthrough = ConsentPassthroughView(region: region)
        self.region = region
        self.passthrough = passthrough
        let resolve: @MainActor () -> ConsentCore?
        if let configuration {
            resolve = { try? C15tApple.install(configuration) }
        } else {
            resolve = { C15t.current }
        }
        overlay = UIHostingController(rootView: AnyView(Color.clear.modifier(ConsentAttachment(
            resolve: resolve, privacyPolicyURL: privacyPolicyURL, theme: theme, autoPresent: autoPresent,
            onNoticeFrameChange: { [weak region] in region?.frame = $0 },
            hostID: region.hostID,
            onAttach: { [weak region] in region?.prompt = $0 }))))
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

/// Accepts touches only where the notice card is showing now. Everything else reaches the app.
@MainActor
private final class ConsentPassthroughView: UIView {
    private let region: NoticeTouchRegion

    init(region: NoticeTouchRegion) {
        self.region = region
        super.init(frame: .zero)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    override func point(inside point: CGPoint, with event: UIEvent?) -> Bool {
        region.contains(convert(point, to: nil))
    }
}
#endif
