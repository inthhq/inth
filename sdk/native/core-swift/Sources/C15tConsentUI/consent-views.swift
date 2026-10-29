#if canImport(SwiftUI) && canImport(UIKit)
#if canImport(C15tCore)
import C15tCore
#endif
import SwiftUI
import UIKit

/// Status colours no theme overrides: a save failure and a stale draft look the same in every app.
private enum StatusColors {
    static let error = ConsentThemeColor(light: 0xB42318, dark: 0xFF9C8F).color
    static let errorBackground = ConsentThemeColor(light: 0xFBEAE7, dark: 0x3A1D1A).color
    static let info = ConsentThemeColor(light: 0x1F3A99, dark: 0xC4D0FF).color
    static let infoBackground = ConsentThemeColor(light: 0xE8ECFA, dark: 0x1E2440).color
}

/// The one button shape. `decision` is for Accept all and Reject all, which always share it;
/// `accent` is for Save; `quiet` is for everything that is not a decision.
private struct ConsentButtonStyle: ButtonStyle {
    enum Variant { case decision, accent, quiet }
    var variant: Variant = .decision
    @Environment(\.consentTheme) private var theme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    func makeBody(configuration: Configuration) -> some View {
        let shape = RoundedRectangle(cornerRadius: theme.cornerRadius, style: .continuous)
        configuration.label.font(.body.weight(.semibold))
            .multilineTextAlignment(.center).padding(.horizontal, 16).padding(.vertical, 14)
            .frame(maxWidth: .infinity, minHeight: 52)
            .foregroundStyle(foreground)
            .background(background, in: shape)
            .overlay { if variant == .quiet { shape.strokeBorder(theme.colors.text.color.opacity(0.18)) } }
            .opacity(configuration.isPressed ? 0.85 : 1)
            .scaleEffect(configuration.isPressed && !reduceMotion ? 0.98 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
    private var foreground: Color {
        switch variant {
        case .decision: theme.colors.onDecision.color
        case .accent: theme.colors.onAccent.color
        case .quiet: theme.colors.text.color
        }
    }
    private var background: Color {
        switch variant {
        case .decision: theme.colors.decision.color
        case .accent: theme.colors.accent.color
        case .quiet: Color.clear
        }
    }
}

/// Measures both labels before choosing equal columns or a full-width stack.
struct EqualDecisionLayout: Layout {
    var spacing: CGFloat = 12
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? 320
        let ideal = subviews.map { $0.sizeThatFits(.unspecified).width }.max() ?? 0
        let row = 2 * ideal + spacing <= width
        let sizes = subviews.map { $0.sizeThatFits(ProposedViewSize(width: row ? (width - spacing) / 2 : width, height: nil)) }
        return CGSize(width: width, height: row ? sizes.map(\.height).max() ?? 0 : sizes.reduce(0) { $0 + $1.height } + spacing)
    }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let ideal = subviews.map { $0.sizeThatFits(.unspecified).width }.max() ?? 0
        let row = 2 * ideal + spacing <= bounds.width
        var y = bounds.minY
        for (index, view) in subviews.enumerated() {
            let width = row ? (bounds.width - spacing) / 2 : bounds.width
            let height = row ? bounds.height : view.sizeThatFits(ProposedViewSize(width: width, height: nil)).height
            view.place(at: CGPoint(x: row ? bounds.minX + CGFloat(index) * (width + spacing) : bounds.minX, y: y),
                proposal: ProposedViewSize(width: width, height: height))
            if !row { y += height + spacing }
        }
    }
}

private enum Destination: Hashable { case vendors(Int?), vendor(Int), providers }

/// Widest a consent column gets; wider screens centre it.
private let contentWidth: CGFloat = 560

/// Add native automatic prompting and standing settings to a SwiftUI root.
/// - Parameters:
///   - presenter: A host-owned presenter attached to its native engine.
///   - privacyPolicyURL: The app's required privacy policy, opened in the system browser.
///   - theme: Appearance. `nil` uses ``ConsentTheme/current`` with the bundle's `Info.plist` values applied.
///   - onNoticeFrameChange: Optional notice bounds for UIKit hosts that pass touches through outside the notice.
public extension View {
    @MainActor
    func c15tConsent(presenter: ConsentPresenter, privacyPolicyURL: URL, theme: ConsentTheme? = nil,
        onNoticeFrameChange: ((CGRect) -> Void)? = nil) -> some View {
        modifier(ConsentPresentationModifier(presenter: presenter, privacyPolicyURL: privacyPolicyURL,
            theme: theme ?? ConsentTheme.resolved(), onNoticeFrameChange: onNoticeFrameChange))
    }
}

private struct NoticeBoundsReporter: UIViewRepresentable {
    let onChange: ((CGRect) -> Void)?
    func makeUIView(context: Context) -> NoticeBoundsView {
        let view = NoticeBoundsView()
        view.isUserInteractionEnabled = false
        return view
    }
    func updateUIView(_ view: NoticeBoundsView, context: Context) {
        view.onChange = onChange
        DispatchQueue.main.async { [weak view] in view?.reportBounds() }
    }
}

private final class NoticeBoundsView: UIView {
    var onChange: ((CGRect) -> Void)?
    override func layoutSubviews() { super.layoutSubviews(); reportBounds() }
    override func didMoveToWindow() { super.didMoveToWindow(); reportBounds() }
    func reportBounds() {
        guard window != nil, !bounds.isEmpty else { return }
        onChange?(convert(bounds, to: nil))
    }
}

private struct PresentationSession: Identifiable { let id: UUID }

/// The first layer and anything it opens takes the whole screen: it is a gate, and a sheet that
/// cannot be swiped away promises a dismissal it does not offer. Standing preferences opened
/// later are a sheet, because then the app behind them is the user's and they can leave.
private struct ConsentPresentationModifier: ViewModifier {
    @ObservedObject var presenter: ConsentPresenter
    let privacyPolicyURL: URL
    let theme: ConsentTheme
    let onNoticeFrameChange: ((CGRect) -> Void)?

