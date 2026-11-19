#if canImport(SwiftUI) && canImport(UIKit)
#if canImport(InthCore)
import InthCore
#endif
import SwiftUI
import UIKit

/// Status colours no theme overrides: a save failure and a stale draft look the same in every app.
private enum StatusColors {
    static let error = ConsentThemeColor(light: 0xB42318, dark: 0xFF9C8F).color
    static let info = ConsentThemeColor(light: 0x1F3A99, dark: 0xC4D0FF).color
    static let infoBackground = ConsentThemeColor(light: 0xE8ECFA, dark: 0x1E2440).color
}

/// The one button shape. `decision` is for Accept all and Reject all, which always share it;
/// `accent` is for Save; `quiet` is for everything that is not a decision.
///
/// `busy` is the one action being committed: it keeps its label and full strength and shows a
/// spinner at its leading edge, while the other, disabled actions fade. The spinner is an
/// overlay so the label never moves and the equal-width layout never reflows mid-save.
private struct ConsentButtonStyle: ButtonStyle {
    var variant: DecisionStyle = .decision
    var busy = false
    /// In the Privacy Settings footer and the notice card: the quiet buttons are tonal, everything
    /// but Save takes less height, and every button is a capsule when the first layer is a card.
    var settings = false
    @Environment(\.consentTheme) private var theme
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.firstLayerChrome) private var chrome
    /// Outside the stock page, Customize is a text action in the accent, not an outlined button.
    private var link: Bool { variant == .quiet && chrome != .standard }
    private var tonal: Bool { settings && variant == .quiet }
    private var compact: Bool { settings && variant != .accent }
    func makeBody(configuration: Configuration) -> some View {
        // A radius past half the height is a capsule at every text size.
        let shape = RoundedRectangle(cornerRadius: chrome.card || (settings && theme.firstLayer != .page) ? 200 : slot?.borderRadius ?? theme.radius.md, style: .continuous)
        configuration.label.font(theme.font(.body, weight: link ? .medium : .semibold, slot: variant.slot))
            .multilineTextAlignment(.center).padding(EdgeInsets(top: link ? 8 : compact ? 11 : 14, leading: 16, bottom: link ? 8 : compact ? 11 : 14, trailing: 16))
            .frame(maxWidth: .infinity, minHeight: link ? 44 : compact ? 46 : 52)
            .foregroundStyle(foreground)
            .background(background, in: shape)
            // One overlay: the stroke fills the bounds whatever the alignment, and the spinner sits above it.
            .overlay(alignment: .leading) {
                if variant == .quiet, !link, !tonal || slot?.backgroundColor != nil { shape.strokeBorder(theme.colors.text.color.opacity(0.18)) }
                if busy { ProgressView().tint(foreground).padding(.leading, 16).accessibilityIdentifier("inth.status.progress") }
            }
            .opacity(configuration.isPressed ? 0.85 : isEnabled || busy ? 1 : 0.5)
            .scaleEffect(configuration.isPressed && !reduceMotion ? 0.98 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
    private var slot: ConsentTheme.SlotStyle? { variant.slot.map { theme.slot($0) } }
    private var foreground: Color {
        switch variant {
        case .decision: chrome.card ? theme.cardDecisionLabel(prompt: chrome == .prompt).color : theme.decisionLabel.color
        case .accent: theme.colors.textOnPrimary.color
        case .quiet: link ? theme.colors.primary.color : (slot?.color ?? theme.colors.text).color
        }
    }
    private var background: Color {
        switch variant {
        // On a card the twins are tonal: an accent tint on the sheet, a neutral one on the prompt.
        // The label is the text colour, or black or white where that would fall under 5:1.
        case .decision:
            switch chrome {
            // Opaque, so the label's contrast never depends on what the app shows behind a prompt.
            case .sheet, .prompt: theme.cardDecisionFill(prompt: chrome == .prompt).color
            case .standard, .system: theme.decisionFill.color
            }
        case .accent: theme.colors.primary.color
        // The settings twins are a tint of the text colour, so they hold on any canvas a host sets.
        case .quiet: link ? Color.clear : slot?.backgroundColor?.color ?? (tonal ? theme.colors.text.color.opacity(0.08) : Color.clear)
        }
    }
}

/// What the first layer is drawn on. Only the first layer sets it; every other screen is `standard`.
enum FirstLayerChrome: Equatable {
    case standard, system, sheet, prompt
    /// A card over the app, not a page.
    var card: Bool { self == .sheet || self == .prompt }
}

private struct FirstLayerChromeKey: EnvironmentKey { static let defaultValue = FirstLayerChrome.standard }
private extension EnvironmentValues {
    var firstLayerChrome: FirstLayerChrome {
        get { self[FirstLayerChromeKey.self] }
        set { self[FirstLayerChromeKey.self] = newValue }
    }
}

extension ConsentTheme {
    /// The first layer's container. Accessibility sizes always get the page, where the decisions
    /// follow the text in one scroll. So does an IAB TCF choice in a wide window: a card there
    /// would cover a fraction of the screen, and the framework wants the choice to cover most of it.
    func firstLayerChrome(accessibilitySize: Bool, iabInWideWindow: Bool = false) -> FirstLayerChrome {
        if accessibilitySize || iabInWideWindow || firstLayer == .page { return appearance == .system ? .system : .standard }
        return firstLayer == .sheet ? .sheet : .prompt
    }
}

/// Height the first layer needs: its text plus its pinned decisions. A card takes exactly that.
private struct FirstLayerHeightKey: PreferenceKey {
    static let defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value += nextValue() }
}
private extension View {
    func countsTowardFirstLayerHeight() -> some View {
        background(GeometryReader { Color.clear.preference(key: FirstLayerHeightKey.self, value: $0.size.height) })
    }
}

private extension DecisionStyle {
    /// The theme slot that restyles this variant. Save keeps the primary colour on purpose.
    var slot: ConsentTheme.Slot? {
        switch self {
        case .decision: .buttonPrimary
        case .accent: nil
        case .quiet: .buttonSecondary
        }
    }
}

/// Text-only actions: links, retries, partner counts, detail toggles. The label itself is the
/// whole 44pt target; a frame added outside a button only pads the layout and leaves the hit
/// area the size of the text.
private struct TextLinkStyle: ButtonStyle {
    var style: Font.TextStyle = .subheadline
    var weight: Font.Weight? = .medium
    /// `nil` is the theme primary.
    var color: Color? = nil
    @Environment(\.consentTheme) private var theme
    @Environment(\.isEnabled) private var isEnabled
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.font(theme.font(style, weight: weight)).foregroundStyle(color ?? theme.colors.primary.color)
            .frame(minHeight: 44).contentShape(Rectangle())
            .opacity(configuration.isPressed ? 0.6 : isEnabled ? 1 : 0.5)
    }
}

private enum Destination: Hashable { case vendors(Int?), vendor(Int), providers, customVendors(Int?), customVendor(String) }

/// Widest a consent column gets; wider screens centre it.
private let contentWidth: CGFloat = 560

/// Where the decisions live. Below the accessibility text sizes they are a pinned footer. From
/// the first accessibility size on, three stacked buttons and a failure row would take most of
/// a short window and need a scroll of their own, so the first layer puts the whole group in
/// the page after the text, and preferences keep one compact pinned action while Reject all and
/// Accept all sit in the page after the introduction. The trigger is the platform's own size
/// class, not a measured height: a layout that changed structure the moment a failure row
/// appeared would move the actions under the thumb.
private extension DynamicTypeSize {
    var actionsInPage: Bool { isAccessibilitySize }
}

/// Add native automatic prompting and standing settings to a SwiftUI root.
/// - Parameters:
///   - presenter: A host-owned presenter attached to its native engine.
///   - privacyPolicyURL: The app's required privacy policy, opened in the system browser.
///   - theme: Appearance. `nil` uses ``ConsentTheme/current`` with the bundle's `Info.plist` values applied.
///   - onNoticeFrameChange: Optional notice bounds for UIKit hosts that pass touches through outside the notice.
public extension View {
    @MainActor
    func inth(presenter: ConsentPresenter, privacyPolicyURL: URL, theme: ConsentTheme? = nil,
        onNoticeFrameChange: ((CGRect) -> Void)? = nil) -> some View {
        modifier(ConsentPresentationModifier(presenter: presenter, privacyPolicyURL: privacyPolicyURL,
            theme: (theme ?? ConsentTheme.resolved()).withSystemAppearance(tint: .appAccent()).withReadableDecisions(),
            onNoticeFrameChange: onNoticeFrameChange))
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
    /// The card is gone: a host that hit-tests against its bounds must stop doing so.
    static func dismantleUIView(_ view: NoticeBoundsView, coordinator: ()) {
        view.onChange?(.zero)
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

/// A refused commit asks the failure row to take VoiceOver focus. Each request is numbered; the
/// row that is on screen, now or once the page has scrolled it in, answers the newest one and marks
/// it handled, so a row the list recycles later does not take the cursor again. If no row answers
/// in time the message is announced instead.
fileprivate final class FailureFocus: ObservableObject {
    @Published private(set) var request = 0
    private(set) var handled = 0
    func post(fallback: String) {
        request += 1
        let number = request
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) { [weak self] in
            guard let self, self.handled < number else { return }
            UIAccessibility.post(notification: .announcement, argument: fallback)
        }
    }
    /// The row takes the newest request if it has not been taken; true when it should focus.
    func claim() -> Bool {
        guard handled < request else { return false }
        handled = request
        return true
    }
}
private struct FailureFocusKey: EnvironmentKey { static let defaultValue = FailureFocus() }
extension EnvironmentValues {
    fileprivate var failureFocus: FailureFocus {
        get { self[FailureFocusKey.self] }
        set { self[FailureFocusKey.self] = newValue }
    }
}

/// The first layer and anything it opens takes the whole screen: it is a gate, and a sheet that
/// cannot be swiped away promises a dismissal it does not offer. Standing preferences opened
/// later are a sheet, because then the app behind them is the user's and they can leave.
private struct ConsentPresentationModifier: ViewModifier {
    @ObservedObject var presenter: ConsentPresenter
    let privacyPolicyURL: URL
    let theme: ConsentTheme
    let onNoticeFrameChange: ((CGRect) -> Void)?
    @State private var failureFocus = FailureFocus()

    private func session(fullScreen: Bool) -> Binding<PresentationSession?> {
        let current = presenter.presentationID
        let style = presenter.presentationStyle
        return Binding(
            get: { current.flatMap { style == (fullScreen ? .fullScreen : .sheet) ? PresentationSession(id: $0) : nil } },
            set: { next in if next == nil, presenter.presentationID == current { presenter.requestClose() } })
    }

    func body(content: Content) -> some View {
        content
            .overlay(alignment: .bottom) {
                if presenter.noticeVisible {
                    NoticeCard(presenter: presenter, privacyPolicyURL: privacyPolicyURL)
                        .padding(12).background(NoticeBoundsReporter(onChange: onNoticeFrameChange))
                        .environment(\.consentTheme, theme).environment(\.failureFocus, failureFocus).environment(\.iabCopy, presenter.iabCopy).environment(\.consentCopy, presenter.copy)
                }
            }
            .fullScreenCover(item: session(fullScreen: true), onDismiss: { presenter.coverDismissed() }) { session in
                ConsentScreen(presenter: presenter, privacyPolicyURL: privacyPolicyURL).id(session.id)
                    .onAppear { presenter.coverAppeared() }
                    .environment(\.consentTheme, theme).environment(\.failureFocus, failureFocus).environment(\.iabCopy, presenter.iabCopy).environment(\.consentCopy, presenter.copy)
                    // The page draws its own canvas; a sheet or prompt leaves the app visible behind it.
                    .presentationBackground(.clear)
            }
            .sheet(item: session(fullScreen: false), onDismiss: { presenter.coverDismissed() }) { session in
                ConsentScreen(presenter: presenter, privacyPolicyURL: privacyPolicyURL).id(session.id)
                    .onAppear { presenter.coverAppeared() }
                    .environment(\.consentTheme, theme).environment(\.failureFocus, failureFocus).environment(\.iabCopy, presenter.iabCopy).environment(\.consentCopy, presenter.copy)
                    .presentationDetents([.large]).presentationDragIndicator(.hidden)
            }
            .onAppear {
                presenter.onAnnouncement = { [failureFocus] text in
                    // A refused commit shows its message in the failure row. VoiceOver is moved onto that
                    // row instead of hearing a detached announcement: the message is spoken once, from the
                    // element, with Try again the next flick to the right. Successes close the screen and
                    // the stale draft shows a callout, so those keep the announcement.
                    if presenter.errorCode != nil, !presenter.stale { failureFocus.post(fallback: text) }
                    else { UIAccessibility.post(notification: .announcement, argument: text) }
                }
            }
    }
}

private struct NoticeCard: View {
    @ObservedObject var presenter: ConsentPresenter
    let privacyPolicyURL: URL
    @Environment(\.consentTheme) private var theme
    @Environment(\.dynamicTypeSize) private var typeSize
    var body: some View {
        let shape = RoundedRectangle(cornerRadius: theme.radius.resolvedLg, style: .continuous)
        VStack(alignment: .leading, spacing: theme.spacing.sm + theme.spacing.xs) {
            Text(presenter.copy.noticeTitle).font(theme.font(.headline)).foregroundStyle(theme.colors.text.color)
                .accessibilityAddTraits(.isHeader).accessibilityIdentifier("inth.notice.title")
            Text(presenter.copy.noticeDescription)
                .font(theme.font(.subheadline)).foregroundStyle(theme.colors.textMuted.color)
            EqualDecisionLayout {
                Button(presenter.copy.acknowledge) { presenter.commit(.acknowledge) }
                    .buttonStyle(ConsentButtonStyle(busy: presenter.showProgress && presenter.pendingAction == .acknowledge, settings: true))
                    .accessibilityIdentifier("inth.notice.acknowledge")
                Button(presenter.copy.privacySettings) { presenter.presentPreferences() }.buttonStyle(ConsentButtonStyle(variant: .quiet, settings: true)).accessibilityIdentifier("inth.notice.settings")
            }
            // The policy link and the provider tag share the card's last line.
            // At accessibility sizes they stack, so neither is squeezed.
            let stacked = typeSize.isAccessibilitySize
            let last = stacked ? AnyLayout(VStackLayout(alignment: .leading, spacing: 0)) : AnyLayout(HStackLayout(spacing: theme.spacing.sm))
            last {
                PrivacyLink(url: privacyPolicyURL, style: .footnote)
                if theme.showsBranding { Branding(id: "inth.notice.branding", alignment: stacked ? .leading : .trailing) }
            }.padding(.vertical, -6)
            if let message = presenter.errorMessage { FailureRow(message: message, id: "inth.notice.error", retry: presenter.retry) }
        }
        .padding(theme.spacing.md + theme.spacing.xs).frame(maxWidth: contentWidth)
        .background(theme.colors.surface.color, in: shape)
        .overlay(shape.strokeBorder(theme.colors.text.color.opacity(0.1)))
        .shadow(color: .black.opacity(0.1), radius: 18, y: 8)
        .disabled(presenter.pending).accessibilityElement(children: .contain).accessibilityIdentifier("inth.notice")
    }
}

private struct PrivacyLink: View {
    let url: URL
    var style: Font.TextStyle = .subheadline
    @Environment(\.consentTheme) private var theme
    @Environment(\.iabCopy) private var copy
    var body: some View {
        Link(copy.preferenceCenterVendorListPrivacyPolicy, destination: url).buttonStyle(TextLinkStyle(style: style)).accessibilityIdentifier("inth.privacy-policy")
    }
}

/// A commit that did not reach durable storage. One red glyph carries the status; the message
/// is ink and Try again follows it in the same text run, in the accent, wrapping like any other
/// word instead of taking a row of its own. One text view draws both and reports where the link
/// landed, so an invisible 44pt button sits over exactly that span: the paragraph never retries,
/// the link always does. To VoiceOver the text view is two elements of its own, the message as
/// static text and then the link as a button over the span, so a finger on the word meets Try
/// again and a flick reads the message first. When the failure arrives the row moves VoiceOver's
/// cursor onto the message, so it is heard once, from the element, with Try again one flick on.
private struct FailureRow: View {
    let message: String
    let id: String
    let retry: () -> Void
    @Environment(\.consentTheme) private var theme
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.failureFocus) private var failureFocus
    @Environment(\.iabCopy) private var copy
    @State private var messageElement: UIView?
    @State private var linkRects: [CGRect] = []
    @State private var pressed = false
    private func takeFocus() {
        guard let messageElement, failureFocus.claim() else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { UIAccessibility.post(notification: .layoutChanged, argument: messageElement) }
    }
    var body: some View {
        let lineHeight = theme.uiFont(.subheadline).lineHeight
        HStack(alignment: .top, spacing: 8) {
            // The glyph follows the text up to the largest non-accessibility size and then holds, so the
            // message keeps its column width where every point of it is lines of text.
            Image(systemName: "exclamationmark.circle.fill").font(theme.font(.subheadline)).foregroundStyle(StatusColors.error)
                .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
                .frame(height: lineHeight).accessibilityHidden(true)
            InlineLinkText(message: message, link: copy.appTryAgain, id: id, theme: theme, enabled: isEnabled, pressed: pressed, retry: retry,
                           onMessageElement: { messageElement = $0 }) { linkRects = $0 }
                .overlay(alignment: .topLeading) {
                    // One target per line the link occupies, so a long translation that wraps never
                    // puts a button over the message text between its two pieces.
                    ForEach(Array(linkRects.enumerated()), id: \.offset) { _, rect in
                        // The hit area grows to 44pt around the span, never into the paragraph's sense: the slop
                        // only reaches the space before the link and the spacing after the row.
                        let size = CGSize(width: max(44, rect.width + 16), height: max(44, rect.height))
                        Button(action: retry) { Color.clear.contentShape(Rectangle()) }
                            .buttonStyle(PressReporter(pressed: $pressed))
                            .frame(width: size.width, height: size.height)
                            .offset(x: rect.midX - size.width / 2, y: rect.midY - size.height / 2)
                            // The text view exposes the link to VoiceOver; this button is the touch target only.
                            .accessibilityHidden(true)
                    }
                }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .onChange(of: messageElement == nil) { _ in takeFocus() }
        .onReceive(failureFocus.$request) { _ in takeFocus() }
    }
}

/// Mirrors a button's pressed state into the text that draws its label.
private struct PressReporter: ButtonStyle {
    @Binding var pressed: Bool
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.onChange(of: configuration.isPressed) { pressed = $0 }
    }
}

/// The failure message and its Try again link in one text run. UIKit lays the text out, so the
/// link's frame comes from the same line breaks the person sees, at every Dynamic Type size and
/// in any language. The view is no accessibility element itself: it holds two, the message as
/// static text and the link as a button over the span.
private struct InlineLinkText: UIViewRepresentable {
    let message: String
    let link: String
    let id: String
    let theme: ConsentTheme
    let enabled: Bool
    let pressed: Bool
    let retry: () -> Void
    let onMessageElement: (UIView) -> Void
    let onLinkRect: ([CGRect]) -> Void

