import Foundation
#if canImport(SwiftUI) && canImport(UIKit)
import SwiftUI
import UIKit
#endif

/// One colour with a light and a dark value, each an sRGB `0xRRGGBB`.
public struct ConsentThemeColor: Equatable, Hashable, Sendable {
    public var light: UInt32
    public var dark: UInt32

    /// - Parameters:
    ///   - light: Colour in the light appearance.
    ///   - dark: Colour in the dark appearance. Defaults to `light`.
    public init(light: UInt32, dark: UInt32? = nil) {
        self.light = light
        self.dark = dark ?? light
    }

    /// Parse `#RRGGBB`, `RRGGBB`, or `#RRGGBB,#RRGGBB` (light, dark).
    /// - Returns: `nil` for anything that is not one or two six-digit hex colours.
    public init?(hex text: String) {
        let parts = text.split(separator: ",", omittingEmptySubsequences: false).map { ConsentThemeColor.hex($0) }
        guard parts.count == 1 || parts.count == 2, parts.allSatisfy({ $0 != nil }) else { return nil }
        self.init(light: parts[0]!, dark: parts.count == 2 ? parts[1]! : nil)
    }

    private static func hex(_ raw: Substring) -> UInt32? {
        var text = raw.trimmingCharacters(in: .whitespaces)
        if text.hasPrefix("#") { text.removeFirst() }
        guard text.count == 6, let value = UInt32(text, radix: 16) else { return nil }
        return value
    }

    /// This colour moved `fraction` of the way toward `other` in each appearance, in sRGB.
    /// - Parameters:
    ///   - other: The colour to move toward.
    ///   - fraction: `0` keeps this colour; `1` is `other`. Values outside `0...1` are clamped.
    /// - Returns: A colour whose light and dark values are each blended separately.
    public func blended(toward other: ConsentThemeColor, fraction: Double) -> ConsentThemeColor {
        ConsentThemeColor(light: Self.mix(light, other.light, fraction), dark: Self.mix(dark, other.dark, fraction))
    }

    private static func mix(_ from: UInt32, _ to: UInt32, _ fraction: Double) -> UInt32 {
        let amount = min(max(fraction, 0), 1)
        func channel(_ shift: UInt32) -> UInt32 {
            let start = Double((from >> shift) & 255), end = Double((to >> shift) & 255)
            return UInt32((start + (end - start) * amount).rounded()) << shift
        }
        return channel(16) | channel(8) | channel(0)
    }

    #if canImport(SwiftUI) && canImport(UIKit)
    /// A dynamic colour that follows the trait collection. Every read of the same pair returns the
    /// same instance, so SwiftUI sees an unchanged colour and skips the views that use it.
    public var color: Color { ConsentColorCache.shared.color(light: light, dark: dark) }

    /// The same dynamic colour for UIKit, with `alpha` applied in each appearance.
    func uiColor(alpha: CGFloat = 1) -> UIColor {
        ConsentColorCache.shared.uiColor(light: light, dark: dark, alpha: alpha)
    }
    #endif
}

#if canImport(SwiftUI) && canImport(UIKit)
/// Dynamic colours by light, dark and alpha. A theme has a handful of colours, so the cache
/// stays small; the cap only guards a host that builds colours without end.
private final class ConsentColorCache: @unchecked Sendable {
    static let shared = ConsentColorCache()
    private struct Key: Hashable { let light: UInt32, dark: UInt32, alpha: CGFloat }
    private let lock = NSLock()
    private var uiColors: [Key: UIColor] = [:]
    private var colors: [Key: Color] = [:]

    func uiColor(light: UInt32, dark: UInt32, alpha: CGFloat) -> UIColor {
        let key = Key(light: light, dark: dark, alpha: alpha)
        lock.lock(); defer { lock.unlock() }
        return uiColorLocked(key)
    }

    func color(light: UInt32, dark: UInt32) -> Color {
        let key = Key(light: light, dark: dark, alpha: 1)
        lock.lock(); defer { lock.unlock() }
        if let color = colors[key] { return color }
        if colors.count >= 256 { colors.removeAll() }
        let color = Color(uiColor: uiColorLocked(key))
        colors[key] = color
        return color
    }