    private var standingPreferences: Bool { presenter.preferences && !presenter.returnsToFirstLayer }
    private func session(fullScreen: Bool) -> Binding<PresentationSession?> {
        let current = presenter.presentationID
        return Binding(
            get: { current.flatMap { fullScreen != standingPreferences ? PresentationSession(id: $0) : nil } },
            set: { next in if next == nil, presenter.presentationID == current { presenter.requestClose() } })
    }

    func body(content: Content) -> some View {
        content
            .overlay(alignment: .bottom) {
                if presenter.noticeVisible {
                    NoticeCard(presenter: presenter, privacyPolicyURL: privacyPolicyURL)
                        .padding(12).background(NoticeBoundsReporter(onChange: onNoticeFrameChange))
                        .environment(\.consentTheme, theme)
                }
            }
            .fullScreenCover(item: session(fullScreen: true)) { session in
                ConsentScreen(presenter: presenter, privacyPolicyURL: privacyPolicyURL).id(session.id)
                    .environment(\.consentTheme, theme)
            }
            .sheet(item: session(fullScreen: false)) { session in
                ConsentScreen(presenter: presenter, privacyPolicyURL: privacyPolicyURL).id(session.id)
                    .environment(\.consentTheme, theme)
                    .presentationDetents([.large]).presentationDragIndicator(.hidden)
            }
            .onAppear {
                presenter.onAnnouncement = { UIAccessibility.post(notification: .announcement, argument: $0) }
            }
    }
}

private struct NoticeCard: View {
    @ObservedObject var presenter: ConsentPresenter
    let privacyPolicyURL: URL
    @Environment(\.consentTheme) private var theme
    var body: some View {
        let shape = RoundedRectangle(cornerRadius: theme.cornerRadius + 6, style: .continuous)
        VStack(alignment: .leading, spacing: 12) {
            Text("How this app uses your data").font(.headline).foregroundStyle(theme.colors.text.color)
                .accessibilityAddTraits(.isHeader).accessibilityIdentifier("c15t.notice.title")
            Text("You can review or change this at any time in Privacy settings.")
                .font(.subheadline).foregroundStyle(theme.colors.textSecondary.color)
            EqualDecisionLayout {
                Button("Got it") { presenter.commit(.acknowledge) }.buttonStyle(ConsentButtonStyle()).accessibilityIdentifier("c15t.notice.acknowledge")
                Button("Privacy settings") { presenter.presentPreferences() }.buttonStyle(ConsentButtonStyle(variant: .quiet)).accessibilityIdentifier("c15t.notice.settings")
            }
            PrivacyLink(url: privacyPolicyURL)
            if let message = presenter.errorMessage { ErrorCallout(message: message, id: "c15t.notice.error", retry: presenter.retry) }
        }
        .padding(20).frame(maxWidth: contentWidth)
        .background(theme.colors.surface.color, in: shape)
        .overlay(shape.strokeBorder(theme.colors.text.color.opacity(0.1)))
        .shadow(color: .black.opacity(0.1), radius: 18, y: 8)
        .disabled(presenter.pending).accessibilityElement(children: .contain).accessibilityIdentifier("c15t.notice")
    }
}

private struct PrivacyLink: View {
    let url: URL
    @Environment(\.consentTheme) private var theme
    var body: some View {
        Link("Privacy policy", destination: url).font(.subheadline.weight(.medium)).foregroundStyle(theme.colors.accent.color)
            .frame(minHeight: 44).accessibilityIdentifier("c15t.privacy-policy")
    }
}

private struct ErrorCallout: View {
    let message: String
    let id: String
    let retry: () -> Void
    @Environment(\.consentTheme) private var theme
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Label(message, systemImage: "exclamationmark.circle").fixedSize(horizontal: false, vertical: true).accessibilityIdentifier(id)
            Button("Try again", action: retry).font(.subheadline.weight(.semibold)).frame(minHeight: 44).accessibilityIdentifier(id + ".retry")
        }
        .font(.subheadline).foregroundStyle(StatusColors.error).padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(StatusColors.errorBackground, in: RoundedRectangle(cornerRadius: theme.calloutRadius, style: .continuous))
    }
}

/// A short status line with a tinted background: why the prompt is back, or that the draft is stale.
private struct InfoCallout<Content: View>: View {
    @ViewBuilder let content: Content
    @Environment(\.consentTheme) private var theme
    var body: some View {
        content.font(.subheadline).foregroundStyle(StatusColors.info).padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(StatusColors.infoBackground, in: RoundedRectangle(cornerRadius: theme.calloutRadius, style: .continuous))
    }
}

private struct SectionLabel: View {
    let text: String
    @Environment(\.consentTheme) private var theme
    init(_ text: String) { self.text = text }
    var body: some View {
        Text(text).font(.footnote.weight(.semibold)).foregroundStyle(theme.colors.textSecondary.color).textCase(nil)
    }
}