    func makeUIView(context: Context) -> LinkTextHost {
        let host = LinkTextHost()
        let view = host.textView
        view.isEditable = false
        view.isSelectable = false
        view.isScrollEnabled = false
        view.isUserInteractionEnabled = false
        view.backgroundColor = .clear
        view.textContainerInset = .zero
        view.textContainer.lineFragmentPadding = 0
        view.adjustsFontForContentSizeCategory = true
        view.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        DispatchQueue.main.async { onMessageElement(host.messageElement) }
        return host
    }

    func updateUIView(_ host: LinkTextHost, context: Context) {
        let view = host.textView
        // The same family and size as the SwiftUI text around it, so the row's height and the glyph agree.
        let body = theme.uiFont(.subheadline)
        let bold = theme.uiFont(.subheadline, weight: .semibold)
        // A no-break space keeps the label whole; it wraps as one word or not at all.
        let label = link.replacingOccurrences(of: " ", with: "\u{00A0}")
        let text = NSMutableAttributedString(string: message + " ", attributes: [.font: body, .foregroundColor: theme.colors.text.uiColor()])
        text.append(NSAttributedString(string: label, attributes: [
            .font: bold, .foregroundColor: theme.colors.primary.uiColor(alpha: pressed ? 0.6 : enabled ? 1 : 0.5)]))
        view.attributedText = text
        view.linkRange = NSRange(location: (message as NSString).length + 1, length: (label as NSString).length)
        host.messageElement.accessibilityLabel = message
        host.messageElement.accessibilityIdentifier = id
        host.linkElement.accessibilityLabel = link
        host.linkElement.accessibilityIdentifier = id + ".retry"
        host.linkElement.accessibilityTraits = enabled ? .button : [.button, .notEnabled]
        host.linkElement.activate = enabled ? retry : nil
        view.onLinkRect = onLinkRect
        view.setNeedsLayout()
        host.setNeedsLayout()
    }

    func sizeThatFits(_ proposal: ProposedViewSize, uiView: LinkTextHost, context: Context) -> CGSize? {
        let width = proposal.width ?? UIView.layoutFittingExpandedSize.width
        let size = uiView.textView.sizeThatFits(CGSize(width: width, height: .greatestFiniteMagnitude))
        return CGSize(width: proposal.width ?? size.width, height: size.height)
    }
}

/// A plain view around the text view, so the two accessibility regions are ordinary siblings of
/// it rather than children of a text view, whose accessibility has rules of its own.
private final class LinkTextHost: UIView {
    let textView = LinkTextView()
    let messageElement = AccessibilityRegion(traits: .staticText)
    let linkElement = AccessibilityRegion(traits: .button)
    init() {
        super.init(frame: .zero)
        isAccessibilityElement = false
        backgroundColor = .clear
        addSubview(textView)
        addSubview(messageElement)
        addSubview(linkElement)
        textView.onLinkBox = { [weak self] box, linkShape, shape in
            self?.linkElement.frame = box
            self?.linkElement.shape = linkShape
            self?.messageElement.shape = shape
        }
    }
    @available(*, unavailable) required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }
    override func layoutSubviews() {
        super.layoutSubviews()
        textView.frame = bounds
        messageElement.frame = bounds
    }
}

/// An accessibility element with no drawing and no touch handling of its own: a region of the
/// text view that VoiceOver can land on, read and activate.
private final class AccessibilityRegion: UIView {
    var activate: (() -> Void)?
    /// The region's shape in its own coordinates, when it is not its whole frame: the paragraph's
    /// lines with the link cut out, so a finger on the link is outside the paragraph.
    var shape: UIBezierPath? { didSet { accessibilityPath = nil } }
    override var accessibilityPath: UIBezierPath? {
        get { shape.map { UIAccessibility.convertToScreenCoordinates($0, in: self) } }
        set { super.accessibilityPath = newValue }
    }
    init(traits: UIAccessibilityTraits) {
        super.init(frame: .zero)
        isAccessibilityElement = true
        accessibilityTraits = traits
        isUserInteractionEnabled = false
        backgroundColor = .clear
    }
    @available(*, unavailable) required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }
    override func accessibilityActivate() -> Bool {
        guard let activate else { return false }
        activate()
        return true
    }
}

private final class LinkTextView: UITextView {
    var linkRange = NSRange(location: 0, length: 0)
    var onLinkRect: (([CGRect]) -> Void)?
    /// The link's 44pt box, its per-line shape inside that box, and the paragraph's shape without it,
    /// for the host's accessibility regions.
    var onLinkBox: ((CGRect, UIBezierPath, UIBezierPath) -> Void)?
    private var reported: [CGRect] = []
    /// A TextKit 1 stack, built by hand: `layoutSubviews` reads glyph rects from the layout manager,
    /// and only the designated initialiser runs this class's own setup. UIKit's
    /// `init(usingTextLayoutManager:)` convenience path does not, and leaves the regions unmade.
    convenience init() {
        let storage = NSTextStorage()
        let layout = NSLayoutManager()
        let container = NSTextContainer(size: .zero)
        container.widthTracksTextView = true
        layout.addTextContainer(container)
        storage.addLayoutManager(layout)
        self.init(frame: .zero, textContainer: container)
    }
    override init(frame: CGRect, textContainer: NSTextContainer?) {
        super.init(frame: frame, textContainer: textContainer)
        isAccessibilityElement = false
        accessibilityElementsHidden = true
    }
    @available(*, unavailable) required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }
    override func layoutSubviews() {
        super.layoutSubviews()
        guard linkRange.length > 0, linkRange.location + linkRange.length <= textStorage.length else { return }
        let glyphs = layoutManager.glyphRange(forCharacterRange: linkRange, actualCharacterRange: nil)
        // One rect per line the link occupies. A no-break label can still wrap glyph by glyph when
        // a translation is longer than the line, and one enclosing rect would then cover the message.
        var rects: [CGRect] = []
        layoutManager.enumerateEnclosingRects(forGlyphRange: glyphs, withinSelectedGlyphRange: NSRange(location: NSNotFound, length: 0), in: textContainer) { rect, _ in
            rects.append(rect.offsetBy(dx: self.textContainerInset.left, dy: self.textContainerInset.top))
        }
        guard !rects.isEmpty else { return }
        let boxes = rects.map { rect -> CGRect in
            let size = CGSize(width: max(44, rect.width + 16), height: max(44, rect.height))
            return CGRect(x: rect.midX - size.width / 2, y: rect.midY - size.height / 2, width: size.width, height: size.height)
        }
        let box = boxes.dropFirst().reduce(boxes[0]) { $0.union($1) }
        let linkShape = UIBezierPath()
        for target in boxes { linkShape.append(UIBezierPath(rect: target.offsetBy(dx: -box.minX, dy: -box.minY))) }
        // The paragraph's shape is its lines, less each piece of the link and a little air around it.
        let cuts = rects.map { $0.insetBy(dx: -4, dy: -2) }
        let shape = UIBezierPath()
        layoutManager.enumerateLineFragments(forGlyphRange: NSRange(location: 0, length: layoutManager.numberOfGlyphs)) { [textContainerInset] _, used, _, _, _ in
            let line = used.offsetBy(dx: textContainerInset.left, dy: textContainerInset.top)
            guard let cut = cuts.first(where: { line.intersects($0) }) else { shape.append(UIBezierPath(rect: line)); return }
            let left = CGRect(x: line.minX, y: line.minY, width: max(0, cut.minX - line.minX), height: line.height)
            let right = CGRect(x: cut.maxX, y: line.minY, width: max(0, line.maxX - cut.maxX), height: line.height)
            if left.width > 0 { shape.append(UIBezierPath(rect: left)) }
            if right.width > 0 { shape.append(UIBezierPath(rect: right)) }
        }
        onLinkBox?(box, linkShape, shape)
        guard rects != reported else { return }
        reported = rects
        DispatchQueue.main.async { [weak self] in self?.onLinkRect?(rects) }
    }
}

/// A short status line with a tinted background: why the prompt is back, or that the draft is stale.
private struct InfoCallout<Content: View>: View {
    @ViewBuilder let content: Content
    @Environment(\.consentTheme) private var theme
    var body: some View {
        content.font(theme.font(.subheadline)).foregroundStyle(StatusColors.info).padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(StatusColors.infoBackground, in: RoundedRectangle(cornerRadius: theme.radius.resolvedSm, style: .continuous))
    }
}

/// The standard text under a section, in the muted colour whatever the list's own text colour is.
private struct SectionNote: View {
    let text: String
    @Environment(\.consentTheme) private var theme
    init(_ text: String) { self.text = text }
    var body: some View { Text(text).font(theme.font(.footnote)).foregroundStyle(theme.colors.textMuted.color) }
}

