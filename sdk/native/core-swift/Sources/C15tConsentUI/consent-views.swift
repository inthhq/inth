#if canImport(SwiftUI) && canImport(UIKit)
#if canImport(C15tCore)
import C15tCore
#endif
import SwiftUI
import UIKit

private enum ConsentColors {
    static func color(_ light: UInt32, _ dark: UInt32) -> Color {
        Color(uiColor: UIColor { traits in
            let value = traits.userInterfaceStyle == .dark ? dark : light
            return UIColor(red: CGFloat((value >> 16) & 255) / 255,
                green: CGFloat((value >> 8) & 255) / 255, blue: CGFloat(value & 255) / 255, alpha: 1)
        })
    }
    static let accent = color(0x335CFF, 0x8CA2FF)
    static let onAccent = color(0xFFFFFF, 0x0A1033)
    static let link = color(0x2C4FDB, 0xA9BAFF)
    static let secondary = color(0x525768, 0xA9AEBF)
    static let border = color(0x8A8FA3, 0x6B7083)
    static let error = color(0xB42318, 0xFF9C8F)
    static let errorBackground = color(0xFDEDEB, 0x3A1D1A)
    static let info = color(0x1F3A99, 0xC4D0FF)
    static let infoBackground = color(0xEEF1FF, 0x1E2440)
}

private struct DecisionStyle: ButtonStyle {
    var filled = true
    private let minimumHeight: CGFloat = 50
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.font(.body.weight(.semibold))
            .multilineTextAlignment(.center).padding(.horizontal, 16).padding(.vertical, 12)
            .frame(maxWidth: .infinity, minHeight: minimumHeight)
            .foregroundStyle(filled ? ConsentColors.onAccent : Color.primary)
            .background(filled ? ConsentColors.accent : Color.clear, in: RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(filled ? Color.clear : ConsentColors.border))
            .opacity(configuration.isPressed ? 0.8 : 1)
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

/// Add native automatic prompting and standing settings to a SwiftUI root.
/// - Parameters:
///   - presenter: A host-owned presenter attached to its native engine.
///   - privacyPolicyURL: The app's required privacy policy, opened in the system browser.
///   - onNoticeFrameChange: Optional notice bounds for UIKit hosts that pass touches through outside the notice.
public extension View {
    func c15tConsent(presenter: ConsentPresenter, privacyPolicyURL: URL, onNoticeFrameChange: ((CGRect) -> Void)? = nil) -> some View {
        modifier(ConsentPresentationModifier(presenter: presenter, privacyPolicyURL: privacyPolicyURL, onNoticeFrameChange: onNoticeFrameChange))
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

private struct ConsentPresentationModifier: ViewModifier {
    @ObservedObject var presenter: ConsentPresenter
    let privacyPolicyURL: URL
    let onNoticeFrameChange: ((CGRect) -> Void)?
    func body(content: Content) -> some View {
        let sessionID = presenter.presentationID
        content
            .overlay(alignment: .bottom) {
                if presenter.noticeVisible {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Your privacy choices").font(.headline).accessibilityAddTraits(.isHeader).accessibilityIdentifier("c15t.notice.title")
                        Text("You can change how this app uses your data in Privacy settings.")
                        EqualDecisionLayout {
                            Button("Got it") { presenter.commit(.acknowledge) }.buttonStyle(DecisionStyle()).accessibilityIdentifier("c15t.notice.acknowledge")
                            Button("Privacy settings") { presenter.presentPreferences() }.buttonStyle(DecisionStyle(filled: false)).accessibilityIdentifier("c15t.notice.settings")
                        }
                        PrivacyLink(url: privacyPolicyURL)
                        if let message = presenter.errorMessage { ErrorCallout(message: message, id: "c15t.notice.error", retry: presenter.retry) }
                    }
                    .padding(20).background(.background, in: RoundedRectangle(cornerRadius: 20))
                    .overlay(RoundedRectangle(cornerRadius: 20).strokeBorder(ConsentColors.border))
                    .padding(8).background(NoticeBoundsReporter(onChange: onNoticeFrameChange)).disabled(presenter.pending).accessibilityElement(children: .contain).accessibilityIdentifier("c15t.notice")
                }
            }
            .sheet(item: Binding(get: { presenter.presentationID.map { PresentationSession(id: $0) } }, set: { next in
                if next == nil, presenter.presentationID == sessionID { presenter.requestClose() }
            })) { session in
                ConsentScreen(presenter: presenter, privacyPolicyURL: privacyPolicyURL).id(session.id)
            }
            .onAppear {
                presenter.onAnnouncement = { UIAccessibility.post(notification: .announcement, argument: $0) }
            }
    }
}

private struct PrivacyLink: View {
    let url: URL
    var body: some View {
        Link("Privacy policy", destination: url).font(.subheadline).foregroundStyle(ConsentColors.link)
            .frame(minHeight: 44).accessibilityIdentifier("c15t.privacy-policy")
    }
}

private struct ErrorCallout: View {
    let message: String
    let id: String
    let retry: () -> Void
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Label(message, systemImage: "exclamationmark.circle").fixedSize(horizontal: false, vertical: true).accessibilityIdentifier(id)
            Button("Try again", action: retry).frame(minHeight: 44).accessibilityIdentifier(id + ".retry")
        }
        .font(.subheadline).foregroundStyle(ConsentColors.error).padding(12)
        .frame(maxWidth: .infinity, alignment: .leading).background(ConsentColors.errorBackground, in: RoundedRectangle(cornerRadius: 12))

    }
}