    private func uiColorLocked(_ key: Key) -> UIColor {
        if let color = uiColors[key] { return color }
        if uiColors.count >= 256 { uiColors.removeAll() }
        let light = key.light, dark = key.dark, alpha = key.alpha
        let color = UIColor { traits in
            UIColor(rgb: traits.userInterfaceStyle == .dark ? dark : light).withAlphaComponent(alpha)
        }
        uiColors[key] = color
        return color
    }
}
#endif

/// Appearance of the native consent screens. Every value has a c15t default.
///
/// Pass one to `c15tConsent(presenter:privacyPolicyURL:theme:)`, set ``current``
/// once at launch, or declare the same values in `Info.plist` under the
/// ``InfoPlistKey`` names. Plist values override ``current``; an explicit theme
/// passed to the root modifier takes precedence over both.
public struct ConsentTheme: Equatable, Sendable {
    /// Semantic colours. Components never use a raw value outside this set. A name that has a web
    /// token is that token's name: `primary` is `--c15t-primary`, `textMuted` is `--c15t-text-muted`.
    public struct Colors: Equatable, Sendable {
        /// Page background behind every consent screen. No web token.
        public var canvas: ConsentThemeColor
        /// Cards and list rows that sit on the canvas. Web: `--c15t-surface`.
        public var surface: ConsentThemeColor
        /// A quieter surface for subordinate content such as the partner purposes list. No web token.
        public var surfaceMuted: ConsentThemeColor
        /// Primary text. Web: `--c15t-text`.
        public var text: ConsentThemeColor
        /// Supporting text and section labels. Web: `--c15t-text-muted`.
        public var textMuted: ConsentThemeColor
        /// Links, switches, the Save button, and the brand eyebrow. Web: `--c15t-primary`.
        public var primary: ConsentThemeColor
        /// Text on `primary`. Web: `--c15t-text-on-primary`.
        public var textOnPrimary: ConsentThemeColor
        /// Fill of the two decision buttons. Accept all and Reject all always share it. No web token.
        public var decision: ConsentThemeColor
        /// Text on `decision`. No web token.
        public var textOnDecision: ConsentThemeColor

        public init(canvas: ConsentThemeColor, surface: ConsentThemeColor, surfaceMuted: ConsentThemeColor,
            text: ConsentThemeColor, textMuted: ConsentThemeColor, primary: ConsentThemeColor,
            textOnPrimary: ConsentThemeColor, decision: ConsentThemeColor, textOnDecision: ConsentThemeColor) {
            self.canvas = canvas
            self.surface = surface
            self.surfaceMuted = surfaceMuted
            self.text = text
            self.textMuted = textMuted
            self.primary = primary
            self.textOnPrimary = textOnPrimary
            self.decision = decision
            self.textOnDecision = textOnDecision
        }

        /// Text of an On or Partly on status tag. The tag sits on a 14% tint of `primary`, and the
        /// primary alone does not reach 4.5:1 on its own tint at caption size, so the label is the
        /// primary pulled toward `text`. Derived, so a host theme gets the same floor for free.
        var statusTagText: ConsentThemeColor { primary.blended(toward: text, fraction: 0.3) }

        /// Warm paper, ink decisions, and the c15t blue for links and switches.
        public static let c15t = Colors(
            canvas: ConsentThemeColor(light: 0xF8F4EE, dark: 0x171411),
            surface: ConsentThemeColor(light: 0xFFFFFF, dark: 0x211D18),
            surfaceMuted: ConsentThemeColor(light: 0xEFE9DF, dark: 0x2B2620),
            text: ConsentThemeColor(light: 0x1E1B17, dark: 0xF3EEE6),
            textMuted: ConsentThemeColor(light: 0x6B655D, dark: 0xA49D93),
            primary: ConsentThemeColor(light: 0x335CFF, dark: 0x8CA2FF),
            textOnPrimary: ConsentThemeColor(light: 0xFFFFFF, dark: 0x0A1033),
            decision: ConsentThemeColor(light: 0x1E1B17, dark: 0xF3EEE6),
            textOnDecision: ConsentThemeColor(light: 0xF8F4EE, dark: 0x171411))
    }

