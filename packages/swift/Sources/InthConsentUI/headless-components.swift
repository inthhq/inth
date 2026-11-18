#if canImport(InthCore)
import InthCore
#endif
import Combine
import Foundation

// The headless consent blocks. They carry behaviour and no look: when a prompt is owed, the copy
// to place, the actions to wire and the accessibility an app-owned screen would otherwise miss.
// The two scopes need no UI framework, so `swift test` checks them everywhere. The views follow
// under `canImport(SwiftUI)`.

/// What ``HeadlessConsentPrompt`` hands your first layer: the copy to place and the actions to wire.
@MainActor
public struct ConsentPromptScope {
    /// The draft the prompt acts on.
    public let draft: ConsentDraft
    /// The policy owes a notice to acknowledge, not a consent choice.
    public let isNotice: Bool
    private let onOpenPreferences: () -> Void

    /// The scope for the prompt `draft`'s policy owes now, or `nil` when nothing is owed or the
    /// core has no resolved policy yet.
    init?(draft: ConsentDraft, onOpenPreferences: @escaping () -> Void) {
        let kind = draft.snapshot.promptRequirement.kind
        guard draft.isReady, kind != .none else { return nil }
        self.draft = draft
        self.isNotice = kind == .notice
        self.onOpenPreferences = onOpenPreferences
    }

    private var copy: ConsentCopy { draft.copy }

    /// Why the prompt is back, when a choice expired or the policy changed.
    public var reason: String? { draft.promptReason }
    public var title: String { isNotice ? copy.noticeTitle : copy.headline }
    public var description: String { isNotice ? copy.noticeDescription : copy.introduction }
    /// A second sentence for a category choice. `nil` for a notice and under IAB, where ``iab``
    /// replaces it.
    public var detail: String? { !isNotice && !draft.isIAB ? copy.firstLayerDescription : nil }
    /// The IAB first layer's required text under a TCF policy. Render all of it.
    public var iab: IABFirstLayerContent? { isNotice ? nil : draft.iab?.firstLayer }
    public var acceptAllLabel: String { draft.decisionLabels.acceptAll }
    public var rejectAllLabel: String { draft.decisionLabels.rejectAll }
    public var customizeLabel: String { isNotice ? copy.privacySettings : draft.decisionLabels.customize }
    public var acknowledgeLabel: String { copy.acknowledge }
    public var privacyPolicyLabel: String { draft.iabCopy.preferenceCenterVendorListPrivacyPolicy }

    /// The IAB vendor list cannot back a new grant now. Show ``listOutdated`` with a control
    /// wired to ``refresh()``, keep Reject all, and leave Accept all out, as the stock first
    /// layer does.
    public var listUnavailable: Bool { !isNotice && draft.listUnavailable }
    public var listOutdated: String { draft.iabCopy.appListOutdated }
    /// Fetch the policy and vendor list again.
    public func refresh() { draft.refresh() }
    /// A decision landed elsewhere after this prompt read the record, so its actions do nothing
    /// now. Show `iabCopy.appSettingsChanged` with a control wired to ``reload()``.
    public var isStale: Bool { draft.isStale }
    /// Read the current record again, so the actions work.
    public func reload() { draft.reset() }

    /// Grant everything in one tap. Ignored while ``listUnavailable``.
    public func acceptAll() {
        if !listUnavailable { draft.save(.acceptAll, onResult: { _ in }) }
    }
    /// Deny everything optional in one tap. Under IAB every consent signal goes off.
    public func rejectAll() { draft.save(.rejectAll, onResult: { _ in }) }
    /// Acknowledge a notice. Records no optional grant.
    public func acknowledge() { draft.save(.acknowledge, onResult: { _ in }) }
    /// Open your preferences screen. Ignored while a save runs.
    public func openPreferences() {
        if !draft.isSaving { onOpenPreferences() }
    }
}