private struct ConsentScreen: View {
    @ObservedObject var presenter: ConsentPresenter
    let privacyPolicyURL: URL
    @State private var path: [Destination] = []
    @AccessibilityFocusState private var titleFocused: Bool
    @Environment(\.dynamicTypeSize) private var typeSize
    private var prefix: String { presenter.preferences ? (presenter.iab ? "c15t.iab" : "c15t.prefs") : "c15t.first-layer" }
    var body: some View {
        NavigationStack(path: $path) {
            Group {
                if presenter.preferences { preferences } else { firstLayer }
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
            .toolbar {
                if presenter.preferences {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") { presenter.requestClose() }.disabled(presenter.pending).accessibilityIdentifier("c15t.prefs.cancel")
                    }
                }
            }
        }
        .tint(ConsentColors.link)
        .presentationDetents(presenter.preferences || presenter.iab || typeSize.isAccessibilitySize ? [.large] : [.height(430), .large])
        .presentationDragIndicator(.hidden)
        .interactiveDismissDisabled(!presenter.preferences || presenter.isDirty || presenter.pending)
        .accessibilityHidden(presenter.confirmDiscard)
        .overlay {
            if presenter.confirmDiscard {
                ZStack {
                    Color.black.opacity(0.32).ignoresSafeArea().accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 16) {
                        Text("Discard changes?").font(.headline).accessibilityAddTraits(.isHeader)
                        Text("Your changes won't be saved.")
                        Button("Keep editing") { presenter.confirmDiscard = false }
                            .buttonStyle(DecisionStyle()).accessibilityIdentifier("c15t.prefs.discard.keep")
                        Button("Discard changes", role: .destructive) { presenter.discard() }
                            .buttonStyle(DecisionStyle(filled: false)).accessibilityIdentifier("c15t.prefs.discard.confirm")
                    }.padding(24).background(.background, in: RoundedRectangle(cornerRadius: 20))
                        .padding(24).frame(maxWidth: 480).accessibilityElement(children: .contain)
                        .accessibilityAddTraits(.isModal).accessibilityIdentifier("c15t.prefs.discard")
                }
            }
        }
    }

    private func backIdentifier(_ destination: Destination) -> String {
        switch destination {
        case .vendors: "c15t.iab.vendors.back"
        case .vendor: "c15t.iab.vendor.back"
        case .providers: "c15t.ac.back"
        }
    }

    private var firstLayer: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let reason = presenter.snapshot.promptRequirement.reason, reason.rawValue != "missing" {
                    Text(reason.rawValue == "expired" ? "Your earlier choice has expired, so we're asking again." : "How this app uses data has changed since your last choice, so we're asking again.")
                        .padding(12).background(ConsentColors.infoBackground, in: RoundedRectangle(cornerRadius: 12)).foregroundStyle(ConsentColors.info).accessibilityIdentifier("c15t.first-layer.reason")
                }
                Text("Choose how this app uses your data").font(.title3.weight(.semibold)).accessibilityAddTraits(.isHeader)
                    .accessibilityIdentifier("c15t.first-layer.title").accessibilityFocused($titleFocused)
                if presenter.iab { iabIntro(first: true) } else {
                    Text("We use data to improve your experience, measure how the app is used and show relevant advertising. You choose which uses to allow. You can change your choice at any time in Privacy settings.")
                        .foregroundStyle(ConsentColors.secondary).accessibilityIdentifier("c15t.first-layer.body")
                }
                if let list = presenter.disclosure?.list {
                    ForEach(list.purposes.keys.sorted(), id: \.self) { id in
                        Text(list.purposes[id]?.name ?? "").font(.subheadline).accessibilityIdentifier("c15t.first-layer.purpose.\(id)")
                        Divider()
                    }
                    ForEach(list.specialFeatures.keys.sorted(), id: \.self) { id in
                        Text(list.specialFeatures[id]?.name ?? "").font(.subheadline).accessibilityIdentifier("c15t.first-layer.special-feature.\(id)")
                    }
                }
                PrivacyLink(url: privacyPolicyURL)
                if typeSize.isAccessibilitySize { branding }
            }.padding(20)
        }
        .accessibilityIdentifier("c15t.first-layer")
        .safeAreaInset(edge: .bottom, spacing: 0) { footer(first: true) }
        .onAppear { titleFocused = true }
    }

    private var preferences: some View {
        List {
            if presenter.snapshot.policyPending {
                Section {
                    Text("Privacy settings aren't available yet. Connect to the internet and try again.")
                    Button("Try again") { presenter.refresh() }.frame(minHeight: 44).accessibilityIdentifier("c15t.status.unavailable.retry")
                }
            } else {
                if presenter.stale {
                    Section {
                        Text("Settings changed while you were editing").font(.headline).accessibilityAddTraits(.isHeader)
                        Text("Your choices weren't saved. Load the current settings, then choose again.")
                    }.foregroundStyle(ConsentColors.info).accessibilityIdentifier("c15t.prefs.stale")
                }
                Section {
                    if presenter.iab { iabIntro(first: false) } else {
                        Text("Choose which kinds of data use you allow. Changes apply on this device as soon as you save.").foregroundStyle(ConsentColors.secondary)
                    }
                }
                Section(presenter.iab ? "This app" : "Data use") {
                    ForEach(presenter.offeredCategories, id: \.self) { category in CategoryRow(presenter: presenter, category: category) }
                }
                if presenter.iab, let disclosure = presenter.disclosure {
                    Section("Purposes") {
                        ForEach(disclosure.list.purposes.keys.sorted(), id: \.self) { id in
                            PurposeRow(presenter: presenter, id: id) { path.append(.vendors(id)) }
                        }
                    }
                    Section("Special features") {
                        ForEach(disclosure.list.specialFeatures.keys.sorted(), id: \.self) { id in
                            if let item = disclosure.list.specialFeatures[id] {
                                ConsentToggle(isOn: choiceBinding(\.specialFeatureOptIns, id)) {
                                    VStack(alignment: .leading, spacing: 8) {
                                        Text(item.name).font(.body.weight(.semibold))
                                        Text(item.description).font(.subheadline).foregroundStyle(ConsentColors.secondary)
                                        Text("Partners only do this if you turn it on.").font(.footnote)
                                    }
                                }.tint(ConsentColors.accent).accessibilityIdentifier("c15t.iab.special-feature.\(id).switch")
                            }
                        }
                    }
                    Section {
                        ForEach(disclosure.list.specialPurposes.keys.sorted(), id: \.self) { id in
                            if let item = disclosure.list.specialPurposes[id] { ReadOnlyDefinition(item: item).accessibilityIdentifier("c15t.iab.special-purpose.\(id)") }
                        }
                    } header: { Text("Special purposes") } footer: { Text(disclosure.list.standardTexts?.specialPurposes ?? "") }
                    Section {
                        ForEach(disclosure.list.features.keys.sorted(), id: \.self) { id in
                            if let item = disclosure.list.features[id] { ReadOnlyDefinition(item: item).accessibilityIdentifier("c15t.iab.feature.\(id)") }
                        }
                    } header: { Text("Features") } footer: { Text(disclosure.list.standardTexts?.features ?? "").accessibilityIdentifier("c15t.iab.features-standard-text") }
                    Section {
                        NavigationLink(value: Destination.vendors(nil)) {
                            LabeledContent("IAB partners", value: "\(disclosure.vendors.count)")
                        }.frame(minHeight: 44).accessibilityIdentifier("c15t.iab.partners")
                        if let providers = disclosure.adTechProviders, !providers.isEmpty {
                            NavigationLink(value: Destination.providers) { LabeledContent("Other ad partners", value: "\(providers.count)") }
                                .frame(minHeight: 44).accessibilityIdentifier("c15t.iab.other-partners")
                        }
                    }
                }
                Section {
                    PrivacyLink(url: privacyPolicyURL)
                    if let changed = presenter.snapshot.explicitChoice?.categories.values.map(\.confirmedAt).max() {
                        Text("Last changed \(Date(timeIntervalSince1970: Double(changed) / 1000).formatted(date: .abbreviated, time: .omitted))")
                            .font(.footnote).foregroundStyle(ConsentColors.secondary).accessibilityIdentifier("c15t.prefs.last-changed")
                    }
                }
            }
        }
        .listStyle(.insetGrouped).navigationTitle("Privacy settings").navigationBarTitleDisplayMode(.inline)
        .accessibilityIdentifier(presenter.iab ? "c15t.iab" : "c15t.prefs")
        .safeAreaInset(edge: .bottom, spacing: 0) { if !presenter.snapshot.policyPending || presenter.core.bundledPolicyInfo != nil { footer(first: false) } }
    }

    private func choiceBinding(_ key: WritableKeyPath<IABChoices, [Int]>, _ id: Int) -> Binding<Bool> {
        Binding(get: { presenter.choices[keyPath: key].contains(id) }, set: { presenter.edit(key, id: id, enabled: $0) })
    }
    private func iabIntro(first: Bool) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("We and our partners store and access information on your device and process personal data for the purposes below. Some partners rely on legitimate interest instead of consent. You can object to that and change your choices at any time in Privacy settings.").foregroundStyle(ConsentColors.secondary)
            Button("\(presenter.disclosure?.vendors.count ?? 0) IAB partners") {
                if !presenter.preferences { presenter.customize() }
                path.append(.vendors(nil))
            }.frame(minHeight: 44).accessibilityIdentifier(first ? "c15t.first-layer.partner-count" : "c15t.iab.partner-count")
        }
    }
    private func footer(first: Bool) -> some View {
        VStack(spacing: 12) {
            if presenter.stale {
                Button("Load current settings") { presenter.loadDraft() }.buttonStyle(DecisionStyle()).accessibilityIdentifier("c15t.prefs.stale.reload")
            } else {
                if let message = presenter.errorMessage { ErrorCallout(message: message, id: (first ? "c15t.first-layer" : "c15t.prefs") + ".error", retry: presenter.retry) }
                if presenter.snapshot.policyPending {
                    decision("Reject all", .reject, first: first)
                } else if presenter.listUnavailable {
                    Text("Our partner list is out of date. Try again to load it, or reject optional data use.").font(.subheadline)
                        .accessibilityIdentifier(first ? "c15t.first-layer.list-stale" : "c15t.iab.list-stale")
                    EqualDecisionLayout {
                        decision("Reject all", .reject, first: first)
                        Button("Try again") { presenter.refresh() }.buttonStyle(DecisionStyle(filled: first)).accessibilityIdentifier(first ? "c15t.first-layer.retry" : "c15t.iab.retry")
                    }
                } else {
                    EqualDecisionLayout {
                        decision("Reject all", .reject, first: first)
                        decision("Accept all", .accept, first: first)
                    }
                    if first {
                        Button("Customize") { presenter.customize() }.buttonStyle(DecisionStyle(filled: false)).accessibilityIdentifier("c15t.first-layer.customize")
                        if !typeSize.isAccessibilitySize { branding }
                    } else {
                        decision("Save choices", .save, first: false)
                    }
                }
            }
        }.padding(.horizontal, 20).padding(.vertical, 12).background(.bar).disabled(presenter.pending)
    }
    private var branding: some View {
        Text("Secured by c15t").font(.footnote).foregroundStyle(ConsentColors.secondary)
            .accessibilityIdentifier("c15t.first-layer.branding")
    }
    private func decision(_ label: String, _ action: ConsentPresenter.Action, first: Bool) -> some View {
        let suffix: String = switch action { case .accept: "accept-all"; case .reject: "reject-all"; case .save: "save"; case .acknowledge: "acknowledge" }
        return Button { presenter.commit(action) } label: {
            if presenter.showProgress { ProgressView().accessibilityIdentifier("c15t.status.progress") } else { Text(label) }
        }.buttonStyle(DecisionStyle(filled: first || suffix == "save"))
            .accessibilityLabel(label).accessibilityIdentifier((first ? "c15t.first-layer" : presenter.iab ? "c15t.iab" : "c15t.prefs") + "." + suffix)
    }
}