private struct SectionLabel: View {
    let text: String
    @Environment(\.consentTheme) private var theme
    init(_ text: String) { self.text = text }
    var body: some View {
        Text(text).font(theme.font(.footnote, weight: .semibold)).foregroundStyle(theme.colors.textMuted.color).textCase(nil)
    }
}

/// The first layer needs no navigation, so it is drawn on its own. The stack that preferences and
/// partner pages need is built the first time either opens and then kept for the session: from
/// then on, going back to the first layer and forward again animates inside the stack as before.
private struct ConsentScreen: View {
    @ObservedObject var presenter: ConsentPresenter
    let privacyPolicyURL: URL
    @State private var path: [Destination] = []
    @State private var navigated = false
    @Environment(\.consentTheme) private var theme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dynamicTypeSize) private var typeSize
    @Environment(\.horizontalSizeClass) private var widthClass
    @Environment(\.verticalSizeClass) private var heightClass
    var body: some View {
        let chrome = theme.firstLayerChrome(accessibilitySize: typeSize.isAccessibilitySize, iabInWideWindow: presenter.iab && (widthClass == .regular || heightClass == .compact))
        // A page stays in the stack once it exists. A card is not in the stack: Back from settings
        // returns to the card over the app, not to its text on a full page.
        let navigates = (navigated && !chrome.card) || presenter.preferences || !path.isEmpty
        ZStack {
            if navigates || !chrome.card { theme.colors.canvas.color.ignoresSafeArea() }
            if navigates {
                NavigatingConsentScreen(presenter: presenter, privacyPolicyURL: privacyPolicyURL, path: $path)
                    .transition(reduceMotion ? .opacity : .move(edge: .trailing))
            } else if chrome.card {
                FirstLayerCard(presenter: presenter, privacyPolicyURL: privacyPolicyURL, path: $path, prompt: chrome == .prompt)
                    .transition(.opacity)
            } else {
                FirstLayer(presenter: presenter, privacyPolicyURL: privacyPolicyURL, path: $path)
                    .transition(reduceMotion ? .opacity : .move(edge: .leading).combined(with: .opacity))
            }
        }
        // Keyed to the switch, not to `preferences`: once the stack exists this never changes again,
        // and the stack's own animation drives every later move.
        .animation(.easeOut(duration: 0.28), value: navigates)
        .onChange(of: navigates) { if $0 { navigated = true } }
        .tint(theme.colors.primary.color)
        .interactiveDismissDisabled(!presenter.allowsInteractiveDismiss)
        .accessibilityHidden(presenter.confirmDiscard)
        .overlay { if presenter.confirmDiscard { DiscardConfirmation(presenter: presenter) } }
    }
}

private struct NavigatingConsentScreen: View {
    @ObservedObject var presenter: ConsentPresenter
    let privacyPolicyURL: URL
    @Binding var path: [Destination]
    @Environment(\.consentTheme) private var theme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dynamicTypeSize) private var typeSize
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
                            if presenter.returnsToFirstLayer { Label(presenter.iabCopy.appBack, systemImage: "chevron.backward").frame(minHeight: 44) }
                            else { Text(presenter.iabCopy.appCancel) }
                        }.disabled(presenter.pending).accessibilityIdentifier("inth.prefs.cancel")
                    }
                    if SaveInBar.shows(presenter, theme: theme, typeSize: typeSize) {
                        ToolbarItem(placement: .confirmationAction) { SaveInBar(presenter: presenter) }
                    }
                }
            }
            .navigationDestination(for: Destination.self) { destination in
                Group {
                    switch destination {
                    case .vendors(let purpose): VendorList(presenter: presenter, purpose: purpose)
                    case .vendor(let id): VendorDetails(presenter: presenter, id: id)
                    case .providers: ProviderList(presenter: presenter)
                    case .customVendors(let purpose): CustomVendorList(presenter: presenter, purpose: purpose)
                    case .customVendor(let id): CustomVendorDetails(presenter: presenter, id: id)
                    }
                }
                // A pushed page is its own view: the root's canvas and bar colour do not follow it.
                .background(theme.colors.canvas.color.ignoresSafeArea())
                .toolbarBackground(theme.colors.canvas.color, for: .navigationBar)
                .toolbarBackground(.visible, for: .navigationBar)
                .navigationBarBackButtonHidden()
                .toolbar {
                    ToolbarItem(placement: .navigationBarLeading) {
                        Button { if !path.isEmpty { path.removeLast() } } label: {
                            Label(presenter.iabCopy.appBack, systemImage: "chevron.backward").frame(minHeight: 44)
                        }.disabled(presenter.pending).accessibilityIdentifier(backIdentifier(destination))
                    }
                }
            }
            .toolbarBackground(theme.colors.canvas.color, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
        }
    }

    private func backIdentifier(_ destination: Destination) -> String {
        switch destination {
        case .vendors: "inth.iab.vendors.back"
        case .vendor: "inth.iab.vendor.back"
        case .providers: "inth.ac.back"
        case .customVendors: "inth.iab.custom-vendors.back"
        case .customVendor: "inth.iab.custom-vendor.back"
        }
    }
}

private struct DiscardConfirmation: View {
    @ObservedObject var presenter: ConsentPresenter
    @Environment(\.consentTheme) private var theme
    var body: some View {
        ZStack {
            Color.black.opacity(0.32).ignoresSafeArea().accessibilityHidden(true)
            VStack(alignment: .leading, spacing: theme.spacing.md) {
                Text(presenter.iabCopy.appDiscardChangesTitle).font(theme.font(.headline)).foregroundStyle(theme.colors.text.color).accessibilityAddTraits(.isHeader)
                Text(presenter.iabCopy.appDiscardChangesDetail).foregroundStyle(theme.colors.textMuted.color)
                Button(presenter.iabCopy.appKeepEditing) { presenter.confirmDiscard = false }
                    .buttonStyle(ConsentButtonStyle()).accessibilityIdentifier("inth.prefs.discard.keep")
                Button(presenter.iabCopy.appDiscardChanges, role: .destructive) { presenter.discard() }
                    .buttonStyle(ConsentButtonStyle(variant: .quiet)).accessibilityIdentifier("inth.prefs.discard.confirm")
            }
            .padding(theme.spacing.lg).background(theme.colors.surface.color, in: RoundedRectangle(cornerRadius: theme.radius.resolvedLg, style: .continuous))
            .padding(theme.spacing.lg).frame(maxWidth: 480).accessibilityElement(children: .contain)
            .accessibilityAddTraits(.isModal).accessibilityIdentifier("inth.prefs.discard")
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
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.horizontalSizeClass) private var widthClass
    @Environment(\.verticalSizeClass) private var heightClass
    @AccessibilityFocusState private var titleFocused: Bool

    var body: some View {
        let page = typeSize.actionsInPage
        let chrome = theme.firstLayerChrome(accessibilitySize: typeSize.isAccessibilitySize, iabInWideWindow: presenter.iab && (widthClass == .regular || heightClass == .compact))
        let centered = chrome == .system
        ScrollViewReader { proxy in
          ScrollView {
            VStack(alignment: centered ? .center : .leading, spacing: chrome.card ? theme.spacing.md - 2 : theme.spacing.md + theme.spacing.xs) {
                // The sheet names the app in one row; the prompt, like a system alert, has no identity.
                if !theme.brand.isHidden, chrome != .prompt {
                    IdentityHeader(identity: ResolvedIdentity.resolve(theme.brand, provider: theme.branding, placeholder: presenter.copy.brandPlaceholder,
                        appIdentity: chrome != .standard), centered: centered, compact: chrome == .sheet)
                }
                if let reason = presenter.draft.promptReason {
                    InfoCallout {
                        Text(reason)
                    }.accessibilityIdentifier("inth.first-layer.reason")
                }
                let headline = Text(theme.copy.headline ?? presenter.copy.headline)
                    .font(chrome == .sheet ? theme.font(.title2, weight: .bold) : chrome == .prompt ? theme.font(.title3, weight: .semibold)
                        : centered ? theme.typography.headlineFont.font(.largeTitle, weight: .bold, size: theme.slot(.consentBannerTitle).fontSize ?? theme.typography.fontSize.lg)
                        : theme.firstLayerHeadlineFont)
                    .foregroundStyle((theme.slot(.consentBannerTitle).color ?? theme.colors.text).color).multilineTextAlignment(centered ? .center : .leading)
                    .accessibilityAddTraits(.isHeader).accessibilityIdentifier("inth.first-layer.title").accessibilityFocused($titleFocused)
                // The balanced layout sets its text at the leading edge; a centred headline wraps as text does.
                if centered { headline } else { BalancedTextLayout { headline } }
                Text(theme.copy.introduction ?? presenter.copy.introduction).font(theme.font(chrome.card ? .subheadline : .body, slot: .consentBannerDescription))
                    .foregroundStyle((theme.slot(.consentBannerDescription).color ?? (centered ? theme.colors.textMuted : theme.colors.text)).color)
                    .multilineTextAlignment(centered ? .center : .leading)
                    .frame(maxWidth: .infinity, alignment: centered ? .center : .leading)
                    .accessibilityIdentifier("inth.first-layer.body")
                // The IAB sentences come from the IAB copy, never from the host theme.
                if let content = presenter.iabFirstLayer {
                    IABDisclosure(content: content, symbols: chrome == .system ? SummarySymbols(list: presenter.disclosure?.list) : nil, openPartners: openPartners)
                } else {
                    Text(presenter.copy.firstLayerDescription)
                        .font(theme.font(chrome == .standard ? .subheadline : .footnote)).foregroundStyle(theme.colors.textMuted.color)
                        .multilineTextAlignment(centered ? .center : .leading)
                }
                PrivacyLink(url: privacyPolicyURL, style: chrome == .standard ? .subheadline : .footnote)
                // At accessibility sizes the decisions follow the text they decide on.
                if page { DecisionGroup(presenter: presenter, first: true, part: .all, path: $path).padding(.top, 4).id(DecisionGroup.errorID(first: true)) }
            }
            .padding(.horizontal, chrome.card ? theme.spacing.lg - 2 : theme.spacing.lg)
            .padding(.top, chrome.card ? theme.spacing.lg - 2 : centered ? (presenter.iab ? theme.spacing.xl * 2 : theme.spacing.xl * 3 + theme.spacing.lg) : theme.spacing.xl + theme.spacing.sm)
            .padding(.bottom, chrome.card ? theme.spacing.xs : theme.spacing.md)
            .frame(maxWidth: contentWidth, alignment: .leading).frame(maxWidth: .infinity)
            .countsTowardFirstLayerHeight()
          }
          .scrollBounceBehavior(.basedOnSize)
          // On a card the disclosures can run past its height: say so once, as the card arrives.
          .modifier(FlashesScrollIndicators(enabled: chrome.card))
          .onChange(of: presenter.errorCode) { code in
              guard code != nil, page else { return }
              DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                  withAnimation(reduceMotion ? nil : .easeOut(duration: 0.25)) { proxy.scrollTo(DecisionGroup.errorID(first: true), anchor: nil) }
              }
          }
        }
        // The first choice is a page with its own top edge; the bar only appears once settings push in.
        .toolbar(.hidden, for: .navigationBar)
        .accessibilityIdentifier("inth.first-layer")
        .modifier(PinnedFooter(below: chrome.card) { DecisionFooter(presenter: presenter, first: true, path: $path).countsTowardFirstLayerHeight() })
        .modifier(SideBrandingPlacement(enabled: theme.showsBranding && !presenter.snapshot.policyPending && !presenter.listUnavailable))
        .environment(\.firstLayerChrome, chrome)
        .onAppear { titleFocused = true }
    }

    private func openPartners() {
        // While a decision is being saved there are no settings to open the list in.
        guard !presenter.pending else { return }
        presenter.customize()
        path.append(.vendors(nil))
    }
}

/// The decisions under the first layer's text. On a page they are a bottom inset, so the text
/// scrolls behind an opaque footer. A card can be translucent, so there the footer is a row of its
/// own under the scroll view and the text never passes behind the buttons.
private struct PinnedFooter<Footer: View>: ViewModifier {
    let below: Bool
    @ViewBuilder let footer: Footer
    func body(content: Content) -> some View {
        if below {
            VStack(spacing: 0) { content; footer }
        } else {
            content.safeAreaInset(edge: .bottom, spacing: 0) { footer }
        }
    }
}

/// A symbol for each line of the first-layer summary, on the system page. The summary holds
/// standard names from the vendor list, so the list tells which purpose, stack or special
/// feature a line is. Symbols only label the rows; the standard names stay the text.
struct SummarySymbols {
    private var byName: [String: String] = [:]
    private static let purposes: [Int: String] = [
        1: "internaldrive", 2: "megaphone", 3: "person.2", 4: "person.crop.rectangle", 5: "person.text.rectangle",
        6: "doc.richtext", 7: "chart.bar", 8: "chart.line.uptrend.xyaxis", 9: "chart.pie", 10: "wrench.and.screwdriver", 11: "doc.text",
    ]
    private static let specialFeatures: [Int: String] = [1: "location", 2: "iphone.radiowaves.left.and.right"]
    private static let specialPurposes: [Int: String] = [1: "lock.shield", 2: "paperplane", 3: "checkmark.seal"]
    private static let features: [Int: String] = [1: "arrow.triangle.merge", 2: "laptopcomputer.and.iphone", 3: "antenna.radiowaves.left.and.right"]
    private static let categories: [String: String] = [
        "necessary": "checkmark.shield", "experience": "sparkles", "functionality": "gearshape",
        "marketing": "megaphone", "measurement": "chart.bar",
    ]
    static let stack = "square.stack.3d.up"
    static let iabPartners = "building.2"
    static let adTechProviders = "g.circle"
    static let customPartners = "person.3"

    /// Symbols for the rows of Privacy Settings, by the vendor list's own ids.
    static func purpose(_ id: Int) -> String { purposes[id] ?? stack }
    static func specialFeature(_ id: Int) -> String { specialFeatures[id] ?? stack }
    static func specialPurpose(_ id: Int) -> String { specialPurposes[id] ?? stack }
    static func feature(_ id: Int) -> String { features[id] ?? stack }
    static func category(_ id: String) -> String { categories[id] ?? "slider.horizontal.3" }

