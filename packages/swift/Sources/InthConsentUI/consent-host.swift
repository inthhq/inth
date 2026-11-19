#if canImport(InthCore)
import InthCore
#endif
import Foundation

/// Where a ``ConsentHostDriver`` puts the prompt on screen: a UIKit overlay in the React Native
/// binding, a fake in tests.
@MainActor
public protocol ConsentHostCanvas: AnyObject {
    /// Put `presenter` on screen over whatever the app shows now. Called again while it is up,
    /// which keeps it there.
    /// - Throws: When there is no foreground window to show it on yet.
    func show(_ presenter: ConsentPresenter, privacyPolicyURL: URL) throws
    /// Take it off screen. Called once nothing of it shows and no cover is animating away.
    func hide()
}

/// Draws the app's ``ConsentPrompt`` for a runtime that owns no SwiftUI scene of its own, such as
/// React Native.
///
/// The prompt decides. ``configure(core:autoPresent:privacyPolicyURL:)`` attaches this driver to it
/// with the runtime's `autoPresent`, and from then on the prompt opens an owed prompt by itself,
/// once per owed prompt, exactly as it does under `inthConsent`. The driver only puts what the
/// prompt opened on the ``ConsentHostCanvas`` and reports it: ``onPresented`` once a session is on
/// screen, ``onUnavailable`` while an owed prompt has no window to show on yet, and one
/// ``onOutcome`` per session, sent once its cover has animated away. An owed prompt that cannot
/// show yet stays owed and shows on the next ``retry()``, so it is not lost across backgrounding,
/// a scene that is not ready yet, or an uninstall followed by a new install.
/// ``present(core:preferences:privacyPolicyURL:)`` opens a session the app asked for through the
/// same prompt, so what the person dismissed counts either way.
///
/// Mirrors `ConsentHost` in the Kotlin SDK.
@MainActor
public final class ConsentHostDriver {
    /// What a session shows.
    public enum Shows: String, Sendable { case prompt, preferences }

    /// How a session ended.
    public enum Ending: Sendable, Equatable {
        /// A decision was saved durably on the device.
        case committed
        /// A notice was acknowledged. No consent decision was recorded.
        case acknowledged
        /// The person closed the session without a decision.
        case dismissed
        /// The session closed because the policy was unresolved, or its core was uninstalled.
        case unavailable
    }

    /// What ``present(core:preferences:privacyPolicyURL:)`` did.
    public enum Answer: Equatable, Sendable {
        case presented(sessionID: String, shows: Shows)
        case alreadyPresented(sessionID: String, shows: Shows)
        case notRequired
    }

    /// Why a request was refused.
    public enum Refusal: Error, Equatable {
        /// The privacy-policy URL is not an absolute HTTPS URL with a host. Permanent.
        case invalidPrivacyPolicy
    }

    /// A session is on screen: one the prompt opened by itself (`automatic`), or one the app asked
    /// for. Sent before the outcome of any session it replaced.
    public var onPresented: ((_ sessionID: String, _ shows: Shows, _ automatic: Bool) -> Void)?
    /// An owed prompt has no window to show on yet. It shows on a later ``retry()``.
    public var onUnavailable: ((_ message: String) -> Void)?
    /// How a session ended, with the core's revision then. Once per session.
    public var onOutcome: ((_ sessionID: String, _ ending: Ending, _ revision: Int) -> Void)?

    @MainActor
    private final class Session {
        let id: String
        let prompt: ConsentPrompt
        let notice: Bool
        let preferences: Bool
        init(id: String, prompt: ConsentPrompt, notice: Bool, preferences: Bool) {
            self.id = id
            self.prompt = prompt
            self.notice = notice
            self.preferences = preferences
        }
        var shows: Shows { preferences ? .preferences : .prompt }
        var showing: Bool {
            let presenter = prompt.presenter
            return presenter.presentationID != nil || presenter.noticeVisible || presenter.pending
        }
    }