/// The native switch handles its thumb and accessibility action; its label shares the tap target.
private struct ConsentToggle<Label: View>: View {
    @Binding var isOn: Bool
    let label: Label
    init(isOn: Binding<Bool>, @ViewBuilder label: () -> Label) {
        self._isOn = isOn
        self.label = label()
    }
    var body: some View {
        Toggle(isOn: $isOn) {
            label.frame(minHeight: 44).contentShape(Rectangle())
                .onTapGesture { isOn.toggle() }
        }.frame(minHeight: 44)
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
                ConsentToggle(isOn: Binding(get: { presenter.categories[optional] ?? false }, set: { presenter.setCategory(optional, $0) })) { label }
                    .tint(ConsentColors.accent).accessibilityIdentifier("c15t.prefs.category.\(category.rawValue).switch")
            } else {
                VStack(alignment: .leading, spacing: 8) {
                    label
                    Text(category == .necessary ? "Always on" : "Off").font(.subheadline).foregroundStyle(ConsentColors.secondary)
                        .accessibilityIdentifier("c15t.prefs.category.\(category.rawValue).locked")
                    if let optional, restricted {
                        Text(presenter.snapshot.restrictions[optional]?.contains(.gpc) == true ? "Off because your device sends a Global Privacy Control signal." : "Not offered where you are.")
                            .font(.footnote).accessibilityIdentifier("c15t.prefs.category.\(category.rawValue).restricted")
                    }
                }.accessibilityElement(children: .combine)
            }
        }.padding(.vertical, 8).disabled(presenter.pending || presenter.stale || presenter.listUnavailable)
    }
    private var label: some View {
        VStack(alignment: .leading, spacing: 8) { Text(title).font(.body.weight(.semibold)); Text(description).font(.subheadline).foregroundStyle(ConsentColors.secondary) }
    }
}