    /// Corner radii in points, named after `--c15t-radius-*`.
    public struct Radius: Equatable, Sendable {
        /// Status callouts. `nil` follows `md` minus 2.
        public var sm: CGFloat?
        /// Buttons and cards. Web: `--c15t-radius-md`.
        public var md: CGFloat
        /// The notice card and the discard confirmation. `nil` follows `md` plus 6.
        public var lg: CGFloat?

        public init(sm: CGFloat? = nil, md: CGFloat = 14, lg: CGFloat? = nil) {
            self.sm = sm
            self.md = md
            self.lg = lg
        }

        var resolvedSm: CGFloat { sm ?? max(0, md - 2) }
        var resolvedLg: CGFloat { lg ?? md + 6 }
    }

    /// Spacing scale in points, named after `--c15t-space-*`. Page gutters, stack gaps and
    /// section padding read it; a control's own inset stays fixed so its tap target keeps its size.
    public struct Spacing: Equatable, Sendable {
        public var xs: CGFloat
        public var sm: CGFloat
        public var md: CGFloat
        public var lg: CGFloat
        public var xl: CGFloat

        public init(xs: CGFloat = 4, sm: CGFloat = 8, md: CGFloat = 16, lg: CGFloat = 24, xl: CGFloat = 32) {
            self.xs = xs
            self.sm = sm
            self.md = md
            self.lg = lg
            self.xl = xl
        }
    }

    /// Type settings, named after the web `typography` tokens.
    public struct Typography: Equatable, Sendable {
        /// Sizes in points at the default Dynamic Type size, named after `--c15t-font-size-*`.
        /// `nil` keeps the platform text style. Every text role in a group scales with its token,
        /// so the hierarchy inside the group holds, and Dynamic Type still applies on top.
        public struct FontSize: Equatable, Sendable {
            /// Supporting text, footnotes and captions. The platform default is 15 (subheadline).
            public var sm: CGFloat?
            /// Body text, row titles and buttons. The platform default is 17 (body).
            public var base: CGFloat?
            /// The first-layer headline. The platform default is 34 (large title).
            public var lg: CGFloat?

            public init(sm: CGFloat? = nil, base: CGFloat? = nil, lg: CGFloat? = nil) {
                self.sm = sm
                self.base = base
                self.lg = lg
            }
        }

        /// PostScript name of a font the app bundles, for every text role except the headline.
        /// `nil` is the system face. Web: `--c15t-font-family`.
        public var fontFamily: String?
        /// Typeface of the first-layer headline. No web token.
        public var headlineFont: HeadlineFont
        public var fontSize: FontSize

        public init(fontFamily: String? = nil, headlineFont: HeadlineFont = .sansSerif, fontSize: FontSize = FontSize()) {
            self.fontFamily = fontFamily
            self.headlineFont = headlineFont
            self.fontSize = fontSize
        }
    }

    /// Parts a theme can restyle one at a time, named after the web `slots`.
    public enum Slot: String, CaseIterable, Sendable {
        /// The first-layer headline.
        case consentBannerTitle
        /// The sentence under the first-layer headline.
        case consentBannerDescription
        /// Accept all and Reject all, and the other filled decisions. Both always share it.
        case buttonPrimary
        /// Outlined actions such as Customize and Privacy settings.
        case buttonSecondary
    }

    /// One part's overrides. Each field names the CSS property a web slot's `style` would set,
    /// and `nil` keeps the theme value. A field the part does not draw is ignored.
    public struct SlotStyle: Equatable, Sendable {
        /// Text colour.
        public var color: ConsentThemeColor?
        /// Fill of a button.
        public var backgroundColor: ConsentThemeColor?
        /// Corner radius of a button, in points.
        public var borderRadius: CGFloat?
        /// Text size in points at the default Dynamic Type size.
        public var fontSize: CGFloat?

        public init(color: ConsentThemeColor? = nil, backgroundColor: ConsentThemeColor? = nil,
            borderRadius: CGFloat? = nil, fontSize: CGFloat? = nil) {
            self.color = color
            self.backgroundColor = backgroundColor
            self.borderRadius = borderRadius
            self.fontSize = fontSize
        }
    }

    /// Typeface of the first-layer headline. Body text always uses the system face.
    public enum HeadlineFont: Equatable, Sendable {
        /// New York on Apple platforms.
        case serif
        /// SF Rounded.
        case rounded
        /// SF Pro.
        case sansSerif
        /// A font the app bundles, by PostScript name.
        case custom(String)

