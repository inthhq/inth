#if canImport(SwiftUI) && canImport(UIKit)
#if canImport(C15tCore)
import C15tCore
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
    @Environment(\.consentTheme) private var theme
    @Environment(\.isEnabled) private var isEnabled
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    func makeBody(configuration: Configuration) -> some View {
        let shape = RoundedRectangle(cornerRadius: slot?.borderRadius ?? theme.radius.md, style: .continuous)
        configuration.label.font(theme.font(.body, weight: .semibold, slot: variant.slot))
            .multilineTextAlignment(.center).padding(.horizontal, 16).padding(.vertical, 14)
            .frame(maxWidth: .infinity, minHeight: 52)
            .foregroundStyle(foreground)
            .background(background, in: shape)
            .overlay { if variant == .quiet { shape.strokeBorder(theme.colors.text.color.opacity(0.18)) } }
            .overlay(alignment: .leading) {
                if busy { ProgressView().tint(foreground).padding(.leading, 16).accessibilityIdentifier("c15t.status.progress") }
            }
            .opacity(configuration.isPressed ? 0.85 : isEnabled || busy ? 1 : 0.5)
            .scaleEffect(configuration.isPressed && !reduceMotion ? 0.98 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
    private var slot: ConsentTheme.SlotStyle? { variant.slot.map { theme.slot($0) } }
    private var foreground: Color {
        switch variant {
        case .decision: theme.decisionLabel.color
        case .accent: theme.colors.textOnPrimary.color
        case .quiet: (slot?.color ?? theme.colors.text).color
        }
    }
    private var background: Color {
        switch variant {
        case .decision: theme.decisionFill.color
        case .accent: theme.colors.primary.color
        case .quiet: slot?.backgroundColor?.color ?? Color.clear
        }
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
    func c15tConsent(presenter: ConsentPresenter, privacyPolicyURL: URL, theme: ConsentTheme? = nil,
        onNoticeFrameChange: ((CGRect) -> Void)? = nil) -> some View {
        modifier(ConsentPresentationModifier(presenter: presenter, privacyPolicyURL: privacyPolicyURL,
            theme: (theme ?? ConsentTheme.resolved()).withReadableDecisions(), onNoticeFrameChange: onNoticeFrameChange))
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
                        .environment(\.consentTheme, theme).environment(\.failureFocus, failureFocus).environment(\.iabCopy, presenter.iabCopy)
                }
            }
            .fullScreenCover(item: session(fullScreen: true)) { session in
                ConsentScreen(presenter: presenter, privacyPolicyURL: privacyPolicyURL).id(session.id)
                    .environment(\.consentTheme, theme).environment(\.failureFocus, failureFocus).environment(\.iabCopy, presenter.iabCopy)
            }
            .sheet(item: session(fullScreen: false)) { session in
                ConsentScreen(presenter: presenter, privacyPolicyURL: privacyPolicyURL).id(session.id)
                    .environment(\.consentTheme, theme).environment(\.failureFocus, failureFocus).environment(\.iabCopy, presenter.iabCopy)
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
    var body: some View {
        let shape = RoundedRectangle(cornerRadius: theme.radius.resolvedLg, style: .continuous)
        VStack(alignment: .leading, spacing: theme.spacing.sm + theme.spacing.xs) {
            Text("How this app uses your data").font(theme.font(.headline)).foregroundStyle(theme.colors.text.color)
                .accessibilityAddTraits(.isHeader).accessibilityIdentifier("c15t.notice.title")
            Text("You can review or change this at any time in Privacy settings.")
                .font(theme.font(.subheadline)).foregroundStyle(theme.colors.textMuted.color)
            EqualDecisionLayout {
                Button("Got it") { presenter.commit(.acknowledge) }
                    .buttonStyle(ConsentButtonStyle(busy: presenter.showProgress && presenter.pendingAction == .acknowledge))
                    .accessibilityIdentifier("c15t.notice.acknowledge")
                Button("Privacy settings") { presenter.presentPreferences() }.buttonStyle(ConsentButtonStyle(variant: .quiet)).accessibilityIdentifier("c15t.notice.settings")
            }
            PrivacyLink(url: privacyPolicyURL)
            if let message = presenter.errorMessage { FailureRow(message: message, id: "c15t.notice.error", retry: presenter.retry) }
        }
        .padding(theme.spacing.md + theme.spacing.xs).frame(maxWidth: contentWidth)
        .background(theme.colors.surface.color, in: shape)
        .overlay(shape.strokeBorder(theme.colors.text.color.opacity(0.1)))
        .shadow(color: .black.opacity(0.1), radius: 18, y: 8)
        .disabled(presenter.pending).accessibilityElement(children: .contain).accessibilityIdentifier("c15t.notice")
    }
}

private struct PrivacyLink: View {
    let url: URL
    @Environment(\.consentTheme) private var theme
    @Environment(\.iabCopy) private var copy
    var body: some View {
        Link(copy.preferenceCenterVendorListPrivacyPolicy, destination: url).buttonStyle(TextLinkStyle()).accessibilityIdentifier("c15t.privacy-policy")
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

private struct SectionLabel: View {
    let text: String
    @Environment(\.consentTheme) private var theme
    init(_ text: String) { self.text = text }
    var body: some View {
        Text(text).font(theme.font(.footnote, weight: .semibold)).foregroundStyle(theme.colors.textMuted.color).textCase(nil)
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
                            if presenter.returnsToFirstLayer { Label(presenter.iabCopy.appBack, systemImage: "chevron.backward").frame(minHeight: 44) }
                            else { Text(presenter.iabCopy.appCancel) }
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
        .tint(theme.colors.primary.color)
        .interactiveDismissDisabled(!presenter.allowsInteractiveDismiss)
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
            VStack(alignment: .leading, spacing: theme.spacing.md) {
                Text(presenter.iabCopy.appDiscardChangesTitle).font(theme.font(.headline)).foregroundStyle(theme.colors.text.color).accessibilityAddTraits(.isHeader)
                Text(presenter.iabCopy.appDiscardChangesDetail).foregroundStyle(theme.colors.textMuted.color)
                Button(presenter.iabCopy.appKeepEditing) { presenter.confirmDiscard = false }
                    .buttonStyle(ConsentButtonStyle()).accessibilityIdentifier("c15t.prefs.discard.keep")
                Button(presenter.iabCopy.appDiscardChanges, role: .destructive) { presenter.discard() }
                    .buttonStyle(ConsentButtonStyle(variant: .quiet)).accessibilityIdentifier("c15t.prefs.discard.confirm")
            }
            .padding(theme.spacing.lg).background(theme.colors.surface.color, in: RoundedRectangle(cornerRadius: theme.radius.resolvedLg, style: .continuous))
            .padding(theme.spacing.lg).frame(maxWidth: 480).accessibilityElement(children: .contain)
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
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @AccessibilityFocusState private var titleFocused: Bool

    var body: some View {
        let page = typeSize.actionsInPage
        ScrollViewReader { proxy in
          ScrollView {
            VStack(alignment: .leading, spacing: theme.spacing.md + theme.spacing.xs) {
                if !theme.brand.isHidden { IdentityHeader(identity: ResolvedIdentity.resolve(theme.brand, provider: theme.branding)) }
                if let reason = presenter.snapshot.promptRequirement.reason, reason.rawValue != "missing" {
                    InfoCallout {
                        Text(reason.rawValue == "expired" ? "Your earlier choice has expired, so we're asking again." : "How this app uses data has changed since your last choice, so we're asking again.")
                    }.accessibilityIdentifier("c15t.first-layer.reason")
                }
                BalancedTextLayout {
                    Text(theme.copy.headline).font(theme.firstLayerHeadlineFont)
                        .foregroundStyle((theme.slot(.consentBannerTitle).color ?? theme.colors.text).color).multilineTextAlignment(.leading)
                        .accessibilityAddTraits(.isHeader).accessibilityIdentifier("c15t.first-layer.title").accessibilityFocused($titleFocused)
                }
                Text(theme.copy.introduction).font(theme.font(.body, slot: .consentBannerDescription))
                    .foregroundStyle((theme.slot(.consentBannerDescription).color ?? theme.colors.text).color)
                    .accessibilityIdentifier("c15t.first-layer.body")
                // The IAB sentences come from the IAB copy, never from the host theme.
                if let content = presenter.iabFirstLayer {
                    iabDisclosure(content)
                } else {
                    Text("You decide which uses to allow, and you can change your mind at any time in Privacy settings.")
                        .font(theme.font(.subheadline)).foregroundStyle(theme.colors.textMuted.color)
                }
                PrivacyLink(url: privacyPolicyURL)
                // At accessibility sizes the decisions follow the text they decide on.
                if page { DecisionGroup(presenter: presenter, first: true, part: .all, path: $path).padding(.top, 4).id(DecisionGroup.errorID(first: true)) }
            }
            .padding(.horizontal, theme.spacing.lg).padding(.top, theme.spacing.xl + theme.spacing.sm).padding(.bottom, theme.spacing.md)
            .frame(maxWidth: contentWidth, alignment: .leading).frame(maxWidth: .infinity)
          }
          .scrollBounceBehavior(.basedOnSize)
          .onChange(of: presenter.errorCode) { code in
              guard code != nil, page else { return }
              DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                  withAnimation(reduceMotion ? nil : .easeOut(duration: 0.25)) { proxy.scrollTo(DecisionGroup.errorID(first: true), anchor: nil) }
              }
          }
        }
        // The first choice is a page with its own top edge; the bar only appears once settings push in.
        .toolbar(.hidden, for: .navigationBar)
        .accessibilityIdentifier("c15t.first-layer")
        .safeAreaInset(edge: .bottom, spacing: 0) { DecisionFooter(presenter: presenter, first: true, path: $path) }
        .modifier(SideBrandingPlacement(enabled: theme.showsBranding && !presenter.snapshot.policyPending && !presenter.listUnavailable))
        .onAppear { titleFocused = true }
    }

    private func openPartners() {
        presenter.customize()
        path.append(.vendors(nil))
    }

    /// The description with its partners link inline, as on the web. The link opens the partner
    /// list; the button under the summary opens the same list with a full-size target.
    private func description(_ content: IABFirstLayerContent) -> AttributedString {
        var text = AttributedString(content.descriptionLead)
        var link = AttributedString(content.partnersLink)
        link.link = URL(string: "c15t-partners:list")
        link.font = theme.font(.subheadline, weight: .semibold)
        link.underlineStyle = .single
        text += link
        text += AttributedString(content.descriptionTail)
        return text
    }

    /// The web prompt's order: description and partners link, the purpose summary on a quieter
    /// surface, then legitimate interest, scope and withdrawal.
    @ViewBuilder private func iabDisclosure(_ content: IABFirstLayerContent) -> some View {
        Text(description(content)).font(theme.font(.subheadline)).foregroundStyle(theme.colors.text.color)
            .tint(theme.colors.primary.color)
            .environment(\.openURL, OpenURLAction { _ in openPartners(); return .handled })
            .accessibilityIdentifier("c15t.first-layer.iab-description")
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(content.summaryItems.enumerated()), id: \.offset) { index, item in
                Text(item).font(theme.font(.subheadline)).foregroundStyle(theme.colors.text.color)
                    .frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 16).padding(.vertical, 10)
                    .accessibilityIdentifier("c15t.first-layer.summary.\(index)")
                Hairline().padding(.leading, 16)
            }
            if let more = content.moreItems {
                Text(more).font(theme.font(.subheadline)).foregroundStyle(theme.colors.textMuted.color)
                    .frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 16).padding(.vertical, 10)
                    .accessibilityIdentifier("c15t.first-layer.summary.more")
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
            .accessibilityIdentifier("c15t.first-layer.partner-count")
            .padding(.horizontal, 16)
        }
        .padding(.vertical, 6)
        .background(theme.colors.surfaceMuted.color, in: RoundedRectangle(cornerRadius: theme.radius.md + 2, style: .continuous))
        VStack(alignment: .leading, spacing: 12) {
            Text(content.legitimateInterestNotice).accessibilityIdentifier("c15t.first-layer.legitimate-interest")
            Text(content.scope).accessibilityIdentifier("c15t.first-layer.scope")
            Text(content.withdraw).accessibilityIdentifier("c15t.first-layer.withdraw")
        }
        .font(theme.font(.subheadline)).foregroundStyle(theme.colors.textMuted.color)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct Hairline: View {
    @Environment(\.consentTheme) private var theme
    var body: some View { Rectangle().fill(theme.colors.text.color.opacity(0.1)).frame(height: 1 / UIScreen.main.scale) }
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
    @Environment(\.consentTheme) private var theme
    var body: some View {
        HStack(spacing: 4) {
            switch theme.branding {
            case .c15t, .inth:
                ConsentProviderMark(branding: theme.branding).fill(style: FillStyle(eoFill: true))
                    .frame(width: 15, height: 15).accessibilityHidden(true)
            case .custom(_, let imageName):
                if let imageName {
                    Image(imageName).resizable().scaledToFit().frame(width: 15, height: 15)
                        .accessibilityHidden(true)
                }
            }
            Text(theme.branding.name).fontWeight(.semibold)
        }
    }
}

private struct Branding: View {
    @Environment(\.consentTheme) private var theme
    var body: some View {
        HStack(spacing: 6) {
            Text("Secured by")
            ProviderSignature()
        }
        .font(theme.font(.caption)).foregroundStyle(theme.colors.textMuted.color)
        .frame(maxWidth: .infinity, alignment: .trailing)
        .accessibilityElement(children: .ignore).accessibilityLabel("Secured by \(theme.branding.name)")
        .accessibilityIdentifier("c15t.first-layer.branding")
    }
}

private struct CompactBranding: View {
    @Environment(\.consentTheme) private var theme
    var body: some View {
        VStack(spacing: 4) {
            Text("Secured by").font(theme.font(.caption2))
            ProviderSignature().font(theme.font(.caption))
        }
        .foregroundStyle(theme.colors.textMuted.color)
        .fixedSize()
        .accessibilityElement(children: .ignore).accessibilityLabel("Secured by \(theme.branding.name)")
        .accessibilityIdentifier("c15t.first-layer.branding")
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
    @Environment(\.brandingInOverlay) private var brandingInOverlay
    private var prefix: String { first ? "c15t.first-layer" : presenter.iab ? "c15t.iab" : "c15t.prefs" }

    static func errorID(first: Bool) -> String { (first ? "c15t.first-layer" : "c15t.prefs") + ".error" }
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
                    decisions
                }
            case .pinned:
                if presenter.stale { reload }
                else if let action = Self.pinnedAction(presenter) {
                    let labels = presenter.decisionLabels
                    decision(action == .save ? labels.save : labels.rejectAll, action)
                }
            case .shortcuts:
                if Self.showsShortcuts(presenter) {
                    if presenter.failedAction != Self.pinnedAction(presenter) { failure }
                    decisions
                }
            case .pinnedStatus:
                if Self.showsPinnedStatus(presenter) { failure }
            }
        }
        .disabled(presenter.pending)
    }

    private var reload: some View {
        Button(presenter.iabCopy.appLoadCurrentSettings) { presenter.loadDraft() }.buttonStyle(ConsentButtonStyle(variant: .accent)).accessibilityIdentifier("c15t.prefs.stale.reload")
    }
    @ViewBuilder private var failure: some View {
        if let message = presenter.errorMessage {
            FailureRow(message: message, id: Self.errorID(first: first), retry: presenter.retry)
        }
    }
    @ViewBuilder private var decisions: some View {
        let labels = presenter.decisionLabels
        if presenter.snapshot.policyPending {
            decision(labels.rejectAll, .reject)
        } else if presenter.listUnavailable {
            Text(presenter.iabCopy.appListOutdated)
                .font(theme.font(.subheadline)).foregroundStyle(theme.colors.textMuted.color).frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityIdentifier(first ? "c15t.first-layer.list-stale" : "c15t.iab.list-stale")
            EqualDecisionLayout {
                decision(labels.rejectAll, .reject)
                Button(presenter.iabCopy.appTryAgain) { presenter.refresh() }.buttonStyle(ConsentButtonStyle(variant: .quiet)).accessibilityIdentifier(first ? "c15t.first-layer.retry" : "c15t.iab.retry")
            }
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
            } else if part == .all {
                decision(plan.next)
            }
        }
    }

    @ViewBuilder private func decision(_ control: DecisionControl) -> some View {
        switch control.kind {
        case .reject: decision(control.label, .reject, style: control.style)
        case .accept: decision(control.label, .accept, style: control.style)
        case .save: decision(control.label, .save, style: control.style)
        case .customize:
            Button(control.label) { presenter.customize() }.buttonStyle(ConsentButtonStyle(variant: control.style)).accessibilityIdentifier("c15t.first-layer.customize")
        }
    }

    /// Labels stay put while a commit runs: the pressed action shows progress beside its own
    /// label, and the others fade as disabled, so the person can still see what is being saved.
    private func decision(_ label: String, _ action: ConsentPresenter.Action, style: DecisionStyle? = nil) -> some View {
        let suffix: String = switch action { case .accept: "accept-all"; case .reject: "reject-all"; case .save: "save"; case .acknowledge: "acknowledge" }
        let busy = presenter.showProgress && presenter.pendingAction == action
        return Button(label) { presenter.commit(action) }
            .buttonStyle(ConsentButtonStyle(variant: style ?? (action == .save ? .accent : first ? .decision : .quiet), busy: busy))
            .accessibilityLabel(label).accessibilityValue(busy ? "Saving" : "").accessibilityIdentifier(prefix + "." + suffix)
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

    var body: some View {
        let page = typeSize.actionsInPage
        if !page || (!first && DecisionGroup.showsPinned(presenter)) {
            DecisionGroup(presenter: presenter, first: first, part: page ? .pinned : .all, path: $path)
                .padding(.horizontal, first ? theme.spacing.lg : theme.spacing.md)
                .padding(.top, theme.spacing.sm + theme.spacing.xs).padding(.bottom, theme.spacing.sm)
                // The row fades in and the actions ease down to make room instead of jumping under the thumb.
                .animation(reduceMotion ? nil : .easeOut(duration: 0.2), value: presenter.errorCode)
                .frame(maxWidth: contentWidth).frame(maxWidth: .infinity)
                .background(theme.colors.canvas.color.ignoresSafeArea())
                .overlay(alignment: .top) { Hairline() }
                .accessibilityElement(children: .contain).accessibilityIdentifier("c15t.footer")
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
        let content = presenter.iabPreferences
        ScrollViewReader { proxy in
          List {
            if presenter.snapshot.policyPending {
                Section {
                    Text(presenter.iabCopy.appPreferencesUnavailable).foregroundStyle(theme.colors.text.color)
                        .accessibilityFocused($introFocused)
                    Button(presenter.iabCopy.appTryAgain) { presenter.refresh() }.buttonStyle(TextLinkStyle(style: .body, weight: .medium)).accessibilityIdentifier("c15t.status.unavailable.retry")
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
                    }.accessibilityIdentifier("c15t.prefs.stale")
                }
                Section {
                    VStack(alignment: .leading, spacing: 8) {
                        if presenter.iab {
                            Text(presenter.iabCopy.appPreferencesIntro)
                                .accessibilityFocused($introFocused)
                            if let explanation = content?.legitimateInterestExplanation {
                                Text(explanation).accessibilityIdentifier("c15t.iab.legitimate-interest-explanation")
                            }
                            Button(presenter.iabCopy.format(presenter.iabCopy.appIabPartnerCount, ["count": String(presenter.disclosure?.vendors.count ?? 0)])) { path.append(.vendors(nil)) }
                                .buttonStyle(TextLinkStyle(style: .subheadline, weight: .semibold)).accessibilityIdentifier("c15t.iab.partner-count")
                        } else {
                            Text("Choose which kinds of data use you allow. Changes apply on this device as soon as you save.")
                                .accessibilityFocused($introFocused)
                        }
                    }.font(theme.font(.subheadline)).foregroundStyle(theme.colors.textMuted.color)
                }.modifier(PreferencesUnboxedSection(top: 0, bottom: 4))
                if page, DecisionGroup.showsShortcuts(presenter) {
                    Section { DecisionGroup(presenter: presenter, first: false, part: .shortcuts, path: $path).id("c15t.prefs.shortcuts") }
                        .modifier(PreferencesUnboxedSection(top: 4, bottom: 8))
                }
                Section { ForEach(presenter.offeredCategories, id: \.self) { category in CategoryRow(presenter: presenter, category: category) } }
                    header: { if presenter.iab { SectionLabel(presenter.iabCopy.appThisApp) } }
                    .listRowBackground(surface)
                if let content, let disclosure = presenter.disclosure {
                    Section {
                        ForEach(content.purposes) { purpose in
                            PurposeRow(presenter: presenter, content: purpose, rightToObject: content.rightToObject) { path.append(.vendors(purpose.id)) }
                        }
                    } header: { SectionLabel(presenter.iabCopy.preferenceCenterVendorListPurposes) }
                        .listRowBackground(surface)
                    if !content.specialFeatures.isEmpty {
                        Section {
                            ForEach(content.specialFeatures) { item in SpecialFeatureRow(presenter: presenter, item: item) }
                        } header: { SectionLabel(presenter.iabCopy.preferenceCenterVendorListSpecialFeatures) }
                            .listRowBackground(surface)
                    }
                    if !content.specialPurposes.isEmpty {
                        Section {
                            ForEach(content.specialPurposes) { item in
                                ReadOnlyDefinition(item: item, id: "c15t.iab.special-purpose.\(item.id)")
                            }
                        } header: { SectionLabel(presenter.iabCopy.preferenceCenterVendorListSpecialPurposes) } footer: { Text(disclosure.list.standardTexts?.specialPurposes ?? "") }
                            .listRowBackground(surface)
                    }
                    if !content.features.isEmpty {
                        Section {
                            ForEach(content.features) { item in
                                ReadOnlyDefinition(item: item, id: "c15t.iab.feature.\(item.id)")
                            }
                        } header: { SectionLabel(presenter.iabCopy.preferenceCenterFeaturesTitle) } footer: { Text(content.featuresStandardText).accessibilityIdentifier("c15t.iab.features-standard-text") }
                            .listRowBackground(surface)
                    }
                    Section {
                        NavigationLink(value: Destination.vendors(nil)) {
                            LabeledContent(presenter.iabCopy.appIabPartners, value: "\(content.iabPartnerCount)")
                        }.frame(minHeight: 44).accessibilityIdentifier("c15t.iab.partners")
                        if content.otherPartnerCount > 0 {
                            NavigationLink(value: Destination.providers) { LabeledContent(presenter.iabCopy.preferenceCenterVendorListAdTechProvidersHeading, value: "\(content.otherPartnerCount)") }
                                .frame(minHeight: 44).accessibilityIdentifier("c15t.iab.other-partners")
                        }
                    } header: { SectionLabel(presenter.iabCopy.appPartners) }
                        .listRowBackground(surface)
                }
                Section {
                    PrivacyLink(url: privacyPolicyURL)
                    if let storage = content?.consentStorage {
                        Text(storage).font(theme.font(.footnote)).foregroundStyle(theme.colors.textMuted.color)
                            .accessibilityIdentifier("c15t.iab.consent-storage")
                    }
                    if let changed = presenter.snapshot.explicitChoice?.categories.values.map(\.confirmedAt).max() {
                        Text(presenter.lastChanged(at: changed))
                            .font(theme.font(.footnote)).foregroundStyle(theme.colors.textMuted.color).accessibilityIdentifier("c15t.prefs.last-changed")
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
                      proxy.scrollTo(last ? DecisionGroup.errorID(first: false) : "c15t.prefs.shortcuts", anchor: last ? .bottom : nil)
                  }
              }
          }
        }
        .listStyle(.insetGrouped).scrollContentBackground(.hidden).modifier(SectionSpacing())
        .foregroundStyle(theme.colors.text.color)
        .navigationTitle(presenter.iabCopy.preferenceCenterTitle).navigationBarTitleDisplayMode(.inline)
        .accessibilityIdentifier(presenter.iab ? "c15t.iab" : "c15t.prefs")
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
            Text(title).font(theme.font(.body, weight: .semibold)).foregroundStyle(theme.colors.text.color)
            if let description, !description.isEmpty { Text(description).font(theme.font(.subheadline)).foregroundStyle(theme.colors.textMuted.color) }
            if let note { Text(note).font(theme.font(.footnote)).foregroundStyle(theme.colors.textMuted.color) }
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
                ReadOnlyStatusRow(
                    label: RowLabel(title: title, description: description,
                        note: optional.flatMap { optional in restricted ? (presenter.snapshot.restrictions[optional]?.contains(.gpc) == true ? "Off because your device sends a Global Privacy Control signal." : "Not offered where you are.") : nil }),
                    status: Text(category == .necessary ? presenter.iabCopy.appAlwaysOn : presenter.iabCopy.appOff).font(theme.font(.subheadline)).foregroundStyle(theme.colors.textMuted.color)
                        .accessibilityIdentifier("c15t.prefs.category.\(category.rawValue).locked")
                )
                .frame(minHeight: 44)
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier(restricted ? "c15t.prefs.category.\(category.rawValue).restricted" : "c15t.prefs.category.\(category.rawValue).locked")
            }
        }.disabled(presenter.pending || presenter.stale || presenter.listUnavailable)
    }
}

