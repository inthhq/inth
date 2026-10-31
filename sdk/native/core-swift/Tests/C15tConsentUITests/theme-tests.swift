import Foundation
import XCTest
@testable import C15tConsentUI

final class ThemeTests: XCTestCase {
    func testHexParsingAcceptsOneOrTwoColours() {
        XCTAssertEqual(ConsentThemeColor(hex: "#00CCBC"), ConsentThemeColor(light: 0x00CCBC))
        XCTAssertEqual(ConsentThemeColor(hex: "00ccbc"), ConsentThemeColor(light: 0x00CCBC))
        XCTAssertEqual(ConsentThemeColor(hex: " #00CCBC , #7FE6DC "), ConsentThemeColor(light: 0x00CCBC, dark: 0x7FE6DC))
        XCTAssertNil(ConsentThemeColor(hex: "#00CCB"))
        XCTAssertNil(ConsentThemeColor(hex: "#00CCBC,#7FE6DC,#000000"))
        XCTAssertNil(ConsentThemeColor(hex: "teal"))
        XCTAssertNil(ConsentThemeColor(hex: "#00CCBC,"))
    }

    func testInfoPlistValuesOverrideOnlyWhatTheyName() {
        let theme = ConsentTheme.c15t.applying(infoDictionary: [
            ConsentTheme.InfoPlistKey.accent: "#00CCBC,#7FE6DC",
            ConsentTheme.InfoPlistKey.brandName: "Deliveroo",
            ConsentTheme.InfoPlistKey.brandMark: "ConsentMark",
            ConsentTheme.InfoPlistKey.headline: "Mmmm, cookies.",
            ConsentTheme.InfoPlistKey.headlineFont: "rounded",
            ConsentTheme.InfoPlistKey.cornerRadius: NSNumber(value: 8),
            ConsentTheme.InfoPlistKey.branding: false,
        ])
        XCTAssertEqual(theme.colors.accent, ConsentThemeColor(light: 0x00CCBC, dark: 0x7FE6DC))
        XCTAssertEqual(theme.colors.decision, ConsentTheme.Colors.c15t.decision)
        XCTAssertEqual(theme.brand, ConsentTheme.Brand(name: "Deliveroo", markImageName: "ConsentMark"))
        XCTAssertEqual(theme.copy.headline, "Mmmm, cookies.")
        XCTAssertEqual(theme.copy.introduction, ConsentTheme.Copy.c15t.introduction)
        XCTAssertEqual(theme.headlineFont, .rounded)
        XCTAssertEqual(theme.cornerRadius, 8)
        XCTAssertFalse(theme.showsBranding)
    }

    func testUnreadableValuesKeepTheExistingTheme() {
        let base = ConsentTheme(cornerRadius: 20, headlineFont: .sansSerif)
        let theme = base.applying(infoDictionary: [
            ConsentTheme.InfoPlistKey.accent: "not a colour",
            ConsentTheme.InfoPlistKey.cornerRadius: "-4",
            ConsentTheme.InfoPlistKey.headline: "   ",
            ConsentTheme.InfoPlistKey.branding: "maybe",
        ])
        XCTAssertEqual(theme, base)
    }

    func testHeadlineFontNamesResolve() {
        XCTAssertEqual(ConsentTheme.HeadlineFont(name: "Serif"), .serif)
        XCTAssertEqual(ConsentTheme.HeadlineFont(name: "sans-serif"), .sansSerif)
        XCTAssertEqual(ConsentTheme.HeadlineFont(name: "system"), .sansSerif)
        XCTAssertEqual(ConsentTheme.HeadlineFont(name: "Fraunces-SemiBold"), .custom("Fraunces-SemiBold"))
    }

    func testStringCornerRadiusAndBrandingSpellings() {
        let theme = ConsentTheme.c15t.applying(infoDictionary: [
            ConsentTheme.InfoPlistKey.cornerRadius: "6",
            ConsentTheme.InfoPlistKey.branding: "NO",
        ])
        XCTAssertEqual(theme.cornerRadius, 6)
        XCTAssertFalse(theme.showsBranding)
    }

    @MainActor func testResolvedAppliesBundleOverCurrent() {
        let previous = ConsentTheme.current
        defer { ConsentTheme.current = previous }
        ConsentTheme.current = ConsentTheme(cornerRadius: 4)
        XCTAssertEqual(ConsentTheme.resolved(bundle: Bundle(for: ThemeTests.self)).cornerRadius, 4)
    }