        init(name: String) {
            switch name.lowercased() {
            case "serif": self = .serif
            case "rounded": self = .rounded
            case "sans", "sans-serif", "sansserif", "system": self = .sansSerif
            default: self = .custom(name)
            }
        }
    }

    /// The identity shown above the headline. Defaults to the selected provider logo and a
    /// placeholder name. Supply app assets and a name to replace either value.
    public struct Brand: Equatable, Sendable {
        /// Short name shown as an eyebrow above the headline. `nil` shows a placeholder in the
        /// policy's language.
        public var name: String?
        /// Asset-catalogue image name for the mark. `nil` uses the selected provider logo. A missing explicit
        /// asset shows a drawn tile with the name's initial. Rendered 56pt square with the icon mask.
        public var markImageName: String?
        /// `true` shows no identity at all: the headline starts the page.
        public var isHidden: Bool

        public init(name: String? = nil, markImageName: String? = nil, isHidden: Bool = false) {
            self.name = name
            self.markImageName = markImageName
            self.isHidden = isHidden
        }

        /// No app mark or name above the headline.
        public static let hidden = Brand(isHidden: true)
    }

    /// Provider identity in the small provider tag, separate from the app's ``Brand``.
    public enum Branding: Equatable, Sendable {
        /// The bundled c15t mark and name.
        case c15t
        /// The bundled Inth mark and name.
        case inth
        /// A provider's name and optional image from the app's asset catalogue.
        case custom(name: String, markImageName: String? = nil)

        /// The provider name displayed and announced in the provider tag.
        public var name: String {
            switch self {
            case .c15t: return "c15t"
            case .inth: return "Inth"
            case .custom(let name, _): return name
            }
        }