private struct ReadOnlyDefinition: View {
    let item: GVLDefinition
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(item.name).font(.body.weight(.semibold)); Text("No choice").font(.footnote).foregroundStyle(ConsentColors.secondary)
            Text(item.description).font(.subheadline)
        }.padding(.vertical, 8)
    }
}

private struct PurposeRow: View {
    @ObservedObject var presenter: ConsentPresenter
    let id: Int
    let openPartners: () -> Void
    @State private var expanded = false
    var body: some View {
        if let disclosure = presenter.disclosure, let item = disclosure.list.purposes[id] {
            let li = disclosure.vendors.values.contains { $0.legitimateInterestPurposes.contains(id) }
            VStack(alignment: .leading, spacing: 8) {
                ConsentToggle(item.name, isOn: Binding(get: { presenter.choices.purposeConsents.contains(id) }, set: { presenter.edit(\.purposeConsents, id: id, enabled: $0) }))
                    .font(.body.weight(.semibold)).tint(ConsentColors.accent).accessibilityIdentifier("c15t.iab.purpose.\(id).consent")
                Text(item.description).font(.subheadline).foregroundStyle(ConsentColors.secondary)
                Text(li ? "Asks for consent · Some partners use legitimate interest" : "Asks for consent").font(.footnote).foregroundStyle(ConsentColors.secondary)
                Button { expanded.toggle() } label: { Label("Details", systemImage: expanded ? "chevron.up" : "chevron.down").frame(minHeight: 44) }
                    .buttonStyle(.borderless).accessibilityValue(expanded ? "Expanded" : "Collapsed").accessibilityIdentifier("c15t.iab.purpose.\(id).details")
                if expanded {
                    if let legal = item.descriptionLegal { Text(legal).font(.subheadline) }
                    ForEach(item.illustrations, id: \.self) { Text("• " + $0).font(.subheadline) }
                    Text("Asks for consent: \(disclosure.vendors.values.filter { $0.consentPurposes.contains(id) }.count) partners. Legitimate interest: \(disclosure.vendors.values.filter { $0.legitimateInterestPurposes.contains(id) }.count) partners.").font(.footnote)
                    Button("View partners", action: openPartners).buttonStyle(.borderless).frame(minHeight: 44).accessibilityIdentifier("c15t.iab.purpose.\(id).view-partners")
                    if li {
                        ConsentToggle(isOn: Binding(get: { presenter.choices.purposeLegitimateInterests.contains(id) }, set: { presenter.editLI(purpose: true, id: id, enabled: $0) })) {
                            VStack(alignment: .leading, spacing: 8) { Text("Legitimate interest"); Text("Some partners claim this legal basis. Turn off to object.").font(.footnote) }
                        }.tint(ConsentColors.accent).accessibilityIdentifier("c15t.iab.purpose.\(id).li")
                    }
                }
            }.padding(.vertical, 8).disabled(presenter.pending || presenter.stale || presenter.listUnavailable)
        }
    }
}

