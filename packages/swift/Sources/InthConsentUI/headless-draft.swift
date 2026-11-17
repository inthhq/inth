#if canImport(InthCore)
import InthCore
#endif
import Combine
import Foundation

// The headless consent draft. Foundation and Combine only, so `swift test` on macOS checks it.

/// What a consent control asks the core to record.
public enum ConsentWriteAction: Sendable, Equatable {
    /// Grant everything the policy offers.
    case acceptAll
    /// Deny everything optional, and withdraw every IAB consent.
    case rejectAll
    /// Record the draft as it stands.
    case save
    /// Acknowledge a notice. Records no optional grant.
    case acknowledge
}

/// One category of the resolved policy, ready to place in a row.
public struct ConsentCategoryRow: Identifiable {
    public let category: ConsentCategory
    public let title: String
    public let description: String
    /// The person cannot change it: `necessary`, or a category a restriction such as Global
    /// Privacy Control holds off.
    public let locked: Bool
    /// The state to show in place of a switch when ``locked``.
    public let lockedLabel: String?
    /// Why a locked optional category is off.
    public let note: String?
    /// The staged value. `necessary` is always on.
    public let isOn: Bool
    /// Whether the switch takes input now. `false` while a save runs, while the draft is stale,
    /// and while an IAB vendor list cannot be edited.
    public let isEnabled: Bool
    let change: @MainActor (Bool) -> Void

    public var id: ConsentCategory { category }

    /// Stage a new value. Ignored for a locked category.
    /// - Parameter value: `true` to grant the category.
    @MainActor public func set(_ value: Bool) { change(value) }
}

/// A consent draft for an app-owned screen: the staged category and IAB choices, the save with
/// its revision check, and the copy to show. It draws nothing.
///
/// Edits stay in the draft until ``save(_:onResult:)``. A save names the snapshot revision the
/// draft was read at, so the core refuses it when another screen recorded a decision meanwhile.
/// The draft then turns ``isStale`` and takes no more edits or saves until ``reset()``. A storage
/// failure keeps the edits and sets ``errorMessage``; ``retry(onResult:)`` sends the same action
/// again.
///
/// While the draft has no edits and shows no error it follows the saved record.
///
/// Hold it with `@StateObject` in SwiftUI, or keep it on the object that owns your screen.
@MainActor
public final class ConsentDraft: ObservableObject {
    /// The installed core this draft reads and writes.
    public let core: ConsentCore
    /// The snapshot the draft last read.
    @Published public private(set) var snapshot: ConsentSnapshot
    /// A save is running. Disable your controls and do not close the screen.
    @Published public private(set) var isSaving = false
    /// The action being saved while ``isSaving``, so only its control shows progress.
    @Published public private(set) var savingAction: ConsentWriteAction?
    /// `true` once a save has run long enough to deserve a progress indicator.
    @Published public private(set) var showProgress = false
    /// The core's code for the last refused save, such as `concurrent-change`.
    @Published public private(set) var errorCode: String?
    /// The action behind ``errorCode``.
    @Published public private(set) var failedAction: ConsentWriteAction?
    /// Another screen recorded a decision under this draft. Call ``reset()`` and let the person
    /// review again.
    @Published public private(set) var isStale = false
    /// The staged value of each optional category in scope.
    @Published public private(set) var categoryChoices: [OptionalConsentCategory: Bool] = [:]
    /// The staged IAB selection. Empty outside an IAB policy.
    @Published public private(set) var choices = IABChoices()
    /// The core's IAB disclosure, read with the draft. `nil` outside an IAB policy or before a
    /// list loads.
    @Published public private(set) var disclosure: IABPresentation?
    /// The last message a screen reader should hear. ``announcements`` sends each one.
    public private(set) var announcement = ""
    /// Called with each message a screen reader should hear: a save result or an error.
    public var onAnnouncement: ((String) -> Void)?
    /// Each message a screen reader should hear, as it happens. The prompt and preferences
    /// blocks speak these for you.
    public var announcements: AnyPublisher<String, Never> { announcementSubject.eraseToAnyPublisher() }

    private let announcementSubject = PassthroughSubject<String, Never>()
    private var subscription: ConsentSubscription?
    private var baseRevision = 0
    private var seedCategories: [OptionalConsentCategory: Bool] = [:]
    private var seedChoices = IABChoices()
    private var lastAction: ConsentWriteAction?
    private var reloadAfterRefresh = false
    private var commitNumber = 0