    private let canvas: ConsentHostCanvas
    /// This driver's claim on the prompt, beside any SwiftUI scene's.
    private let token = UUID()
    private var prompt: ConsentPrompt?
    private var subscription: ConsentSubscription?
    private var configured = false
    private var autoPresent = false
    private var privacyPolicyURL: URL?
    /// The session on screen. Read it through ``current()``, which never returns one that shows nothing.
    private var held: Session?
    /// The owed prompt last reported as having no window, so it is reported once.
    private var unavailableFor: String?
    /// Outcomes waiting to go, in order: for their cover to animate away, and for the prompt that
    /// replaces them, if one is owed, to be reported presented first.
    private var waiting: [() -> Void] = []
    private var waitTask: Task<Void, Never>?
    /// How long an outcome waits for the prompt that replaces it when no window can show it yet,
    /// such as while the scene is inactive. Short enough that an app sent to the background still
    /// hears the outcome.
    var replacementWait: Duration = .seconds(2)

    public init(canvas: ConsentHostCanvas) {
        self.canvas = canvas
        Inth.onUninstall { [weak self] core in
            Task { @MainActor [weak self] in self?.drop(core) }
        }
    }

    /// Attach to `core`'s prompt with the runtime's settings. Call it again whenever they change.
    /// With `autoPresent` on, the prompt presents an owed prompt by itself; with it off, nothing
    /// opens until ``present(core:preferences:privacyPolicyURL:)``, and a session the prompt opened
    /// by itself that is not on screen yet is withdrawn, so an app that opted out never sees a
    /// prompt it did not ask for.
    /// - Throws: ``Refusal/invalidPrivacyPolicy`` when `autoPresent` is on and the URL is not HTTPS.
    public func configure(core: ConsentCore, autoPresent: Bool, privacyPolicyURL: String?) throws {
        let url = privacyPolicyURL.flatMap(Self.https)
        if autoPresent, url == nil { throw Refusal.invalidPrivacyPolicy }
        configured = true
        self.autoPresent = autoPresent
        if let url { self.privacyPolicyURL = url }
        let attached = attach(core)
        // Opened by itself and never shown: not for an app that has just opted out.
        if !autoPresent, held == nil { attached.presenter.withdrawAutomaticSession() }
        reconcile()
    }

    /// Open a prompt or settings the app asked for. Repeated requests reuse the open session.
    /// - Throws: ``Refusal/invalidPrivacyPolicy``, or the canvas's error when there is no window.
    public func present(core: ConsentCore, preferences: Bool, privacyPolicyURL: String) throws -> Answer {
        guard let url = Self.https(privacyPolicyURL) else { throw Refusal.invalidPrivacyPolicy }
        let prompt = attach(core)
        let presenter = prompt.presenter
        // A repeated prompt request re-asks the open session, so a notice cleared and owed again shows.
        if held != nil, !preferences { presenter.presentPrompt() }
        if let session = current() {
            try canvas.show(presenter, privacyPolicyURL: url)
            return .alreadyPresented(sessionID: session.id, shows: session.shows)
        }
        // The prompt opened a session by itself that had no window to show on until now.
        if presenter.presentationID != nil || presenter.noticeVisible {
            let session = try open(prompt, url: url, automatic: true)
            return .alreadyPresented(sessionID: session.id, shows: session.shows)
        }
        let snapshot = core.snapshot()
        if !preferences, snapshot.policyPending || snapshot.promptRequirement.kind == .none { return .notRequired }
        if preferences { prompt.presentPreferences() } else { prompt.presentPrompt() }
        guard presenter.presentationID != nil || presenter.noticeVisible else { return .notRequired }
        let session = try open(prompt, url: url, automatic: false)
        return .presented(sessionID: session.id, shows: session.shows)
    }