/// Legal text and the GVL's standard illustrations behind one Details control, for every kind
/// of definition: purposes, special purposes, features and special features.
private struct DefinitionDetails<Extra: View>: View {
    let item: IABDefinitionContent
    let id: String
    let extra: Extra
    @State private var expanded = false
    @Environment(\.consentTheme) private var theme
    @Environment(\.iabCopy) private var copy
    init(item: IABDefinitionContent, id: String, @ViewBuilder extra: () -> Extra) {
        self.item = item
        self.id = id
        self.extra = extra()
    }
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button { expanded.toggle() } label: {
                Label(expanded ? copy.appHideDetails : copy.appDetails, systemImage: expanded ? "chevron.up" : "chevron.down")
                    .labelStyle(TrailingIconLabelStyle())
            }
            .buttonStyle(TextLinkStyle()).accessibilityValue(expanded ? copy.appExpanded : copy.appCollapsed).accessibilityIdentifier(id + ".details")
            if expanded {
                VStack(alignment: .leading, spacing: 8) {
                    if let legal = item.descriptionLegal, !legal.isEmpty { Text(legal) }
                    ForEach(item.illustrations, id: \.self) { Text("• " + $0) }
                }
                .font(theme.font(.subheadline)).foregroundStyle(theme.colors.textMuted.color)
                // Expanded text takes its full height; a list row otherwise truncates it to a line.
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityElement(children: .combine).accessibilityIdentifier(id + ".illustrations")
                extra
            }
        }
    }
}
private extension DefinitionDetails where Extra == EmptyView {
    init(item: IABDefinitionContent, id: String) { self.init(item: item, id: id) { EmptyView() } }
}