/// What ``HeadlessConsentPreferences`` hands your preferences screen.
///
/// The labels here are the ones that differ between a category policy and IAB. Every other
/// string is a value on ``ConsentDraft/copy`` or ``ConsentDraft/iabCopy``, such as
/// `iabCopy.appClose`, `iabCopy.appTryAgain` and `copy.saving`.
@MainActor
public final class ConsentPreferencesScope: ObservableObject {
    /// The draft the screen edits.
    public let draft: ConsentDraft
    /// The person tried to leave with unsaved edits. Show your own confirmation with
    /// `iabCopy.appDiscardChangesTitle`, `appDiscardChangesDetail`, `appDiscardChanges` and
    /// `appKeepEditing`.
    @Published public private(set) var confirmDiscard = false
    var onClose: () -> Void

    init(draft: ConsentDraft, onClose: @escaping () -> Void) {
        self.draft = draft
        self.onClose = onClose
    }

    /// One row per category in scope.
    public var categories: [ConsentCategoryRow] { draft.categories }
    /// The IAB selection and disclosure. `nil` outside a TCF policy.
    public var iab: IABDraftHandle? { draft.iab }
    public var title: String { draft.isIAB ? draft.iabCopy.preferenceCenterTitle : draft.copy.privacySettings }
    public var description: String { draft.isIAB ? draft.iabCopy.appPreferencesIntro : draft.copy.preferencesDescription }
    public var saveLabel: String { draft.decisionLabels.save }
    public var acceptAllLabel: String { draft.decisionLabels.acceptAll }
    public var rejectAllLabel: String { draft.decisionLabels.rejectAll }
    /// When the saved choice was last changed, or `nil` before one exists.
    public var lastChanged: String? { draft.lastChanged }

    /// Save the draft and close on success. A refused save keeps the screen open with the error set.
    public func save() { commit(.save) }
    /// Grant everything and close on success.
    public func acceptAll() { commit(.acceptAll) }
    /// Deny everything optional and close on success.
    public func rejectAll() { commit(.rejectAll) }
    /// Send the refused action again, and close on success.
    public func retry() {
        draft.retry { [weak self] saved in
            if saved { self?.onClose() }
        }
    }
    /// Leave. With unsaved edits this sets ``confirmDiscard`` and stays. Ignored while a save runs.
    public func requestClose() {
        guard !draft.isSaving else { return }
        if draft.isDirty { confirmDiscard = true } else { onClose() }
    }
    /// Drop the edits and leave.
    public func discard() {
        confirmDiscard = false
        draft.reset()
        onClose()
    }
    /// Stay on the screen with the edits.
    public func keepEditing() { confirmDiscard = false }

    private func commit(_ action: ConsentWriteAction) {
        draft.save(action) { [weak self] saved in
            if saved { self?.onClose() }
        }
    }
}

#if canImport(SwiftUI)
import SwiftUI
#if canImport(UIKit) && !os(watchOS)
import UIKit
#endif

/// The installed core, for blocks that are not handed one.
private func installedCore() -> ConsentCore {
    guard let core = Inth.current else {
        preconditionFailure("Install Inth before using the headless consent blocks")
    }
    return core
}

/// Shows its content only while the committed decision allows it, and the fallback otherwise.
/// An unresolved policy counts as not allowed, so nothing gated starts on a cold launch. It
/// reads the saved decision, never a draft, and follows every consent change.
///
/// Install Inth before a gate is built, or pass `core`. A gate with neither stops the app.
///
/// ```swift
/// ConsentGate(.marketing) { AdBanner() } fallback: { AdPlaceholder() }
/// ConsentGate(vendorId: 755, purposeId: 1) { GoogleAds() }
/// ConsentGate(allowed: { $0.isCustomVendorAllowed("internal-ads") }) { HouseAds() }
/// ```
@MainActor
public struct ConsentGate<Content: View, Fallback: View>: View {
    /// Publishes each revision, so the gate is evaluated again on every consent change.
    @StateObject private var consent: PublishedConsent
    private let core: ConsentCore
    private let allowed: (ConsentCore) -> Bool
    private let content: () -> Content
    private let fallback: () -> Fallback

