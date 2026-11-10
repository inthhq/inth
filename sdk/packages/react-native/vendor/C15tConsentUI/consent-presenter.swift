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
public final class ConsentPresenter: ObservableObject, SnapshotObserver {
    public let core: ConsentCore
    @Published public private(set) var snapshot: ConsentSnapshot
    @Published public private(set) var presentationID: UUID?
    @Published public private(set) var preferences = false
    @Published public private(set) var pending = false
    /// The action being committed while `pending`, so only its control shows progress.
    @Published public private(set) var pendingAction: Action?
    /// `true` once a commit has taken long enough to deserve a spinner.
    @Published public private(set) var showProgress = false
    @Published public private(set) var errorCode: String?
    /// The action behind `errorCode`, so a page can show the failure beside the control that
    /// failed; `nil` whenever there is no error.
    @Published public private(set) var failedAction: Action?
    @Published public private(set) var stale = false
    @Published public private(set) var categories: [OptionalConsentCategory: Bool] = [:]
    @Published public private(set) var choices = IABChoices()
    @Published public private(set) var disclosure: IABPresentation?
    @Published public var confirmDiscard = false
    public var onOutcome: ((ConsentPresenterOutcome) -> Void)?
    public var onAnnouncement: ((String) -> Void)?
    private var subscription: ConsentSubscription?
    private var baseRevision = 0
    private var seedCategories: [OptionalConsentCategory: Bool] = [:]
    private var seedChoices = IABChoices()
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
    private var reloadAfterRefresh = false
    /// The owed notice the host asked for while ``autoPresent`` is off, by its key. A later notice
    /// needs its own request.
    @Published private var requestedNotice: String? = nil
    /// Open an owed prompt by itself. Turning it on presents a prompt that is already owed.
    @Published public var autoPresent: Bool {
        didSet { if autoPresent { presentIfOwed() } }
    }

    public enum Action { case accept, reject, save, acknowledge }

    /// Attach to a bootstrapped core. The presenter never installs a second engine.
    /// - Parameters:
    ///   - core: Native authority shared by the app's SDK gates.
    ///   - autoPresent: Open an owed prompt by itself. `false` waits for ``presentPrompt()``.
    public init(core: ConsentCore, autoPresent: Bool = true) {
        self.autoPresent = autoPresent
        self.core = core
        self.snapshot = core.snapshot()
        self.subscription = core.onChange(self)
        receive(core.snapshot())
    }

    deinit { subscription?.cancel() }

    nonisolated public func consentDidChange(_ snapshot: ConsentSnapshot) {
        Task { @MainActor [weak self] in self?.receive(snapshot) }
    }

    /// Names the owed prompt. `promptOwedSince` moves whenever a prompt becomes owed again, so the
    /// same requirement owed again is a new prompt even when the snapshots between were coalesced.
    private var promptKey: String {
        "\(snapshot.resolution.fingerprint ?? ""):\(snapshot.promptRequirement.kind.rawValue):\(snapshot.promptRequirement.reason?.rawValue ?? ""):\(snapshot.promptOwedSince.map { String($0) } ?? "")"
    }

    private func receive(_ next: ConsentSnapshot) {
        guard next.revision >= snapshot.revision else { return }
        let wasPending = snapshot.policyPending
        snapshot = next
        if presentationID != nil, !pending, !isDirty, (!preferences || wasPending && !next.policyPending) { loadDraft() }
        if reloadAfterRefresh, !next.policyPending {
            if isDirty {
                disclosure = core.iabPresentation()
                stale = next.revision != baseRevision
            } else { loadDraft() }
            reloadAfterRefresh = listUnavailable
        }
        presentIfOwed()
    }