    /// Whether a clean draft reloads for a new snapshot. The stock presenter narrows it to an
    /// open session. `nil` follows the record whenever no error is shown.
    var follows: ((_ wasPolicyPending: Bool, _ next: ConsentSnapshot) -> Bool)?
    /// Called after each snapshot is applied.
    var onReceived: (() -> Void)?

    /// Follow `core` and read its saved record.
    /// - Parameter core: The installed core. The draft never installs one.
    public convenience init(core: ConsentCore) { self.init(core: core, load: true) }

    /// - Parameter load: `false` leaves the draft empty until ``reset()``. The stock presenter
    ///   reads the disclosure when a session opens, not at launch.
    init(core: ConsentCore, load: Bool) {
        self.core = core
        self.snapshot = core.snapshot()
        // Weak, because the handle owns this closure and the draft owns the handle.
        self.subscription = core.onChange { [weak self] snapshot in
            Task { @MainActor [weak self] in self?.receive(snapshot) }
        }
        if load { reset() }
    }

    deinit { subscription?.cancel() }

    /// Whether the resolved policy is IAB TCF.
    public var isIAB: Bool { snapshot.model == .iab }
    /// The core has a resolved policy. Until then show a loading state, not controls.
    public var isReady: Bool { snapshot.ready && !snapshot.policyPending }
    /// Whether the draft differs from what it was read as.
    public var isDirty: Bool { categoryChoices != seedCategories || choices != seedChoices }
    /// The IAB vendor list or a required Additional Consent list cannot back a new decision now:
    /// stale, missing or offline. Show the saved decision, call ``refresh()`` and offer controls
    /// again once this turns `false`.
    public var listUnavailable: Bool {
        guard isIAB else { return false }
        let status = core.iabStatus().availability
        return disclosure?.canEdit != true || status == .stale || status == .missing || status == .unavailable
            || disclosure?.adTechProviders?.isEmpty == false && core.additionalConsentStatus() == .stale
    }
    /// Whether a control takes input now.
    public var isEditable: Bool { !isSaving && !isStale && !listUnavailable }

    /// The language every label is shown in. IAB mode follows the served list, English until it
    /// loads; category mode follows the policy's translation language.
    public var language: String { isIAB ? disclosure?.language ?? "en" : snapshot.overrides.language }
    /// Category-mode copy in ``language``.
    public var copy: ConsentCopy { ConsentCopy.forLanguage(language) }
    /// IAB copy in ``language``.
    public var iabCopy: IABCopy { IABCopy.forLanguage(language) }

    /// Button labels: the IAB copy in IAB mode, the category-mode copy otherwise.
    var decisionLabels: DecisionLabels {
        isIAB && disclosure != nil ? DecisionLabels(copy: iabCopy) : DecisionLabels(copy: copy)
    }

    /// Why the prompt is back, when a choice expired or the policy changed.
    var promptReason: String? {
        switch snapshot.promptRequirement.reason {
        case .expired: return copy.choiceExpired
        case .policyChanged: return copy.policyChanged
        case .missing, nil: return nil
        }
    }

    /// The categories the resolved policy puts in scope, `necessary` first.
    public var displayedCategories: [ConsentCategory] { snapshot.consentCategories ?? [.necessary] }

    /// One row per displayed category, with its copy, lock and switch.
    public var categories: [ConsentCategoryRow] { displayedCategories.map { category($0) } }