    init(list: GlobalVendorList?) {
        guard let list else { return }
        for (_, stack) in list.stacks { byName[stack.name] = Self.stack }
        for (id, feature) in list.specialFeatures { byName[feature.name] = Self.specialFeatures[id] ?? Self.stack }
        // Purposes last: a purpose and a stack never share a name, and the purpose is the exact match.
        for (id, purpose) in list.purposes { byName[purpose.name] = Self.purposes[id] ?? Self.stack }
    }

    func symbol(for line: String) -> String { byName[line] ?? Self.stack }
}

private struct FlashesScrollIndicators: ViewModifier {
    let enabled: Bool
    func body(content: Content) -> some View {
        if #available(iOS 17, *), enabled { content.scrollIndicatorsFlash(onAppear: true) } else { content }
    }
}

/// The first layer as a card over the app: a floating sheet at the bottom, or a centred prompt.
/// It holds the same ``FirstLayer`` the page shows and is as tall as that needs, up to most of
/// the window; past that the text scrolls and the decisions stay pinned under a rule.
private struct FirstLayerCard: View {
    @ObservedObject var presenter: ConsentPresenter
    let privacyPolicyURL: URL
    @Binding var path: [Destination]
    let prompt: Bool
    @Environment(\.consentTheme) private var theme
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var height: CGFloat = 0
    @State private var arrived = false

    var body: some View {
        GeometryReader { geometry in
            let limit = geometry.size.height * (prompt ? 0.72 : 0.84)
            let shape = RoundedRectangle(cornerRadius: prompt ? 34 : 36, style: .continuous)
            ZStack(alignment: prompt ? .center : .bottom) {
                Color.black.opacity(arrived ? (prompt ? 0.32 : 0.4) : 0).ignoresSafeArea().accessibilityHidden(true)
                FirstLayer(presenter: presenter, privacyPolicyURL: privacyPolicyURL, path: $path)
                    .frame(height: height > 0 ? min(height, limit) : limit)
                    .frame(maxWidth: prompt ? 340 : 520)
                    .clipShape(shape)
                    .modifier(CardSurface(prompt: prompt, shape: shape))
                    .padding(.horizontal, prompt ? 24 : 8).padding(.bottom, prompt ? 0 : 4)
                    .onPreferenceChange(FirstLayerHeightKey.self) { height = $0 }
                    .accessibilityAddTraits(.isModal)
                    .accessibilityIdentifier(prompt ? "inth.first-layer.prompt" : "inth.first-layer.sheet")
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: prompt ? .center : .bottom)
        }
        .onAppear { withAnimation(reduceMotion ? nil : .easeOut(duration: 0.25)) { arrived = true } }
    }
}

/// The sheet is the app's own surface. The prompt is translucent like a system alert: glass
/// where the system has it, a material before that, so the app shows through in both.
private struct CardSurface: ViewModifier {
    let prompt: Bool
    let shape: RoundedRectangle
    @Environment(\.consentTheme) private var theme
    @Environment(\.colorScheme) private var scheme
    func body(content: Content) -> some View {
        // Depth is a shadow in light and a ring in dark, where a shadow cannot be seen.
        let ring = shape.strokeBorder(scheme == .dark ? Color.white.opacity(0.09) : Color.black.opacity(0.05))
        if !prompt {
            content.background(theme.colors.surface.color, in: shape).overlay(ring)
                .shadow(color: .black.opacity(scheme == .dark ? 0 : 0.14), radius: 24, y: 12)
        } else if #available(iOS 26, *) {
            content.glassEffect(.regular, in: shape)
        } else {
            content.background(.regularMaterial, in: shape).overlay(ring)
                .shadow(color: .black.opacity(scheme == .dark ? 0 : 0.18), radius: 30, y: 14)
        }
    }
}

/// The web prompt's order: description and partners link, the purpose summary on a quieter
/// surface, then legitimate interest, scope and withdrawal. Its own view, so a first layer
/// outside IAB mode never builds these types.
private struct IABDisclosure: View {
    let content: IABFirstLayerContent
    /// Symbols for the summary rows, on the system page.
    var symbols: SummarySymbols? = nil
    let openPartners: () -> Void
    @Environment(\.consentTheme) private var theme
    @Environment(\.firstLayerChrome) private var chrome
    /// The description is supporting text under the introduction, smaller on a card.
    private var descriptionStyle: Font.TextStyle { chrome.card ? .footnote : .subheadline }

    /// The description with its partners link inline, as on the web. The link opens the partner
    /// list; the button under the summary opens the same list with a full-size target.
    private func description(_ content: IABFirstLayerContent) -> AttributedString {
        var text = AttributedString(content.descriptionLead)
        var link = AttributedString(content.partnersLink)
        link.link = URL(string: "inth-partners:list")
        link.font = theme.font(descriptionStyle, weight: .semibold)
        link.underlineStyle = .single
        text += link
        text += AttributedString(content.descriptionTail)
        return text
    }

    var body: some View {
        Text(description(content)).font(theme.font(descriptionStyle)).foregroundStyle(theme.colors.textMuted.color)
            .tint(theme.colors.primary.color)
            .environment(\.openURL, OpenURLAction { _ in openPartners(); return .handled })
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityIdentifier("inth.first-layer.description")
        switch chrome {
        case .standard: summaryCard
        case .system: summaryRows
        case .sheet: summaryBullets(boxed: true)
        case .prompt: summaryBullets(boxed: false)
        }
        VStack(alignment: .leading, spacing: chrome == .standard ? 12 : chrome == .system ? 8 : 6) {
            Text(content.legitimateInterestNotice).accessibilityIdentifier("inth.first-layer.legitimate-interest")
            Text(content.scope).accessibilityIdentifier("inth.first-layer.scope")
            Text(content.withdraw).accessibilityIdentifier("inth.first-layer.withdraw")
        }
        .font(theme.font(chrome == .standard ? .subheadline : chrome == .system ? .footnote : .caption)).foregroundStyle(theme.colors.textMuted.color)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// Every summary line: the names, then "and N more" when the list was cut.
    private var lines: [(id: String, text: String)] {
        content.summaryItems.enumerated().map { ("inth.first-layer.summary.item.\($0.offset)", $0.element) }
            + (content.moreItems.map { [("inth.first-layer.summary.more", $0)] } ?? [])
    }

    /// A dot in the accent, on the first line of its text.
    private func dot(_ size: CGFloat) -> some View {
        Circle().fill(theme.colors.primary.color).frame(width: size, height: size).accessibilityHidden(true)
    }

    /// The sheet's and the prompt's summary: one line each at supporting size, under a dot. The
    /// sheet sets them on a quieter box; the prompt, like an alert, sets them as plain text.
    @ViewBuilder private func summaryBullets(boxed: Bool) -> some View {
        let list = VStack(alignment: .leading, spacing: boxed ? 7 : 5) {
            ForEach(lines, id: \.id) { line in
                HStack(alignment: .firstTextBaseline, spacing: boxed ? 8 : 6) {
                    dot(boxed ? 5 : 4).alignmentGuide(.firstTextBaseline) { $0[.bottom] + 3 }
                    Text(line.text).font(theme.font(.footnote)).foregroundStyle(theme.colors.text.color)
                        .accessibilityIdentifier(line.id)
                }
            }
        }.frame(maxWidth: .infinity, alignment: .leading)
        if boxed {
            list.padding(14).background(theme.colors.textMuted.color.opacity(0.12), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        } else {
            list
        }
        // The inline link has no target of its own: this is the partner list at 44pt, with the selector suites tap.
        Button(action: openPartners) {
            Label(content.partnersLink, systemImage: "chevron.forward").labelStyle(TrailingIconLabelStyle())
        }
        .buttonStyle(TextLinkStyle(style: .footnote)).padding(.vertical, -8)
        .accessibilityLabel(content.partnersLink).accessibilityIdentifier("inth.first-layer.partner-count")
    }

    /// The system page's summary: a grouped list, each line under a dot, ending in the partners row.
    private var summaryRows: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(lines, id: \.id) { line in
                HStack(spacing: 14) {
                    Image(systemName: line.id.hasSuffix(".more") ? "ellipsis" : symbols?.symbol(for: line.text) ?? SummarySymbols.stack)
                        .font(theme.font(.body)).foregroundStyle(theme.colors.primary.color).frame(width: 28).accessibilityHidden(true)
                    Text(line.text).font(theme.font(.subheadline)).foregroundStyle(theme.colors.text.color)
                        .frame(maxWidth: .infinity, alignment: .leading).accessibilityIdentifier(line.id)
                }.padding(.horizontal, 16).padding(.vertical, 11)
                Hairline().padding(.leading, 58)
            }
            Button(action: openPartners) {
                HStack(spacing: 14) {
                    Image(systemName: "building.2").font(theme.font(.body)).foregroundStyle(theme.colors.primary.color).frame(width: 28).accessibilityHidden(true)
                    Text(content.partnersLink).font(theme.font(.subheadline, weight: .medium)).foregroundStyle(theme.colors.text.color)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    Image(systemName: "chevron.forward").font(theme.font(.footnote, weight: .semibold)).foregroundStyle(theme.colors.textMuted.color.opacity(0.6)).accessibilityHidden(true)
                }.padding(.horizontal, 16).frame(minHeight: 46).contentShape(Rectangle())
            }
            .buttonStyle(.plain).accessibilityLabel(content.partnersLink).accessibilityIdentifier("inth.first-layer.partner-count")
        }
        .background(theme.colors.surface.color, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }

    /// The stock page's summary on a quieter surface.
    private var summaryCard: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(content.summaryItems.enumerated()), id: \.offset) { index, item in
                Text(item).font(theme.font(.subheadline)).foregroundStyle(theme.colors.text.color)
                    .frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 16).padding(.vertical, 10)
                    .accessibilityIdentifier("inth.first-layer.summary.item.\(index)")
                Hairline().padding(.leading, 16)
            }
            if let more = content.moreItems {
                Text(more).font(theme.font(.subheadline)).foregroundStyle(theme.colors.textMuted.color)
                    .frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 16).padding(.vertical, 10)
                    .accessibilityIdentifier("inth.first-layer.summary.more")
                Hairline().padding(.leading, 16)
            }
            // Ink with a chevron, not a blue link: small blue text doesn't reach 4.5:1 on the muted surface.
            Button(action: openPartners) {
                HStack(spacing: 4) {
                    Text(content.partnersLink)
                    Image(systemName: "chevron.forward").font(theme.font(.caption2, weight: .bold)).foregroundStyle(theme.colors.textMuted.color)
                }
            }
            .buttonStyle(TextLinkStyle(style: .footnote, weight: .semibold, color: theme.colors.text.color))
            .accessibilityLabel(content.partnersLink)
            .accessibilityIdentifier("inth.first-layer.partner-count")
            .padding(.horizontal, 16)
        }
        .padding(.vertical, 6)
        .background(theme.colors.surfaceMuted.color, in: RoundedRectangle(cornerRadius: theme.radius.md + 2, style: .continuous))
    }
}

private struct Hairline: View {
    @Environment(\.consentTheme) private var theme
    // The scale of the screen this view is on, not `UIScreen.main`, which iOS 26
    // deprecates and which reports the wrong screen on an external display.
    @Environment(\.displayScale) private var displayScale
    var body: some View { Rectangle().fill(theme.colors.text.color.opacity(0.1)).frame(height: 1 / displayScale) }
}

private enum BrandingAnchor { case customize, inline }

private struct BrandingAnchorsKey: PreferenceKey {
    static let defaultValue: [BrandingAnchor: Anchor<CGRect>] = [:]
    static func reduce(value: inout [BrandingAnchor: Anchor<CGRect>], nextValue: () -> [BrandingAnchor: Anchor<CGRect>]) {
        value.merge(nextValue(), uniquingKeysWith: { _, next in next })
    }
}

private struct BrandingInOverlayKey: EnvironmentKey {
    static let defaultValue = false
}

private extension EnvironmentValues {
    var brandingInOverlay: Bool {
        get { self[BrandingInOverlayKey.self] }
        set { self[BrandingInOverlayKey.self] = newValue }
    }
}

private struct ProviderSignature: View {
    /// The stacked tag in a side column has room for a larger mark.
    var large = false
    @Environment(\.consentTheme) private var theme
    var body: some View {
        HStack(spacing: 4) {
            switch theme.branding {
            case .inth:
                // The wordmark is the name; no text follows it.
                ConsentProviderMark(branding: .inth, wordmark: true).fill(style: FillStyle(eoFill: true))
                    .frame(width: large ? 47 : 35, height: large ? 16 : 12).accessibilityHidden(true)
            case .c15t:
                ConsentProviderMark(branding: theme.branding).fill(style: FillStyle(eoFill: true))
                    .frame(width: 15, height: 15).accessibilityHidden(true)
                Text(theme.branding.name).fontWeight(.semibold)
            case .custom(let name, let imageName):
                if let imageName { ProviderImage(name: imageName) }
                Text(name).fontWeight(.semibold)
            }
        }
    }
}

private struct ProviderImage: View {
    let name: String
    var body: some View {
        Image(name).resizable().scaledToFit().frame(width: 15, height: 15)
            .accessibilityHidden(true)
    }
}

private struct Branding: View {
    var id = "inth.first-layer.branding"
    var alignment = Alignment.center
    @Environment(\.consentTheme) private var theme
    @Environment(\.consentCopy) private var copy
    var body: some View {
        HStack(spacing: 5) {
            Text(copy.securedBy)
            ProviderSignature()
        }
        .font(theme.font(.caption2)).foregroundStyle(theme.colors.textMuted.color)
        .frame(maxWidth: .infinity, alignment: alignment)
        .accessibilityElement(children: .ignore).accessibilityLabel("\(copy.securedBy) \(theme.branding.name)")
        .accessibilityIdentifier(id)
    }
}