private struct ConsentScreen: View {
    @ObservedObject var presenter: ConsentPresenter
    let privacyPolicyURL: URL
    @State private var path: [Destination] = []
    @Environment(\.consentTheme) private var theme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var body: some View {
        NavigationStack(path: $path) {
            ZStack {
                theme.colors.canvas.color.ignoresSafeArea()
                if presenter.preferences {
                    PreferencesList(presenter: presenter, privacyPolicyURL: privacyPolicyURL, path: $path)
                        .transition(reduceMotion ? .opacity : .move(edge: .trailing))
                } else {
                    FirstLayer(presenter: presenter, privacyPolicyURL: privacyPolicyURL, path: $path)
                        .transition(reduceMotion ? .opacity : .asymmetric(
                            insertion: .move(edge: .leading).combined(with: .opacity),
                            removal: .move(edge: .leading).combined(with: .opacity)))
                }
            }
            .animation(.easeOut(duration: 0.28), value: presenter.preferences)
            .toolbar {
                if presenter.preferences {
                    ToolbarItem(placement: .cancellationAction) {
                        Button { presenter.requestClose() } label: {
                            if presenter.returnsToFirstLayer { Label("Back", systemImage: "chevron.backward").frame(minHeight: 44) }
                            else { Text("Cancel") }
                        }.disabled(presenter.pending).accessibilityIdentifier("c15t.prefs.cancel")
                    }
                }
            }
            .navigationDestination(for: Destination.self) { destination in
                Group {
                    switch destination {
                    case .vendors(let purpose): VendorList(presenter: presenter, purpose: purpose)
                    case .vendor(let id): VendorDetails(presenter: presenter, id: id)
                    case .providers: ProviderList(presenter: presenter)
                    }
                }
                .navigationBarBackButtonHidden()
                .toolbar {
                    ToolbarItem(placement: .navigationBarLeading) {
                        Button { if !path.isEmpty { path.removeLast() } } label: {
                            Label("Back", systemImage: "chevron.backward").frame(minHeight: 44)
                        }.disabled(presenter.pending).accessibilityIdentifier(backIdentifier(destination))
                    }
                }
            }
            .toolbarBackground(theme.colors.canvas.color, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
        }
        .tint(theme.colors.accent.color)
        .interactiveDismissDisabled(!presenter.preferences || presenter.isDirty || presenter.pending)
        .accessibilityHidden(presenter.confirmDiscard)
        .overlay { if presenter.confirmDiscard { DiscardConfirmation(presenter: presenter) } }
    }

    private func backIdentifier(_ destination: Destination) -> String {
        switch destination {
        case .vendors: "c15t.iab.vendors.back"
        case .vendor: "c15t.iab.vendor.back"
        case .providers: "c15t.ac.back"
        }
    }
}

private struct DiscardConfirmation: View {
    @ObservedObject var presenter: ConsentPresenter
    @Environment(\.consentTheme) private var theme
    var body: some View {
        ZStack {
            Color.black.opacity(0.32).ignoresSafeArea().accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 16) {
                Text("Discard changes?").font(.headline).foregroundStyle(theme.colors.text.color).accessibilityAddTraits(.isHeader)
                Text("Your changes won't be saved.").foregroundStyle(theme.colors.textSecondary.color)
                Button("Keep editing") { presenter.confirmDiscard = false }
                    .buttonStyle(ConsentButtonStyle()).accessibilityIdentifier("c15t.prefs.discard.keep")
                Button("Discard changes", role: .destructive) { presenter.discard() }
                    .buttonStyle(ConsentButtonStyle(variant: .quiet)).accessibilityIdentifier("c15t.prefs.discard.confirm")
            }
            .padding(24).background(theme.colors.surface.color, in: RoundedRectangle(cornerRadius: theme.cornerRadius + 6, style: .continuous))
            .padding(24).frame(maxWidth: 480).accessibilityElement(children: .contain)
            .accessibilityAddTraits(.isModal).accessibilityIdentifier("c15t.prefs.discard")
        }
    }
}

/// The first choice. A page of the app, not a panel over it: brand, headline, one sentence,
/// then the two decisions at equal weight and the path to the details.
private struct FirstLayer: View {
    @ObservedObject var presenter: ConsentPresenter
    let privacyPolicyURL: URL
    @Binding var path: [Destination]
    @Environment(\.consentTheme) private var theme
    @Environment(\.dynamicTypeSize) private var typeSize
    @AccessibilityFocusState private var titleFocused: Bool
    @ScaledMetric(relativeTo: .largeTitle) private var markSize: CGFloat = 56

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                brandHeader
                if let reason = presenter.snapshot.promptRequirement.reason, reason.rawValue != "missing" {
                    InfoCallout {
                        Text(reason.rawValue == "expired" ? "Your earlier choice has expired, so we're asking again." : "How this app uses data has changed since your last choice, so we're asking again.")
                    }.accessibilityIdentifier("c15t.first-layer.reason")
                }
                Text(theme.copy.headline).font(theme.headlineFont.font(.largeTitle, weight: .semibold))
                    .foregroundStyle(theme.colors.text.color).fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader).accessibilityIdentifier("c15t.first-layer.title").accessibilityFocused($titleFocused)
                VStack(alignment: .leading, spacing: 12) {
                    Text(theme.copy.introduction).font(.body).foregroundStyle(theme.colors.text.color)
                        .accessibilityIdentifier("c15t.first-layer.body")
                    Text(presenter.iab
                        ? "We and our partners store information on this device for the purposes below. Some partners rely on legitimate interest instead of consent; you can object to that. Change your mind at any time in Privacy settings."
                        : "You decide which uses to allow, and you can change your mind at any time in Privacy settings.")
                        .font(.subheadline).foregroundStyle(theme.colors.textSecondary.color)
                }
                if presenter.iab { partnerSummary }
                PrivacyLink(url: privacyPolicyURL)
                if typeSize.isAccessibilitySize && theme.showsBranding { Branding() }
            }
            .padding(.horizontal, 24).padding(.top, 24).padding(.bottom, 16)
            .frame(maxWidth: contentWidth, alignment: .leading).frame(maxWidth: .infinity)
        }
        .scrollBounceBehavior(.basedOnSize)
        .accessibilityIdentifier("c15t.first-layer")
        .safeAreaInset(edge: .bottom, spacing: 0) { DecisionFooter(presenter: presenter, first: true, path: $path) }
        .onAppear { titleFocused = true }
    }

    @ViewBuilder private var brandHeader: some View {
        if theme.brand.markImageName != nil || theme.brand.name != nil {
            VStack(alignment: .leading, spacing: 16) {
                if let mark = theme.brand.markImageName {
                    Image(mark).resizable().scaledToFill().frame(width: markSize, height: markSize)
                        .clipShape(RoundedRectangle(cornerRadius: markSize * 0.24, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: markSize * 0.24, style: .continuous).strokeBorder(.black.opacity(0.08)))
                        .accessibilityLabel(theme.brand.name ?? "").accessibilityHidden(theme.brand.name == nil)
                }
                if let name = theme.brand.name {
                    Text(name.uppercased()).font(.footnote.weight(.semibold)).tracking(1.4)
                        .foregroundStyle(theme.colors.accent.color).accessibilityIdentifier("c15t.first-layer.brand")
                }
            }
        }
    }

    /// The purposes partners ask for, on a quieter surface so they inform without competing.
    @ViewBuilder private var partnerSummary: some View {
        if let disclosure = presenter.disclosure {
            let list = disclosure.list
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .firstTextBaseline) {
                    SectionLabel("What partners may do")
                    Spacer()
                    Button("\(disclosure.vendors.count) IAB partners") {
                        presenter.customize()
                        path.append(.vendors(nil))
                    }.font(.footnote.weight(.semibold)).foregroundStyle(theme.colors.accent.color).frame(minHeight: 44)
                        .accessibilityIdentifier("c15t.first-layer.partner-count")
                }
                .padding(.horizontal, 16)
                ForEach(list.purposes.keys.sorted(), id: \.self) { id in
                    Text(list.purposes[id]?.name ?? "").font(.subheadline).foregroundStyle(theme.colors.text.color)
                        .frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 16).padding(.vertical, 10)
                        .accessibilityIdentifier("c15t.first-layer.purpose.\(id)")
                    Hairline().padding(.leading, 16)
                }
                ForEach(list.specialFeatures.keys.sorted(), id: \.self) { id in
                    Text(list.specialFeatures[id]?.name ?? "").font(.subheadline).foregroundStyle(theme.colors.text.color)
                        .frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 16).padding(.vertical, 10)
                        .accessibilityIdentifier("c15t.first-layer.special-feature.\(id)")
                    if id != list.specialFeatures.keys.sorted().last { Hairline().padding(.leading, 16) }
                }
            }
            .padding(.vertical, 6)
            .background(theme.colors.surfaceMuted.color, in: RoundedRectangle(cornerRadius: theme.cornerRadius + 2, style: .continuous))
        }
    }
}

