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
    /// A dynamic colour that follows the trait collection.
    public var color: Color { Color(uiColor: uiColor()) }

    /// The same dynamic colour for UIKit, with `alpha` applied in each appearance.
    func uiColor(alpha: CGFloat = 1) -> UIColor {
        let light = light, dark = dark
        return UIColor { traits in
            UIColor(rgb: traits.userInterfaceStyle == .dark ? dark : light).withAlphaComponent(alpha)
        }
    }
    #endif
}

/// Appearance of the native consent screens. Every value has a c15t default.
///
/// Pass one to `c15tConsent(presenter:privacyPolicyURL:theme:)`, set ``current``
/// once at launch, or declare the same values in `Info.plist` under the
/// ``InfoPlistKey`` names. Plist values override ``current``; an explicit theme
/// passed to the root modifier takes precedence over both.
public struct ConsentTheme: Equatable, Sendable {
    /// Semantic colours. Components never use a raw value outside this set.
    public struct Colors: Equatable, Sendable {
        /// Page background behind every consent screen.
        public var canvas: ConsentThemeColor
        /// Cards and list rows that sit on the canvas.
        public var surface: ConsentThemeColor
        /// A quieter surface for subordinate content such as the partner purposes list.
        public var surfaceMuted: ConsentThemeColor
        /// Primary text.
        public var text: ConsentThemeColor
        /// Supporting text and section labels.
        public var textSecondary: ConsentThemeColor
        /// Links, switches, the Save button, and the brand eyebrow.
        public var accent: ConsentThemeColor
        /// Text on `accent`.
        public var onAccent: ConsentThemeColor
        /// Fill of the two decision buttons. Accept all and Reject all always share it.
        public var decision: ConsentThemeColor
        /// Text on `decision`.
        public var onDecision: ConsentThemeColor

        public init(canvas: ConsentThemeColor, surface: ConsentThemeColor, surfaceMuted: ConsentThemeColor,
            text: ConsentThemeColor, textSecondary: ConsentThemeColor, accent: ConsentThemeColor,
            onAccent: ConsentThemeColor, decision: ConsentThemeColor, onDecision: ConsentThemeColor) {
            self.canvas = canvas
            self.surface = surface
            self.surfaceMuted = surfaceMuted
            self.text = text
            self.textSecondary = textSecondary
            self.accent = accent
            self.onAccent = onAccent
            self.decision = decision
            self.onDecision = onDecision
        }

        /// Text of an On or Partly on status tag. The tag sits on a 14% tint of `accent`, and the
        /// accent alone does not reach 4.5:1 on its own tint at caption size, so the label is the
        /// accent pulled toward `text`. Derived, so a host theme gets the same floor for free.
        var statusTagText: ConsentThemeColor { accent.blended(toward: text, fraction: 0.3) }

        /// Warm paper, ink decisions, and the c15t blue for links and switches.
        public static let c15t = Colors(
            canvas: ConsentThemeColor(light: 0xF8F4EE, dark: 0x171411),
            surface: ConsentThemeColor(light: 0xFFFFFF, dark: 0x211D18),
            surfaceMuted: ConsentThemeColor(light: 0xEFE9DF, dark: 0x2B2620),
            text: ConsentThemeColor(light: 0x1E1B17, dark: 0xF3EEE6),
            textSecondary: ConsentThemeColor(light: 0x6B655D, dark: 0xA49D93),
            accent: ConsentThemeColor(light: 0x335CFF, dark: 0x8CA2FF),
            onAccent: ConsentThemeColor(light: 0xFFFFFF, dark: 0x0A1033),
            decision: ConsentThemeColor(light: 0x1E1B17, dark: 0xF3EEE6),
            onDecision: ConsentThemeColor(light: 0xF8F4EE, dark: 0x171411))
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

    /// The identity shown above the headline. Defaults to the selected provider logo and
    /// "Your brand here". Supply app assets and a name to replace either value.
    public struct Brand: Equatable, Sendable {
        /// Short name shown as an eyebrow above the headline. `nil` shows "Your brand here".
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

    /// Provider identity in the small "Secured by" tag, separate from the app's ``Brand``.
    public enum Branding: Equatable, Sendable {
        /// The bundled c15t mark and name.
        case c15t
        /// The bundled Inth mark and name.
        case inth
        /// A provider's name and optional image from the app's asset catalogue.
        case custom(name: String, markImageName: String? = nil)

        /// The provider name displayed and announced with "Secured by".
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