private struct CompactBranding: View {
    @Environment(\.consentTheme) private var theme
    @Environment(\.consentCopy) private var copy
    var body: some View {
        VStack(spacing: 5) {
            Text(copy.securedBy).font(theme.font(.caption2))
            ProviderSignature(large: true).font(theme.font(.caption))
        }
        .foregroundStyle(theme.colors.textMuted.color)
        .fixedSize()
        .accessibilityElement(children: .ignore).accessibilityLabel("\(copy.securedBy) \(theme.branding.name)")
        .accessibilityIdentifier("inth.first-layer.branding")
    }
}

private struct SideBrandingPlacement: ViewModifier {
    let enabled: Bool
    func body(content: Content) -> some View {
        #if canImport(SwiftUI, _version: 8.1)
        if #available(iOS 27.1, *) {
            content.modifier(VerticalBrandingPlacement(enabled: enabled))
        } else {
            content
        }
        #else
        content
        #endif
    }
}

#if canImport(SwiftUI, _version: 8.1)
@available(iOS 27.1, *)
private struct VerticalBrandingPlacement: ViewModifier {
    let enabled: Bool
    @Environment(\.toolbarVerticalEdge) private var edge
    @Environment(\.dynamicTypeSize) private var typeSize
    @Environment(\.layoutDirection) private var layoutDirection
    @State private var contentFrame: CGRect = .zero
    @State private var brandSize: CGSize = .zero

    func body(content: Content) -> some View {
        if enabled && edge != nil && !typeSize.isAccessibilitySize {
            content
                .environment(\.brandingInOverlay, true)
                .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { contentFrame = $0 }
                .overlayPreferenceValue(BrandingAnchorsKey.self) { anchors in
                    GeometryReader { geometry in
                        let bounds = CGRect(origin: .zero, size: geometry.size)
                        let origin = geometry.frame(in: .global).origin
                        let safe = contentFrame.offsetBy(dx: -origin.x, dy: -origin.y)
                        let button = anchors[.customize].map { geometry[$0] } ?? .zero
                        let reserved = geometry.reservedRegions(kind: .occlusion, layoutDirectionBehavior: .fixed)
                            + geometry.reservedRegions(kind: .division, layoutDirectionBehavior: .fixed)
                        let onLeft = (edge == .leading) == (layoutDirection == .leftToRight)
                        let candidate = anchors[.customize] != nil
                            ? SideBrandingFrame.resolve(canvas: bounds, content: safe, anchor: button,
                                size: brandSize, onLeft: onLeft, reserved: reserved.map(\.frame))
                            : nil
                        ZStack(alignment: .topLeading) {
                            Color.clear
                            if let candidate {
                                // Reserved regions use physical coordinates; position mirrors in RTL.
                                let x = layoutDirection == .rightToLeft ? bounds.width - candidate.midX : candidate.midX
                                CompactBranding().position(x: x, y: candidate.midY)
                            } else if let anchor = anchors[.inline] {
                                let slot = geometry[anchor]
                                let x = layoutDirection == .rightToLeft ? bounds.width - slot.midX : slot.midX
                                Branding().frame(width: slot.width, height: slot.height)
                                    .position(x: x, y: slot.midY)
                            }
                        }
                    }
                    .allowsHitTesting(false)
                    .ignoresSafeArea(.container, edges: .horizontal)
                }
                .overlay(alignment: .topLeading) {
                    CompactBranding().hidden().accessibilityHidden(true)
                        .onGeometryChange(for: CGSize.self) { $0.size } action: { brandSize = $0 }
                }
        } else {
            content
        }
    }
}

#endif

/// The decision controls and the failure row beside them, in one of four cuts. `all` is the
/// whole group: the pinned footer below accessibility sizes, the end of the first layer's page
/// at them. The other three are the accessibility-size cuts of preferences: `shortcuts` after
/// the introduction, `pinned` in the compact footer, `pinnedStatus` as the page's last row, so
/// a failure sits beside the control that failed rather than in a tray that grows past the window.
private struct DecisionGroup: View {
    enum Part { case all, shortcuts, pinned, pinnedStatus }
    @ObservedObject var presenter: ConsentPresenter
    let first: Bool
    let part: Part
    @Binding var path: [Destination]
    @Environment(\.consentTheme) private var theme

    static func errorID(first: Bool) -> String { (first ? "inth.first-layer" : "inth.prefs") + ".error" }
    /// The one action a compact footer keeps at accessibility sizes, if any.
    static func pinnedAction(_ presenter: ConsentPresenter) -> ConsentPresenter.Action? {
        if presenter.stale { return nil }
        if presenter.snapshot.policyPending { return .reject }
        return presenter.listUnavailable ? nil : .save
    }
    static func showsPinned(_ presenter: ConsentPresenter) -> Bool { presenter.stale || pinnedAction(presenter) != nil }
    static func showsShortcuts(_ presenter: ConsentPresenter) -> Bool { !presenter.stale && !presenter.snapshot.policyPending }
    static func showsPinnedStatus(_ presenter: ConsentPresenter) -> Bool {
        !presenter.stale && presenter.failedAction != nil && presenter.failedAction == pinnedAction(presenter)
    }

    var body: some View {
        VStack(spacing: theme.spacing.sm + theme.spacing.xs) {
            switch part {
            case .all:
                if presenter.stale { reload } else {
                    failure
                    DecisionRows(presenter: presenter, first: first, part: part)
                }
            case .pinned:
                if presenter.stale { reload }
                else if let action = Self.pinnedAction(presenter) {
                    let labels = presenter.decisionLabels
                    DecisionButton(presenter, first: first, label: action == .save ? labels.save : labels.rejectAll, action: action)
                }
            case .shortcuts:
                if Self.showsShortcuts(presenter) {
                    if presenter.failedAction != Self.pinnedAction(presenter) { failure }
                    DecisionRows(presenter: presenter, first: first, part: part)
                }
            case .pinnedStatus:
                if Self.showsPinnedStatus(presenter) { failure }
            }
        }
        .disabled(presenter.pending)
    }

    private var reload: ActionButton {
        ActionButton(label: presenter.iabCopy.appLoadCurrentSettings, variant: .accent, id: "inth.prefs.stale.reload") { [presenter] in presenter.loadDraft() }
    }
    @ViewBuilder private var failure: some View {
        if let message = presenter.errorMessage {
            FailureRow(message: message, id: Self.errorID(first: first), retry: presenter.retry)
        }
    }
}

/// The decisions of the `all` and `shortcuts` cuts. Each case that is not on screen is its own
/// view or a leaf button, so a page builds only the controls it shows.
private struct DecisionRows: View {
    @ObservedObject var presenter: ConsentPresenter
    let first: Bool
    let part: DecisionGroup.Part
    @Environment(\.consentTheme) private var theme
    @Environment(\.brandingInOverlay) private var brandingInOverlay
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        let labels = presenter.decisionLabels
        if presenter.snapshot.policyPending {
            DecisionButton(presenter, first: first, label: labels.rejectAll, action: .reject)
        } else if presenter.listUnavailable {
            ListOutdatedRows(presenter: presenter, first: first)
        } else {
            let plan = DecisionPlan.rows(first: first, labels: labels)
            EqualDecisionLayout {
                ForEach(plan.pair, id: \.label) { control in decision(control) }
            }
            if first {
                decision(plan.next)
                    .anchorPreference(key: BrandingAnchorsKey.self, value: .bounds) { [.customize: $0] }
                if theme.showsBranding {
                    // One overlay owns both placements; the placeholder keeps Customize stationary.
                    if brandingInOverlay {
                        Branding().hidden().accessibilityHidden(true)
                            .anchorPreference(key: BrandingAnchorsKey.self, value: .bounds) { [.inline: $0] }
                    } else {
                        Branding()
                    }
                }
            } else if part == .all, !SaveInBar.shows(presenter, theme: theme, typeSize: typeSize) {
                decision(plan.next)
            }
        }
    }

    @ViewBuilder private func decision(_ control: DecisionControl) -> some View {
        if control.kind == .customize {
            ActionButton(label: control.label, variant: control.style, id: "inth.first-layer.customize") { [presenter] in presenter.customize() }
        } else {
            DecisionButton(presenter, first: first, label: control.label,
                action: control.kind == .reject ? .reject : control.kind == .accept ? .accept : .save, style: control.style)
        }
    }
}

/// The list could not be refreshed: Reject all stays available beside Try again.
private struct ListOutdatedRows: View {
    @ObservedObject var presenter: ConsentPresenter
    let first: Bool
    @Environment(\.consentTheme) private var theme
    var body: some View {
        Text(presenter.iabCopy.appListOutdated)
            .font(theme.font(.subheadline)).foregroundStyle(theme.colors.textMuted.color).frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityIdentifier(first ? "inth.first-layer.list-stale" : "inth.iab.list-stale")
        EqualDecisionLayout {
            DecisionButton(presenter, first: first, label: presenter.decisionLabels.rejectAll, action: .reject)
            ActionButton(label: presenter.iabCopy.appTryAgain, variant: .quiet, id: first ? "inth.first-layer.retry" : "inth.iab.retry") { [presenter] in presenter.refresh() }
        }
    }
}

/// A button in the decision shape that does not commit: Customize, Try again, Load current settings.
private struct ActionButton: View {
    let label: String
    let variant: DecisionStyle
    let id: String
    let action: () -> Void
    var body: some View {
        Button(label, action: action).buttonStyle(ConsentButtonStyle(variant: variant)).accessibilityIdentifier(id)
    }
}

/// Labels stay put while a commit runs: the pressed action shows progress beside its own
/// label, and the others fade as disabled, so the person can still see what is being saved.
private struct DecisionButton: View {
    let label: String
    let variant: DecisionStyle
    let busy: Bool
    let settings: Bool
    let savingLabel: String
    let id: String
    let commit: () -> Void
    @MainActor init(_ presenter: ConsentPresenter, first: Bool, label: String, action: ConsentPresenter.Action, style: DecisionStyle? = nil) {
        self.label = label
        self.variant = style ?? (action == .save ? .accent : first ? .decision : .quiet)
        self.busy = presenter.showProgress && presenter.pendingAction == action
        self.settings = !first
        self.savingLabel = presenter.copy.saving
        self.id = Self.identifier(first: first, iab: presenter.iab, action: action)
        self.commit = { presenter.commit(action) }
    }
    /// Each decision's selector, spelled out whole: E2E suites tap these, and
    /// `scripts/native-consent-selectors.test.ts` looks for every one in the source.
    fileprivate static func identifier(first: Bool, iab: Bool, action: ConsentPresenter.Action) -> String {
        switch action {
        case .accept: first ? "inth.first-layer.accept-all" : iab ? "inth.iab.accept-all" : "inth.prefs.accept-all"
        case .reject: first ? "inth.first-layer.reject-all" : iab ? "inth.iab.reject-all" : "inth.prefs.reject-all"
        case .save: first ? "inth.first-layer.save" : iab ? "inth.iab.save" : "inth.prefs.save"
        case .acknowledge: first ? "inth.first-layer.acknowledge" : iab ? "inth.iab.acknowledge" : "inth.prefs.acknowledge"
        }
    }
    var body: some View {
        Button(label, action: commit)
            .buttonStyle(ConsentButtonStyle(variant: variant, busy: busy, settings: settings))
            .accessibilityLabel(label).accessibilityValue(busy ? savingLabel : "").accessibilityIdentifier(id)
    }
}

/// Save Settings in the navigation bar, for themes that place it at the top. It carries the
/// footer button's identifier, so a suite that taps Save finds it in either place.
private struct SaveInBar: View {
    @ObservedObject var presenter: ConsentPresenter
    @MainActor static func shows(_ presenter: ConsentPresenter, theme: ConsentTheme, typeSize: DynamicTypeSize) -> Bool {
        theme.savePlacement == .top && !typeSize.actionsInPage && presenter.preferences
            && !presenter.stale && !presenter.snapshot.policyPending && !presenter.listUnavailable
    }
    var body: some View {
        // The bar has room for one word; the footer button keeps the full label.
        let label = presenter.iabCopy.appSave
        let busy = presenter.showProgress && presenter.pendingAction == .save
        Button { presenter.commit(.save) } label: {
            if busy { ProgressView().accessibilityIdentifier("inth.status.progress") } else { Text(label).fontWeight(.semibold) }
        }
        .disabled(presenter.pending)
        .accessibilityLabel(label).accessibilityValue(busy ? presenter.copy.saving : "")
        .accessibilityIdentifier(DecisionButton.identifier(first: false, iab: presenter.iab, action: .save))
    }
}

/// Pinned actions. Accept all and Reject all are twins; Save is the accent; nothing else is filled.
/// At accessibility sizes the first layer has no footer and preferences keep one compact action,
/// so the bar never needs a scroll of its own.
private struct DecisionFooter: View {
    @ObservedObject var presenter: ConsentPresenter
    let first: Bool
    @Binding var path: [Destination]
    @Environment(\.consentTheme) private var theme
    @Environment(\.dynamicTypeSize) private var typeSize
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.firstLayerChrome) private var chrome

    var body: some View {
        let page = typeSize.actionsInPage
        if !page || (!first && DecisionGroup.showsPinned(presenter)) {
            VStack(spacing: theme.spacing.sm) {
                DecisionGroup(presenter: presenter, first: first, part: page ? .pinned : .all, path: $path)
                // The first layer places its own tag; Privacy Settings carries it under the actions.
                if !first, !page, theme.showsBranding { Branding(id: "inth.prefs.branding") }
            }
                .padding(.horizontal, chrome.card ? theme.spacing.md : first ? theme.spacing.lg : theme.spacing.md)
                .padding(.top, theme.spacing.sm + theme.spacing.xs).padding(.bottom, theme.spacing.sm)
                // The row fades in and the actions ease down to make room instead of jumping under the thumb.
                .animation(reduceMotion ? nil : .easeOut(duration: 0.2), value: presenter.errorCode)
                .frame(maxWidth: contentWidth).frame(maxWidth: .infinity)
                .background {
                    switch chrome {
                    // The prompt's card is translucent all the way down; the sheet's footer is its surface.
                    case .prompt: Color.clear
                    case .sheet: theme.colors.surface.color
                    case .system: Rectangle().fill(.bar).ignoresSafeArea()
                    case .standard: theme.colors.canvas.color.ignoresSafeArea()
                    }
                }
                // A card rules off its decisions only when there is text that can scroll under them.
                .overlay(alignment: .top) { if chrome == .standard || (chrome.card && presenter.iab) { Hairline() } }
                .accessibilityElement(children: .contain).accessibilityIdentifier("inth.footer")
        }
    }
}