private struct Hairline: View {
    @Environment(\.consentTheme) private var theme
    var body: some View { Rectangle().fill(theme.colors.text.color.opacity(0.1)).frame(height: 1 / UIScreen.main.scale) }
}

private struct Branding: View {
    @Environment(\.consentTheme) private var theme
    var body: some View {
        Text("Secured by c15t").font(.caption).foregroundStyle(theme.colors.textSecondary.color)
            .frame(maxWidth: .infinity, alignment: .trailing).accessibilityIdentifier("c15t.first-layer.branding")
    }
}

/// Pinned actions. Accept all and Reject all are twins; Save is the accent; nothing else is filled.
private struct DecisionFooter: View {
    @ObservedObject var presenter: ConsentPresenter
    let first: Bool
    @Binding var path: [Destination]
    @Environment(\.consentTheme) private var theme
    @Environment(\.dynamicTypeSize) private var typeSize
    private var prefix: String { first ? "c15t.first-layer" : presenter.iab ? "c15t.iab" : "c15t.prefs" }

    var body: some View {
        VStack(spacing: 12) {
            if presenter.stale {
                Button("Load current settings") { presenter.loadDraft() }.buttonStyle(ConsentButtonStyle(variant: .accent)).accessibilityIdentifier("c15t.prefs.stale.reload")
            } else {
                if let message = presenter.errorMessage { ErrorCallout(message: message, id: (first ? "c15t.first-layer" : "c15t.prefs") + ".error", retry: presenter.retry) }
                if presenter.snapshot.policyPending {
                    decision("Reject all", .reject)
                } else if presenter.listUnavailable {
                    Text("Our partner list is out of date. Try again to load it, or reject optional data use.")
                        .font(.subheadline).foregroundStyle(theme.colors.textSecondary.color).frame(maxWidth: .infinity, alignment: .leading)
                        .accessibilityIdentifier(first ? "c15t.first-layer.list-stale" : "c15t.iab.list-stale")
                    EqualDecisionLayout {
                        decision("Reject all", .reject)
                        Button("Try again") { presenter.refresh() }.buttonStyle(ConsentButtonStyle(variant: .quiet)).accessibilityIdentifier(first ? "c15t.first-layer.retry" : "c15t.iab.retry")
                    }
                } else {
                    EqualDecisionLayout {
                        decision("Reject all", .reject)
                        decision("Accept all", .accept)
                    }
                    if first {
                        Button("Customize") { presenter.customize() }.buttonStyle(ConsentButtonStyle(variant: .quiet)).accessibilityIdentifier("c15t.first-layer.customize")
                        if !typeSize.isAccessibilitySize && theme.showsBranding { Branding() }
                    } else {
                        decision("Save choices", .save)
                    }
                }
            }
        }
        .padding(.horizontal, 24).padding(.top, 12).padding(.bottom, 8)
        .frame(maxWidth: contentWidth).frame(maxWidth: .infinity)
        .background(theme.colors.canvas.color.ignoresSafeArea())
        .overlay(alignment: .top) { Hairline() }
        .disabled(presenter.pending)
    }

    private func decision(_ label: String, _ action: ConsentPresenter.Action) -> some View {
        let suffix: String = switch action { case .accept: "accept-all"; case .reject: "reject-all"; case .save: "save"; case .acknowledge: "acknowledge" }
        return Button { presenter.commit(action) } label: {
            if presenter.showProgress { ProgressView().tint(action == .save ? theme.colors.onAccent.color : theme.colors.onDecision.color).accessibilityIdentifier("c15t.status.progress") }
            else { Text(label) }
        }.buttonStyle(ConsentButtonStyle(variant: action == .save ? .accent : .decision))
            .accessibilityLabel(label).accessibilityIdentifier(prefix + "." + suffix)
    }
}

/// Standing settings in the platform's own voice: an inset grouped list on the canvas.
private struct PreferencesList: View {
    @ObservedObject var presenter: ConsentPresenter
    let privacyPolicyURL: URL
    @Binding var path: [Destination]
    @Environment(\.consentTheme) private var theme
    private var surface: Color { theme.colors.surface.color }