    /// Ask to close the open session. A dirty draft asks the person first; an obsolete id does nothing.
    public func close(sessionID: String) {
        guard let session = current(), session.id == sessionID, !session.prompt.presenter.pending else { return }
        session.prompt.presenter.requestClose()
    }

    /// Follow `core`'s prompt with the current settings. A core installed after an uninstall gets a
    /// new prompt, and the driver moves to it, so an owed prompt is presented on the new core too.
    public func follow(_ core: ConsentCore) {
        guard configured else { return }
        attach(core)
        reconcile()
    }

    /// A scene became active: show what could not be shown before.
    public func retry() { reconcile() }

    /// The runtime went away. Its canvas comes off screen with it, and nothing presents by itself
    /// until a runtime configures a driver again. An open session stays open in the prompt, so the
    /// next runtime's driver shows it and reports it.
    public func detach() {
        configured = false
        autoPresent = false
        held = nil
        sendWaiting(force: true)
        canvas.hide()
        subscription?.cancel()
        subscription = nil
        if let prompt {
            prompt.onHostFinished = nil
            prompt.onHostCoverDismissed = nil
            prompt.detach(token)
        }
        prompt = nil
    }

    private static func https(_ raw: String) -> URL? {
        guard let url = URL(string: raw), url.scheme == "https", url.host?.isEmpty == false else { return nil }
        return url
    }

    /// Attach this driver's claim to `core`'s prompt, moving from another core's if it changed.
    @discardableResult
    private func attach(_ core: ConsentCore) -> ConsentPrompt {
        let next = ConsentPrompt.shared(for: core)
        if prompt !== next {
            if let old = prompt {
                old.onHostFinished = nil
                old.onHostCoverDismissed = nil
                old.detach(token)
                // A session of a core this driver no longer follows is not the runtime's any more.
                if let session = held, session.prompt === old {
                    held = nil
                    canvas.hide()
                }
            }
            subscription?.cancel()
            prompt = next
            next.onHostFinished = { [weak self, weak next] outcome in
                guard let self, let next else { return }
                self.finished(next, outcome)
            }
            next.onHostCoverDismissed = { [weak self] in self?.coverDismissed() }
            // After the presenter has applied the same change, which it hears first: a notice
            // cleared outside a session ends it, and what the prompt opened by itself is shown.
            subscription = core.onChange { [weak self, weak next] _ in
                Task { @MainActor [weak self, weak next] in
                    guard let self, let next, self.prompt === next else { return }
                    self.reconcile()
                }
            }
        }
        next.attach(token, active: true, autoPresent: autoPresent && configured, trackingRequest: .manual)
        return next
    }

    private func drop(_ core: ConsentCore) {
        guard let dropped = prompt, dropped.core === core else { return }
        // No prompt of this core will follow.
        sendWaiting(force: true)
        if let session = held, session.prompt === dropped {
            held = nil
            canvas.hide()
            onOutcome?(session.id, .unavailable, core.snapshot().revision)
        }
        dropped.onHostFinished = nil
        dropped.onHostCoverDismissed = nil
        subscription?.cancel()
        subscription = nil
        prompt = nil
    }

    /// The open session, derived from what is on screen: a held session that shows nothing (its
    /// notice was cleared by `dismissNotice()` or a reset, with no decision to close it) is ended
    /// here with a dismissed outcome, so no request is answered with a session that is not visible.
    private func current() -> Session? {
        if let session = held, !session.showing { finish(session, .dismissed) }
        return held
    }

    /// End a held session that shows nothing, and show what the prompt opened by itself.
    private func reconcile() {
        guard let prompt, current() == nil, prompt.host == token else { return }
        let presenter = prompt.presenter
        guard presenter.presentationID != nil || presenter.noticeVisible else {
            unavailableFor = nil
            sendWaiting()
            hideIfIdle()
            return
        }
        guard let url = privacyPolicyURL else { return }
        do {
            try open(prompt, url: url, automatic: true)
        } catch {
            // An outcome is waiting for this prompt; the wait reports it if no window comes.
            if !waiting.isEmpty { return armWait() }
            let key = presenter.presentationID?.uuidString ?? "notice"
            guard unavailableFor != key else { return }
            unavailableFor = key
            onUnavailable?("No foreground window to show the owed consent prompt on yet: \(error)")
        }
    }