/// Sections sit 24pt apart where the platform lets a list say so; iOS 16 keeps its default.
private struct SectionSpacing: ViewModifier {
    @Environment(\.consentTheme) private var theme
    func body(content: Content) -> some View {
        if #available(iOS 17, *) { content.listSectionSpacing(theme.spacing.lg) } else { content }
    }
}

/// The introduction starts close under the bar; a grouped list otherwise opens with a section's gap.
private struct ListTopMargin: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 17, *) { content.contentMargins(.top, 8, for: .scrollContent) } else { content }
    }
}

/// Unboxed rows meet the card grid. On iOS 26 the section must extend past the
/// text, or the inset-grouped corner mask clips the first and last lines.
private struct PreferencesUnboxedSection: ViewModifier {
    let top: CGFloat
    let bottom: CGFloat
    func body(content: Content) -> some View {
        let section = content.listRowBackground(Color.clear)
            .listRowSeparator(.hidden).listSectionSeparator(.hidden)
        if #available(iOS 26, *) {
            section.listSectionMargins(.horizontal, 0)
                .listRowInsets(EdgeInsets(top: top, leading: 16, bottom: bottom, trailing: 16))
        } else {
            section.listRowInsets(EdgeInsets(top: top, leading: 0, bottom: bottom, trailing: 0))
        }
    }
}

/// Standing settings in the platform's own voice: an inset grouped list on the canvas.
private struct PreferencesList: View {
    @ObservedObject var presenter: ConsentPresenter
    let privacyPolicyURL: URL
    @Binding var path: [Destination]
    @Environment(\.consentTheme) private var theme
    @Environment(\.dynamicTypeSize) private var typeSize
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    private var surface: Color { theme.colors.surface.color }
    @AccessibilityFocusState private var introFocused: Bool
    @State private var arrived = false

    var body: some View {
        let page = typeSize.actionsInPage
        // One handle per pass: its texts and its rows come from the same disclosure.
        let rows = presenter.iabRows
        let content = rows?.preferences
        ScrollViewReader { proxy in
          List {
            if presenter.snapshot.policyPending {
                Section {
                    Text(presenter.iabCopy.appPreferencesUnavailable).foregroundStyle(theme.colors.text.color)
                        .accessibilityFocused($introFocused)
                    Button(presenter.iabCopy.appTryAgain) { presenter.refresh() }.buttonStyle(TextLinkStyle(style: .body, weight: .medium)).accessibilityIdentifier("inth.status.unavailable.retry")
                }.listRowBackground(surface)
            } else {
                if presenter.stale {
                    Section {
                        InfoCallout {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(presenter.iabCopy.appSettingsChanged).font(theme.font(.subheadline, weight: .semibold)).accessibilityAddTraits(.isHeader)
                                Text(presenter.iabCopy.appSettingsChangedDetail)
                            }
                        }.listRowInsets(EdgeInsets()).listRowBackground(Color.clear)
                    }.accessibilityIdentifier("inth.prefs.stale")
                }
                Section {
                    VStack(alignment: .leading, spacing: 8) {
                        if presenter.iab {
                            Text(presenter.iabCopy.appPreferencesIntro)
                                .accessibilityFocused($introFocused)
                            Button(presenter.iabCopy.format(presenter.iabCopy.appIabPartnerCount, ["count": String(presenter.disclosure?.vendors.count ?? 0)])) { path.append(.vendors(nil)) }
                                .buttonStyle(TextLinkStyle(style: .subheadline, weight: .semibold)).accessibilityIdentifier("inth.iab.partner-count")
                                // The link keeps its 44pt target; the air under its text is not the section's gap too.
                                .padding(.top, -6).padding(.bottom, -12)
                        } else {
                            Text(presenter.copy.preferencesDescription)
                                .accessibilityFocused($introFocused)
                        }
                    }.font(theme.font(.subheadline)).foregroundStyle(theme.colors.textMuted.color)
                }.modifier(PreferencesUnboxedSection(top: 0, bottom: 4))
                if page, DecisionGroup.showsShortcuts(presenter) {
                    Section { DecisionGroup(presenter: presenter, first: false, part: .shortcuts, path: $path).id("inth.prefs.shortcuts") }
                        .modifier(PreferencesUnboxedSection(top: 4, bottom: 8))
                }
                Section { ForEach(presenter.offeredCategories, id: \.self) { category in CategoryRow(presenter: presenter, category: category) } }
                    header: { if presenter.iab { SectionLabel(presenter.iabCopy.appThisApp) } }
                    .listRowBackground(surface)
                if let content, let rows {
                    let disclosure = rows.disclosure
                    Section {
                        ForEach(rows.purposes) { purpose in
                            PurposeRow(row: purpose) { path.append(.vendors(purpose.id)) }
                        }
                    } header: { SectionLabel(presenter.iabCopy.preferenceCenterVendorListPurposes) } footer: {
                        // Beside the switches it explains, not at the top of the page.
                        if let explanation = content.legitimateInterestExplanation {
                            SectionNote(explanation).accessibilityIdentifier("inth.iab.legitimate-interest-explanation")
                        }
                    }
                        .listRowBackground(surface)
                    if !content.specialFeatures.isEmpty {
                        Section {
                            ForEach(rows.specialFeatures) { item in SpecialFeatureRow(row: item) }
                        } header: { SectionLabel(presenter.iabCopy.preferenceCenterVendorListSpecialFeatures) }
                            .listRowBackground(surface)
                    }
                    if !content.specialPurposes.isEmpty {
                        Section {
                            ForEach(content.specialPurposes) { item in
                                ReadOnlyDefinition(item: item, id: "inth.iab.special-purpose.\(item.id)", symbol: SummarySymbols.specialPurpose(item.id))
                            }
                        } header: { SectionLabel(presenter.iabCopy.preferenceCenterVendorListSpecialPurposes) } footer: { SectionNote(disclosure.list.standardTexts?.specialPurposes ?? "") }
                            .listRowBackground(surface)
                    }
                    if !content.features.isEmpty {
                        Section {
                            ForEach(content.features) { item in
                                ReadOnlyDefinition(item: item, id: "inth.iab.feature.\(item.id)", symbol: SummarySymbols.feature(item.id))
                            }
                        } header: { SectionLabel(presenter.iabCopy.preferenceCenterFeaturesTitle) } footer: { SectionNote(content.featuresStandardText).accessibilityIdentifier("inth.iab.features-standard-text") }
                            .listRowBackground(surface)
                    }
                    Section {
                        NavigationLink(value: Destination.vendors(nil)) {
                            PartnerLinkRow(symbol: SummarySymbols.iabPartners, title: presenter.iabCopy.appIabPartners, count: content.iabPartnerCount)
                        }.accessibilityIdentifier("inth.iab.partners")
                        if content.otherPartnerCount > 0 {
                            NavigationLink(value: Destination.providers) { PartnerLinkRow(symbol: SummarySymbols.adTechProviders, title: presenter.iabCopy.preferenceCenterVendorListAdTechProvidersHeading, count: content.otherPartnerCount) }
                                .accessibilityIdentifier("inth.iab.other-partners")
                        }
                        if content.customPartnerCount > 0 {
                            NavigationLink(value: Destination.customVendors(nil)) { PartnerLinkRow(symbol: SummarySymbols.customPartners, title: presenter.iabCopy.preferenceCenterVendorListCustomVendorsHeading, count: content.customPartnerCount) }
                                .accessibilityIdentifier("inth.iab.custom-partners")
                        }
                    } header: { SectionLabel(presenter.iabCopy.appPartners) }
                        .listRowBackground(surface)
                }
                Section {
                    PrivacyLink(url: privacyPolicyURL)
                    if let storage = content?.consentStorage {
                        Text(storage).font(theme.font(.footnote)).foregroundStyle(theme.colors.textMuted.color)
                            .accessibilityIdentifier("inth.iab.consent-storage")
                    }
                    if let changed = presenter.draft.lastChanged {
                        Text(changed)
                            .font(theme.font(.footnote)).foregroundStyle(theme.colors.textMuted.color).accessibilityIdentifier("inth.prefs.last-changed")
                    }
                }.listRowBackground(surface)
            }
            if page, DecisionGroup.showsPinnedStatus(presenter) {
                Section { DecisionGroup(presenter: presenter, first: false, part: .pinnedStatus, path: $path).id(DecisionGroup.errorID(first: false)) }
                    .modifier(PreferencesUnboxedSection(top: 4, bottom: 8))
            }
          }
          .onAppear {
              // When the first layer slides out, VoiceOver keeps its cursor where it was, which is the
              // footer, and forward flicks end there. Arrival is the introduction instead: the title and
              // Back are one flick to the left, the first switch one to the right. Once per session, so
              // coming back from a partner page does not take the cursor off the row that opened it.
              guard !arrived else { return }
              arrived = true
              introFocused = true
              DispatchQueue.main.asyncAfter(deadline: .now() + 0.45) { introFocused = true }
          }
          .onChange(of: presenter.errorCode) { code in
              guard code != nil, page else { return }
              let last = DecisionGroup.showsPinnedStatus(presenter)
              DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                  withAnimation(reduceMotion ? nil : .easeOut(duration: 0.25)) {
                      proxy.scrollTo(last ? DecisionGroup.errorID(first: false) : "inth.prefs.shortcuts", anchor: last ? .bottom : nil)
                  }
              }
          }
        }
        .listStyle(.insetGrouped).scrollContentBackground(.hidden).modifier(SectionSpacing()).modifier(ListTopMargin())
        .foregroundStyle(theme.colors.text.color)
        .navigationTitle(presenter.iabCopy.preferenceCenterTitle).navigationBarTitleDisplayMode(.inline)
        .accessibilityIdentifier(presenter.iab ? "inth.iab" : "inth.prefs")
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if !presenter.snapshot.policyPending || presenter.core.bundledPolicyInfo != nil { DecisionFooter(presenter: presenter, first: false, path: $path) }
        }
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
            Text(title).font(theme.font(.subheadline, weight: .medium)).foregroundStyle(theme.colors.text.color)
            if let description, !description.isEmpty { Text(description).font(theme.font(.footnote)).foregroundStyle(theme.colors.textMuted.color) }
            if let note { Text(note).font(theme.font(.caption)).foregroundStyle(theme.colors.textMuted.color) }
        }.fixedSize(horizontal: false, vertical: true)
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
        }.frame(minHeight: 44).tint(theme.colors.primary.color)
    }
}
private extension ConsentToggle where Label == Text {
    init(_ title: String, isOn: Binding<Bool>) {
        self.init(isOn: isOn) { Text(title) }
    }
}

private struct ReadOnlyStatusRow<Label: View, Status: View>: View {
    let label: Label
    let status: Status
    @Environment(\.dynamicTypeSize) private var typeSize
    var body: some View {
        let layout = typeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 8))
            : AnyLayout(HStackLayout(alignment: .firstTextBaseline, spacing: 12))
        layout {
            label
            if !typeSize.isAccessibilitySize { Spacer(minLength: 0) }
            status
        }
    }
}

/// The symbol at the leading edge of a settings row, in the accent. It labels the row; the
/// standard name beside it stays the text.
private struct RowSymbol: View {
    let name: String
    @Environment(\.consentTheme) private var theme
    @Environment(\.dynamicTypeSize) private var typeSize
    init(_ name: String) { self.name = name }
    var body: some View {
        // At accessibility sizes the symbol goes, and the text takes the row's whole width.
        if !typeSize.isAccessibilitySize {
            Image(systemName: name).font(theme.font(.body)).foregroundStyle(theme.colors.primary.color)
                .frame(minWidth: 28).accessibilityHidden(true)
        }
    }
}

/// A row that leads to a partner page: symbol, name, count and the list's own chevron.
private struct PartnerLinkRow: View {
    let symbol: String
    let title: String
    let count: Int
    @Environment(\.consentTheme) private var theme
    var body: some View {
        HStack(spacing: 14) {
            RowSymbol(symbol)
            Text(title).font(theme.font(.subheadline, weight: .medium)).foregroundStyle(theme.colors.text.color)
            Spacer(minLength: 8)
            Text("\(count)").font(theme.font(.subheadline)).foregroundStyle(theme.colors.textMuted.color).monospacedDigit()
        }.frame(minHeight: 44)
    }
}

private struct RowPressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.contentShape(Rectangle()).opacity(configuration.isPressed ? 0.6 : 1)
    }
}

private struct CategoryRow: View {
    @ObservedObject var presenter: ConsentPresenter
    let category: ConsentCategory
    @Environment(\.consentTheme) private var theme
    var body: some View {
        // The draft's row carries the copy, the lock and the staged value.
        let row = presenter.draft.category(category)
        Group {
            if !row.locked {
                ConsentToggle(isOn: row.binding) {
                    HStack(spacing: 14) {
                        RowSymbol(SummarySymbols.category(category.rawValue))
                        RowLabel(title: row.title, description: row.description)
                    }
                }.accessibilityIdentifier("inth.prefs.category.\(category.rawValue).switch")
            } else {
                ReadOnlyStatusRow(
                    label: HStack(spacing: 14) {
                        RowSymbol(SummarySymbols.category(category.rawValue))
                        RowLabel(title: row.title, description: row.description, note: row.note)
                    },
                    status: Text(row.lockedLabel ?? "").font(theme.font(.footnote)).foregroundStyle(theme.colors.textMuted.color)
                        .accessibilityIdentifier("inth.prefs.category.\(category.rawValue).locked")
                )
                .frame(minHeight: 44)
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier(category == .necessary ? "inth.prefs.category.\(category.rawValue).locked" : "inth.prefs.category.\(category.rawValue).restricted")
            }
        }.disabled(!presenter.draft.isEditable)
    }
}