    /// First-layer copy a host may replace. Decision labels are not here on purpose.
    public struct Copy: Equatable, Sendable {
        /// The headline. Keep it short: it is set in display type.
        public var headline: String
        /// The sentence under the headline. Partner and category details stay native.
        public var introduction: String

        public init(headline: String, introduction: String) {
            self.headline = headline
            self.introduction = introduction
        }

        public static let c15t = Copy(
            headline: "Your privacy, your choice.",
            introduction: "We use data to improve your experience, measure how the app is used and show relevant advertising.")
    }

    public var colors: Colors
    /// Corner radius of buttons and cards, in points.
    public var cornerRadius: CGFloat
    var calloutRadius: CGFloat { max(0, cornerRadius - 2) }
    public var headlineFont: HeadlineFont
    public var brand: Brand
    public var copy: Copy
    /// Provider name and logo in the attribution tag. The app identity above the headline is ``brand``.
    public var branding: Branding
    /// Whether the small provider attribution appears under the first-layer actions.
    public var showsBranding: Bool

    public init(colors: Colors = .c15t, cornerRadius: CGFloat = 14, headlineFont: HeadlineFont = .sansSerif,
        brand: Brand = Brand(), copy: Copy = .c15t, showsBranding: Bool = true, branding: Branding = .c15t) {
        self.colors = colors
        self.cornerRadius = cornerRadius
        self.headlineFont = headlineFont
        self.brand = brand
        self.copy = copy
        self.showsBranding = showsBranding
        self.branding = branding
    }

    /// The stock c15t appearance.
    public static let c15t = ConsentTheme()

    /// The theme hosts that present without passing one get. Set it once at launch.
    @MainActor public static var current = ConsentTheme.c15t

    /// `Info.plist` keys. Each colour is `#RRGGBB` or `#RRGGBB,#RRGGBB` (light, dark).
    public enum InfoPlistKey {
        public static let accent = "com.c15t.consent.accent"
        public static let onAccent = "com.c15t.consent.onAccent"
        public static let canvas = "com.c15t.consent.canvas"
        public static let surface = "com.c15t.consent.surface"
        public static let surfaceMuted = "com.c15t.consent.surfaceMuted"
        public static let text = "com.c15t.consent.text"
        public static let textSecondary = "com.c15t.consent.textSecondary"
        public static let decision = "com.c15t.consent.decision"
        public static let onDecision = "com.c15t.consent.onDecision"
        /// A number of points.
        public static let cornerRadius = "com.c15t.consent.cornerRadius"
        /// `serif`, `rounded`, `sans`, or a bundled font's PostScript name.
        public static let headlineFont = "com.c15t.consent.headlineFont"
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
        color(InfoPlistKey.accent, \.accent)
        color(InfoPlistKey.onAccent, \.onAccent)
        color(InfoPlistKey.canvas, \.canvas)
        color(InfoPlistKey.surface, \.surface)
        color(InfoPlistKey.surfaceMuted, \.surfaceMuted)
        color(InfoPlistKey.text, \.text)
        color(InfoPlistKey.textSecondary, \.textSecondary)
        color(InfoPlistKey.decision, \.decision)
        color(InfoPlistKey.onDecision, \.onDecision)
        if let radius = dictionary[InfoPlistKey.cornerRadius] as? NSNumber, radius.doubleValue.isFinite, radius.doubleValue >= 0 {
            theme.cornerRadius = CGFloat(radius.doubleValue)
        } else if let text = dictionary[InfoPlistKey.cornerRadius] as? String, let radius = Double(text), radius.isFinite, radius >= 0 {
            theme.cornerRadius = CGFloat(radius)
        }
        if let name = string(dictionary[InfoPlistKey.headlineFont]) { theme.headlineFont = HeadlineFont(name: name) }
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
    func font(_ style: Font.TextStyle, weight: Font.Weight) -> Font {
        switch self {
        case .serif: return .system(style, design: .serif).weight(weight)
        case .rounded: return .system(style, design: .rounded).weight(weight)
        case .sansSerif: return .system(style, design: .default).weight(weight)
        case .custom(let name):
            let size = UIFont.preferredFont(forTextStyle: style.uiKit).pointSize
            return .custom(name, size: size, relativeTo: style).weight(weight)
        }
    }
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

struct ConsentThemeKey: EnvironmentKey {
    static let defaultValue = ConsentTheme.c15t
}

extension EnvironmentValues {
    var consentTheme: ConsentTheme {
        get { self[ConsentThemeKey.self] }
        set { self[ConsentThemeKey.self] = newValue }
    }
}
#endif