    /// Gate on what the other initializers do not name: a purpose alone, a custom partner, or an
    /// Additional Consent provider.
    /// - Parameters:
    ///   - allowed: Runs against the core on every consent change.
    ///   - core: The core to follow. Defaults to the one the app installed.
    ///   - content: Shown while `allowed` holds.
    ///   - fallback: Shown otherwise.
    public init(
        allowed: @escaping (ConsentCore) -> Bool, core: ConsentCore? = nil,
        @ViewBuilder content: @escaping () -> Content, @ViewBuilder fallback: @escaping () -> Fallback
    ) {
        let core = core ?? installedCore()
        _consent = StateObject(wrappedValue: PublishedConsent(core: core))
        self.core = core
        self.allowed = allowed
        self.content = content
        self.fallback = fallback
    }

    /// Gate on one category.
    /// - Parameters:
    ///   - category: The category the content needs.
    ///   - core: The core to follow. Defaults to the one the app installed.
    ///   - content: Shown while the category is allowed.
    ///   - fallback: Shown otherwise.
    public init(
        _ category: ConsentCategory, core: ConsentCore? = nil,
        @ViewBuilder content: @escaping () -> Content, @ViewBuilder fallback: @escaping () -> Fallback
    ) {
        self.init(allowed: { $0.isAllowed(category) }, core: core, content: content, fallback: fallback)
    }

    /// Gate on the committed IAB decision for one vendor and purpose.
    /// - Parameters:
    ///   - vendorId: The vendor's id in the Global Vendor List.
    ///   - purposeId: The TCF purpose the vendor needs.
    ///   - basis: The legal basis to check.
    ///   - core: The core to follow. Defaults to the one the app installed.
    ///   - content: Shown while the vendor may use the purpose.
    ///   - fallback: Shown otherwise.
    public init(
        vendorId: Int, purposeId: Int, basis: IABLegalBasis = .consent, core: ConsentCore? = nil,
        @ViewBuilder content: @escaping () -> Content, @ViewBuilder fallback: @escaping () -> Fallback
    ) {
        self.init(allowed: { $0.isIABAllowed(vendorId: vendorId, purposeId: purposeId, basis: basis) },
            core: core, content: content, fallback: fallback)
    }

    /// Whether the committed decision allows the content now.
    var isAllowed: Bool { allowed(core) }

    public var body: some View {
        if isAllowed { content() } else { fallback() }
    }
}

public extension ConsentGate where Fallback == EmptyView {
    /// Gate with nothing shown while not allowed. See ``init(allowed:core:content:fallback:)``.
    init(allowed: @escaping (ConsentCore) -> Bool, core: ConsentCore? = nil, @ViewBuilder content: @escaping () -> Content) {
        self.init(allowed: allowed, core: core, content: content, fallback: { EmptyView() })
    }

    /// Gate on one category with nothing shown while not allowed.
    init(_ category: ConsentCategory, core: ConsentCore? = nil, @ViewBuilder content: @escaping () -> Content) {
        self.init(category, core: core, content: content, fallback: { EmptyView() })
    }

    /// Gate on one vendor and purpose with nothing shown while not allowed.
    init(
        vendorId: Int, purposeId: Int, basis: IABLegalBasis = .consent, core: ConsentCore? = nil,
        @ViewBuilder content: @escaping () -> Content
    ) {
        self.init(vendorId: vendorId, purposeId: purposeId, basis: basis, core: core, content: content, fallback: { EmptyView() })
    }
}

/// Shows its content once the core has a resolved policy, and the fallback until then.
@MainActor
public struct ConsentReady<Content: View, Fallback: View>: View {
    @StateObject private var consent: PublishedConsent
    private let content: () -> Content
    private let fallback: () -> Fallback

