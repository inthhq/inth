#if canImport(C15tCore)
import C15tCore
#endif
import Combine
import Foundation

/// The compact outcome delivered to a native host. A dismissal records no decision.
public enum ConsentPresenterOutcome: Sendable { case saved, dismissed }

/// Owns one native presentation and its draft. Keep one instance for the host's lifetime.
/// Storage work runs on a worker; observing and editing are confined to the main actor.
///
/// With ``autoPresent`` on, the presenter opens an owed prompt by itself once the core is ready,
/// once per owed prompt: a prompt the person answered or dismissed stays closed until the policy,
/// the reason or the requirement changes. With it off, nothing shows until ``presentPrompt()``.
@MainActor
public final class ConsentPresenter: ObservableObject {
    public let core: ConsentCore
    /// The draft behind the session: staged choices, the save and its revision check. The stock
    /// screens and an app-owned screen built on the headless blocks run the same one. Its changes
    /// are forwarded through this presenter's `objectWillChange`.
    let draft: ConsentDraft
    public var snapshot: ConsentSnapshot { draft.snapshot }
    @Published public private(set) var presentationID: UUID?
    @Published public private(set) var preferences = false
    public var pending: Bool { draft.isSaving }
    /// The action being committed while `pending`, so only its control shows progress.
    public var pendingAction: Action? { draft.savingAction.map(Action.init) }
    /// `true` once a commit has taken long enough to deserve a spinner.
    public var showProgress: Bool { draft.showProgress }
    public var errorCode: String? { draft.errorCode }
    /// The action behind `errorCode`, so a page can show the failure beside the control that
    /// failed; `nil` whenever there is no error.
    public var failedAction: Action? { draft.failedAction.map(Action.init) }
    public var stale: Bool { draft.isStale }
    public var categories: [OptionalConsentCategory: Bool] { draft.categoryChoices }
    public var choices: IABChoices { draft.choices }
    public var disclosure: IABPresentation? { draft.disclosure }
    /// The disclosure as rows, for the IAB pages.
    var iabRows: IABDraftHandle? { draft.iab }
    @Published public var confirmDiscard = false
    public var onOutcome: ((ConsentPresenterOutcome) -> Void)?
    public var onAnnouncement: ((String) -> Void)?
    /// A cover or sheet is on screen, including while it animates away after ``onOutcome``.
    public private(set) var covering = false
    /// Called once the cover or sheet has finished animating away. iOS will not show a system
    /// alert, such as App Tracking Transparency, over a presentation that is still leaving.
    public var onCoverDismissed: (() -> Void)?
    private var draftChanges: AnyCancellable?
    private var fromFirstLayer = false
    /// The owed prompt the person saw and closed, by its key. The key carries the core's
    /// `promptOwedSince`, so a prompt owed again never matches it: nothing has to clear it.
    private var suppressedPrompt: String?
    /// The open session shows the owed prompt (its first layer, or settings opened from it), not
    /// standing settings.
    private var sessionIsPrompt: Bool { presentationID != nil && (!preferences || fromFirstLayer) }
    /// The session ``autoPresent`` opened, by its id, as opposed to one the app asked for.
    private var automaticSession: UUID?
    private var lastIntent: Action?
    /// The owed notice the host asked for while ``autoPresent`` is off, by its key. A later notice
    /// needs its own request.
    @Published private var requestedNotice: String? = nil
    /// Open an owed prompt by itself. Turning it on presents a prompt that is already owed.
    @Published public var autoPresent: Bool {
        didSet { if autoPresent { presentIfOwed() } }
    }

    public enum Action {
        case accept, reject, save, acknowledge

        init(_ action: ConsentWriteAction) {
            switch action {
            case .acceptAll: self = .accept
            case .rejectAll: self = .reject
            case .save: self = .save
            case .acknowledge: self = .acknowledge
            }
        }