    /// The row for one category.
    /// - Parameter category: A category, in scope or not.
    /// - Returns: Its copy, lock and staged value.
    public func category(_ category: ConsentCategory) -> ConsentCategoryRow {
        let text = copy
        let title: String
        let description: String
        switch category {
        case .necessary: (title, description) = (text.necessaryTitle, text.necessaryDescription)
        case .functionality: (title, description) = (text.functionalityTitle, text.functionalityDescription)
        case .experience: (title, description) = (text.experienceTitle, text.experienceDescription)
        case .measurement: (title, description) = (text.measurementTitle, text.measurementDescription)
        case .marketing: (title, description) = (text.marketingTitle, text.marketingDescription)
        }
        let optional = OptionalConsentCategory(rawValue: category.rawValue)
        let locked = optional.map { isRestricted($0) } ?? true
        let gpc = optional.map { snapshot.restrictions[$0]?.contains(.gpc) == true } ?? false
        return ConsentCategoryRow(
            category: category, title: title, description: description, locked: locked,
            lockedLabel: !locked ? nil : optional == nil ? iabCopy.appAlwaysOn : iabCopy.appOff,
            note: locked && optional != nil ? (gpc ? text.restrictedByGpc : text.notOffered) : nil,
            isOn: optional.map { categoryChoices[$0] ?? false } ?? true,
            isEnabled: !locked && isEditable,
            change: { [weak self] value in
                if let optional { self?.setCategory(optional, value) }
            })
    }

    /// A restriction such as Global Privacy Control or a strict scope holds this category off.
    public func isRestricted(_ category: OptionalConsentCategory) -> Bool {
        let reasons = snapshot.restrictions[category] ?? []
        return reasons.contains(.gpc) || reasons.contains(.strictScope)
    }

    /// Stage one category. Ignored while saving, while stale, and for a restricted category.
    public func setCategory(_ category: OptionalConsentCategory, _ value: Bool) {
        guard !isSaving, !isStale, !isRestricted(category) else { return }
        categoryChoices[category] = value
    }

    /// Stage a change to the IAB selection. Ignored while saving or stale.
    /// - Parameter transform: Changes the selection in place.
    public func edit(_ transform: (inout IABChoices) -> Void) {
        guard !isSaving, !isStale else { return }
        var next = choices
        transform(&next)
        choices = next
    }

    /// Add `id` to one list of the selection, or take it out. The list stays sorted and unique.
    func select<ID: Hashable & Comparable>(_ key: WritableKeyPath<IABChoices, [ID]>, id: ID, enabled: Bool) {
        edit { Self.select(&$0[keyPath: key], id: id, enabled: enabled) }
    }

    /// Grant or withdraw a Google Additional Consent provider.
    func selectProvider(id: Int, enabled: Bool) {
        edit {
            var ids = $0.adTechProviderConsents ?? []
            Self.select(&ids, id: id, enabled: enabled)
            $0.adTechProviderConsents = ids
        }
    }

    /// Set legitimate interest for a purpose or a registered vendor. Turning it off records the
    /// objection; turning it on withdraws the objection. Purposes 1 and 3 to 6 never allow
    /// legitimate interest, so turning one on is ignored.
    func setLegitimateInterest(purpose: Bool, id: Int, enabled: Bool) {
        if purpose, enabled, customNeverLI.contains(id) { return }
        let interests: WritableKeyPath<IABChoices, [Int]> = purpose ? \.purposeLegitimateInterests : \.vendorLegitimateInterests
        let objections: WritableKeyPath<IABChoices, [Int]> = purpose ? \.purposeObjections : \.vendorObjections
        edit {
            Self.select(&$0[keyPath: interests], id: id, enabled: enabled)
            Self.select(&$0[keyPath: objections], id: id, enabled: !enabled)
        }
    }

    private static func select<ID: Hashable & Comparable>(_ values: inout [ID], id: ID, enabled: Bool) {
        var set = Set(values)
        if enabled { set.insert(id) } else { set.remove(id) }
        values = set.sorted()
    }

    /// Stage what Accept all saves: every displayed category, and under IAB the core's own
    /// projection of every live partner's bases. Saves nothing; call ``save(_:onResult:)``.
    public func acceptAll() {
        guard !isSaving, !isStale else { return }
        categoryChoices = Dictionary(uniqueKeysWithValues: categoryChoices.keys.map { ($0, !isRestricted($0)) })
        if isIAB, let all = core.iabAcceptAllChoices() { choices = all }
    }

    /// Stage a denial for every category and withdrawal of every IAB consent. Legitimate interest
    /// stays as it was; the person objects to it per purpose or vendor. Saves nothing; call
    /// ``save(_:onResult:)``.
    public func rejectAll() {
        guard !isSaving, !isStale else { return }
        categoryChoices = categoryChoices.mapValues { _ in false }
        guard isIAB else { return }
        var next = choices
        next.adTechProviderConsents = next.adTechProviderConsents.map { _ in [] }
        next.customVendorConsents = []
        next.publisherConsents = []
        next.publisherCustomConsents = []
        next.purposeConsents = []
        next.specialFeatureOptIns = []
        next.vendorConsents = []
        choices = next
    }