    /// - Parameters:
    ///   - core: The core to follow. Defaults to the one the app installed.
    ///   - content: Shown once a policy is resolved.
    ///   - fallback: Shown until then.
    public init(
        core: ConsentCore? = nil,
        @ViewBuilder content: @escaping () -> Content, @ViewBuilder fallback: @escaping () -> Fallback
    ) {
        let core = core ?? installedCore()
        _consent = StateObject(wrappedValue: PublishedConsent(core: core))
        self.content = content
        self.fallback = fallback
    }

    public var body: some View {
        if consent.isReady { content() } else { fallback() }
    }
}

public extension ConsentReady where Fallback == EmptyView {
    /// Show nothing until a policy is resolved.
    init(core: ConsentCore? = nil, @ViewBuilder content: @escaping () -> Content) {
        self.init(core: core, content: content, fallback: { EmptyView() })
    }
}

/// Your first-layer prompt, shown only while the resolved policy owes one.
///
/// The block decides when, supplies copy and actions through ``ConsentPromptScope``, sends save
/// results and errors to VoiceOver, and blocks interactive dismissal while a save runs and on an
/// IAB first layer, which waits for a decision. Layout, type and motion are yours.
///
/// ```swift
/// @StateObject private var draft = ConsentDraft(core: core)
///
/// HeadlessConsentPrompt(draft: draft, onOpenPreferences: { showPreferences = true }) { prompt in
///     MyBanner(title: prompt.title, onAccept: prompt.acceptAll, onReject: prompt.rejectAll)
/// }
/// ```
@MainActor
public struct HeadlessConsentPrompt<Content: View, Fallback: View>: View {
    @ObservedObject private var draft: ConsentDraft
    private let onOpenPreferences: () -> Void
    private let fallback: () -> Fallback
    private let content: (ConsentPromptScope) -> Content

    /// - Parameters:
    ///   - draft: The draft the prompt acts on.
    ///   - onOpenPreferences: Show your preferences screen. ``ConsentPromptScope/openPreferences()`` calls it.
    ///   - fallback: Shown when nothing is owed.
    ///   - content: Your prompt, built from the scope.
    public init(
        draft: ConsentDraft, onOpenPreferences: @escaping () -> Void,
        @ViewBuilder fallback: @escaping () -> Fallback,
        @ViewBuilder content: @escaping (ConsentPromptScope) -> Content
    ) {
        self.draft = draft
        self.onOpenPreferences = onOpenPreferences
        self.fallback = fallback
        self.content = content
    }

    public var body: some View {
        let scope = ConsentPromptScope(draft: draft, onOpenPreferences: onOpenPreferences)
        Group {
            if let scope { content(scope) } else { fallback() }
        }
        .consentAnnouncements(draft)
        .interactiveDismissDisabled(scope.map { draft.isSaving || draft.isIAB && !$0.isNotice } ?? false)
    }
}

public extension HeadlessConsentPrompt where Fallback == EmptyView {
    /// A prompt with nothing shown when none is owed.
    init(
        draft: ConsentDraft, onOpenPreferences: @escaping () -> Void,
        @ViewBuilder content: @escaping (ConsentPromptScope) -> Content
    ) {
        self.init(draft: draft, onOpenPreferences: onOpenPreferences, fallback: { EmptyView() }, content: content)
    }
}

/// Your preferences screen. Put it in the view tree while the screen is open.
///
/// The block reads the saved record when it opens, blocks interactive dismissal while a save
/// runs or the draft has unsaved edits, closes after a successful save, and sends save results
/// and errors to VoiceOver. Route your own close control through
/// ``ConsentPreferencesScope/requestClose()`` so unsaved edits ask first. Put
/// `consentPane(_:)` on your root and `consentInitialFocus()` on the first control.
///
/// ```swift
/// .sheet(isPresented: $showPreferences) {
///     HeadlessConsentPreferences(draft: draft, onClose: { showPreferences = false }) { preferences in
///         ForEach(preferences.categories) { row in MySwitchRow(row.title, isOn: row.binding) }
///         Button(preferences.saveLabel, action: preferences.save)
///     }
/// }
/// ```
@MainActor
public struct HeadlessConsentPreferences<Content: View>: View {
    private let draft: ConsentDraft
    private let onClose: () -> Void
    private let content: (ConsentPreferencesScope) -> Content