        static func provider(_ value: String) -> Branding? {
            switch value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
            case "c15t": return .c15t
            case "inth", "consent": return .inth
            default: return nil
            }
        }
    }

    /// First-layer copy a host may replace. Decision labels are not here on purpose. A `nil` field
    /// shows the stock copy from `@c15t/translations` in the policy's language; a host string is
    /// shown as given in every language.
    public struct Copy: Equatable, Sendable {
        /// The headline. Keep it short: it is set in display type.
        public var headline: String?
        /// The sentence under the headline. Partner and category details stay native.
        public var introduction: String?

        public init(headline: String? = nil, introduction: String? = nil) {
            self.headline = headline
            self.introduction = introduction
        }

        /// The stock copy, translated.
        public static let c15t = Copy()
    }

    public var colors: Colors
    public var radius: Radius
    public var spacing: Spacing
    public var typography: Typography
    /// Per-part overrides on top of the tokens.
    public var slots: [Slot: SlotStyle]
    public var brand: Brand
    public var copy: Copy
    /// Provider name and logo in the attribution tag. The app identity above the headline is ``brand``.
    public var branding: Branding
    /// Whether the small provider attribution appears under the first-layer actions.
    public var showsBranding: Bool

    public init(colors: Colors = .c15t, radius: Radius = Radius(), spacing: Spacing = Spacing(),
        typography: Typography = Typography(), slots: [Slot: SlotStyle] = [:],
        brand: Brand = Brand(), copy: Copy = .c15t, showsBranding: Bool = true, branding: Branding = .c15t) {
        self.colors = colors
        self.radius = radius
        self.spacing = spacing
        self.typography = typography
        self.slots = slots
        self.brand = brand
        self.copy = copy
        self.showsBranding = showsBranding
        self.branding = branding
    }

    /// The overrides for `slot`, or an empty style.
    func slot(_ slot: Slot) -> SlotStyle { slots[slot] ?? SlotStyle() }

    /// The stock c15t appearance.
    public static let c15t = ConsentTheme()

    /// The theme hosts that present without passing one get. Set it once at launch.
    @MainActor public static var current = ConsentTheme.c15t

    /// `Info.plist` keys. Each colour is `#RRGGBB` or `#RRGGBB,#RRGGBB` (light, dark). Each
    /// size is a number of points.
    public enum InfoPlistKey {
        public static let primary = "com.c15t.consent.primary"
        public static let textOnPrimary = "com.c15t.consent.textOnPrimary"
        public static let canvas = "com.c15t.consent.canvas"
        public static let surface = "com.c15t.consent.surface"
        public static let surfaceMuted = "com.c15t.consent.surfaceMuted"
        public static let text = "com.c15t.consent.text"
        public static let textMuted = "com.c15t.consent.textMuted"
        public static let decision = "com.c15t.consent.decision"
        public static let textOnDecision = "com.c15t.consent.textOnDecision"
        public static let radiusSm = "com.c15t.consent.radiusSm"
        public static let radiusMd = "com.c15t.consent.radiusMd"
        public static let radiusLg = "com.c15t.consent.radiusLg"
        public static let spaceXs = "com.c15t.consent.spaceXs"
        public static let spaceSm = "com.c15t.consent.spaceSm"
        public static let spaceMd = "com.c15t.consent.spaceMd"
        public static let spaceLg = "com.c15t.consent.spaceLg"
        public static let spaceXl = "com.c15t.consent.spaceXl"
        /// A bundled font's PostScript name.
        public static let fontFamily = "com.c15t.consent.fontFamily"
        public static let fontSizeSm = "com.c15t.consent.fontSizeSm"
        public static let fontSizeBase = "com.c15t.consent.fontSizeBase"
        public static let fontSizeLg = "com.c15t.consent.fontSizeLg"
        /// `serif`, `rounded`, `sans`, or a bundled font's PostScript name.
        public static let headlineFont = "com.c15t.consent.headlineFont"
        /// One slot field, such as `com.c15t.consent.buttonPrimary.backgroundColor`. `field` is
        /// `color`, `backgroundColor`, `borderRadius` or `fontSize`.
        public static func slot(_ slot: Slot, _ field: String) -> String { "com.c15t.consent.\(slot.rawValue).\(field)" }
        /// A Boolean. `false` hides the app mark and name above the headline.
        public static let brand = "com.c15t.consent.brand"
        public static let brandName = "com.c15t.consent.brandName"
        /// An asset-catalogue image name.
        public static let brandMark = "com.c15t.consent.brandMark"
        public static let headline = "com.c15t.consent.headline"
        public static let introduction = "com.c15t.consent.introduction"
        /// A Boolean. `false` hides the "Secured by c15t" line.
        public static let branding = "com.c15t.consent.branding"
        /// `c15t` or `inth`. `consent` is an alias for `inth`.
        public static let brandingProvider = "com.c15t.consent.brandingProvider"
        /// Custom provider name, independent from the app's `brandName`.
        public static let brandingName = "com.c15t.consent.brandingName"
        /// Custom provider asset-catalogue image name.
        public static let brandingMark = "com.c15t.consent.brandingMark"
    }

    /// Apply any ``InfoPlistKey`` values in `dictionary` over this theme.
    /// Unreadable values keep the existing value; a theme never half-applies.
    public func applying(infoDictionary dictionary: [String: Any]) -> ConsentTheme {
        var theme = self
        func color(_ key: String, _ path: WritableKeyPath<Colors, ConsentThemeColor>) {
            if let text = dictionary[key] as? String, let value = ConsentThemeColor(hex: text) { theme.colors[keyPath: path] = value }
        }
        color(InfoPlistKey.primary, \.primary)
        color(InfoPlistKey.textOnPrimary, \.textOnPrimary)
        color(InfoPlistKey.canvas, \.canvas)
        color(InfoPlistKey.surface, \.surface)
        color(InfoPlistKey.surfaceMuted, \.surfaceMuted)
        color(InfoPlistKey.text, \.text)
        color(InfoPlistKey.textMuted, \.textMuted)
        color(InfoPlistKey.decision, \.decision)
        color(InfoPlistKey.textOnDecision, \.textOnDecision)
        if let value = size(dictionary[InfoPlistKey.radiusSm]) { theme.radius.sm = value }
        if let value = size(dictionary[InfoPlistKey.radiusMd]) { theme.radius.md = value }
        if let value = size(dictionary[InfoPlistKey.radiusLg]) { theme.radius.lg = value }
        if let value = size(dictionary[InfoPlistKey.spaceXs]) { theme.spacing.xs = value }
        if let value = size(dictionary[InfoPlistKey.spaceSm]) { theme.spacing.sm = value }
        if let value = size(dictionary[InfoPlistKey.spaceMd]) { theme.spacing.md = value }
        if let value = size(dictionary[InfoPlistKey.spaceLg]) { theme.spacing.lg = value }
        if let value = size(dictionary[InfoPlistKey.spaceXl]) { theme.spacing.xl = value }
        if let name = string(dictionary[InfoPlistKey.fontFamily]) { theme.typography.fontFamily = name }
        if let value = size(dictionary[InfoPlistKey.fontSizeSm], positive: true) { theme.typography.fontSize.sm = value }
        if let value = size(dictionary[InfoPlistKey.fontSizeBase], positive: true) { theme.typography.fontSize.base = value }
        if let value = size(dictionary[InfoPlistKey.fontSizeLg], positive: true) { theme.typography.fontSize.lg = value }
        if let name = string(dictionary[InfoPlistKey.headlineFont]) { theme.typography.headlineFont = HeadlineFont(name: name) }
        for slot in Slot.allCases {
            var style = theme.slot(slot)
            if let text = dictionary[InfoPlistKey.slot(slot, "color")] as? String, let value = ConsentThemeColor(hex: text) { style.color = value }
            if let text = dictionary[InfoPlistKey.slot(slot, "backgroundColor")] as? String, let value = ConsentThemeColor(hex: text) {
                style.backgroundColor = value
            }
            if let value = size(dictionary[InfoPlistKey.slot(slot, "borderRadius")]) { style.borderRadius = value }
            if let value = size(dictionary[InfoPlistKey.slot(slot, "fontSize")], positive: true) { style.fontSize = value }
            if style != SlotStyle() { theme.slots[slot] = style }
        }
        if let name = string(dictionary[InfoPlistKey.brandName]) { theme.brand.name = name }
        if let name = string(dictionary[InfoPlistKey.brandMark]) { theme.brand.markImageName = name }
        if let flag = flag(dictionary[InfoPlistKey.brand]) { theme.brand.isHidden = !flag }
        if let text = string(dictionary[InfoPlistKey.headline]) { theme.copy.headline = text }
        if let text = string(dictionary[InfoPlistKey.introduction]) { theme.copy.introduction = text }
        if let text = string(dictionary[InfoPlistKey.brandingProvider]), let provider = Branding.provider(text) {
            theme.branding = provider
        }
        if let name = string(dictionary[InfoPlistKey.brandingName]) {
            theme.branding = .custom(name: name, markImageName: string(dictionary[InfoPlistKey.brandingMark]))
        } else if let mark = string(dictionary[InfoPlistKey.brandingMark]), case .custom(let name, _) = theme.branding {
            theme.branding = .custom(name: name, markImageName: mark)
        }
        if let flag = flag(dictionary[InfoPlistKey.branding]) { theme.showsBranding = flag }
        return theme
    }

    /// A plist number, or a string holding one, that is finite and at least 0 (above 0 when
    /// `positive`). Anything else is unreadable.
    private func size(_ value: Any?, positive: Bool = false) -> CGFloat? {
        let number: Double?
        if let value = value as? NSNumber {
            number = value.doubleValue
        } else if let text = string(value) {
            number = Double(text)
        } else {
            number = nil
        }
        guard let number, number.isFinite, positive ? number > 0 : number >= 0 else { return nil }
        return CGFloat(number)
    }

    private func string(_ value: Any?) -> String? {
        guard let text = (value as? String)?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty else { return nil }
        return text
    }

    /// A plist Boolean, or the spellings a hand-typed value takes. Anything else is unreadable.
    private func flag(_ value: Any?) -> Bool? {
        if let flag = value as? Bool { return flag }
        switch string(value)?.lowercased() {
        case "true", "1", "yes": return true
        case "false", "0", "no": return false
        default: return nil
        }
    }

    /// ``current`` with the bundle's `Info.plist` values applied over it.
    @MainActor public static func resolved(bundle: Bundle = .main) -> ConsentTheme {
        current.applying(infoDictionary: bundle.infoDictionary ?? [:])
    }

    /// IAB TCF policy wants each primary first-layer action at 5:1 text contrast or more.
    static let minimumDecisionContrast = 5.0

    /// WCAG 2 contrast ratio of two sRGB `0xRRGGBB` colours, from 1 to 21.
    static func contrastRatio(_ first: UInt32, _ second: UInt32) -> Double {
        func luminance(_ rgb: UInt32) -> Double {
            func channel(_ shift: UInt32) -> Double {
                let value = Double((rgb >> shift) & 255) / 255
                return value <= 0.03928 ? value / 12.92 : pow((value + 0.055) / 1.055, 2.4)
            }
            return 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0)
        }
        let (a, b) = (luminance(first), luminance(second))
        return (max(a, b) + 0.05) / (min(a, b) + 0.05)
    }

    /// The fill and label the decision buttons draw: the ``Slot/buttonPrimary`` colours over
    /// `decision` and `textOnDecision`.
    var decisionFill: ConsentThemeColor { slot(.buttonPrimary).backgroundColor ?? colors.decision }
    var decisionLabel: ConsentThemeColor { slot(.buttonPrimary).color ?? colors.textOnDecision }

    /// The lower of the light and dark decision-label contrasts.
    var decisionContrast: Double {
        min(Self.contrastRatio(decisionLabel.light, decisionFill.light),
            Self.contrastRatio(decisionLabel.dark, decisionFill.dark))
    }

    /// This theme, or this theme with the stock decision colours when the host's fall under 5:1
    /// in either appearance. Accept all and Reject all share these colours, so both stay readable.
    /// - Parameter report: Told once per process when a fallback happens.
    func withReadableDecisions(report: (String) -> Void = DecisionContrastLog.reportOnce) -> ConsentTheme {
        let ratio = decisionContrast
        guard ratio < Self.minimumDecisionContrast else { return self }
        var theme = self
        theme.colors.decision = Colors.c15t.decision
        theme.colors.textOnDecision = Colors.c15t.textOnDecision
        theme.slots[.buttonPrimary]?.color = nil
        theme.slots[.buttonPrimary]?.backgroundColor = nil
        report(String(format: "c15t: decision colours reach %.2f:1, under the 5:1 IAB TCF minimum. Using the stock decision colours.", ratio))
        return theme
    }
}