private struct ReadOnlyDefinition: View {
    let item: IABDefinitionContent
    let id: String
    @Environment(\.consentTheme) private var theme
    @Environment(\.iabCopy) private var copy
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            ReadOnlyStatusRow(label: RowLabel(title: item.name, description: item.description),
                status: Text(copy.appNoChoice).font(theme.font(.footnote)).foregroundStyle(theme.colors.textMuted.color))
                .accessibilityElement(children: .combine).accessibilityIdentifier(id)
            if item.hasDetails { DefinitionDetails(item: item, id: id) }
        }.padding(.vertical, 10)
    }
}

private struct PurposeRow: View {
    @ObservedObject var presenter: ConsentPresenter
    let content: IABPurposeContent
    let rightToObject: String
    let openPartners: () -> Void
    @Environment(\.consentTheme) private var theme
    private var copy: IABCopy { presenter.iabCopy }
    var body: some View {
        let id = content.id
        VStack(alignment: .leading, spacing: 8) {
            // The partner counts sit on the collapsed row, not behind Details.
            ConsentToggle(isOn: Binding(get: { presenter.choices.purposeConsents.contains(id) }, set: { presenter.edit(\.purposeConsents, id: id, enabled: $0) })) {
                RowLabel(title: content.definition.name, description: content.definition.description, note: content.partnerCounts)
            }.accessibilityIdentifier("c15t.iab.purpose.\(id).consent")
            DefinitionDetails(item: content.definition, id: "c15t.iab.purpose.\(id)") {
                Button(copy.appViewPartners, action: openPartners).buttonStyle(TextLinkStyle()).accessibilityIdentifier("c15t.iab.purpose.\(id).view-partners")
                if content.offersObjection {
                    ConsentToggle(isOn: Binding(get: { presenter.choices.purposeLegitimateInterests.contains(id) }, set: { presenter.editLI(purpose: true, id: id, enabled: $0) })) {
                        RowLabel(title: copy.preferenceCenterPurposeItemLegitimateInterest, note: rightToObject + " " + copy.appTurnOffToObject)
                    }.accessibilityIdentifier("c15t.iab.purpose.\(id).li")
                }
            }
        }.padding(.vertical, 4).disabled(presenter.pending || presenter.stale || presenter.listUnavailable)
    }
}