    /// Drop staged edits and read the saved record again. Clears ``isStale`` and the error.
    public func reset() {
        guard !isSaving else { return }
        // `@Published` announces every assignment, equal or not, and each announcement
        // re-renders every observing view, so state is assigned only when it differs.
        let current = core.snapshot()
        if snapshot != current { snapshot = current }
        // `IABPresentation` is not `Equatable`; only nil-to-nil is known to be no change.
        let presentation = core.iabPresentation()
        if disclosure != nil || presentation != nil { disclosure = presentation }
        baseRevision = current.revision
        // No IAB decision yet: no choice at all, or a usable list with no saved IAB decision. A
        // list that can't be edited hides the saved decision, so it never counts as first time.
        let nextChoices = presentation.map {
            Self.initialChoices($0, firstTime: current.explicitChoice == nil || ($0.canEdit && core.iabConsent() == nil))
        } ?? IABChoices()
        if choices != nextChoices { choices = nextChoices }
        let nextCategories = Dictionary(uniqueKeysWithValues: (current.consentCategories ?? [.necessary]).compactMap { entry -> (OptionalConsentCategory, Bool)? in
            guard let category = OptionalConsentCategory(rawValue: entry.rawValue) else { return nil }
            return (category, current.explicitChoice?.categories[category]?.value ?? false)
        })
        if categoryChoices != nextCategories { categoryChoices = nextCategories }
        seedCategories = categoryChoices
        seedChoices = choices
        if errorCode != nil { errorCode = nil }
        if failedAction != nil { failedAction = nil }
        if isStale { isStale = false }
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

    /// What the last refused save means for the person. It stays set while a retry runs, so your
    /// layout does not move under the thumb, and clears on success or ``reset()``.
    public var errorMessage: String? {
        guard let errorCode else { return nil }
        if errorCode == "invalid-action-time" { return copy.actionTimeInvalid }
        // The vendor list or the provider list went stale: retrying cannot help, refreshing can.
        if errorCode == "iab-list-stale" || errorCode.hasPrefix("additional-consent-") { return iabCopy.appListOutdated }
        if lastAction == .acknowledge { return copy.dismissFailed }
        return copy.saveFailed
    }

    /// Send the last action again after a refused save.
    /// - Parameter onResult: Called on the main actor once the save settles.
    public func retry(onResult: @escaping (Bool) -> Void = { _ in }) {
        guard let lastAction else { return }
        save(lastAction, onResult: onResult)
    }

    /// Ask the backend for the current policy and vendor list. The draft reloads when it lands,
    /// or turns stale if it has edits.
    public func refresh() {
        guard !isSaving else { return }
        reloadAfterRefresh = true
        core.refresh()
    }

    /// Record `action` and report whether it is stored on this device.
    ///
    /// `true` means durable local success, not backend delivery. `false` leaves the draft as it
    /// was with ``errorCode`` set; a `concurrent-change` also sets ``isStale``. A `.save` with no
    /// edits and nothing owed writes nothing and reports `true`. A call while a save runs or the
    /// draft is stale is ignored and `onResult` is not called.
    ///
    /// - Parameters:
    ///   - action: What to record.
    ///   - onResult: Called on the main actor once the save settles. Close your screen on `true`.
    public func save(_ action: ConsentWriteAction = .save, onResult: @escaping (Bool) -> Void = { _ in }) {
        guard !isSaving, !isStale else { return }
        if action == .save, !isDirty, snapshot.promptRequirement.kind == .none {
            onResult(true)
            return
        }
        commit(action) { [self] ok, message in
            // Spoken before the screen is told, so a screen that closes on success still says it.
            announce(message)
            if ok { reset() }
            onResult(ok)
        }
    }

    /// Record `action` and wait for the result.
    /// - Parameter action: What to record.
    /// - Returns: `true` once the decision is stored on this device. `false` for a refused save,
    ///   and for a call while another save runs or the draft is stale.
    @discardableResult
    public func save(_ action: ConsentWriteAction = .save) async -> Bool {
        guard !isSaving, !isStale else { return false }
        return await withCheckedContinuation { continuation in
            save(action, onResult: { continuation.resume(returning: $0) })
        }
    }

    /// Run the commit without reseeding. `settled` gets the result and the message a screen
    /// reader should hear, and decides when to send it.
    func commit(_ action: ConsentWriteAction, settled: @escaping (Bool, String) -> Void) {
        let authority = core
        let revision = baseRevision
        let categoryDraft = categoryChoices
        let iabDraft = choices
        let isIAB = self.isIAB
        isSaving = true
        savingAction = action
        showProgress = false
        lastAction = action
        commitNumber += 1
        let number = commitNumber
        Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(400))
            if let self, self.isSaving, self.commitNumber == number { self.showProgress = true }
        }
        Task { [self] in
            let outcome: (Bool, String?) = await Task.detached(priority: .userInitiated) {
                let intent: CommitIntent
                switch action {
                case .acknowledge: return (authority.dismissNotice(), "queue-write-failed")
                case .acceptAll: intent = .all
                case .rejectAll: intent = .necessary
                case .save: intent = isIAB ? .iab(iabDraft, categories: categoryDraft) : .custom(categoryDraft)
                }
                let result = authority.save(intent, expectedRevision: revision)
                return (result.status == .committed, result.error?.code)
            }.value
            isSaving = false
            savingAction = nil
            showProgress = false
            snapshot = authority.snapshot()
            let message: String
            if outcome.0 {
                errorCode = nil
                failedAction = nil
                message = action == .acknowledge ? copy.noticeAcknowledged : copy.choicesSaved
            } else {
                errorCode = outcome.1 ?? "save-rejected"
                failedAction = action
                isStale = errorCode == "concurrent-change"
                message = isStale ? iabCopy.appSettingsChanged : errorMessage ?? copy.saveFailed
            }
            settled(outcome.0, message)
        }
    }

    /// Send one message to the screen reader hooks.
    func announce(_ message: String) {
        announcement = message
        onAnnouncement?(message)
        announcementSubject.send(message)
        announcers.last?.speak(message)
    }

    /// Who speaks a save result. Each block on screen registers one and only the newest is
    /// called, so a message is spoken once however many blocks share the draft.
    private var announcers: [(id: UUID, speak: (String) -> Void)] = []

    /// Register a speaker for save results.
    /// - Returns: The token to pass to ``removeAnnouncer(_:)``.
    func addAnnouncer(_ speak: @escaping (String) -> Void) -> UUID {
        let id = UUID()
        announcers.append((id, speak))
        return id
    }

    func removeAnnouncer(_ id: UUID) { announcers.removeAll { $0.id == id } }

    /// Apply a published snapshot.
    func receive(_ next: ConsentSnapshot) {
        guard next.revision >= snapshot.revision else { return }
        let wasPending = snapshot.policyPending
        // The draft was already loaded from exactly this snapshot, so reloading it
        // would rebuild the same disclosure and seeds.
        let draftCurrent = next == snapshot && baseRevision == next.revision
        if snapshot != next { snapshot = next }
        if !isSaving, !isDirty, !draftCurrent, follows?(wasPending, next) ?? (errorCode == nil) { reset() }
        if reloadAfterRefresh, !next.policyPending {
            if isDirty {
                disclosure = core.iabPresentation()
                isStale = next.revision != baseRevision
            } else { reset() }
            reloadAfterRefresh = listUnavailable
        }
        onReceived?()
    }

    /// Read the core's snapshot now, outside a change notification.
    func sync() { snapshot = core.snapshot() }

    /// "Last changed" with the date in the copy's language, not the device's.
    /// - Parameter epochMs: When the choice was made, in milliseconds since 1970.
    public func lastChanged(at epochMs: Int64) -> String {
        let copy = iabCopy
        let date = Date(timeIntervalSince1970: Double(epochMs) / 1000)
            .formatted(Date.FormatStyle(date: .abbreviated, time: .omitted).locale(Locale(identifier: copy.language)))
        return copy.format(copy.appLastChanged, ["date": date])
    }

    /// When the saved choice was last changed, as a sentence, or `nil` before one exists.
    public var lastChanged: String? {
        snapshot.explicitChoice?.categories.values.map(\.confirmedAt).max().map { lastChanged(at: $0) }
    }
}