/// Logs a decision-contrast fallback once per process, not once per presentation.
enum DecisionContrastLog {
    static let reportOnce = once { NSLog("%@", $0) }

    /// Wraps `log` so only its first call gets through.
    static func once(_ log: @escaping @Sendable (String) -> Void) -> @Sendable (String) -> Void {
        let flag = OnceFlag()
        return { message in if flag.claim() { log(message) } }
    }

    private final class OnceFlag: @unchecked Sendable {
        private let lock = NSLock()
        private var done = false
        func claim() -> Bool {
            lock.lock(); defer { lock.unlock() }
            if done { return false }
            done = true
            return true
        }
    }
}

#if canImport(SwiftUI) && canImport(UIKit)
extension UIColor {
    convenience init(rgb value: UInt32) {
        self.init(red: CGFloat((value >> 16) & 255) / 255, green: CGFloat((value >> 8) & 255) / 255,
            blue: CGFloat(value & 255) / 255, alpha: 1)
    }
}

extension ConsentTheme.HeadlineFont {
    /// The display font at the given text style, scaled with Dynamic Type.
    /// - Parameter size: Points at the default Dynamic Type size. `nil` keeps the text style's size.
    func font(_ style: Font.TextStyle, weight: Font.Weight, size: CGFloat? = nil) -> Font {
        let design: Font.Design
        switch self {
        case .serif: design = .serif
        case .rounded: design = .rounded
        case .sansSerif: design = .default
        case .custom(let name):
            return .custom(name, size: size ?? style.defaultSize, relativeTo: style).weight(weight)
        }
        guard let size else { return .system(style, design: design).weight(weight) }
        return .system(size: style.scaled(size), weight: weight, design: design)
    }
}