    /// Hold what `prompt` shows now as a session, put it on the canvas, and report it.
    @discardableResult
    private func open(_ prompt: ConsentPrompt, url: URL, automatic: Bool) throws -> Session {
        let presenter = prompt.presenter
        let notice = presenter.presentationID == nil && presenter.noticeVisible
        let session = Session(id: presenter.presentationID?.uuidString ?? UUID().uuidString, prompt: prompt,
                              notice: notice, preferences: presenter.preferences && !presenter.returnsToFirstLayer)
        do {
            try canvas.show(presenter, privacyPolicyURL: url)
        } catch {
            // One the prompt opened by itself stays open, to show once a window can take it. One
            // the app asked for is withdrawn: not on screen, so not the person's, and still owed.
            if !automatic { presenter.withdrawSession() }
            throw error
        }
        held = session
        unavailableFor = nil
        onPresented?(session.id, session.shows, automatic)
        sendWaiting()
        return session
    }

    private func finished(_ prompt: ConsentPrompt, _ outcome: ConsentPresenterOutcome) {
        guard let session = held, session.prompt === prompt else { return }
        finish(session, outcome == .dismissed ? .dismissed : .committed)
    }

    private func finish(_ session: Session, _ outcome: Ending) {
        guard held === session else { return }
        let presenter = session.prompt.presenter
        let snapshot = session.prompt.core.snapshot()
        let ending: Ending
        if outcome == .dismissed {
            ending = snapshot.policyPending ? .unavailable : .dismissed
        } else if session.notice, !presenter.preferences {
            ending = .acknowledged
        } else {
            ending = .committed
        }
        held = nil
        // The prompt that follows, if one is owed, is reported before this outcome, so a step that
        // waits for Inth's screens to close never runs between the two. With no window to show it
        // on yet, the outcome waits for it, and for no longer than ``replacementWait``.
        presenter.presentIfOwed()
        let report: () -> Void = { [weak self] in self?.onOutcome?(session.id, ending, snapshot.revision) }
        waiting.append(report)
        reconcile()
        sendWaiting()
        hideIfIdle()
    }

    /// A prompt is owed and open in the prompt, but not on screen yet.
    private var replacementOwed: Bool {
        guard held == nil, let presenter = prompt?.presenter else { return false }
        return presenter.presentationID != nil || presenter.noticeVisible
    }

    /// Send the waiting outcomes once their cover has gone, iOS shows no system alert such as App
    /// Tracking Transparency over a presentation that is still leaving, and once no replacement is
    /// owed and not shown. `force` sends them at once; `timedOut` stops waiting for a replacement.
    private func sendWaiting(force: Bool = false, timedOut: Bool = false) {
        guard !waiting.isEmpty else { return }
        if !force {
            if prompt?.presenter.covering == true { return }
            if !timedOut, replacementOwed { return armWait() }
        }
        waitTask?.cancel()
        waitTask = nil
        let reports = waiting
        waiting = []
        reports.forEach { $0() }
    }

    private func armWait() {
        guard waitTask == nil else { return }
        let delay = replacementWait
        waitTask = Task { @MainActor [weak self] in
            try? await Task.sleep(for: delay)
            guard let self, !Task.isCancelled else { return }
            self.waitTask = nil
            self.sendWaiting(timedOut: true)
            self.reconcile()
        }
    }

    /// Take the canvas down once nothing of ours is on it or leaving it.
    private func hideIfIdle() {
        guard held == nil, prompt?.presenter.covering != true else { return }
        canvas.hide()
    }

    private func coverDismissed() {
        sendWaiting()
        hideIfIdle()
    }
}