    func testSquareAndSmallThemesKeepNonnegativeCalloutRadii() {
        XCTAssertEqual(ConsentTheme(cornerRadius: 0).calloutRadius, 0)
        XCTAssertEqual(ConsentTheme(cornerRadius: 1).calloutRadius, 0)
        XCTAssertEqual(ConsentTheme(cornerRadius: 14).calloutRadius, 12)
    }

    func testMalformedOverridesPreserveHostSettings() {
        let base = ConsentTheme(cornerRadius: 10, showsBranding: false)
        for value in ["inf", "NaN"] {
            XCTAssertEqual(base.applying(infoDictionary: [ConsentTheme.InfoPlistKey.cornerRadius: value]), base)
        }
        XCTAssertEqual(base.applying(infoDictionary: [ConsentTheme.InfoPlistKey.branding: "maybe"]), base)
    }

    func testProviderBrandingIsSeparateFromAppIdentity() {
        let base = ConsentTheme(brand: .init(name: "Pantry", markImageName: "PantryMark"))
        XCTAssertEqual(base.branding, .c15t)
        XCTAssertEqual(base.branding.name, "c15t")
        for value in ["inth", "consent", " INTH "] {
            let theme = base.applying(infoDictionary: [ConsentTheme.InfoPlistKey.brandingProvider: value])
            XCTAssertEqual(theme.branding, .inth)
            XCTAssertEqual(theme.branding.name, "Inth")
            XCTAssertEqual(theme.brand, base.brand)
            XCTAssertTrue(theme.showsBranding)
        }
        let inth = ConsentTheme(branding: .inth)
        XCTAssertEqual(inth.applying(infoDictionary: [ConsentTheme.InfoPlistKey.brandingProvider: "other"]), inth)
        XCTAssertEqual(inth.applying(infoDictionary: [ConsentTheme.InfoPlistKey.brandingProvider: "c15t"]).branding, .c15t)
    }

    func testCustomProviderNeverKeepsAnUnrelatedLogo() {
        let theme = ConsentTheme.c15t.applying(infoDictionary: [
            ConsentTheme.InfoPlistKey.brandingName: "Example",
            ConsentTheme.InfoPlistKey.brandingMark: "ExampleLogo",
        ])
        XCTAssertEqual(theme.branding, .custom(name: "Example", markImageName: "ExampleLogo"))
        XCTAssertEqual(ConsentTheme(branding: .inth).applying(infoDictionary: [
            ConsentTheme.InfoPlistKey.brandingName: "Example",
        ]).branding, .custom(name: "Example"))
        XCTAssertEqual(theme.applying(infoDictionary: [ConsentTheme.InfoPlistKey.brandingMark: "NewLogo"]).branding,
            .custom(name: "Example", markImageName: "NewLogo"))
        XCTAssertEqual(ConsentTheme.c15t.applying(infoDictionary: [ConsentTheme.InfoPlistKey.brandingMark: "OrphanLogo"]), .c15t)
        XCTAssertEqual(theme.applying(infoDictionary: [ConsentTheme.InfoPlistKey.branding: false]).branding, theme.branding)
        XCTAssertFalse(theme.applying(infoDictionary: [ConsentTheme.InfoPlistKey.branding: false]).showsBranding)
    }
}

