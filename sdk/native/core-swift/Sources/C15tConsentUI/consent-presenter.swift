#if canImport(C15tCore)
import C15tCore
#endif
import Combine
import Foundation

/// The compact outcome delivered to a native host. A dismissal records no decision.
public enum ConsentPresenterOutcome: Sendable { case saved, dismissed }

/// Owns one native presentation and its draft. Keep one instance for the host's lifetime.
/// Storage work runs on a worker; observing and editing are confined to the main actor.
@MainActor
public final class ConsentPresenter: ObservableObject, SnapshotObserver {
    public let core: ConsentCore
    @Published public private(set) var snapshot: ConsentSnapshot
    @Published public private(set) var presentationID: UUID?
    @Published public private(set) var preferences = false
    @Published public private(set) var pending = false
    @Published public private(set) var showProgress = false
    @Published public private(set) var errorCode: String?
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
    private var suppressedPrompt: String?
    private var lastIntent: Action?
    private var reloadAfterRefresh = false
    private let automaticPresentation: Bool

    public enum Action { case accept, reject, save, acknowledge }

    /// Attach to a bootstrapped core. The presenter never installs a second engine.
    /// - Parameter core: Native authority shared by the app's SDK gates.
    public init(core: ConsentCore, automaticPresentation: Bool = true) {
        self.automaticPresentation = automaticPresentation
        self.core = core
        self.snapshot = core.snapshot()
        self.subscription = core.onChange(self)
        receive(core.snapshot())
    }

    deinit { subscription?.cancel() }

    nonisolated public func consentDidChange(_ snapshot: ConsentSnapshot) {
        Task { @MainActor [weak self] in self?.receive(snapshot) }
    }

    private var promptKey: String {
        "\(snapshot.resolution.fingerprint ?? ""):\(snapshot.promptRequirement.kind.rawValue):\(snapshot.promptRequirement.reason?.rawValue ?? "")"
    }

    private func receive(_ next: ConsentSnapshot) {
        guard next.revision >= snapshot.revision else { return }
        let wasPending = snapshot.policyPending
        snapshot = next
        if presentationID != nil, !pending, (!preferences || wasPending && !next.policyPending) { loadDraft() }
        if reloadAfterRefresh, !next.policyPending {
            if !isDirty { loadDraft() }
            reloadAfterRefresh = false
        }
        if automaticPresentation, !next.policyPending, next.promptRequirement.kind == .choice,
           presentationID == nil, suppressedPrompt != promptKey {
            presentationID = UUID()
            preferences = false
            errorCode = nil
            loadDraft()
        }
    }

    public var noticeVisible: Bool {
        !snapshot.policyPending && snapshot.promptRequirement.kind == .notice && presentationID == nil
    }
    public var isDirty: Bool { categories != seedCategories || choices != seedChoices }
    public var iab: Bool { snapshot.model == .iab }
    public var listUnavailable: Bool {
        guard iab else { return false }
        let status = core.iabStatus().availability
        return disclosure == nil || status == .stale || status == .missing || status == .unavailable
            || disclosure?.adTechProviders?.isEmpty == false && core.additionalConsentStatus() == .stale
    }
    public var offeredCategories: [ConsentCategory] { snapshot.consentCategories ?? [.necessary] }
    public var errorMessage: String? {
        guard let errorCode else { return nil }
        return errorCode == "invalid-action-time"
            ? "Couldn't save because this device's date and time look wrong. Fix them in Settings, then try again."
            : "Couldn't save your choices. Nothing changed on this device."
    }

    /// Open standing privacy settings. A pending action keeps its original presentation.
    public func presentPreferences() {
        guard !pending, presentationID == nil else { return }
        presentationID = UUID()
        preferences = true
        fromFirstLayer = false
        loadDraft()
    }
    /// Open an owed choice prompt. Existing sessions keep their identity and draft.
    public func presentPrompt() {
        guard presentationID == nil, !pending else { return }
        snapshot = core.snapshot()
        guard !snapshot.policyPending, snapshot.promptRequirement.kind == .choice else { return }
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
        choices = disclosure?.draft.choices ?? IABChoices()
        categories = Dictionary(uniqueKeysWithValues: (current.consentCategories ?? [.necessary]).compactMap {
            guard let category = OptionalConsentCategory(rawValue: $0.rawValue) else { return nil }
            return (category, current.explicitChoice?.categories[category]?.value ?? false)
        })
        seedCategories = categories
        seedChoices = choices
        errorCode = nil
        stale = false
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
            suppressedPrompt = promptKey
            presentationID = nil
            onOutcome?(.dismissed)
        }
    }
    public func retry() {
        guard let lastIntent else { return }
        commit(lastIntent)
    }
    public func refresh() {
        guard !pending else { return }
        reloadAfterRefresh = !isDirty
        core.refresh()
    }
    /// Commit through native intents. Accept and Reject never build selection loops in UI.
    public func commit(_ action: Action) {
        guard !pending, !stale else { return }
        if case .save = action, !isDirty, snapshot.promptRequirement.kind == .none {
            suppressedPrompt = promptKey
            presentationID = nil
            onOutcome?(.dismissed)
            return
        }
        let session = presentationID
        let authority = core
        let revision = baseRevision
        let categoryDraft = categories
        let iabDraft = choices
        let isIAB = iab
        pending = true
        showProgress = false
        errorCode = nil
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
            showProgress = false
            guard presentationID == session else { return }
            snapshot = authority.snapshot()
            if outcome.0 {
                suppressedPrompt = promptKey
                presentationID = nil
                if case .acknowledge = action { onAnnouncement?("Privacy notice acknowledged") }
                else { onAnnouncement?("Privacy choices saved") }
                onOutcome?(.saved)
            } else {
                errorCode = outcome.1 ?? "save-rejected"
                stale = errorCode == "concurrent-change"
                onAnnouncement?(stale ? "Settings changed while you were editing" : errorMessage ?? "Couldn't save your choices.")
            }
        }
    }
}