        var write: ConsentWriteAction {
            switch self {
            case .accept: return .acceptAll
            case .reject: return .rejectAll
            case .save: return .save
            case .acknowledge: return .acknowledge
            }
        }
    }

    /// Attach to a bootstrapped core. The presenter never installs a second engine.
    /// - Parameters:
    ///   - core: Native authority shared by the app's SDK gates.
    ///   - autoPresent: Open an owed prompt by itself. `false` waits for ``presentPrompt()``.
    public init(core: ConsentCore, autoPresent: Bool = true) {
        self.autoPresent = autoPresent
        self.core = core
        self.draft = ConsentDraft(core: core, load: false)
        // Views observe the presenter, so every change of the draft is announced as its own.
        draftChanges = draft.objectWillChange.sink { [weak self] _ in self?.objectWillChange.send() }
        // A clean draft follows the record only while a session shows it: the first layer always,
        // standing settings once an unresolved policy resolves.
        draft.follows = { [weak self] wasPending, next in
            guard let self, self.presentationID != nil else { return false }
            return !self.preferences || wasPending && !next.policyPending
        }
        draft.onReceived = { [weak self] in self?.presentIfOwed() }
        receive(core.snapshot())
    }

    /// Names the owed prompt. `promptOwedSince` moves whenever a prompt becomes owed again, so the
    /// same requirement owed again is a new prompt even when the snapshots between were coalesced.
    private var promptKey: String {
        "\(snapshot.resolution.fingerprint ?? ""):\(snapshot.promptRequirement.kind.rawValue):\(snapshot.promptRequirement.reason?.rawValue ?? ""):\(snapshot.promptOwedSince.map { String($0) } ?? "")"
    }

    /// Apply a published snapshot. Internal so a test can hand it a snapshot directly. The draft
    /// assigns state only when it differs: `@Published` announces every assignment, equal or not,
    /// and each announcement re-renders every observing view.
    func receive(_ next: ConsentSnapshot) { draft.receive(next) }

    /// Open an owed prompt now if ``autoPresent`` says so. Idempotent. A host calls it before it
    /// reports an outcome, so the prompt that follows is on screen first.
    func presentIfOwed() {
        guard autoPresent, snapshot.ready, !snapshot.policyPending, snapshot.promptRequirement.kind == .choice,
              presentationID == nil, !pending, suppressedPrompt != promptKey else { return }
        presentationID = UUID()
        // Skip writes that change nothing: each one republishes the whole presenter.
        if preferences { preferences = false }
        if fromFirstLayer { fromFirstLayer = false }
        loadDraft()
        automaticSession = presentationID
    }

    /// End a session that opened by itself, because the host now drawing it opted out of
    /// auto-present and never asked for it. Nothing was decided or dismissed, so it reports no
    /// outcome and leaves the owed prompt owed: a host that auto-presents opens it again.
    func withdrawAutomaticSession() {
        guard !pending, let id = presentationID, id == automaticSession else { return }
        presentationID = nil
        confirmDiscard = false
    }

    /// End a session a host asked for but could not put on screen. Nothing was decided or
    /// dismissed, so it reports no outcome.
    func withdrawSession() {
        guard !pending else { return }
        if presentationID != nil { presentationID = nil }
        if requestedNotice != nil { requestedNotice = nil }
        confirmDiscard = false
    }

    /// Close the open session without a commit. Closing the prompt settles it; closing standing
    /// settings does not, so an owed prompt they covered is presented now.
    private func closeSession() {
        if sessionIsPrompt { suppressedPrompt = promptKey }
        // Closing a notice the host asked for ends that request; it stays owed for the next one.
        if presentationID == nil, requestedNotice != nil { requestedNotice = nil }
        presentationID = nil
        onOutcome?(.dismissed)
        presentIfOwed()
    }