private struct VendorList: View {
    @ObservedObject var presenter: ConsentPresenter
    @State var purpose: Int?
    @State private var search = ""
    var body: some View {
        List {
            TextField("Search partners", text: $search).textInputAutocapitalization(.never).autocorrectionDisabled().accessibilityIdentifier("c15t.iab.vendors.search")
            if let purpose {
                Button("Purpose: \(presenter.disclosure?.list.purposes[purpose]?.name ?? "") ×") { self.purpose = nil }
                    .frame(minHeight: 44).accessibilityIdentifier("c15t.iab.vendors.filter.purpose.clear")
            }
            let vendors = (presenter.disclosure?.list.vendors.values.filter { vendor in
                presenter.disclosure?.vendors[vendor.id] != nil && (search.isEmpty || vendor.name.localizedStandardContains(search))
                    && (purpose == nil || presenter.disclosure?.vendors[vendor.id]?.consentPurposes.contains(purpose!) == true || presenter.disclosure?.vendors[vendor.id]?.legitimateInterestPurposes.contains(purpose!) == true)
            } ?? []).sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
            if vendors.isEmpty { Text("No partners match \"\(search)\".").accessibilityIdentifier("c15t.iab.vendors.empty") }
            ForEach(vendors, id: \.id) { vendor in
                NavigationLink(value: Destination.vendor(vendor.id)) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(vendor.name).font(.body.weight(.semibold))
                        if let projection = presenter.disclosure?.vendors[vendor.id] {
                            Text("\(projection.consentPurposes.count) purposes · \(projection.legitimateInterestPurposes.count) on legitimate interest").font(.footnote).foregroundStyle(ConsentColors.secondary)
                        }
                        Text(presenter.partnerStatus(vendor.id)).font(.footnote).accessibilityIdentifier("c15t.iab.vendors.vendor.\(vendor.id).status")
                    }.padding(.vertical, 8)
                }.accessibilityIdentifier("c15t.iab.vendors.vendor.\(vendor.id)")
            }
        }.navigationTitle("IAB partners").navigationBarTitleDisplayMode(.inline)
            .scrollDismissesKeyboard(.immediately).accessibilityIdentifier("c15t.iab.vendors")
    }
}