    var body: some View {
        List {
            if presenter.snapshot.policyPending {
                Section {
                    Text("Privacy settings aren't available yet. Connect to the internet and try again.").foregroundStyle(theme.colors.text.color)
                    Button("Try again") { presenter.refresh() }.font(.body.weight(.medium)).foregroundStyle(theme.colors.accent.color).frame(minHeight: 44).accessibilityIdentifier("c15t.status.unavailable.retry")
                }.listRowBackground(surface)
            } else {
                if presenter.stale {
                    Section {
                        InfoCallout {
                            VStack(alignment: .leading, spacing: 4) {
                                Text("Settings changed while you were editing").font(.subheadline.weight(.semibold)).accessibilityAddTraits(.isHeader)
                                Text("Your choices weren't saved. Load the current settings, then choose again.")
                            }
                        }.listRowInsets(EdgeInsets()).listRowBackground(Color.clear)
                    }.accessibilityIdentifier("c15t.prefs.stale")
                }
                Section {
                    VStack(alignment: .leading, spacing: 8) {
                        if presenter.iab {
                            Text("We and our partners store and access information on your device and process personal data for the purposes below. Some partners rely on legitimate interest instead of consent. You can object to that and change your choices at any time in Privacy settings.")
                            Button("\(presenter.disclosure?.vendors.count ?? 0) IAB partners") { path.append(.vendors(nil)) }
                                .font(.subheadline.weight(.semibold)).foregroundStyle(theme.colors.accent.color).frame(minHeight: 44).accessibilityIdentifier("c15t.iab.partner-count")
                        } else {
                            Text("Choose which kinds of data use you allow. Changes apply on this device as soon as you save.")
                        }
                    }.font(.subheadline).foregroundStyle(theme.colors.textSecondary.color).listRowBackground(Color.clear).listRowInsets(EdgeInsets(top: 0, leading: 16, bottom: 4, trailing: 16))
                }
                Section { ForEach(presenter.offeredCategories, id: \.self) { category in CategoryRow(presenter: presenter, category: category) } }
                    header: { SectionLabel(presenter.iab ? "This app" : "Data use") }
                    .listRowBackground(surface)
                if presenter.iab, let disclosure = presenter.disclosure {
                    Section { ForEach(disclosure.list.purposes.keys.sorted(), id: \.self) { id in PurposeRow(presenter: presenter, id: id) { path.append(.vendors(id)) } } }
                        header: { SectionLabel("Purposes") }
                        .listRowBackground(surface)
                    Section {
                        ForEach(disclosure.list.specialFeatures.keys.sorted(), id: \.self) { id in
                            if let item = disclosure.list.specialFeatures[id] {
                                ConsentToggle(isOn: choiceBinding(\.specialFeatureOptIns, id)) {
                                    RowLabel(title: item.name, description: item.description, note: "Partners only do this if you turn it on.")
                                }.accessibilityIdentifier("c15t.iab.special-feature.\(id).switch")
                            }
                        }
                    } header: { SectionLabel("Special features") }
                        .listRowBackground(surface)
                    Section {
                        ForEach(disclosure.list.specialPurposes.keys.sorted(), id: \.self) { id in
                            if let item = disclosure.list.specialPurposes[id] { ReadOnlyDefinition(item: item).accessibilityIdentifier("c15t.iab.special-purpose.\(id)") }
                        }
                    } header: { SectionLabel("Special purposes") } footer: { Text(disclosure.list.standardTexts?.specialPurposes ?? "") }
                        .listRowBackground(surface)
                    Section {
                        ForEach(disclosure.list.features.keys.sorted(), id: \.self) { id in
                            if let item = disclosure.list.features[id] { ReadOnlyDefinition(item: item).accessibilityIdentifier("c15t.iab.feature.\(id)") }
                        }
                    } header: { SectionLabel("Features") } footer: { Text(disclosure.list.standardTexts?.features ?? "").accessibilityIdentifier("c15t.iab.features-standard-text") }
                        .listRowBackground(surface)
                    Section {
                        NavigationLink(value: Destination.vendors(nil)) {
                            LabeledContent("IAB partners", value: "\(disclosure.vendors.count)")
                        }.frame(minHeight: 44).accessibilityIdentifier("c15t.iab.partners")
                        if let providers = disclosure.adTechProviders, !providers.isEmpty {
                            NavigationLink(value: Destination.providers) { LabeledContent("Other ad partners", value: "\(providers.count)") }
                                .frame(minHeight: 44).accessibilityIdentifier("c15t.iab.other-partners")
                        }
                    } header: { SectionLabel("Partners") }
                        .listRowBackground(surface)
                }
                Section {
                    PrivacyLink(url: privacyPolicyURL)
                    if let changed = presenter.snapshot.explicitChoice?.categories.values.map(\.confirmedAt).max() {
                        Text("Last changed \(Date(timeIntervalSince1970: Double(changed) / 1000).formatted(date: .abbreviated, time: .omitted))")
                            .font(.footnote).foregroundStyle(theme.colors.textSecondary.color).accessibilityIdentifier("c15t.prefs.last-changed")
                    }
                }.listRowBackground(surface)
            }
        }
        .listStyle(.insetGrouped).scrollContentBackground(.hidden)
        .foregroundStyle(theme.colors.text.color)
        .navigationTitle("Privacy settings").navigationBarTitleDisplayMode(.inline)
        .accessibilityIdentifier(presenter.iab ? "c15t.iab" : "c15t.prefs")
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if !presenter.snapshot.policyPending || presenter.core.bundledPolicyInfo != nil { DecisionFooter(presenter: presenter, first: false, path: $path) }
        }
    }

    private func choiceBinding(_ key: WritableKeyPath<IABChoices, [Int]>, _ id: Int) -> Binding<Bool> {
        Binding(get: { presenter.choices[keyPath: key].contains(id) }, set: { presenter.edit(key, id: id, enabled: $0) })
    }
}

/// A title, its one-line description, and an optional footnote; the label half of every row.
private struct RowLabel: View {
    let title: String
    var description: String? = nil
    var note: String? = nil
    @Environment(\.consentTheme) private var theme
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(.body.weight(.semibold)).foregroundStyle(theme.colors.text.color)
            if let description, !description.isEmpty { Text(description).font(.subheadline).foregroundStyle(theme.colors.textSecondary.color) }
            if let note { Text(note).font(.footnote).foregroundStyle(theme.colors.textSecondary.color) }
        }
    }
}