final class ContrastTests: XCTestCase {
    /// WCAG 2 relative luminance of an sRGB `0xRRGGBB`.
    private func luminance(_ rgb: UInt32) -> Double {
        func channel(_ shift: UInt32) -> Double {
            let value = Double((rgb >> shift) & 255) / 255
            return value <= 0.03928 ? value / 12.92 : pow((value + 0.055) / 1.055, 2.4)
        }
        return 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0)
    }
    private func contrast(_ a: UInt32, _ b: UInt32) -> Double {
        let (x, y) = (luminance(a), luminance(b))
        return (max(x, y) + 0.05) / (min(x, y) + 0.05)
    }
    /// `top` at `alpha` composited over an opaque `base`, the way a tinted capsule renders.
    private func composite(_ top: UInt32, alpha: Double, over base: UInt32) -> UInt32 {
        func channel(_ shift: UInt32) -> UInt32 {
            let a = Double((top >> shift) & 255), b = Double((base >> shift) & 255)
            return UInt32((b + (a - b) * alpha).rounded()) << shift
        }
        return channel(16) | channel(8) | channel(0)
    }

    func testBlendMovesEachAppearanceSeparately() {
        let blended = ConsentThemeColor(light: 0x335CFF, dark: 0x8CA2FF).blended(toward: ConsentThemeColor(light: 0x1E1B17, dark: 0xF3EEE6), fraction: 0.3)
        XCTAssertEqual(blended, ConsentThemeColor(light: 0x2D49B9, dark: 0xABB9F8))
        let accent = ConsentThemeColor(light: 0x335CFF)
        XCTAssertEqual(accent.blended(toward: ConsentThemeColor(light: 0x000000), fraction: 0), accent)
        XCTAssertEqual(accent.blended(toward: ConsentThemeColor(light: 0x000000), fraction: 7), ConsentThemeColor(light: 0x000000))
    }

    /// The small text the stock theme sets on tinted and muted fills, in both appearances.
    func testStockSmallTextReachesFourPointFiveToOne() {
        let colors = ConsentTheme.Colors.c15t
        for dark in [false, true] {
            func value(_ color: ConsentThemeColor) -> UInt32 { dark ? color.dark : color.light }
            let tagFill = composite(value(colors.accent), alpha: 0.14, over: value(colors.surface))
            let pairs: [(String, UInt32, UInt32)] = [
                ("status tag text on its tint", value(colors.statusTagText), tagFill),
                ("off tag text on muted surface", value(colors.textSecondary), value(colors.surfaceMuted)),
                ("partner count on muted surface", value(colors.text), value(colors.surfaceMuted)),
                ("section label on muted surface", value(colors.textSecondary), value(colors.surfaceMuted)),
                ("links on canvas", value(colors.accent), value(colors.canvas)),
                ("links on surface", value(colors.accent), value(colors.surface)),
                ("decision label", value(colors.onDecision), value(colors.decision)),
                ("save label", value(colors.onAccent), value(colors.accent)),
            ]
            for (name, foreground, background) in pairs {
                let ratio = contrast(foreground, background)
                XCTAssertGreaterThanOrEqual(ratio, 4.5, "\(name) (\(dark ? "dark" : "light")) was \(ratio)")
            }
        }
    }
}

final class BalancedTextTests: XCTestCase {
    /// A text that takes one line above 320pt, two down to 200pt, then three.
    private func height(_ width: CGFloat) -> CGFloat { width >= 320 ? 40 : width >= 200 ? 80 : 120 }

    func testFindsTheNarrowestWidthThatKeepsTheLineCount() {
        XCTAssertEqual(balancedTextWidth(within: 380, height: height), 320, accuracy: 1)
        XCTAssertEqual(balancedTextWidth(within: 300, height: height), 200, accuracy: 1)
        XCTAssertEqual(balancedTextWidth(within: 150, height: height), 0, accuracy: 1)
    }

    func testDegenerateWidthsPassThrough() {
        XCTAssertEqual(balancedTextWidth(within: 0, height: height), 0)
        XCTAssertEqual(balancedTextWidth(within: .infinity, height: height), .infinity)
    }
}

final class IdentityTests: XCTestCase {
    func testBrandDefaultsCanBeCustomizedAndHidden() {
        XCTAssertFalse(ConsentTheme.c15t.brand.isHidden)
        XCTAssertNil(ConsentTheme.c15t.brand.name)
        XCTAssertNil(ConsentTheme.c15t.brand.markImageName)
        XCTAssertTrue(ConsentTheme.Brand.hidden.isHidden)
        let hidden = ConsentTheme.c15t.applying(infoDictionary: [ConsentTheme.InfoPlistKey.brand: false])
        XCTAssertTrue(hidden.brand.isHidden)
        XCTAssertEqual(hidden.applying(infoDictionary: [ConsentTheme.InfoPlistKey.brand: "yes"]).brand.isHidden, false)
        XCTAssertEqual(hidden.applying(infoDictionary: [ConsentTheme.InfoPlistKey.brand: "maybe"]).brand.isHidden, true)
        let named = ConsentTheme.c15t.applying(infoDictionary: [ConsentTheme.InfoPlistKey.brandName: "Pantry"])
        XCTAssertEqual(named.brand, ConsentTheme.Brand(name: "Pantry"))
    }

    func testStockThemeUsesTheSystemTypeface() {
        XCTAssertEqual(ConsentTheme.c15t.headlineFont, .sansSerif)
        XCTAssertEqual(ConsentTheme().headlineFont, .sansSerif)
    }
}