/// One opt-in per special feature, with its standard texts and illustrations behind Details.
private struct SpecialFeatureRow: View {
    @ObservedObject var presenter: ConsentPresenter
    let item: IABDefinitionContent
    private var copy: IABCopy { presenter.iabCopy }
    var body: some View {
        let id = item.id
        VStack(alignment: .leading, spacing: 8) {
            ConsentToggle(isOn: Binding(get: { presenter.choices.specialFeatureOptIns.contains(id) }, set: { presenter.edit(\.specialFeatureOptIns, id: id, enabled: $0) })) {
                RowLabel(title: item.name, description: item.description, note: copy.appSpecialFeatureOptIn)
            }.accessibilityIdentifier("c15t.iab.special-feature.\(id).switch")
            DefinitionDetails(item: item, id: "c15t.iab.special-feature.\(id)")
        }.padding(.vertical, 4).disabled(presenter.pending || presenter.stale || presenter.listUnavailable)
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
                SearchField(placeholder: presenter.iabCopy.appSearchPartners, text: $search, id: "c15t.iab.vendors.search")
                if let purpose {
                    Button {
                        self.purpose = nil
                    } label: {
                        Label(presenter.iabCopy.format(presenter.iabCopy.appPurposeFilter, ["purpose": presenter.disclosure?.list.purposes[purpose]?.name ?? ""]), systemImage: "xmark.circle.fill")
                            .labelStyle(TrailingIconLabelStyle())
                    }.buttonStyle(TextLinkStyle()).accessibilityIdentifier("c15t.iab.vendors.filter.purpose.clear")
                }
            }.listRowBackground(theme.colors.surface.color)
            let vendors = (presenter.disclosure?.list.vendors.values.filter { vendor in
                presenter.disclosure?.vendors[vendor.id] != nil && (search.isEmpty || vendor.name.localizedStandardContains(search))
                    && (purpose == nil || presenter.disclosure?.vendors[vendor.id]?.consentPurposes.contains(purpose!) == true || presenter.disclosure?.vendors[vendor.id]?.legitimateInterestPurposes.contains(purpose!) == true)
            } ?? []).sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
            Section {
                if vendors.isEmpty {
                    Text(presenter.iabCopy.format(presenter.iabCopy.appNoPartnersMatch, ["search": search])).foregroundStyle(theme.colors.textMuted.color).accessibilityIdentifier("c15t.iab.vendors.empty")
                }
                ForEach(vendors, id: \.id) { vendor in
                    NavigationLink(value: Destination.vendor(vendor.id)) {
                        HStack(alignment: .center, spacing: 12) {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(vendor.name).font(theme.font(.body, weight: .semibold)).foregroundStyle(theme.colors.text.color)
                                if let projection = presenter.disclosure?.vendors[vendor.id] {
                                    Text(presenter.iabCopy.format(presenter.iabCopy.appVendorPurposeSummary, ["purposes": String(projection.consentPurposes.count), "legitimateInterest": String(projection.legitimateInterestPurposes.count)])).font(theme.font(.footnote)).foregroundStyle(theme.colors.textMuted.color)
                                }
                            }
                            Spacer(minLength: 0)
                            StatusTag(status: presenter.partnerStatus(vendor.id), off: presenter.partnerSelection(vendor.id) == .off).accessibilityIdentifier("c15t.iab.vendors.vendor.\(vendor.id).status")
                        }.padding(.vertical, 6)
                    }.accessibilityIdentifier("c15t.iab.vendors.vendor.\(vendor.id)")
                }
            }.listRowBackground(theme.colors.surface.color)
            // The first layer's partner count includes these, so the list it opens leads to them,
            // on their own page apart from IAB partners.
            if purpose.map(adTechProviderPurposeIds.contains) ?? true, search.isEmpty, let providers = presenter.disclosure?.adTechProviders, !providers.isEmpty {
                Section {
                    NavigationLink(value: Destination.providers) { LabeledContent(presenter.iabCopy.preferenceCenterVendorListAdTechProvidersHeading, value: "\(providers.count)") }
                        .frame(minHeight: 44).accessibilityIdentifier("c15t.iab.vendors.other-partners")
                } footer: { Text(presenter.iabCopy.preferenceCenterVendorListAdTechProvidersNotice) }
                    .listRowBackground(theme.colors.surface.color)
            }
        }
        .listStyle(.insetGrouped).scrollContentBackground(.hidden)
        .navigationTitle(presenter.iabCopy.appIabPartners).navigationBarTitleDisplayMode(.inline)
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
        .listStyle(.insetGrouped).scrollContentBackground(.hidden)
        .foregroundStyle(theme.colors.text.color)
        .navigationTitle(presenter.disclosure?.list.vendors[id]?.name ?? presenter.iabCopy.appPartner).navigationBarTitleDisplayMode(.inline)
        .accessibilityIdentifier("c15t.iab.vendor.\(id)")
    }
    private func links(_ vendor: IABVendorContent) -> some View {
        Section {
            if let url = vendor.privacyPolicy { Link(copy.preferenceCenterVendorListPrivacyPolicy, destination: url).buttonStyle(TextLinkStyle(style: .body, weight: nil)).accessibilityIdentifier("c15t.iab.vendor.\(id).privacy-link") }
            if let url = vendor.legitimateInterestClaim { Link(copy.appLegitimateInterestStatement, destination: url).buttonStyle(TextLinkStyle(style: .body, weight: nil)).accessibilityIdentifier("c15t.iab.vendor.\(id).li-claim-link") }
        }.listRowBackground(theme.colors.surface.color)
    }
    private func selections(_ vendor: IABVendorContent) -> some View {
        Section {
            if !vendor.consentPurposes.isEmpty {
                ConsentToggle(isOn: Binding(get: { presenter.choices.vendorConsents.contains(id) }, set: { presenter.edit(\.vendorConsents, id: id, enabled: $0) })) {
                    RowLabel(title: copy.appConsent, description: vendor.consentPurposes.joined(separator: ", "))
                }.accessibilityIdentifier("c15t.iab.vendor.\(id).consent")
            }
            if !vendor.legitimateInterestPurposes.isEmpty {
                ConsentToggle(isOn: Binding(get: { presenter.choices.vendorLegitimateInterests.contains(id) }, set: { presenter.editLI(purpose: false, id: id, enabled: $0) })) {
                    RowLabel(title: copy.preferenceCenterPurposeItemLegitimateInterest, description: vendor.legitimateInterestPurposes.joined(separator: ", "), note: copy.appTurnOffToObject)
                }.accessibilityIdentifier("c15t.iab.vendor.\(id).li")
            }
            if !vendor.notAllowedPurposes.isEmpty {
                Text(copy.format(copy.appNotAllowedPurposes, ["purposes": vendor.notAllowedPurposes.joined(separator: ", ")])).font(theme.font(.subheadline)).foregroundStyle(theme.colors.textMuted.color)
                    .accessibilityIdentifier("c15t.iab.vendor.\(id).not-allowed")
            }
        } header: { SectionLabel(copy.appYourChoices) }
            .listRowBackground(theme.colors.surface.color)
            .disabled(presenter.pending || presenter.stale || presenter.listUnavailable)
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
                ForEach(vendor.features) { item in ReadOnlyDefinition(item: item, id: "c15t.iab.vendor.\(vendor.id).feature.\(item.id)") }
            } header: { SectionLabel(copy.preferenceCenterFeaturesTitle) } footer: {
                Text(vendor.featuresStandardText).accessibilityIdentifier("c15t.iab.vendor.\(vendor.id).features-standard-text")
            }
                .listRowBackground(theme.colors.surface.color)
        }
        if !vendor.specialFeatureIds.isEmpty {
            Section {
                ForEach(Array(zip(vendor.specialFeatureIds, vendor.specialFeatures)), id: \.0) { feature, name in
                    ReadOnlyStatusRow(label: Text(name),
                        status: Text(presenter.choices.specialFeatureOptIns.contains(feature) ? copy.appOn : copy.appOff).font(theme.font(.footnote)).foregroundStyle(theme.colors.textMuted.color))
                }
            } header: { SectionLabel(copy.preferenceCenterVendorListSpecialFeatures) } footer: { Text(copy.appSpecialFeaturesElsewhere) }
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
            .accessibilityIdentifier("c15t.iab.vendor.\(id).retention")
    }
    private func storage(_ vendor: IABVendorContent) -> some View {
        Section {
            if !vendor.storesOnDevice { Text(copy.appNoDeviceStorage) }
            ForEach(Array(vendor.storage.enumerated()), id: \.offset) { _, row in LabeledContent(row.label, value: row.value) }
            if let url = vendor.storageDisclosure { Link(copy.appDeviceStorageDetails, destination: url).buttonStyle(TextLinkStyle(style: .body, weight: nil)) }
        } header: { SectionLabel(copy.appDeviceStorage) }
            .listRowBackground(theme.colors.surface.color)
            .accessibilityIdentifier("c15t.iab.vendor.\(id).storage")
    }
}