/// The native switch handles its thumb and accessibility action; its label shares the tap target.
private struct ConsentToggle<Label: View>: View {
    @Binding var isOn: Bool
    let label: Label
    @Environment(\.consentTheme) private var theme
    init(isOn: Binding<Bool>, @ViewBuilder label: () -> Label) {
        self._isOn = isOn
        self.label = label()
    }
    var body: some View {
        Toggle(isOn: $isOn) {
            label.frame(minHeight: 44).contentShape(Rectangle())
                .onTapGesture { isOn.toggle() }
        }.frame(minHeight: 44).tint(theme.colors.accent.color).padding(.vertical, 6)
    }
}
private extension ConsentToggle where Label == Text {
    init(_ title: String, isOn: Binding<Bool>) {
        self.init(isOn: isOn) { Text(title) }
    }
}

private struct CategoryRow: View {
    @ObservedObject var presenter: ConsentPresenter
    let category: ConsentCategory
    @Environment(\.consentTheme) private var theme
    private var title: String { category == .necessary ? "Strictly necessary" : category.rawValue.capitalized }
    private var description: String {
        switch category {
        case .necessary: "Required for the app to work."
        case .functionality: "Remember your settings and choices."
        case .experience: "Adapt the app to how you use it."
        case .measurement: "Help us understand how the app is used."
        case .marketing: "Show advertising relevant to you."
        }
    }
    var body: some View {
        let optional = OptionalConsentCategory(rawValue: category.rawValue)
        let restricted = optional.map(presenter.isRestricted) ?? false
        Group {
            if let optional, !restricted {
                ConsentToggle(isOn: Binding(get: { presenter.categories[optional] ?? false }, set: { presenter.setCategory(optional, $0) })) {
                    RowLabel(title: title, description: description)
                }.accessibilityIdentifier("c15t.prefs.category.\(category.rawValue).switch")
            } else {
                HStack(alignment: .firstTextBaseline, spacing: 12) {
                    RowLabel(title: title, description: description,
                        note: optional.flatMap { optional in restricted ? (presenter.snapshot.restrictions[optional]?.contains(.gpc) == true ? "Off because your device sends a Global Privacy Control signal." : "Not offered where you are.") : nil })
                    Spacer(minLength: 0)
                    Text(category == .necessary ? "Always on" : "Off").font(.subheadline).foregroundStyle(theme.colors.textSecondary.color)
                        .accessibilityIdentifier("c15t.prefs.category.\(category.rawValue).locked")
                }
                .padding(.vertical, 10)
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier(restricted ? "c15t.prefs.category.\(category.rawValue).restricted" : "c15t.prefs.category.\(category.rawValue).locked")
            }
        }.disabled(presenter.pending || presenter.stale || presenter.listUnavailable)
    }
}

private struct ReadOnlyDefinition: View {
    let item: GVLDefinition
    @Environment(\.consentTheme) private var theme
    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            RowLabel(title: item.name, description: item.description)
            Spacer(minLength: 0)
            Text("No choice").font(.footnote).foregroundStyle(theme.colors.textSecondary.color)
        }.padding(.vertical, 10)
    }
}

private struct PurposeRow: View {
    @ObservedObject var presenter: ConsentPresenter
    let id: Int
    let openPartners: () -> Void
    @State private var expanded = false
    @Environment(\.consentTheme) private var theme
    var body: some View {
        if let disclosure = presenter.disclosure, let item = disclosure.list.purposes[id] {
            let li = disclosure.vendors.values.contains { $0.legitimateInterestPurposes.contains(id) }
            VStack(alignment: .leading, spacing: 8) {
                ConsentToggle(isOn: Binding(get: { presenter.choices.purposeConsents.contains(id) }, set: { presenter.edit(\.purposeConsents, id: id, enabled: $0) })) {
                    RowLabel(title: item.name, description: item.description,
                        note: li ? "Asks for consent · Some partners use legitimate interest" : "Asks for consent")
                }.accessibilityIdentifier("c15t.iab.purpose.\(id).consent")
                Button { expanded.toggle() } label: {
                    Label(expanded ? "Hide details" : "Details", systemImage: expanded ? "chevron.up" : "chevron.down")
                        .font(.subheadline.weight(.medium)).frame(minHeight: 44)
                }
                .buttonStyle(.borderless).accessibilityValue(expanded ? "Expanded" : "Collapsed").accessibilityIdentifier("c15t.iab.purpose.\(id).details")
                if expanded {
                    VStack(alignment: .leading, spacing: 8) {
                        if let legal = item.descriptionLegal { Text(legal) }
                        ForEach(item.illustrations, id: \.self) { Text("• " + $0) }
                        Text("Asks for consent: \(disclosure.vendors.values.filter { $0.consentPurposes.contains(id) }.count) partners. Legitimate interest: \(disclosure.vendors.values.filter { $0.legitimateInterestPurposes.contains(id) }.count) partners.").font(.footnote)
                    }.font(.subheadline).foregroundStyle(theme.colors.textSecondary.color)
                    Button("View partners", action: openPartners).buttonStyle(.borderless).font(.subheadline.weight(.medium)).frame(minHeight: 44).accessibilityIdentifier("c15t.iab.purpose.\(id).view-partners")
                    if li {
                        ConsentToggle(isOn: Binding(get: { presenter.choices.purposeLegitimateInterests.contains(id) }, set: { presenter.editLI(purpose: true, id: id, enabled: $0) })) {
                            RowLabel(title: "Legitimate interest", note: "Some partners claim this legal basis. Turn off to object.")
                        }.accessibilityIdentifier("c15t.iab.purpose.\(id).li")
                    }
                }
            }.padding(.vertical, 4).disabled(presenter.pending || presenter.stale || presenter.listUnavailable)
        }
    }
}

private struct SearchField: View {
    let placeholder: String
    @Binding var text: String
    let id: String
    @Environment(\.consentTheme) private var theme
    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass").foregroundStyle(theme.colors.textSecondary.color).accessibilityHidden(true)
            TextField(placeholder, text: $text).textInputAutocapitalization(.never).autocorrectionDisabled()
                .foregroundStyle(theme.colors.text.color).accessibilityIdentifier(id)
        }.frame(minHeight: 44)
    }
}