    public var noticeVisible: Bool {
        snapshot.ready && !snapshot.policyPending && snapshot.promptRequirement.kind == .notice && presentationID == nil
            && (autoPresent || requestedNotice == promptKey)
    }
    public var isDirty: Bool { draft.isDirty }
    /// Preferences were opened from the first layer, so closing them returns there.
    public var returnsToFirstLayer: Bool { fromFirstLayer }
    public var iab: Bool { draft.isIAB }
    public var listUnavailable: Bool { draft.listUnavailable }
    /// Whether a partner's permitted legal bases are off, partly on or on in the current draft.
    public func partnerSelection(_ id: Int) -> IABVendorSelectionStatus {
        disclosure?.vendors[id]?.selectionStatus(vendorId: id, choices: choices) ?? .off
    }
    /// Human-readable summary of both permitted legal bases in the current draft, from the shared copy.
    public func partnerStatus(_ id: Int) -> String { statusText(partnerSelection(id)) }
    /// Whether a custom (non-IAB) partner's legal bases are off, partly on or on in the current draft.
    public func customPartnerSelection(_ id: String) -> IABVendorSelectionStatus {
        disclosure?.customVendors.first { $0.id == id }?.selectionStatus(choices: choices) ?? .off
    }
    /// The same summary for a custom partner.
    public func customPartnerStatus(_ id: String) -> String { statusText(customPartnerSelection(id)) }
    private func statusText(_ selection: IABVendorSelectionStatus) -> String { iabCopy.statusLabel(selection) }
    /// One custom partner's page, or `nil` when it is not in the current disclosure.
    func customVendor(_ id: String) -> IABCustomVendorContent? {
        disclosure.flatMap { IABCustomVendorContent($0, id: id) }
    }
    /// How the open session is shown: the first layer, and preferences opened from it, cover
    /// the screen; standing preferences are a sheet. `nil` while nothing is open.
    var presentationStyle: ConsentPresentationStyle? {
        guard presentationID != nil else { return nil }
        return preferences && !fromFirstLayer ? .sheet : .fullScreen
    }
    /// Only a clean standing preferences sheet may be swiped away. The first layer never can.
    var allowsInteractiveDismiss: Bool { preferences && !isDirty && !pending }
    /// The IAB first layer's required sentences. `nil` outside IAB mode or before a list loads.
    var iabFirstLayer: IABFirstLayerContent? { iabRows?.firstLayer }
    /// The IAB preferences content. `nil` outside IAB mode or before a list loads.
    var iabPreferences: IABPreferencesContent? { iabRows?.preferences }
    /// One partner's page, or `nil` when the partner is not in the current disclosure.
    func iabVendor(_ id: Int) -> IABVendorContent? { iabRows?.details(vendorId: id) }
    /// The language every label is shown in. See ``ConsentDraft/language``.
    var copyLanguage: String { draft.language }
    /// The shared IAB copy in ``copyLanguage``.
    var iabCopy: IABCopy { draft.iabCopy }
    /// Category-mode copy in ``copyLanguage``. Hosts replace only the headline and introduction,
    /// through the theme.
    var copy: ConsentCopy { draft.copy }
    /// "Last changed" with the date in the copy's language, not the device's.
    func lastChanged(at epochMs: Int64) -> String { draft.lastChanged(at: epochMs) }
    /// Button labels: the IAB copy in IAB mode, the category-mode copy otherwise.
    var decisionLabels: DecisionLabels { draft.decisionLabels }
    public var offeredCategories: [ConsentCategory] { draft.displayedCategories }
    /// What the last refused commit means for the person; the retry is offered beside it. It stays
    /// set while a retry is in flight, so the footer does not reflow under the thumb, and clears
    /// only on success or a reload.
    public var errorMessage: String? { draft.errorMessage }
    /// Google's Additional Consent only takes effect while TCF purposes 1, 3 and 4 are consented;
    /// the core records every provider as off otherwise. The provider page says so in those
    /// purposes' own names, which is how the person saw them one page back.
    public var providerPrerequisitesMet: Bool { adTechProviderPurposeIds.isSubset(of: Set(choices.purposeConsents)) }
    public var providerPrerequisiteNames: [String] { adTechProviderPurposeIds.sorted().compactMap { disclosure?.list.purposes[$0]?.name } }