/// One line per definition: a symbol, the standard name and a note, with the control at the
/// trailing edge. Tapping the name opens the rest in place: the user-friendly text, the legal
/// text and the vendor list's standard illustrations, then whatever the row adds. This is every
/// purpose, special purpose, feature and special feature.
private struct DefinitionRow<Trailing: View, Extra: View>: View {
    let item: IABDefinitionContent
    let id: String
    let symbol: String?
    var note: String? = nil
    let trailing: Trailing
    let extra: Extra
    @State private var expanded = false
    @Environment(\.consentTheme) private var theme
    @Environment(\.iabCopy) private var copy
    @Environment(\.dynamicTypeSize) private var typeSize
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    init(item: IABDefinitionContent, id: String, symbol: String?, note: String? = nil,
        @ViewBuilder trailing: () -> Trailing, @ViewBuilder extra: () -> Extra) {
        self.item = item
        self.id = id
        self.symbol = symbol
        self.note = note
        self.trailing = trailing()
        self.extra = extra()
    }
    /// At accessibility sizes the symbol goes, and the text takes the row's whole width.
    private var showsSymbol: Bool { symbol != nil && !typeSize.isAccessibilitySize }
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 12) {
                Button { withAnimation(reduceMotion ? nil : .easeOut(duration: 0.2)) { expanded.toggle() } } label: {
                    HStack(spacing: 14) {
                        if showsSymbol, let symbol { RowSymbol(symbol) }
                        // The chevron follows the last line of text, so the name and the counts keep the row's width.
                        let lines = note?.components(separatedBy: " · ") ?? []
                        let chevron = Image(systemName: expanded ? "chevron.up" : "chevron.down")
                            .font(theme.font(.caption2, weight: .semibold)).foregroundStyle(theme.colors.textMuted.color).accessibilityHidden(true)
                        VStack(alignment: .leading, spacing: 2) {
                            HStack(alignment: .lastTextBaseline, spacing: 6) {
                                Text(item.name).font(theme.font(.subheadline, weight: .medium)).foregroundStyle(theme.colors.text.color)
                                if lines.isEmpty { chevron }
                            }
                            // The partner counts sit on the collapsed row, one per line: consent, then legitimate interest.
                            ForEach(Array(lines.enumerated()), id: \.offset) { index, line in
                                HStack(alignment: .lastTextBaseline, spacing: 6) {
                                    Text(line).font(theme.font(.caption)).foregroundStyle(theme.colors.textMuted.color).monospacedDigit()
                                    if index == lines.count - 1 { chevron }
                                }
                            }
                        }.multilineTextAlignment(.leading).fixedSize(horizontal: false, vertical: true)
                        Spacer(minLength: 4)
                    }.frame(minHeight: 44)
                }
                .buttonStyle(RowPressStyle())
                // The name and the counts are the label as drawn; what a tap does is the hint.
                .accessibilityHint(expanded ? copy.appHideDetails : copy.appDetails)
                .accessibilityValue(expanded ? copy.appExpanded : copy.appCollapsed)
                .accessibilityIdentifier(id + ".details")
                trailing
            }
            if expanded {
                VStack(alignment: .leading, spacing: 8) {
                    VStack(alignment: .leading, spacing: 8) {
                        if !item.description.isEmpty { Text(item.description).foregroundStyle(theme.colors.text.color) }
                        if let legal = item.descriptionLegal, !legal.isEmpty, legal != item.description { Text(legal) }
                        ForEach(item.illustrations, id: \.self) { line in
                            HStack(alignment: .firstTextBaseline, spacing: 8) { Text("•"); Text(line) }
                        }
                    }
                    .font(theme.font(.footnote)).foregroundStyle(theme.colors.textMuted.color)
                    // Expanded text takes its full height; a list row otherwise truncates it to a line.
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityElement(children: .combine).accessibilityIdentifier(id + ".illustrations")
                    extra
                }
                .padding(.leading, showsSymbol ? 42 : 0).padding(.top, 6).padding(.bottom, 8)
                .transition(.opacity)
            }
        }
    }
}

private struct ReadOnlyDefinition: View {
    let item: IABDefinitionContent
    let id: String
    var symbol: String? = nil
    @Environment(\.consentTheme) private var theme
    @Environment(\.iabCopy) private var copy
    var body: some View {
        DefinitionRow(item: item, id: id, symbol: symbol) {
            Text(copy.appNoChoice).font(theme.font(.caption)).foregroundStyle(theme.colors.textMuted.color).layoutPriority(1)
                .accessibilityIdentifier(id + ".status")
        } extra: { EmptyView() }
        .accessibilityElement(children: .contain).accessibilityIdentifier(id)
    }
}

private struct PurposeRow: View {
    let row: IABPurposeRow
    let openPartners: () -> Void
    @Environment(\.consentTheme) private var theme
    @Environment(\.iabCopy) private var copy
    var body: some View {
        let id = row.id
        DefinitionRow(item: row.definition, id: "inth.iab.purpose.\(id)", symbol: SummarySymbols.purpose(id), note: row.partnersNote) {
            Toggle(isOn: Binding(get: { row.consent }, set: { row.setConsent($0) })) { EmptyView() }.labelsHidden()
                .tint(theme.colors.primary.color)
                .disabled(!row.isEnabled).accessibilityLabel(row.name).accessibilityIdentifier("inth.iab.purpose.\(id).consent")
        } extra: {
            Button(action: openPartners) {
                Label(copy.appViewPartners, systemImage: "chevron.forward").labelStyle(TrailingIconLabelStyle())
            }.buttonStyle(TextLinkStyle(style: .footnote)).accessibilityIdentifier("inth.iab.purpose.\(id).view-partners")
            if let interest = row.legitimateInterest {
                // The objection is a control of its own, boxed apart from the consent switch above it.
                ConsentToggle(isOn: Binding(get: { interest }, set: { row.setLegitimateInterest($0) })) {
                    RowLabel(title: copy.preferenceCenterPurposeItemLegitimateInterest, note: row.rightToObject)
                }
                .padding(.horizontal, 12).padding(.vertical, 8)
                .background(theme.colors.text.color.opacity(0.06), in: RoundedRectangle(cornerRadius: theme.radius.resolvedSm, style: .continuous))
                .disabled(!row.isEnabled).accessibilityIdentifier("inth.iab.purpose.\(id).li")
            }
        }
    }
}

/// One opt-in per special feature, with its standard texts and illustrations behind the row.
private struct SpecialFeatureRow: View {
    let row: IABSpecialFeatureRow
    @Environment(\.consentTheme) private var theme
    @Environment(\.iabCopy) private var copy
    var body: some View {
        let id = row.id
        DefinitionRow(item: row.definition, id: "inth.iab.special-feature.\(id)", symbol: SummarySymbols.specialFeature(id), note: copy.appSpecialFeatureOptIn) {
            Toggle(isOn: Binding(get: { row.optIn }, set: { row.setOptIn($0) })) { EmptyView() }.labelsHidden()
                .tint(theme.colors.primary.color)
                .disabled(!row.isEnabled).accessibilityLabel(row.name).accessibilityIdentifier("inth.iab.special-feature.\(id).switch")
        } extra: { EmptyView() }
    }
}

private struct SearchField: View {
    let placeholder: String
    @Binding var text: String
    let id: String
    @Environment(\.consentTheme) private var theme
    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass").foregroundStyle(theme.colors.textMuted.color).accessibilityHidden(true)
            TextField(placeholder, text: $text).textInputAutocapitalization(.never).autocorrectionDisabled()
                .foregroundStyle(theme.colors.text.color).accessibilityIdentifier(id)
        }.frame(minHeight: 44)
    }
}

/// On, Partly on, or Off at a glance, beside the chevron into the partner.
private struct StatusTag: View {
    let status: String
    let off: Bool
    @Environment(\.consentTheme) private var theme
    var body: some View {
        Text(status).font(theme.font(.caption, weight: .semibold))
            .foregroundStyle(off ? theme.colors.textMuted.color : theme.colors.statusTagText.color)
            .padding(.horizontal, 8).padding(.vertical, 4)
            .background(off ? theme.colors.surfaceMuted.color : theme.colors.primary.color.opacity(0.14), in: Capsule())
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
                SearchField(placeholder: presenter.iabCopy.appSearchPartners, text: $search, id: "inth.iab.vendors.search")
                if let purpose {
                    Button {
                        self.purpose = nil
                    } label: {
                        Label(presenter.iabCopy.format(presenter.iabCopy.appPurposeFilter, ["purpose": presenter.disclosure?.list.purposes[purpose]?.name ?? ""]), systemImage: "xmark.circle.fill")
                            .labelStyle(TrailingIconLabelStyle())
                    }.buttonStyle(TextLinkStyle()).accessibilityIdentifier("inth.iab.vendors.filter.purpose.clear")
                }
            }.listRowBackground(theme.colors.surface.color)
            // The handle's rows are the disclosed partners that use the purpose, by name.
            let vendors = (presenter.iabRows?.vendors(purposeId: purpose) ?? []).filter { search.isEmpty || $0.name.localizedStandardContains(search) }
            Section {
                if vendors.isEmpty {
                    Text(presenter.iabCopy.format(presenter.iabCopy.appNoPartnersMatch, ["search": search])).foregroundStyle(theme.colors.textMuted.color).accessibilityIdentifier("inth.iab.vendors.empty")
                }
                ForEach(vendors, id: \.id) { vendor in
                    NavigationLink(value: Destination.vendor(vendor.id)) {
                        HStack(alignment: .center, spacing: 12) {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(vendor.name).font(theme.font(.subheadline, weight: .medium)).foregroundStyle(theme.colors.text.color)
                                Text(vendor.summary).font(theme.font(.caption)).foregroundStyle(theme.colors.textMuted.color)
                            }
                            Spacer(minLength: 0)
                            StatusTag(status: vendor.statusLabel, off: vendor.status == .off).accessibilityIdentifier("inth.iab.vendors.vendor.\(vendor.id).status")
                        }.padding(.vertical, 4)
                    }.accessibilityIdentifier("inth.iab.vendors.vendor.\(vendor.id)")
                }
            }.listRowBackground(theme.colors.surface.color)
            // The first layer's partner count includes these, so the list it opens leads to them,
            // on their own page apart from IAB partners.
            if purpose.map(adTechProviderPurposeIds.contains) ?? true, search.isEmpty, let providers = presenter.disclosure?.adTechProviders, !providers.isEmpty {
                Section {
                    NavigationLink(value: Destination.providers) { PartnerLinkRow(symbol: SummarySymbols.adTechProviders, title: presenter.iabCopy.preferenceCenterVendorListAdTechProvidersHeading, count: providers.count) }
                        .accessibilityIdentifier("inth.iab.vendors.other-partners")
                } footer: { SectionNote(presenter.iabCopy.preferenceCenterVendorListAdTechProvidersNotice) }
                    .listRowBackground(theme.colors.surface.color)
            }
            // Custom partners are listed with IAB partners, as on the web, on a page of their own.
            let custom = (presenter.disclosure?.customVendors ?? []).filter { vendor in
                purpose.map { vendor.purposes.contains($0) || vendor.legIntPurposes.contains($0) } ?? true
            }
            if search.isEmpty, !custom.isEmpty {
                Section {
                    NavigationLink(value: Destination.customVendors(purpose)) { PartnerLinkRow(symbol: SummarySymbols.customPartners, title: presenter.iabCopy.preferenceCenterVendorListCustomVendorsHeading, count: custom.count) }
                        .accessibilityIdentifier("inth.iab.vendors.custom-partners")
                } footer: { SectionNote(presenter.iabCopy.preferenceCenterVendorListCustomVendorsNotice) }
                    .listRowBackground(theme.colors.surface.color)
            }
        }
        .listStyle(.insetGrouped).scrollContentBackground(.hidden).modifier(SectionSpacing())
        .navigationTitle(presenter.iabCopy.appIabPartners).navigationBarTitleDisplayMode(.inline)
        .scrollDismissesKeyboard(.immediately).accessibilityIdentifier("inth.iab.vendors")
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
    private var copy: IABCopy { presenter.iabCopy }
    var body: some View {
        List {
            if let vendor = presenter.iabVendor(id) {
                links(vendor)
                selections(vendor)
                otherDisclosures(vendor)
                retention(vendor)
                storage(vendor)
            }
        }
        .listStyle(.insetGrouped).scrollContentBackground(.hidden).modifier(SectionSpacing())
        .font(theme.font(.subheadline)).foregroundStyle(theme.colors.text.color)
        .navigationTitle(presenter.disclosure?.list.vendors[id]?.name ?? presenter.iabCopy.appPartner).navigationBarTitleDisplayMode(.inline)
        .accessibilityIdentifier("inth.iab.vendor.\(id)")
    }
    private func links(_ vendor: IABVendorContent) -> some View {
        Section {
            if let url = vendor.privacyPolicy { Link(copy.preferenceCenterVendorListPrivacyPolicy, destination: url).buttonStyle(TextLinkStyle(style: .subheadline)).accessibilityIdentifier("inth.iab.vendor.\(id).privacy-link") }
            if let url = vendor.legitimateInterestClaim { Link(copy.appLegitimateInterestStatement, destination: url).buttonStyle(TextLinkStyle(style: .subheadline)).accessibilityIdentifier("inth.iab.vendor.\(id).li-claim-link") }
        }.listRowBackground(theme.colors.surface.color)
    }
    private func selections(_ vendor: IABVendorContent) -> some View {
        Section {
            if !vendor.consentPurposes.isEmpty {
                ConsentToggle(isOn: Binding(get: { presenter.choices.vendorConsents.contains(id) }, set: { presenter.edit(\.vendorConsents, id: id, enabled: $0) })) {
                    RowLabel(title: copy.appConsent, description: vendor.consentPurposes.joined(separator: ", "))
                }.accessibilityIdentifier("inth.iab.vendor.\(id).consent")
            }
            if !vendor.legitimateInterestPurposes.isEmpty {
                ConsentToggle(isOn: Binding(get: { presenter.choices.vendorLegitimateInterests.contains(id) }, set: { presenter.editLI(purpose: false, id: id, enabled: $0) })) {
                    RowLabel(title: copy.preferenceCenterPurposeItemLegitimateInterest, description: vendor.legitimateInterestPurposes.joined(separator: ", "), note: copy.appTurnOffToObject)
                }.accessibilityIdentifier("inth.iab.vendor.\(id).li")
            }
            if !vendor.notAllowedPurposes.isEmpty {
                Text(copy.format(copy.appNotAllowedPurposes, ["purposes": vendor.notAllowedPurposes.joined(separator: ", ")])).font(theme.font(.subheadline)).foregroundStyle(theme.colors.textMuted.color)
                    .accessibilityIdentifier("inth.iab.vendor.\(id).not-allowed")
            }
        } header: { SectionLabel(copy.appYourChoices) }
            .listRowBackground(theme.colors.surface.color)
            .disabled(!presenter.draft.isEditable)
    }
    private func noChoice(_ name: String) -> some View {
        ReadOnlyStatusRow(label: Text(name),
            status: Text(copy.appNoChoice).font(theme.font(.footnote)).foregroundStyle(theme.colors.textMuted.color))
    }
    @ViewBuilder private func otherDisclosures(_ vendor: IABVendorContent) -> some View {
        if !vendor.specialPurposes.isEmpty {
            Section { ForEach(vendor.specialPurposes, id: \.self) { noChoice($0) } } header: { SectionLabel(copy.preferenceCenterVendorListSpecialPurposes) }
                .listRowBackground(theme.colors.surface.color)
        }
        if !vendor.features.isEmpty {
            Section {
                ForEach(vendor.features) { item in ReadOnlyDefinition(item: item, id: "inth.iab.vendor.\(vendor.id).feature.\(item.id)") }
            } header: { SectionLabel(copy.preferenceCenterFeaturesTitle) } footer: {
                SectionNote(vendor.featuresStandardText).accessibilityIdentifier("inth.iab.vendor.\(vendor.id).features-standard-text")
            }
                .listRowBackground(theme.colors.surface.color)
        }
        if !vendor.specialFeatureIds.isEmpty {
            Section {
                ForEach(Array(zip(vendor.specialFeatureIds, vendor.specialFeatures)), id: \.0) { feature, name in
                    ReadOnlyStatusRow(label: Text(name),
                        status: Text(presenter.choices.specialFeatureOptIns.contains(feature) ? copy.appOn : copy.appOff).font(theme.font(.footnote)).foregroundStyle(theme.colors.textMuted.color))
                }
            } header: { SectionLabel(copy.preferenceCenterVendorListSpecialFeatures) } footer: { SectionNote(copy.appSpecialFeaturesElsewhere) }
                .listRowBackground(theme.colors.surface.color)
        }
        if !vendor.dataCategories.isEmpty {
            Section { ForEach(vendor.dataCategories, id: \.self) { Text($0) } } header: { SectionLabel(copy.appDataCollected) }
                .listRowBackground(theme.colors.surface.color)
        }
    }
    private func retention(_ vendor: IABVendorContent) -> some View {
        Section {
            if vendor.retention.isEmpty { Text(copy.appRetentionNotProvided).foregroundStyle(theme.colors.textMuted.color) }
            ForEach(Array(vendor.retention.enumerated()), id: \.offset) { _, row in LabeledContent(row.label, value: row.value) }
        } header: { SectionLabel(copy.appRetentionTitle) }
            .listRowBackground(theme.colors.surface.color)
            .accessibilityIdentifier("inth.iab.vendor.\(id).retention")
    }
    private func storage(_ vendor: IABVendorContent) -> some View {
        Section {
            if !vendor.storesOnDevice { Text(copy.appNoDeviceStorage) }
            ForEach(Array(vendor.storage.enumerated()), id: \.offset) { _, row in LabeledContent(row.label, value: row.value) }
            if let url = vendor.storageDisclosure { Link(copy.appDeviceStorageDetails, destination: url).buttonStyle(TextLinkStyle(style: .subheadline)) }
        } header: { SectionLabel(copy.appDeviceStorage) }
            .listRowBackground(theme.colors.surface.color)
            .accessibilityIdentifier("inth.iab.vendor.\(id).storage")
    }
}