extension ConsentTheme {
    /// The font for one text role: the platform text style unless the theme sets a family, a size
    /// for the role's group, or a size on `slot`. Dynamic Type applies in every case.
    func font(_ style: Font.TextStyle, weight: Font.Weight? = nil, slot: Slot? = nil) -> Font {
        let size = slot.flatMap { self.slot($0).fontSize } ?? style.size(in: typography.fontSize)
        if let family = typography.fontFamily {
            let font = Font.custom(family, size: size ?? style.defaultSize, relativeTo: style)
            return weight.map { font.weight($0) } ?? font
        }
        guard let size else { return weight.map { Font.system(style).weight($0) } ?? .system(style) }
        return .system(size: style.scaled(size), weight: weight ?? .regular)
    }

    /// The UIKit font for one text role, for text UIKit lays out itself: the same family and size
    /// ``font(_:weight:slot:)`` gives SwiftUI, scaled with Dynamic Type so a view with
    /// `adjustsFontForContentSizeCategory` keeps following it.
    func uiFont(_ style: Font.TextStyle, weight: UIFont.Weight = .regular) -> UIFont {
        let size = style.size(in: typography.fontSize) ?? style.defaultSize
        let base: UIFont
        if let family = typography.fontFamily, let custom = UIFont(name: family, size: size) {
            let traits: [UIFontDescriptor.TraitKey: Any] = [.weight: weight]
            base = UIFont(descriptor: custom.fontDescriptor.addingAttributes([.traits: traits]), size: size)
        } else {
            base = .systemFont(ofSize: size, weight: weight)
        }
        return UIFontMetrics(forTextStyle: style.uiKit).scaledFont(for: base)
    }