    /// - Parameters:
    ///   - draft: The draft the screen edits.
    ///   - onClose: Hide your screen.
    ///   - content: Your screen, built from the scope.
    public init(
        draft: ConsentDraft, onClose: @escaping () -> Void,
        @ViewBuilder content: @escaping (ConsentPreferencesScope) -> Content
    ) {
        self.draft = draft
        self.onClose = onClose
        self.content = content
    }

    public var body: some View {
        // A different draft is a different screen: its scope must not outlive the draft it edits.
        ConsentPreferencesHost(draft: draft, onClose: onClose, content: content).id(ObjectIdentifier(draft))
    }
}

/// Holds the scope for one draft.
private struct ConsentPreferencesHost<Content: View>: View {
    @ObservedObject var draft: ConsentDraft
    @StateObject private var scope: ConsentPreferencesScope
    let onClose: () -> Void
    let content: (ConsentPreferencesScope) -> Content

    init(draft: ConsentDraft, onClose: @escaping () -> Void, content: @escaping (ConsentPreferencesScope) -> Content) {
        self.draft = draft
        _scope = StateObject(wrappedValue: ConsentPreferencesScope(draft: draft, onClose: onClose))
        self.onClose = onClose
        self.content = content
    }

    var body: some View {
        // Not published, so setting it here redraws nothing. A caller's newer closure must win.
        let _ = scope.onClose = onClose
        content(scope)
            .consentAnnouncements(draft)
            .interactiveDismissDisabled(draft.isSaving || draft.isDirty)
            // The VoiceOver escape gesture leaves through the same discard check as your close control.
            .accessibilityAction(.escape) { scope.requestClose() }
            .onAppear {
                scope.onClose = onClose
                // A draft left clean by an earlier visit shows the record as it is now.
                if !draft.isDirty { draft.reset() }
            }
    }
}

public extension ConsentCategoryRow {
    /// The row's switch as a binding, for `Toggle` or your own control.
    @MainActor var binding: Binding<Bool> {
        Binding(get: { isOn }, set: { set($0) })
    }
}

/// Speaks a draft's save results and errors through VoiceOver.
@MainActor
private struct ConsentAnnouncements: ViewModifier {
    let draft: ConsentDraft
    /// The draft this view speaks for now, and its token there.
    @State private var registration: (draft: ConsentDraft, token: UUID)?
    func body(content: Content) -> some View {
        content
            .onAppear { bind(draft) }
            // A parent can hand the same view a different draft. Speak for the new one.
            .onChange(of: ObjectIdentifier(draft)) { _ in bind(draft) }
            .onDisappear { unbind() }
    }

    private func bind(_ next: ConsentDraft) {
        if let registration, registration.draft === next { return }
        unbind()
        let token = next.addAnnouncer { message in
            guard !message.isEmpty else { return }
            #if canImport(UIKit) && !os(watchOS)
            UIAccessibility.post(notification: .announcement, argument: message)
            #endif
        }
        registration = (next, token)
    }

    private func unbind() {
        if let registration { registration.draft.removeAnnouncer(registration.token) }
        registration = nil
    }
}

/// Tells VoiceOver a consent surface appeared, so it leaves the screen behind and reads this one.
private struct ConsentPane: ViewModifier {
    let title: String
    func body(content: Content) -> some View {
        content.onAppear {
            #if canImport(UIKit) && !os(watchOS)
            UIAccessibility.post(notification: .screenChanged, argument: title)
            #endif
        }
    }
}