private struct ProviderList: View {
    @ObservedObject var presenter: ConsentPresenter
    @State private var search = ""
    @Environment(\.consentTheme) private var theme
    /// The web's notice, plus why the providers stay off while their purposes are.
    private var intro: String {
        let copy = presenter.iabCopy
        let notice = copy.preferenceCenterVendorListAdTechProvidersNotice
        return presenter.providerPrerequisitesMet ? notice : notice + " " + copy.appProvidersOff
    }
    var body: some View {
        List {
            Section {
                SearchField(placeholder: presenter.iabCopy.appSearchOtherPartners, text: $search, id: "c15t.ac.search")
            } footer: {
                Text(intro).accessibilityIdentifier("c15t.ac.intro")
            }.listRowBackground(theme.colors.surface.color)
            let providers = (presenter.disclosure?.adTechProviders ?? []).filter { search.isEmpty || $0.name.localizedStandardContains(search) }.sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
            Section {
                if providers.isEmpty { Text(presenter.iabCopy.format(presenter.iabCopy.appNoPartnersMatch, ["search": search])).foregroundStyle(theme.colors.textMuted.color).accessibilityIdentifier("c15t.ac.empty") }
                ForEach(providers, id: \.id) { provider in
                    VStack(alignment: .leading, spacing: 0) {
                        ConsentToggle(isOn: Binding(get: { presenter.choices.adTechProviderConsents?.contains(provider.id) == true }, set: { presenter.editProvider(id: provider.id, enabled: $0) })) {
                            Text(provider.name).font(theme.font(.body, weight: .semibold)).foregroundStyle(theme.colors.text.color)
                        }.accessibilityIdentifier("c15t.ac.provider.\(provider.id).switch")
                        if let url = URL(string: provider.policyUrl) {
                            Link(presenter.iabCopy.preferenceCenterVendorListPrivacyPolicy, destination: url).buttonStyle(TextLinkStyle()).accessibilityIdentifier("c15t.ac.provider.\(provider.id).privacy-link")
                        }
                    }.disabled(presenter.pending || presenter.stale || presenter.listUnavailable)
                }
            }.listRowBackground(theme.colors.surface.color)
        }
        .listStyle(.insetGrouped).scrollContentBackground(.hidden)
        .navigationTitle(presenter.iabCopy.preferenceCenterVendorListAdTechProvidersHeading).navigationBarTitleDisplayMode(.inline)
        .scrollDismissesKeyboard(.immediately).accessibilityIdentifier("c15t.ac")
    }
}
#endif