    private func presentIfOwed() {
        guard autoPresent, snapshot.ready, !snapshot.policyPending, snapshot.promptRequirement.kind == .choice,
              presentationID == nil, !pending, suppressedPrompt != promptKey else { return }
        presentationID = UUID()
        preferences = false
        fromFirstLayer = false
        errorCode = nil
        failedAction = nil
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

    /// Close the open session without a commit. Closing the prompt settles it; closing standing
    /// settings does not, so an owed prompt they covered is presented now.
    private func closeSession() {
        if sessionIsPrompt { suppressedPrompt = promptKey }
        presentationID = nil
        onOutcome?(.dismissed)
        presentIfOwed()
    }

    public var noticeVisible: Bool {
        snapshot.ready && !snapshot.policyPending && snapshot.promptRequirement.kind == .notice && presentationID == nil
            && (autoPresent || requestedNotice == promptKey)
    }
    public var isDirty: Bool { categories != seedCategories || choices != seedChoices }
    /// Preferences were opened from the first layer, so closing them returns there.
    public var returnsToFirstLayer: Bool { fromFirstLayer }
    public var iab: Bool { snapshot.model == .iab }
    public var listUnavailable: Bool {
        guard iab else { return false }
        let status = core.iabStatus().availability
        return disclosure?.canEdit != true || status == .stale || status == .missing || status == .unavailable
            || disclosure?.adTechProviders?.isEmpty == false && core.additionalConsentStatus() == .stale
    }
    /// Whether a partner's permitted legal bases are off, partly on or on in the current draft.
    public func partnerSelection(_ id: Int) -> IABVendorSelectionStatus {
        disclosure?.vendors[id]?.selectionStatus(vendorId: id, choices: choices) ?? .off
    }
    /// Human-readable summary of both permitted legal bases in the current draft, from the shared copy.
    public func partnerStatus(_ id: Int) -> String {
        switch partnerSelection(id) {
        case .off: return iabCopy.appOff
        case .partial: return iabCopy.appPartlyOn
        case .on: return iabCopy.appOn
        }
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
    var iabFirstLayer: IABFirstLayerContent? { iab ? disclosure.map(IABFirstLayerContent.init) : nil }
    /// The IAB preferences content. `nil` outside IAB mode or before a list loads.
    var iabPreferences: IABPreferencesContent? { iab ? disclosure.map(IABPreferencesContent.init) : nil }
    /// One partner's page, or `nil` when the partner is not in the current disclosure.
    func iabVendor(_ id: Int) -> IABVendorContent? {
        let language = String(Locale.preferredLanguages.first?.prefix(2) ?? "en")
        return disclosure.flatMap { IABVendorContent($0, id: id, language: language) }
    }
    /// The shared IAB copy in the served list's language.
    var iabCopy: IABCopy { IABCopy.forLanguage(disclosure?.language ?? "en") }
    /// "Last changed" with the date in the copy's language, not the device's.
    func lastChanged(at epochMs: Int64) -> String {
        let copy = iabCopy
        let date = Date(timeIntervalSince1970: Double(epochMs) / 1000)
            .formatted(Date.FormatStyle(date: .abbreviated, time: .omitted).locale(Locale(identifier: copy.language)))
        return copy.format(copy.appLastChanged, ["date": date])
    }
    /// Button labels: the IAB copy in IAB mode, the stock labels otherwise.
    var decisionLabels: DecisionLabels {
        guard iab, let disclosure else { return .standard }
        return DecisionLabels(copy: IABCopy.forLanguage(disclosure.language))
    }
    public var offeredCategories: [ConsentCategory] { snapshot.consentCategories ?? [.necessary] }
    /// What the last refused commit means for the person; the retry is offered beside it. It stays
    /// set while a retry is in flight, so the footer does not reflow under the thumb, and clears
    /// only on success or a reload.
    public var errorMessage: String? {
        guard let errorCode else { return nil }
        if errorCode == "invalid-action-time" {
            return "Couldn't save because this device's date and time look wrong. Fix them in Settings first."
        }
        if case .acknowledge = lastIntent { return "Couldn't dismiss this notice. Nothing changed on this device." }
        return "Couldn't save your choices. Nothing changed on this device."
    }
    /// Google's Additional Consent only takes effect while TCF purposes 1, 3 and 4 are consented;
    /// the core records every provider as off otherwise. The provider page says so in those
    /// purposes' own names, which is how the person saw them one page back.
    public var providerPrerequisitesMet: Bool { Set([1, 3, 4]).isSubset(of: Set(choices.purposeConsents)) }
    public var providerPrerequisiteNames: [String] { [1, 3, 4].compactMap { disclosure?.list.purposes[$0]?.name } }

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
        snapshot = core.snapshot()
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
    public func loadDraft() {
        guard !pending else { return }
        let current = core.snapshot()
        snapshot = current
        disclosure = core.iabPresentation()
        baseRevision = current.revision
        // No IAB decision yet: no choice at all, or a usable list with no saved IAB decision. A
        // list that can't be edited hides the saved decision, so it never counts as first time.
        choices = disclosure.map { Self.initialChoices($0, firstTime: current.explicitChoice == nil || ($0.canEdit && core.iabConsent() == nil)) } ?? IABChoices()
        categories = Dictionary(uniqueKeysWithValues: (current.consentCategories ?? [.necessary]).compactMap {
            guard let category = OptionalConsentCategory(rawValue: $0.rawValue) else { return nil }
            return (category, current.explicitChoice?.categories[category]?.value ?? false)
        })
        seedCategories = categories
        seedChoices = choices
        errorCode = nil
        failedAction = nil
        stale = false
    }
    /// A first-time user starts with every consent off and legitimate interest not objected to,
    /// as on the web: legitimate interest needs no opt-in, and the user objects with its switch.
    static func initialChoices(_ presentation: IABPresentation, firstTime: Bool) -> IABChoices {
        var choices = presentation.draft.choices
        guard firstTime, choices == IABChoices() else { return choices }
        let claims = presentation.vendors.filter { !$0.value.legitimateInterestPurposes.isEmpty }
        choices.vendorLegitimateInterests = claims.keys.sorted()
        choices.purposeLegitimateInterests = Set(claims.values.flatMap(\.legitimateInterestPurposes)).sorted()
        return choices
    }
    public func setCategory(_ category: OptionalConsentCategory, _ value: Bool) {
        guard !pending, !stale, !isRestricted(category) else { return }
        categories[category] = value
    }
    public func isRestricted(_ category: OptionalConsentCategory) -> Bool {
        let reasons = snapshot.restrictions[category] ?? []
        return reasons.contains(.gpc) || reasons.contains(.strictScope)
    }
    public func edit(_ key: WritableKeyPath<IABChoices, [Int]>, id: Int, enabled: Bool) {
        guard !pending, !stale else { return }
        var values = Set(choices[keyPath: key])
        if enabled { values.insert(id) } else { values.remove(id) }
        choices[keyPath: key] = values.sorted()
    }
    public func editLI(purpose: Bool, id: Int, enabled: Bool) {
        edit(purpose ? \.purposeLegitimateInterests : \.vendorLegitimateInterests, id: id, enabled: enabled)
        edit(purpose ? \.purposeObjections : \.vendorObjections, id: id, enabled: !enabled)
    }
    public func editProvider(id: Int, enabled: Bool) {
        guard !pending, !stale else { return }
        var ids = Set(choices.adTechProviderConsents ?? [])
        if enabled { ids.insert(id) } else { ids.remove(id) }
        choices.adTechProviderConsents = ids.sorted()
    }
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
    public func retry() {
        guard let lastIntent else { return }
        commit(lastIntent)
    }
    public func refresh() {
        guard !pending else { return }
        reloadAfterRefresh = true
        core.refresh()
    }
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
        let authority = core
        let revision = baseRevision
        let categoryDraft = categories
        let iabDraft = choices
        let isIAB = iab
        pending = true
        pendingAction = action
        showProgress = false
        lastIntent = action
        Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(400))
            if let self, self.pending, self.presentationID == session { self.showProgress = true }
        }
        Task { [self] in
            let outcome: (Bool, String?) = await Task.detached(priority: .userInitiated) {
                if case .acknowledge = action { return (authority.dismissNotice(), "queue-write-failed") }
                let intent: CommitIntent
                switch action {
                case .accept: intent = .all
                case .reject: intent = .necessary
                case .save: intent = isIAB ? .iab(iabDraft, categories: categoryDraft) : .custom(categoryDraft)
                case .acknowledge: fatalError("handled above")
                }
                let result = authority.save(intent, expectedRevision: revision)
                return (result.status == .committed, result.error?.code)
            }.value
            pending = false
            pendingAction = nil
            showProgress = false
            guard presentationID == session else { presentIfOwed(); return }
            snapshot = authority.snapshot()
            if outcome.0 {
                errorCode = nil
                failedAction = nil
                if shownPrompt { suppressedPrompt = handled }
                presentationID = nil
                if case .acknowledge = action { onAnnouncement?("Privacy notice acknowledged") }
                else { onAnnouncement?("Privacy choices saved") }
                onOutcome?(.saved)
                // Snapshots that arrived while the commit ran were not acted on; the current one is.
                presentIfOwed()
            } else {
                errorCode = outcome.1 ?? "save-rejected"
                failedAction = action
                stale = errorCode == "concurrent-change"
                onAnnouncement?(stale ? iabCopy.appSettingsChanged : errorMessage ?? "Couldn't save your choices.")
            }
        }
    }
}