private struct VendorDetails: View {
    @ObservedObject var presenter: ConsentPresenter
    let id: Int
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
        }.navigationTitle(presenter.disclosure?.list.vendors[id]?.name ?? "Partner").navigationBarTitleDisplayMode(.inline)
            .accessibilityIdentifier("c15t.iab.vendor.\(id)")
    }
    private func links(_ vendor: GVLVendor) -> some View {
        let language = String(Locale.preferredLanguages.first?.prefix(2) ?? "en")
        let urls = vendor.urls.first { $0.langId.lowercased() == language } ?? vendor.urls.first { $0.langId.lowercased() == "en" } ?? vendor.urls.first
        return Section {
            if let value = urls?.privacy, let url = URL(string: value) { Link("Privacy policy", destination: url).buttonStyle(.borderless).frame(minHeight: 44).accessibilityIdentifier("c15t.iab.vendor.\(id).privacy-link") }
            if let value = urls?.legIntClaim, let url = URL(string: value) { Link("Legitimate interest statement", destination: url).buttonStyle(.borderless).frame(minHeight: 44).accessibilityIdentifier("c15t.iab.vendor.\(id).li-claim-link") }
        }
    }
    private func selections(_ projection: IABVendorDisclosure) -> some View {
        Section("Your choices") {
            if !projection.consentPurposes.isEmpty {
                ConsentToggle(isOn: Binding(get: { presenter.choices.vendorConsents.contains(id) }, set: { presenter.edit(\.vendorConsents, id: id, enabled: $0) })) {
                    VStack(alignment: .leading, spacing: 8) { Text("Consent"); Text("For: " + names(projection.consentPurposes)).font(.footnote) }
                }.accessibilityIdentifier("c15t.iab.vendor.\(id).consent")
            }
            if !projection.legitimateInterestPurposes.isEmpty {
                ConsentToggle(isOn: Binding(get: { presenter.choices.vendorLegitimateInterests.contains(id) }, set: { presenter.editLI(purpose: false, id: id, enabled: $0) })) {
                    VStack(alignment: .leading, spacing: 8) { Text("Legitimate interest"); Text("For: " + names(projection.legitimateInterestPurposes) + ". Turn off to object.").font(.footnote) }
                }.accessibilityIdentifier("c15t.iab.vendor.\(id).li")
            }
            if !projection.notAllowedPurposes.isEmpty { Text("This app doesn't allow this partner to: " + names(projection.notAllowedPurposes)).accessibilityIdentifier("c15t.iab.vendor.\(id).not-allowed") }
        }.tint(ConsentColors.accent).disabled(presenter.pending || presenter.stale || presenter.listUnavailable)
    }
    @ViewBuilder private func otherDisclosures(_ vendor: GVLVendor, _ list: GlobalVendorList) -> some View {
        Section("Special purposes") { ForEach(vendor.specialPurposes, id: \.self) { Text((list.specialPurposes[$0]?.name ?? "") + ". No choice.") } }
        Section("Features") { ForEach(vendor.features, id: \.self) { Text((list.features[$0]?.name ?? "") + ". No choice.") } }
        Section("Special features") { ForEach(vendor.specialFeatures, id: \.self) { feature in
            Text((list.specialFeatures[feature]?.name ?? "") + (presenter.choices.specialFeatureOptIns.contains(feature) ? ": On" : ": Off") + ". Set under Special features.")
        } }
        Section("Data collected") { ForEach(vendor.dataCategories ?? [], id: \.self) { Text(list.dataCategories?[$0]?.name ?? "") } }
    }
    private func retention(_ vendor: GVLVendor) -> some View {
        Section("How long data is kept") {
            if let retention = vendor.dataRetention {
                ForEach(retention.purposes.keys.sorted(), id: \.self) { purpose in Text("\(names([purpose])): \(retention.purposes[purpose] ?? 0) days") }
                if let days = retention.stdRetention { Text("Standard retention: \(days) days") }
            } else { Text("Not provided by this partner.") }
        }.accessibilityIdentifier("c15t.iab.vendor.\(id).retention")
    }
    private func storage(_ vendor: GVLVendor) -> some View {
        Section("Device storage") {
            if !vendor.usesCookies && !vendor.usesNonCookieAccess { Text("Doesn't store information on your device.") } else {
                if let seconds = vendor.cookieMaxAgeSeconds { Text("Stores information on your device for up to \(seconds / 86400) days.") }
                Text("Refreshes stored information: \(vendor.cookieRefresh ? "Yes" : "No").")
                Text("Uses other ways to access your device: \(vendor.usesNonCookieAccess ? "Yes" : "No").")
            }
            if let value = vendor.deviceStorageDisclosureUrl, let url = URL(string: value) { Link("Device storage details", destination: url).buttonStyle(.borderless).frame(minHeight: 44) }
        }.accessibilityIdentifier("c15t.iab.vendor.\(id).storage")
    }
}