    /// Open standing privacy settings. A pending action keeps its original presentation.
    public func presentPreferences() {
        guard !pending, presentationID == nil else { return }
        presentationID = UUID()
        preferences = true
        fromFirstLayer = false
        loadDraft()
    }
    /// Open an owed prompt. An owed notice shows as the notice card. Existing sessions keep
    /// their identity and draft.
    public func presentPrompt() {
        guard presentationID == nil, !pending else { return }
        draft.sync()
        guard !snapshot.policyPending else { return }
        if snapshot.promptRequirement.kind == .notice { requestedNotice = promptKey; return }
        guard snapshot.promptRequirement.kind == .choice else { return }
        presentationID = UUID()
        preferences = false
        fromFirstLayer = false
        loadDraft()
    }
    /// Close only the session the host opened. Dirty drafts still require confirmation.
    public func requestClose(sessionID: UUID) {
        guard presentationID == sessionID else { return }
        requestClose()
    }
    public func customize() {
        guard !pending else { return }
        preferences = true
        fromFirstLayer = true
        loadDraft()
    }
    public func loadDraft() { draft.reset() }
    public func setCategory(_ category: OptionalConsentCategory, _ value: Bool) { draft.setCategory(category, value) }
    public func isRestricted(_ category: OptionalConsentCategory) -> Bool { draft.isRestricted(category) }
    public func edit(_ key: WritableKeyPath<IABChoices, [Int]>, id: Int, enabled: Bool) {
        draft.select(key, id: id, enabled: enabled)
    }
    public func editLI(purpose: Bool, id: Int, enabled: Bool) {
        draft.setLegitimateInterest(purpose: purpose, id: id, enabled: enabled)
    }
    /// Grant or withdraw a custom partner's consent or legitimate interest. Turning legitimate
    /// interest off is the objection; custom partners have no separate objection list.
    public func editCustom(_ key: WritableKeyPath<IABChoices, [String]>, id: String, enabled: Bool) {
        draft.select(key, id: id, enabled: enabled)
    }
    public func editProvider(id: Int, enabled: Bool) { draft.selectProvider(id: id, enabled: enabled) }
    public func requestClose() {
        guard !pending else { return }
        if isDirty { confirmDiscard = true } else { discard() }
    }
    public func discard() {
        guard !pending else { return }
        confirmDiscard = false
        if fromFirstLayer {
            preferences = false
            fromFirstLayer = false
            loadDraft()
        } else {
            closeSession()
        }
    }
    func coverAppeared() { covering = true }
    func coverDismissed() {
        covering = false
        onCoverDismissed?()
    }
    public func retry() {
        guard let lastIntent else { return }
        commit(lastIntent)
    }
    public func refresh() { draft.refresh() }
    /// Commit through native intents. Accept and Reject never build selection loops in UI.
    public func commit(_ action: Action) {
        guard !pending, !stale else { return }
        if case .save = action, !isDirty, snapshot.promptRequirement.kind == .none {
            closeSession()
            return
        }
        let session = presentationID
        // The prompt the person acted on. A requirement that changes while the commit runs is a new one.
        let handled = promptKey
        // A notice is shown without a session; a session shows the prompt or standing settings.
        let shownPrompt = session == nil || sessionIsPrompt
        lastIntent = action
        draft.commit(action.write) { [self] ok, message in
            guard presentationID == session else { presentIfOwed(); return }
            if ok {
                if shownPrompt { suppressedPrompt = handled }
                presentationID = nil
                onAnnouncement?(message)
                onOutcome?(.saved)
                // Snapshots that arrived while the commit ran were not acted on; the current one is.
                presentIfOwed()
            } else {
                onAnnouncement?(message)
            }
        }
    }
}