/// On, Partly on, or Off at a glance, beside the chevron into the partner.
private struct StatusTag: View {
    let status: String
    @Environment(\.consentTheme) private var theme
    var body: some View {
        let off = status == "Off"
        Text(status).font(.caption.weight(.semibold))
            .foregroundStyle(off ? theme.colors.textSecondary.color : theme.colors.accent.color)
            .padding(.horizontal, 8).padding(.vertical, 4)
            .background(off ? theme.colors.surfaceMuted.color : theme.colors.accent.color.opacity(0.14), in: Capsule())
    }
}

private struct VendorList: View {
    @ObservedObject var presenter: ConsentPresenter
    @State var purpose: Int?
    @State private var search = ""
    @Environment(\.consentTheme) private var theme
    var body: some View {
        List {
            Section {
                SearchField(placeholder: "Search partners", text: $search, id: "c15t.iab.vendors.search")
                if let purpose {
                    Button {
                        self.purpose = nil
                    } label: {
                        Label("Purpose: \(presenter.disclosure?.list.purposes[purpose]?.name ?? "")", systemImage: "xmark.circle.fill")
                            .labelStyle(TrailingIconLabelStyle()).font(.subheadline.weight(.medium))
                    }.frame(minHeight: 44).accessibilityIdentifier("c15t.iab.vendors.filter.purpose.clear")
                }
            }.listRowBackground(theme.colors.surface.color)
            let vendors = (presenter.disclosure?.list.vendors.values.filter { vendor in
                presenter.disclosure?.vendors[vendor.id] != nil && (search.isEmpty || vendor.name.localizedStandardContains(search))
                    && (purpose == nil || presenter.disclosure?.vendors[vendor.id]?.consentPurposes.contains(purpose!) == true || presenter.disclosure?.vendors[vendor.id]?.legitimateInterestPurposes.contains(purpose!) == true)
            } ?? []).sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
            Section {
                if vendors.isEmpty {
                    Text("No partners match \"\(search)\".").foregroundStyle(theme.colors.textSecondary.color).accessibilityIdentifier("c15t.iab.vendors.empty")
                }
                ForEach(vendors, id: \.id) { vendor in
                    NavigationLink(value: Destination.vendor(vendor.id)) {
                        HStack(alignment: .center, spacing: 12) {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(vendor.name).font(.body.weight(.semibold)).foregroundStyle(theme.colors.text.color)
                                if let projection = presenter.disclosure?.vendors[vendor.id] {
                                    Text("\(projection.consentPurposes.count) purposes · \(projection.legitimateInterestPurposes.count) on legitimate interest").font(.footnote).foregroundStyle(theme.colors.textSecondary.color)
                                }
                            }
                            Spacer(minLength: 0)
                            StatusTag(status: presenter.partnerStatus(vendor.id)).accessibilityIdentifier("c15t.iab.vendors.vendor.\(vendor.id).status")
                        }.padding(.vertical, 6)
                    }.accessibilityIdentifier("c15t.iab.vendors.vendor.\(vendor.id)")
                }
            }.listRowBackground(theme.colors.surface.color)
        }
        .listStyle(.insetGrouped).scrollContentBackground(.hidden)
        .navigationTitle("IAB partners").navigationBarTitleDisplayMode(.inline)
        .scrollDismissesKeyboard(.immediately).accessibilityIdentifier("c15t.iab.vendors")
    }
}

private struct TrailingIconLabelStyle: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 6) { configuration.title; configuration.icon }
    }
}