private struct ProviderList: View {
    @ObservedObject var presenter: ConsentPresenter
    @State private var search = ""
    var body: some View {
        List {
            TextField("Search other partners", text: $search).textInputAutocapitalization(.never).autocorrectionDisabled().accessibilityIdentifier("c15t.ac.search")
            Text("These partners work with Google but aren't in the IAB list. They only use your data if you allow it. Purposes 1, 3 and 4 must also be on.").font(.subheadline)
            let providers = (presenter.disclosure?.adTechProviders ?? []).filter { search.isEmpty || $0.name.localizedStandardContains(search) }.sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
            if providers.isEmpty { Text("No partners match \"\(search)\".").accessibilityIdentifier("c15t.ac.empty") }
            ForEach(providers, id: \.id) { provider in
                VStack(alignment: .leading, spacing: 8) {
                    ConsentToggle(provider.name, isOn: Binding(get: { presenter.choices.adTechProviderConsents?.contains(provider.id) == true }, set: { presenter.editProvider(id: provider.id, enabled: $0) }))
                        .tint(ConsentColors.accent).accessibilityIdentifier("c15t.ac.provider.\(provider.id).switch")
                    if let url = URL(string: provider.policyUrl) { Link("Privacy policy", destination: url).buttonStyle(.borderless).frame(minHeight: 44).accessibilityIdentifier("c15t.ac.provider.\(provider.id).privacy-link") }
                }.padding(.vertical, 8).disabled(presenter.pending || presenter.stale || presenter.listUnavailable)
            }
        }.navigationTitle("Other ad partners").navigationBarTitleDisplayMode(.inline)
            .scrollDismissesKeyboard(.immediately).accessibilityIdentifier("c15t.ac")
    }
}
#endif