private struct CustomVendorList: View {
    @ObservedObject var presenter: ConsentPresenter
    let purpose: Int?
    @State private var search = ""
    @Environment(\.consentTheme) private var theme
    var body: some View {
        List {
            Section {
                SearchField(placeholder: presenter.iabCopy.appSearchPartners, text: $search, id: "inth.iab.custom-vendors.search")
            } footer: {
                SectionNote(presenter.iabCopy.preferenceCenterVendorListCustomVendorsNotice).accessibilityIdentifier("inth.iab.custom-vendors.intro")
            }.listRowBackground(theme.colors.surface.color)
            let vendors = (presenter.iabRows?.customVendors ?? []).filter { row in
                (search.isEmpty || row.name.localizedStandardContains(search))
                    && (purpose.map { row.vendor.purposes.contains($0) || row.vendor.legIntPurposes.contains($0) } ?? true)
            }.sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
            Section {
                if vendors.isEmpty {
                    Text(presenter.iabCopy.format(presenter.iabCopy.appNoPartnersMatch, ["search": search])).foregroundStyle(theme.colors.textMuted.color).accessibilityIdentifier("inth.iab.custom-vendors.empty")
                }
                ForEach(vendors, id: \.id) { vendor in
                    NavigationLink(value: Destination.customVendor(vendor.id)) {
                        HStack(alignment: .center, spacing: 12) {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(vendor.name).font(theme.font(.subheadline, weight: .medium)).foregroundStyle(theme.colors.text.color)
                                Text(vendor.summary).font(theme.font(.caption)).foregroundStyle(theme.colors.textMuted.color)
                            }
                            Spacer(minLength: 0)
                            StatusTag(status: vendor.statusLabel, off: vendor.status == .off).accessibilityIdentifier("inth.iab.custom-vendors.vendor.\(vendor.id).status")
                        }.padding(.vertical, 4)
                    }.accessibilityIdentifier("inth.iab.custom-vendors.vendor.\(vendor.id)")
                }
            }.listRowBackground(theme.colors.surface.color)
        }
        .listStyle(.insetGrouped).scrollContentBackground(.hidden).modifier(SectionSpacing())
        .navigationTitle(presenter.iabCopy.preferenceCenterVendorListCustomVendorsHeading).navigationBarTitleDisplayMode(.inline)
        .scrollDismissesKeyboard(.immediately).accessibilityIdentifier("inth.iab.custom-vendors")
    }
}

private struct CustomVendorDetails: View {
    @ObservedObject var presenter: ConsentPresenter
    let id: String
    @Environment(\.consentTheme) private var theme
    private var copy: IABCopy { presenter.iabCopy }
    var body: some View {
        List {
            if let vendor = presenter.customVendor(id) {
                Section {
                    Text(vendor.note).font(theme.font(.subheadline)).foregroundStyle(theme.colors.textMuted.color)
                        .accessibilityIdentifier("inth.iab.custom-vendor.\(id).note")
                    if let description = vendor.description { Text(description) }
                    if let url = vendor.privacyPolicy { Link(copy.preferenceCenterVendorListPrivacyPolicy, destination: url).buttonStyle(TextLinkStyle(style: .subheadline)).accessibilityIdentifier("inth.iab.custom-vendor.\(id).privacy-link") }
                }.listRowBackground(theme.colors.surface.color)
                Section {
                    if vendor.offersConsent {
                        ConsentToggle(isOn: Binding(get: { presenter.choices.customVendorConsents.contains(id) }, set: { presenter.editCustom(\.customVendorConsents, id: id, enabled: $0) })) {
                            RowLabel(title: copy.appConsent, description: vendor.consentPurposes.joined(separator: ", "))
                        }.accessibilityIdentifier("inth.iab.custom-vendor.\(id).consent")
                    }
                    if vendor.offersLegitimateInterest {
                        ConsentToggle(isOn: Binding(get: { presenter.choices.customVendorLegitimateInterests.contains(id) }, set: { presenter.editCustom(\.customVendorLegitimateInterests, id: id, enabled: $0) })) {
                            RowLabel(title: copy.preferenceCenterPurposeItemLegitimateInterest, description: vendor.legitimateInterestPurposes.joined(separator: ", "), note: copy.appTurnOffToObject)
                        }.accessibilityIdentifier("inth.iab.custom-vendor.\(id).li")
                    }
                } header: { SectionLabel(copy.appYourChoices) }
                    .listRowBackground(theme.colors.surface.color)
                    .disabled(!presenter.draft.isEditable)
                if !vendor.features.isEmpty {
                    Section {
                        ForEach(vendor.features) { item in ReadOnlyDefinition(item: item, id: "inth.iab.custom-vendor.\(id).feature.\(item.id)") }
                    } header: { SectionLabel(copy.preferenceCenterFeaturesTitle) } footer: { SectionNote(vendor.featuresStandardText) }
                        .listRowBackground(theme.colors.surface.color)
                }
                if !vendor.specialFeatureIds.isEmpty {
                    Section {
                        ForEach(Array(zip(vendor.specialFeatureIds, vendor.specialFeatures)), id: \.0) { feature, name in
                            ReadOnlyStatusRow(label: Text(name),
                                status: Text(presenter.choices.specialFeatureOptIns.contains(feature) ? copy.appOn : copy.appOff).font(theme.font(.footnote)).foregroundStyle(theme.colors.textMuted.color))
                        }
                    } header: { SectionLabel(copy.preferenceCenterVendorListSpecialFeatures) } footer: { SectionNote(copy.appSpecialFeaturesElsewhere) }
                        .listRowBackground(theme.colors.surface.color)
                }
                if !vendor.dataCategories.isEmpty {
                    Section { ForEach(vendor.dataCategories, id: \.self) { Text($0) } } header: { SectionLabel(copy.appDataCollected) }
                        .listRowBackground(theme.colors.surface.color)
                }
                Section {
                    if vendor.retention.isEmpty { Text(copy.appRetentionNotProvided).foregroundStyle(theme.colors.textMuted.color) }
                    ForEach(Array(vendor.retention.enumerated()), id: \.offset) { _, row in LabeledContent(row.label, value: row.value) }
                } header: { SectionLabel(copy.appRetentionTitle) }
                    .listRowBackground(theme.colors.surface.color)
                Section {
                    if !vendor.storesOnDevice { Text(copy.appNoDeviceStorage) }
                    ForEach(Array(vendor.storage.enumerated()), id: \.offset) { _, row in LabeledContent(row.label, value: row.value) }
                } header: { SectionLabel(copy.appDeviceStorage) }
                    .listRowBackground(theme.colors.surface.color)
            }
        }
        .listStyle(.insetGrouped).scrollContentBackground(.hidden).modifier(SectionSpacing())
        .font(theme.font(.subheadline)).foregroundStyle(theme.colors.text.color)
        .navigationTitle(presenter.disclosure?.customVendors.first { $0.id == id }?.name ?? copy.appPartner).navigationBarTitleDisplayMode(.inline)
        .accessibilityIdentifier("inth.iab.custom-vendor.\(id)")
    }
}

private struct ProviderList: View {
    @ObservedObject var presenter: ConsentPresenter
    @State private var search = ""
    @Environment(\.consentTheme) private var theme
    /// The web's notice, plus why the providers stay off while their purposes are.
    private var intro: String {
        presenter.iabRows?.adTechProvidersNotice ?? presenter.iabCopy.preferenceCenterVendorListAdTechProvidersNotice
    }
    var body: some View {
        List {
            Section {
                SearchField(placeholder: presenter.iabCopy.appSearchOtherPartners, text: $search, id: "inth.ac.search")
            } footer: {
                SectionNote(intro).accessibilityIdentifier("inth.ac.intro")
            }.listRowBackground(theme.colors.surface.color)
            let providers = (presenter.disclosure?.adTechProviders ?? []).filter { search.isEmpty || $0.name.localizedStandardContains(search) }.sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
            Section {
                if providers.isEmpty { Text(presenter.iabCopy.format(presenter.iabCopy.appNoPartnersMatch, ["search": search])).foregroundStyle(theme.colors.textMuted.color).accessibilityIdentifier("inth.ac.empty") }
                ForEach(providers, id: \.id) { provider in
                    VStack(alignment: .leading, spacing: 0) {
                        ConsentToggle(isOn: Binding(get: { presenter.choices.adTechProviderConsents?.contains(provider.id) == true }, set: { presenter.editProvider(id: provider.id, enabled: $0) })) {
                            Text(provider.name).font(theme.font(.subheadline, weight: .medium)).foregroundStyle(theme.colors.text.color)
                        }.accessibilityIdentifier("inth.ac.provider.\(provider.id).switch")
                        if let url = URL(string: provider.policyUrl) {
                            Link(presenter.iabCopy.preferenceCenterVendorListPrivacyPolicy, destination: url).buttonStyle(TextLinkStyle()).accessibilityIdentifier("inth.ac.provider.\(provider.id).privacy-link")
                        }
                    }.disabled(!presenter.draft.isEditable)
                }
            }.listRowBackground(theme.colors.surface.color)
        }
        .listStyle(.insetGrouped).scrollContentBackground(.hidden).modifier(SectionSpacing())
        .navigationTitle(presenter.iabCopy.preferenceCenterVendorListAdTechProvidersHeading).navigationBarTitleDisplayMode(.inline)
        .scrollDismissesKeyboard(.immediately).accessibilityIdentifier("inth.ac")
    }
}
#endif
