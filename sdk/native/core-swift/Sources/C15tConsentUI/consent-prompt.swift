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
    /// The presenter behind the prompt. Auto-present stays off until a scene attaches. Internal:
    /// opening it directly would skip the host rules and the App Tracking Transparency order, so
    /// apps open the prompt through ``presentPrompt()`` and ``presentPreferences()``.
    let presenter: ConsentPresenter
    /// Called each time a prompt or settings session closes, with how it ended. A step that has
    /// to follow the consent prompt, such as a platform permission request, starts here.
    public var onFinished: ((ConsentPresenterOutcome) -> Void)?
    /// When App Tracking Transparency is asked, relative to this prompt. Set by the scene that
    /// attaches; see ``ConsentTrackingRequest``.
    public private(set) var trackingRequest = ConsentTrackingRequest.afterConsent

    @Published private(set) var host: UUID?
    @Published private(set) var hostActive = false

    private let tracking: C15tTrackingController
    private let isActive: @MainActor () -> Bool
    /// The drawing scene's `autoPresent`. The presenter's own setting also waits for
    /// `beforeConsent`.
    private var wantsAutoPresent = false
    private var launchChecked = false
    /// Apple has answered a request from this prompt in this launch. `beforeConsent` asks once.
    private var trackingAsked = false
    private var trackingInFlight = false
    private var trackingOwed: ConsentTrackingStage?
    /// The owed ask came from the launch check, which depends on the scene's settings.
    private var trackingOwedAtLaunch = false
    /// The app called ``presentPrompt()`` with `beforeConsent` and Apple has not been asked yet.
    private var promptAfterTracking = false
    /// The app called ``presentPrompt()`` before any scene attached, so no order was known yet.
    private var promptAfterAttach = false
    private var observers: [AnyCancellable] = []

    init(core: ConsentCore, tracking: C15tTrackingController = C15tApple.tracking,
         isActive: @escaping @MainActor () -> Bool = { ConsentPrompt.appIsActive() },
         becameActive: AnyPublisher<Void, Never>? = nil) {
        self.core = core
        self.tracking = tracking
        self.isActive = isActive
        self.presenter = ConsentPresenter(core: core, autoPresent: false)
        presenter.onOutcome = { [weak self] outcome in self?.finished(outcome) }
        presenter.onCoverDismissed = { [weak self] in self?.requestOwedTracking() }
        observers = [
            presenter.$snapshot.sink { [weak self] in
                self?.checkLaunch($0)
                self?.syncTrackingHold()
                self?.requestOwedTracking()
            },
            (becameActive ?? ConsentPrompt.activations).sink { [weak self] in self?.requestOwedTracking() },
        ]
    }

    #if canImport(UIKit)
    static func appIsActive() -> Bool { UIApplication.shared.applicationState == .active }
    static var activations: AnyPublisher<Void, Never> {
        NotificationCenter.default.publisher(for: UIApplication.didBecomeActiveNotification).map { _ in }.eraseToAnyPublisher()
    }
    #else
    static func appIsActive() -> Bool { true }
    static var activations: AnyPublisher<Void, Never> { Empty().eraseToAnyPublisher() }
    #endif

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

    /// Open an owed prompt now. Does nothing while a prompt or settings session is open. With
    /// `beforeConsent`, Apple's alert comes first, as it does for a prompt that opens by itself.
    /// Called before any scene has attached, for example from a view's `onAppear`, it opens once
    /// the first scene attaches, in that scene's order.
    public func presentPrompt() {
        guard host != nil else {
            promptAfterAttach = true
            return
        }
        if holdsForTracking, core.snapshot().promptRequirement.kind != .none {
            promptAfterTracking = true
            return owe(.beforePrompt)
        }
        presenter.presentPrompt()
    }

    /// Open privacy settings, also when no prompt is owed. Does nothing while a session is open.
    public func presentPreferences() { presenter.presentPreferences() }

    /// Let the scene behind `id` draw the prompt if nobody draws it, or if the scene drawing it
    /// left the foreground and this one is active.
    func attach(_ id: UUID, active: Bool, autoPresent: Bool,
                trackingRequest: ConsentTrackingRequest = .afterConsent) {
        guard host == nil || host == id || active && !hostActive else { return }
        // A session that opened by itself for another scene is not this one's to draw if it
        // opted out.
        if host != id, !autoPresent { presenter.withdrawAutomaticSession() }
        if host != id { host = id }
        if hostActive != active { hostActive = active }
        // The launch decision was made under the old settings; make it again, and drop a launch
        // ask still waiting on them.
        if autoPresent != wantsAutoPresent || trackingRequest != self.trackingRequest {
            if trackingOwedAtLaunch { dropOwedTracking() }
            launchChecked = false
        }
        self.trackingRequest = trackingRequest
        wantsAutoPresent = autoPresent
        checkLaunch(presenter.snapshot)
        syncTrackingHold()
        if promptAfterAttach {
            promptAfterAttach = false
            presentPrompt()
        }
    }

    /// The scene behind `id` went away. Another attached scene takes over. Until one does, nothing
    /// presents by itself, so a scene that attaches later with `autoPresent: false` finds nothing open.
    func detach(_ id: UUID) {
        guard host == id else { return }
        host = nil
        hostActive = false
        wantsAutoPresent = false
        presenter.autoPresent = false
        // The scene that configured the ask is gone. A scene that attaches decides it again.
        dropOwedTracking()
    }

    private func dropOwedTracking() {
        trackingOwed = nil
        trackingOwedAtLaunch = false
        launchChecked = false
        promptAfterTracking = false
    }

    /// With `beforeConsent`, a prompt waits while Apple would be asked now and has not answered
    /// yet in this launch. Read live, so a refusal that clears or an answer that arrives later is
    /// seen by the next prompt.
    var holdsForTracking: Bool {
        guard trackingRequest == .beforeConsent, !trackingAsked else { return false }
        if trackingInFlight { return true }
        let snapshot = core.snapshot()
        return trackingRequest.shouldAsk(at: .beforePrompt, platform: tracking.trackingPlatformStatus(),
                                         promptStringPresent: tracking.trackingPromptStringPresent(),
                                         marketing: ConsentDecision(snapshot: snapshot, category: .marketing),
                                         marketingRefused: snapshot.explicitChoice?.categories[.marketing]?.value == false)
    }

    private func applyAutoPresent() {
        let on = wantsAutoPresent && !holdsForTracking
        if presenter.autoPresent != on { presenter.autoPresent = on }
    }

    /// Apply the hold, and owe the ask it waits for when a prompt would open by itself.
    private func syncTrackingHold() {
        applyAutoPresent()
        guard wantsAutoPresent, host != nil, trackingOwed == nil, !trackingInFlight, holdsForTracking,
              core.snapshot().promptRequirement.kind != .none else { return }
        owe(.beforePrompt)
    }

    /// Decide once per attachment, when the core first has an answer, whether tracking is asked
    /// before any prompt. Only an auto-presenting scene does this; `autoPresent: false` asks
    /// nothing until the app opens a prompt.
    private func checkLaunch(_ snapshot: ConsentSnapshot) {
        guard !launchChecked, host != nil, wantsAutoPresent, snapshot.ready, !snapshot.policyPending else { return }
        launchChecked = true
        switch trackingRequest {
        // beforeConsent asks right before a prompt opens; ``syncTrackingHold()`` owes that ask.
        // A stored choice still in force owes no prompt, so the after-consent rule applies now.
        case .afterConsent where snapshot.promptRequirement.kind == .none: owe(.afterPrompt, atLaunch: true)
        default: break
        }
    }

    private func finished(_ outcome: ConsentPresenterOutcome) {
        onFinished?(outcome)
        owe(.afterPrompt)
    }

    private func owe(_ stage: ConsentTrackingStage, atLaunch: Bool = false) {
        trackingOwed = stage
        trackingOwedAtLaunch = atLaunch
        requestOwedTracking()
    }

    /// Ask once a scene is attached, nothing of ours is on screen and the app is active. Apple
    /// shows nothing and answers at once while the app is not active, and will not show an alert
    /// over a cover that is still animating away, so each of those waits for its own signal.
    private func requestOwedTracking() {
        guard let stage = trackingOwed, host != nil, !trackingInFlight, !presenter.covering,
              presenter.presentationID == nil, !presenter.noticeVisible, isActive() else { return }
        trackingOwed = nil
        trackingOwedAtLaunch = false
        let snapshot = core.snapshot()
        guard trackingRequest.shouldAsk(at: stage, platform: tracking.trackingPlatformStatus(),
                                        promptStringPresent: tracking.trackingPromptStringPresent(),
                                        marketing: ConsentDecision(snapshot: snapshot, category: .marketing),
                                        marketingRefused: snapshot.explicitChoice?.categories[.marketing]?.value == false) else {
            return releasePrompt()
        }
        trackingInFlight = true
        tracking.request { [weak self] result in
            Task { @MainActor in self?.trackingAnswered(stage, result) }
        }
    }

    private func trackingAnswered(_ stage: ConsentTrackingStage,
                                  _ result: Result<C15tTrackingRequestResult, C15tTrackingError>) {
        trackingInFlight = false
        trackingAsked = true
        // Additional Information on Apple's EU sheet asks the app to show its own controls.
        // After a prompt, that is settings; closing them runs the after-consent rule again.
        // Before the prompt, the prompt itself is those controls. Settings are read now, not when
        // the request started: a switch to manual, or no scene left, opens nothing.
        if stage == .afterPrompt, trackingRequest == .afterConsent, host != nil, case let .success(answer) = result,
           answer.stage == .additionalInformation {
            presenter.presentPreferences()
        }
        releasePrompt()
        requestOwedTracking()
    }

    private func releasePrompt() {
        applyAutoPresent()
        if promptAfterTracking {
            promptAfterTracking = false
            if host != nil { presenter.presentPrompt() }
        }
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
    ///   - trackingRequest: When App Tracking Transparency is asked. The default asks after the
    ///     prompt, and only while marketing is granted. Needs `NSUserTrackingUsageDescription`.
    @MainActor
    func c15tConsent(_ configuration: C15tAppleConfiguration, privacyPolicyURL: URL, theme: ConsentTheme? = nil,
                     autoPresent: Bool = true, trackingRequest: ConsentTrackingRequest = .afterConsent) -> some View {
        modifier(ConsentAttachment(resolve: { try? C15tApple.install(configuration) }, privacyPolicyURL: privacyPolicyURL,
                                   theme: theme, autoPresent: autoPresent, trackingRequest: trackingRequest,
                                   onNoticeFrameChange: nil))
    }

    /// Add the stock consent prompt and settings for a core the app installed itself, such as an
    /// IAB core from `C15tApple.install(_: CoreConfig)`. Behaves like the configuration form and
    /// attaches once a core is installed.
    @MainActor
    func c15tConsent(privacyPolicyURL: URL, theme: ConsentTheme? = nil, autoPresent: Bool = true,
                     trackingRequest: ConsentTrackingRequest = .afterConsent) -> some View {
        modifier(ConsentAttachment(resolve: { C15t.current }, privacyPolicyURL: privacyPolicyURL,
                                   theme: theme, autoPresent: autoPresent, trackingRequest: trackingRequest,
                                   onNoticeFrameChange: nil))
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
    var trackingRequest: ConsentTrackingRequest = .afterConsent
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
                                      theme: theme, autoPresent: autoPresent, trackingRequest: trackingRequest,
                                      onNoticeFrameChange: onNoticeFrameChange)
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
    let trackingRequest: ConsentTrackingRequest
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
        .onChange(of: trackingRequest) { _ in claim() }
    }

    private func claim() {
        prompt.attach(id, active: scenePhase == .active, autoPresent: autoPresent, trackingRequest: trackingRequest)
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
    ///   - trackingRequest: When App Tracking Transparency is asked. See ``ConsentTrackingRequest``.
    public init(root: UIViewController, configuration: C15tAppleConfiguration? = nil, privacyPolicyURL: URL,
                theme: ConsentTheme? = nil, autoPresent: Bool = true,
                trackingRequest: ConsentTrackingRequest = .afterConsent) {
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
            trackingRequest: trackingRequest, onNoticeFrameChange: { [weak region] in region?.frame = $0 },
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