    /// The first-layer headline in ``Typography/headlineFont``.
    var firstLayerHeadlineFont: Font {
        typography.headlineFont.font(.largeTitle, weight: .semibold,
            size: slot(.consentBannerTitle).fontSize ?? typography.fontSize.lg)
    }
}

extension Font.TextStyle {
    /// The style's size in points at the default Dynamic Type size.
    var defaultSize: CGFloat {
        switch self {
        case .largeTitle: return 34
        case .title: return 28
        case .title2: return 22
        case .title3: return 20
        case .callout: return 16
        case .subheadline: return 15
        case .footnote: return 13
        case .caption: return 12
        case .caption2: return 11
        default: return 17
        }
    }

    /// The size this role takes from the theme's scale, keeping its ratio to the group's lead
    /// style: with `sm` at 14, a footnote is 14 × 13 / 15. `nil` when the group's token is unset.
    func size(in scale: ConsentTheme.Typography.FontSize) -> CGFloat? {
        switch self {
        case .largeTitle, .title, .title2, .title3:
            return scale.lg.map { $0 * defaultSize / Font.TextStyle.largeTitle.defaultSize }
        case .subheadline, .footnote, .caption, .caption2:
            return scale.sm.map { $0 * defaultSize / Font.TextStyle.subheadline.defaultSize }
        default:
            return scale.base.map { $0 * defaultSize / Font.TextStyle.body.defaultSize }
        }
    }

    /// `size` scaled for the current Dynamic Type setting the way this style scales.
    func scaled(_ size: CGFloat) -> CGFloat { UIFontMetrics(forTextStyle: uiKit).scaledValue(for: size) }
}

private extension Font.TextStyle {
    var uiKit: UIFont.TextStyle {
        switch self {
        case .largeTitle: return .largeTitle
        case .title: return .title1
        case .title2: return .title2
        case .title3: return .title3
        case .headline: return .headline
        case .subheadline: return .subheadline
        case .callout: return .callout
        case .footnote: return .footnote
        case .caption: return .caption1
        case .caption2: return .caption2
        default: return .body
        }
    }
}

/// The shared IAB copy for the views below, in the served list's language.
struct IABCopyKey: EnvironmentKey {
    static let defaultValue = IABCopy.forLanguage("en")
}

/// The category-mode copy for the views below, in the policy's language.
struct ConsentCopyKey: EnvironmentKey {
    static let defaultValue = ConsentCopy.forLanguage("en")
}

struct ConsentThemeKey: EnvironmentKey {
    static let defaultValue = ConsentTheme.c15t
}

extension EnvironmentValues {
    var consentTheme: ConsentTheme {
        get { self[ConsentThemeKey.self] }
        set { self[ConsentThemeKey.self] = newValue }
    }
    var iabCopy: IABCopy {
        get { self[IABCopyKey.self] }
        set { self[IABCopyKey.self] = newValue }
    }
    var consentCopy: ConsentCopy {
        get { self[ConsentCopyKey.self] }
        set { self[ConsentCopyKey.self] = newValue }
    }
}
#endif