private struct VendorDetails: View {
    @ObservedObject var presenter: ConsentPresenter
    let id: Int
    @Environment(\.consentTheme) private var theme
    private func names(_ ids: [Int]) -> String { ids.compactMap { presenter.disclosure?.list.purposes[$0]?.name }.joined(separator: ", ") }
    var body: some View {
        List {
            if let disclosure = presenter.disclosure, let vendor = disclosure.list.vendors[id], let projection = disclosure.vendors[id] {
                links(vendor)
                selections(projection)
                otherDisclosures(vendor, disclosure.list)
                retention(vendor)
                storage(vendor)
            }
        }
        .listStyle(.insetGrouped).scrollContentBackground(.hidden)
        .foregroundStyle(theme.colors.text.color)
        .navigationTitle(presenter.disclosure?.list.vendors[id]?.name ?? "Partner").navigationBarTitleDisplayMode(.inline)
        .accessibilityIdentifier("c15t.iab.vendor.\(id)")
    }
    private func links(_ vendor: GVLVendor) -> some View {
        let language = String(Locale.preferredLanguages.first?.prefix(2) ?? "en")
        let urls = vendor.urls.first { $0.langId.lowercased() == language } ?? vendor.urls.first { $0.langId.lowercased() == "en" } ?? vendor.urls.first
        return Section {
            if let value = urls?.privacy, let url = URL(string: value) { Link("Privacy policy", destination: url).buttonStyle(.borderless).foregroundStyle(theme.colors.accent.color).frame(minHeight: 44).accessibilityIdentifier("c15t.iab.vendor.\(id).privacy-link") }
            if let value = urls?.legIntClaim, let url = URL(string: value) { Link("Legitimate interest statement", destination: url).buttonStyle(.borderless).foregroundStyle(theme.colors.accent.color).frame(minHeight: 44).accessibilityIdentifier("c15t.iab.vendor.\(id).li-claim-link") }
        }.listRowBackground(theme.colors.surface.color)
    }
    private func selections(_ projection: IABVendorDisclosure) -> some View {
        Section {
            if !projection.consentPurposes.isEmpty {
                ConsentToggle(isOn: Binding(get: { presenter.choices.vendorConsents.contains(id) }, set: { presenter.edit(\.vendorConsents, id: id, enabled: $0) })) {
                    RowLabel(title: "Consent", description: "For: " + names(projection.consentPurposes))
                }.accessibilityIdentifier("c15t.iab.vendor.\(id).consent")
            }
            if !projection.legitimateInterestPurposes.isEmpty {
                ConsentToggle(isOn: Binding(get: { presenter.choices.vendorLegitimateInterests.contains(id) }, set: { presenter.editLI(purpose: false, id: id, enabled: $0) })) {
                    RowLabel(title: "Legitimate interest", description: "For: " + names(projection.legitimateInterestPurposes), note: "Turn off to object.")
                }.accessibilityIdentifier("c15t.iab.vendor.\(id).li")
            }
            if !projection.notAllowedPurposes.isEmpty {
                Text("This app doesn't allow this partner to: " + names(projection.notAllowedPurposes)).font(.subheadline).foregroundStyle(theme.colors.textSecondary.color)
                    .accessibilityIdentifier("c15t.iab.vendor.\(id).not-allowed")
            }
        } header: { SectionLabel("Your choices") }
            .listRowBackground(theme.colors.surface.color)
            .disabled(presenter.pending || presenter.stale || presenter.listUnavailable)
    }
    private func noChoice(_ name: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            Text(name)
            Spacer(minLength: 0)
            Text("No choice").font(.footnote).foregroundStyle(theme.colors.textSecondary.color)
        }
    }
    @ViewBuilder private func otherDisclosures(_ vendor: GVLVendor, _ list: GlobalVendorList) -> some View {
        if !vendor.specialPurposes.isEmpty {
            Section { ForEach(vendor.specialPurposes, id: \.self) { noChoice(list.specialPurposes[$0]?.name ?? "") } } header: { SectionLabel("Special purposes") }
                .listRowBackground(theme.colors.surface.color)
        }
        if !vendor.features.isEmpty {
            Section { ForEach(vendor.features, id: \.self) { noChoice(list.features[$0]?.name ?? "") } } header: { SectionLabel("Features") }
                .listRowBackground(theme.colors.surface.color)
        }
        if !vendor.specialFeatures.isEmpty {
            Section {
                ForEach(vendor.specialFeatures, id: \.self) { feature in
                    HStack(alignment: .firstTextBaseline, spacing: 12) {
                        Text(list.specialFeatures[feature]?.name ?? "")
                        Spacer(minLength: 0)
                        Text(presenter.choices.specialFeatureOptIns.contains(feature) ? "On" : "Off").font(.footnote).foregroundStyle(theme.colors.textSecondary.color)
                    }
                }
            } header: { SectionLabel("Special features") } footer: { Text("Set under Special features in Privacy settings.") }
                .listRowBackground(theme.colors.surface.color)
        }
        if let categories = vendor.dataCategories, !categories.isEmpty {
            Section { ForEach(categories, id: \.self) { Text(list.dataCategories?[$0]?.name ?? "") } } header: { SectionLabel("Data collected") }
                .listRowBackground(theme.colors.surface.color)
        }
    }
    private func retention(_ vendor: GVLVendor) -> some View {
        Section {
            if let retention = vendor.dataRetention {
                ForEach(retention.purposes.keys.sorted(), id: \.self) { purpose in
                    LabeledContent(names([purpose]), value: "\(retention.purposes[purpose] ?? 0) days")
                }
                if let days = retention.stdRetention { LabeledContent("Standard retention", value: "\(days) days") }
            } else { Text("Not provided by this partner.").foregroundStyle(theme.colors.textSecondary.color) }
        } header: { SectionLabel("How long data is kept") }
            .listRowBackground(theme.colors.surface.color)
            .accessibilityIdentifier("c15t.iab.vendor.\(id).retention")
    }
    private func storage(_ vendor: GVLVendor) -> some View {
        Section {
            if !vendor.usesCookies && !vendor.usesNonCookieAccess { Text("Doesn't store information on your device.") } else {
                if let seconds = vendor.cookieMaxAgeSeconds { LabeledContent("Stored for up to", value: "\(seconds / 86400) days") }
                LabeledContent("Refreshes stored information", value: vendor.cookieRefresh ? "Yes" : "No")
                LabeledContent("Other ways to access your device", value: vendor.usesNonCookieAccess ? "Yes" : "No")
            }
            if let value = vendor.deviceStorageDisclosureUrl, let url = URL(string: value) { Link("Device storage details", destination: url).buttonStyle(.borderless).foregroundStyle(theme.colors.accent.color).frame(minHeight: 44) }
        } header: { SectionLabel("Device storage") }
            .listRowBackground(theme.colors.surface.color)
            .accessibilityIdentifier("c15t.iab.vendor.\(id).storage")
    }
}

private struct ProviderList: View {
    @ObservedObject var presenter: ConsentPresenter
    @State private var search = ""
    @Environment(\.consentTheme) private var theme
    var body: some View {
        List {
            Section {
                SearchField(placeholder: "Search other partners", text: $search, id: "c15t.ac.search")
            } footer: {
                Text("These partners work with Google but aren't in the IAB list. They only use your data if you allow it. Purposes 1, 3 and 4 must also be on.")
            }.listRowBackground(theme.colors.surface.color)
            let providers = (presenter.disclosure?.adTechProviders ?? []).filter { search.isEmpty || $0.name.localizedStandardContains(search) }.sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
            Section {
                if providers.isEmpty { Text("No partners match \"\(search)\".").foregroundStyle(theme.colors.textSecondary.color).accessibilityIdentifier("c15t.ac.empty") }
                ForEach(providers, id: \.id) { provider in
                    VStack(alignment: .leading, spacing: 0) {
                        ConsentToggle(isOn: Binding(get: { presenter.choices.adTechProviderConsents?.contains(provider.id) == true }, set: { presenter.editProvider(id: provider.id, enabled: $0) })) {
                            Text(provider.name).font(.body.weight(.semibold)).foregroundStyle(theme.colors.text.color)
                        }.accessibilityIdentifier("c15t.ac.provider.\(provider.id).switch")
                        if let url = URL(string: provider.policyUrl) {
                            Link("Privacy policy", destination: url).buttonStyle(.borderless).font(.subheadline.weight(.medium)).foregroundStyle(theme.colors.accent.color).frame(minHeight: 44).accessibilityIdentifier("c15t.ac.provider.\(provider.id).privacy-link")
                        }
                    }.disabled(presenter.pending || presenter.stale || presenter.listUnavailable)
                }
            }.listRowBackground(theme.colors.surface.color)
        }
        .listStyle(.insetGrouped).scrollContentBackground(.hidden)
        .navigationTitle("Other ad partners").navigationBarTitleDisplayMode(.inline)
        .scrollDismissesKeyboard(.immediately).accessibilityIdentifier("c15t.ac")
    }
}
#endif