/// Moves VoiceOver focus to an element when it appears.
private struct ConsentInitialFocus: ViewModifier {
    @AccessibilityFocusState private var focused: Bool
    func body(content: Content) -> some View {
        content
            .accessibilityFocused($focused)
            .onAppear {
                focused = true
                // A surface that animates in takes the cursor only once it has settled.
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.45) { focused = true }
            }
    }
}

public extension View {
    /// Tell VoiceOver the screen changed when a consent surface appears, and have it read the
    /// title. A custom overlay otherwise leaves the cursor on the screen behind it.
    /// - Parameter title: The surface's title, such as the scope's `title`.
    @MainActor func consentPane(_ title: String) -> some View { modifier(ConsentPane(title: title)) }

    /// Move VoiceOver focus here when the surface opens. Put it on the heading or the first control.
    @MainActor func consentInitialFocus() -> some View { modifier(ConsentInitialFocus()) }

    /// Speak a draft's save results and errors through VoiceOver. The prompt and preferences
    /// blocks include it.
    /// - Parameter draft: The draft to listen to.
    @MainActor func consentAnnouncements(_ draft: ConsentDraft) -> some View { modifier(ConsentAnnouncements(draft: draft)) }
}

/// Lays paired decisions out at equal width: side by side when every label fits, stacked when
/// one does not or text is at an accessibility size. IAB asks that Accept all and Reject all get
/// the same treatment; this keeps their size equal. It draws nothing.
///
/// ```swift
/// ConsentActions {
///     Button(prompt.rejectAllLabel, action: prompt.rejectAll)
///     Button(prompt.acceptAllLabel, action: prompt.acceptAll)
/// }
/// ```
public struct ConsentActions<Content: View>: View {
    @Environment(\.dynamicTypeSize) private var typeSize
    private let spacing: CGFloat
    private let content: () -> Content

    /// - Parameters:
    ///   - spacing: The gap between actions, in points.
    ///   - content: The actions, one view each.
    public init(spacing: CGFloat = 12, @ViewBuilder content: @escaping () -> Content) {
        self.spacing = spacing
        self.content = content
    }

    public var body: some View {
        EqualDecisionLayout(spacing: spacing, stacked: typeSize.isAccessibilitySize) { content() }
    }
}

/// Measures every label before choosing equal columns or a full-width stack.
struct EqualDecisionLayout: Layout {
    var spacing: CGFloat = 12
    /// Stack even when the labels would fit side by side.
    var stacked = false

    private func fitsRow(_ subviews: Subviews, width: CGFloat) -> Bool {
        guard !stacked else { return false }
        let ideal = subviews.map { $0.sizeThatFits(.unspecified).width }.max() ?? 0
        return CGFloat(subviews.count) * ideal + gaps(subviews) <= width
    }
    private func gaps(_ subviews: Subviews) -> CGFloat { spacing * CGFloat(max(subviews.count - 1, 0)) }
    private func columnWidth(_ subviews: Subviews, width: CGFloat) -> CGFloat {
        (width - gaps(subviews)) / CGFloat(max(subviews.count, 1))
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? 320
        let row = fitsRow(subviews, width: width)
        let sizes = subviews.map { $0.sizeThatFits(ProposedViewSize(width: row ? columnWidth(subviews, width: width) : width, height: nil)) }
        return CGSize(width: width, height: row ? sizes.map(\.height).max() ?? 0 : sizes.reduce(0) { $0 + $1.height } + gaps(subviews))
    }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let row = fitsRow(subviews, width: bounds.width)
        let width = row ? columnWidth(subviews, width: bounds.width) : bounds.width
        var y = bounds.minY
        for (index, view) in subviews.enumerated() {
            let height = row ? bounds.height : view.sizeThatFits(ProposedViewSize(width: width, height: nil)).height
            view.place(at: CGPoint(x: row ? bounds.minX + CGFloat(index) * (width + spacing) : bounds.minX, y: y),
                proposal: ProposedViewSize(width: width, height: height))
            if !row { y += height + spacing }
        }
    }
}
#endif
