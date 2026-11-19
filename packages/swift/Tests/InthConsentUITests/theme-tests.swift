import Foundation
import XCTest
@testable import InthConsentUI

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
        let theme = ConsentTheme.default.applying(infoDictionary: [
            ConsentTheme.InfoPlistKey.primary: "#00CCBC,#7FE6DC",
            ConsentTheme.InfoPlistKey.brandName: "Deliveroo",
            ConsentTheme.InfoPlistKey.brandMark: "ConsentMark",
            ConsentTheme.InfoPlistKey.headline: "Mmmm, cookies.",
            ConsentTheme.InfoPlistKey.headlineFont: "rounded",
            ConsentTheme.InfoPlistKey.radiusMd: NSNumber(value: 8),
            ConsentTheme.InfoPlistKey.branding: false,
        ])
        XCTAssertEqual(theme.colors.primary, ConsentThemeColor(light: 0x00CCBC, dark: 0x7FE6DC))
        XCTAssertEqual(theme.colors.decision, ConsentTheme.Colors.default.decision)
        XCTAssertEqual(theme.brand, ConsentTheme.Brand(name: "Deliveroo", markImageName: "ConsentMark"))
        XCTAssertEqual(theme.copy.headline, "Mmmm, cookies.")
        XCTAssertEqual(theme.copy.introduction, ConsentTheme.Copy.default.introduction)
        XCTAssertEqual(theme.typography.headlineFont, .rounded)
        XCTAssertEqual(theme.radius.md, 8)
        XCTAssertFalse(theme.showsBranding)
    }

    func testUnreadableValuesKeepTheExistingTheme() {
        let base = ConsentTheme(radius: .init(md: 20), typography: .init(headlineFont: .sansSerif))
        let theme = base.applying(infoDictionary: [
            ConsentTheme.InfoPlistKey.primary: "not a colour",
            ConsentTheme.InfoPlistKey.radiusMd: "-4",
            ConsentTheme.InfoPlistKey.headline: "   ",
            ConsentTheme.InfoPlistKey.branding: "maybe",
        ])
        XCTAssertEqual(theme, base)
    }

    func testInfoPlistReadsSpacingTypeAndSlots() {
        let theme = ConsentTheme.default.applying(infoDictionary: [
            ConsentTheme.InfoPlistKey.radiusSm: 2,
            ConsentTheme.InfoPlistKey.radiusLg: "28",
            ConsentTheme.InfoPlistKey.spaceMd: 20,
            ConsentTheme.InfoPlistKey.spaceLg: "32",
            ConsentTheme.InfoPlistKey.fontFamily: "Inter-Regular",
            ConsentTheme.InfoPlistKey.fontSizeSm: 14,
            ConsentTheme.InfoPlistKey.fontSizeBase: "16",
            ConsentTheme.InfoPlistKey.fontSizeLg: 0,
            ConsentTheme.InfoPlistKey.slot(.buttonPrimary, "borderRadius"): 999,
            ConsentTheme.InfoPlistKey.slot(.buttonSecondary, "color"): "#112233",
            ConsentTheme.InfoPlistKey.slot(.consentBannerTitle, "fontSize"): "40",
        ])
        XCTAssertEqual(theme.radius, ConsentTheme.Radius(sm: 2, md: 14, lg: 28))
        XCTAssertEqual(theme.spacing, ConsentTheme.Spacing(md: 20, lg: 32))
        XCTAssertEqual(theme.typography.fontFamily, "Inter-Regular")
        // A size of 0 is unreadable and keeps the platform size.
        XCTAssertEqual(theme.typography.fontSize, .init(sm: 14, base: 16, lg: nil))
        XCTAssertEqual(theme.slots, [
            .buttonPrimary: .init(borderRadius: 999),
            .buttonSecondary: .init(color: ConsentThemeColor(light: 0x112233)),
            .consentBannerTitle: .init(fontSize: 40),
        ])
        XCTAssertEqual(ConsentTheme.InfoPlistKey.slot(.buttonPrimary, "backgroundColor"),
            "com.inth.consent.buttonPrimary.backgroundColor")
    }

    func testRadiusStepsFollowMdUntilSet() {
        XCTAssertEqual(ConsentTheme.Radius(md: 10).resolvedSm, 8)
        XCTAssertEqual(ConsentTheme.Radius(md: 10).resolvedLg, 16)
        XCTAssertEqual(ConsentTheme.Radius(sm: 1, md: 10, lg: 3).resolvedLg, 3)
        XCTAssertEqual(ConsentTheme.Radius(sm: 1, md: 10, lg: 3).resolvedSm, 1)
    }

    func testHeadlineFontNamesResolve() {
        XCTAssertEqual(ConsentTheme.HeadlineFont(name: "Serif"), .serif)
        XCTAssertEqual(ConsentTheme.HeadlineFont(name: "sans-serif"), .sansSerif)
        XCTAssertEqual(ConsentTheme.HeadlineFont(name: "system"), .sansSerif)
        XCTAssertEqual(ConsentTheme.HeadlineFont(name: "Fraunces-SemiBold"), .custom("Fraunces-SemiBold"))
    }

    func testStringCornerRadiusAndBrandingSpellings() {
        let theme = ConsentTheme.default.applying(infoDictionary: [
            ConsentTheme.InfoPlistKey.radiusMd: "6",
            ConsentTheme.InfoPlistKey.branding: "NO",
        ])
        XCTAssertEqual(theme.radius.md, 6)
        XCTAssertFalse(theme.showsBranding)
    }

    @MainActor func testResolvedAppliesBundleOverCurrent() {
        let previous = ConsentTheme.current
        defer { ConsentTheme.current = previous }
        ConsentTheme.current = ConsentTheme(radius: .init(md: 4))
        XCTAssertEqual(ConsentTheme.resolved(bundle: Bundle(for: ThemeTests.self)).radius.md, 4)
    }

    func testSquareAndSmallThemesKeepNonnegativeCalloutRadii() {
        XCTAssertEqual(ConsentTheme(radius: .init(md: 0)).radius.resolvedSm, 0)
        XCTAssertEqual(ConsentTheme(radius: .init(md: 1)).radius.resolvedSm, 0)
        XCTAssertEqual(ConsentTheme(radius: .init(md: 14)).radius.resolvedSm, 12)
    }

    func testMalformedOverridesPreserveHostSettings() {
        let base = ConsentTheme(radius: .init(md: 10), showsBranding: false)
        for value in ["inf", "NaN"] {
            XCTAssertEqual(base.applying(infoDictionary: [ConsentTheme.InfoPlistKey.radiusMd: value]), base)
        }
        XCTAssertEqual(base.applying(infoDictionary: [ConsentTheme.InfoPlistKey.branding: "maybe"]), base)
    }

    func testSavePlacementComesFromInfoPlist() {
        XCTAssertEqual(ConsentTheme.default.savePlacement, .top)
        let theme = ConsentTheme.default.applying(infoDictionary: [ConsentTheme.InfoPlistKey.savePlacement: " Bottom "])
        XCTAssertEqual(theme.savePlacement, .bottom)
        // An unreadable value keeps what the theme had.
        XCTAssertEqual(theme.applying(infoDictionary: [ConsentTheme.InfoPlistKey.savePlacement: "left"]), theme)
    }

    func testFirstLayerAndAppearanceComeFromInfoPlist() {
        XCTAssertEqual(ConsentTheme.default.firstLayer, .page)
        XCTAssertEqual(ConsentTheme.default.appearance, .system)
        let theme = ConsentTheme.default.applying(infoDictionary: [
            ConsentTheme.InfoPlistKey.firstLayer: " Sheet ",
            ConsentTheme.InfoPlistKey.appearance: "PAPER",
        ])
        XCTAssertEqual(theme.firstLayer, .sheet)
        XCTAssertEqual(theme.appearance, .paper)
        // An unreadable value keeps what the theme had.
        let kept = theme.applying(infoDictionary: [
            ConsentTheme.InfoPlistKey.firstLayer: "drawer",
            ConsentTheme.InfoPlistKey.appearance: 3,
        ])
        XCTAssertEqual(kept, theme)
    }

    // TCF-CHECK: P11
    func testSystemAppearanceKeepsDecisionsAtFiveToOneForAnyAccent() {
        // System blue, a pale yellow and white: none reaches 5:1 under white text as given.
        for accent: UInt32 in [0x007AFF, 0xFFE066, 0xFFFFFF, 0x118C5C] {
            let theme = ConsentTheme(appearance: .system).withSystemAppearance(tint: ConsentThemeColor(light: accent))
            XCTAssertGreaterThanOrEqual(theme.decisionContrast, ConsentTheme.minimumDecisionContrast, String(accent, radix: 16))
            XCTAssertGreaterThanOrEqual(ConsentTheme.contrastRatio(theme.colors.primary.light, theme.colors.canvas.light), 4.5)
            XCTAssertGreaterThanOrEqual(ConsentTheme.contrastRatio(theme.colors.primary.dark, theme.colors.surface.dark), 4.5)
            XCTAssertEqual(theme.withReadableDecisions(report: { _ in XCTFail("no fallback expected") }), theme)
        }
    }

    // TCF-CHECK: P11
    func testCardDecisionsKeepFiveToOneOnAHostPalette() {
        // Mid-grey text passes on a page's solid decision fill but not on a card's tint of the surface.
        var colours = ConsentTheme.Colors.default
        colours.text = ConsentThemeColor(light: 0x6B6B6B, dark: 0x8A8A8A)
        colours.surface = ConsentThemeColor(light: 0xFFFFFF, dark: 0x1C1C1E)
        for prompt in [true, false] {
            let theme = ConsentTheme(colors: colours, firstLayer: prompt ? .prompt : .sheet)
            let label = theme.cardDecisionLabel(prompt: prompt), fill = theme.cardDecisionFill(prompt: prompt)
            XCTAssertGreaterThanOrEqual(ConsentTheme.contrastRatio(label.light, fill.light), 5)
            XCTAssertGreaterThanOrEqual(ConsentTheme.contrastRatio(label.dark, fill.dark), 5)
            XCTAssertNotEqual(label, colours.text)
            // The stock card palette keeps its own text colour.
            let stock = ConsentTheme(firstLayer: prompt ? .prompt : .sheet).withSystemAppearance(tint: ConsentThemeColor(light: 0x007AFF))
            XCTAssertEqual(stock.cardDecisionLabel(prompt: prompt), stock.colors.text)
            // A mid-grey tint leaves neither black nor white at 5:1, so the fill moves too.
            var grey = ConsentTheme.Colors.default
            grey.surface = ConsentThemeColor(light: 0x848484); grey.text = ConsentThemeColor(light: 0x000000); grey.primary = ConsentThemeColor(light: 0x333333)
            let mid = ConsentTheme(colors: grey, firstLayer: prompt ? .prompt : .sheet)
            let midLabel = mid.cardDecisionLabel(prompt: prompt), midFill = mid.cardDecisionFill(prompt: prompt)
            XCTAssertGreaterThanOrEqual(ConsentTheme.contrastRatio(midLabel.light, midFill.light), 5)
            XCTAssertGreaterThanOrEqual(ConsentTheme.contrastRatio(midLabel.dark, midFill.dark), 5)
        }
    }

    func testSystemAppearanceLeavesHostColoursAndOtherAppearancesAlone() {
        let accent = ConsentThemeColor(light: 0x007AFF)
        let paper = ConsentTheme(appearance: .paper)
        XCTAssertEqual(paper.withSystemAppearance(tint: accent), paper)
        // A sheet or a prompt sits over the app, so it takes the system colours whatever the appearance.
        for layout in [ConsentTheme.FirstLayer.sheet, .prompt] {
            let card = ConsentTheme(firstLayer: layout).withSystemAppearance(tint: accent)
            XCTAssertEqual(card.colors.surface, ConsentThemeColor(light: 0xFFFFFF, dark: 0x1C1C1E))
            XCTAssertGreaterThanOrEqual(ConsentTheme.contrastRatio(card.colors.primary.light, card.colors.surface.light), 4.5)
        }
        var colours = ConsentTheme.Colors.default
        colours.primary = ConsentThemeColor(light: 0x00796B)
        let host = ConsentTheme(colors: colours, appearance: .system)
        XCTAssertEqual(host.withSystemAppearance(tint: accent), host)
    }

    #if canImport(SwiftUI) && canImport(UIKit)
    // TCF-CHECK: P1
    func testAccessibilityTextSizesAlwaysGetTheFullPage() {
        for layout in ConsentTheme.FirstLayer.allCases {
            let theme = ConsentTheme(firstLayer: layout)
            XCTAssertFalse(theme.firstLayerChrome(accessibilitySize: true).card)
            XCTAssertEqual(theme.firstLayerChrome(accessibilitySize: false).card, layout != .page)
        }
        XCTAssertEqual(ConsentTheme(appearance: .system).firstLayerChrome(accessibilitySize: false), .system)
        XCTAssertEqual(ConsentTheme(firstLayer: .prompt, appearance: .system).firstLayerChrome(accessibilitySize: false), .prompt)
    }

    // TCF-CHECK: P1
    func testAnIABChoiceInAWideWindowGetsTheFullPage() {
        for layout in [ConsentTheme.FirstLayer.sheet, .prompt] {
            let theme = ConsentTheme(firstLayer: layout)
            XCTAssertFalse(theme.firstLayerChrome(accessibilitySize: false, iabInWideWindow: true).card)
            XCTAssertTrue(theme.firstLayerChrome(accessibilitySize: false, iabInWideWindow: false).card)
        }
    }
    #endif

    func testProviderBrandingIsSeparateFromAppIdentity() {
        let base = ConsentTheme(brand: .init(name: "Pantry", markImageName: "PantryMark"))
        XCTAssertEqual(base.branding, .inth)
        XCTAssertEqual(base.branding.name, "Inth")
        XCTAssertEqual(base.applying(infoDictionary: [ConsentTheme.InfoPlistKey.brandingProvider: "c15t"]).branding, .c15t)
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
        let theme = ConsentTheme.default.applying(infoDictionary: [
            ConsentTheme.InfoPlistKey.brandingName: "Example",
            ConsentTheme.InfoPlistKey.brandingMark: "ExampleLogo",
        ])
        XCTAssertEqual(theme.branding, .custom(name: "Example", markImageName: "ExampleLogo"))
        XCTAssertEqual(ConsentTheme(branding: .inth).applying(infoDictionary: [
            ConsentTheme.InfoPlistKey.brandingName: "Example",
        ]).branding, .custom(name: "Example"))
        XCTAssertEqual(theme.applying(infoDictionary: [ConsentTheme.InfoPlistKey.brandingMark: "NewLogo"]).branding,
            .custom(name: "Example", markImageName: "NewLogo"))
        XCTAssertEqual(ConsentTheme.default.applying(infoDictionary: [ConsentTheme.InfoPlistKey.brandingMark: "OrphanLogo"]), .default)
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
        let primary = ConsentThemeColor(light: 0x335CFF)
        XCTAssertEqual(primary.blended(toward: ConsentThemeColor(light: 0x000000), fraction: 0), primary)
        XCTAssertEqual(primary.blended(toward: ConsentThemeColor(light: 0x000000), fraction: 7), ConsentThemeColor(light: 0x000000))
    }

    /// The small text the stock theme sets on tinted and muted fills, in both appearances. The
    /// decision labels are held to IAB's 5:1 for the first layer's primary actions.
    // TCF-CHECK: P11
    func testStockSmallTextReachesFourPointFiveToOne() {
        let colors = ConsentTheme.Colors.default
        for dark in [false, true] {
            func value(_ color: ConsentThemeColor) -> UInt32 { dark ? color.dark : color.light }
            let tagFill = composite(value(colors.primary), alpha: 0.14, over: value(colors.surface))
            let pairs: [(String, UInt32, UInt32, Double)] = [
                ("status tag text on its tint", value(colors.statusTagText), tagFill, 4.5),
                ("off tag text on muted surface", value(colors.textMuted), value(colors.surfaceMuted), 4.5),
                ("partner count on muted surface", value(colors.text), value(colors.surfaceMuted), 4.5),
                ("section label on muted surface", value(colors.textMuted), value(colors.surfaceMuted), 4.5),
                ("links on canvas", value(colors.primary), value(colors.canvas), 4.5),
                ("links on surface", value(colors.primary), value(colors.surface), 4.5),
                ("decision label", value(colors.textOnDecision), value(colors.decision), 5),
                ("customize label on canvas", value(colors.text), value(colors.canvas), 5),
                ("save label", value(colors.textOnPrimary), value(colors.primary), 4.5),
            ]
            for (name, foreground, background, minimum) in pairs {
                let ratio = contrast(foreground, background)
                XCTAssertGreaterThanOrEqual(ratio, minimum, "\(name) (\(dark ? "dark" : "light")) was \(ratio)")
                XCTAssertEqual(ConsentTheme.contrastRatio(foreground, background), ratio, accuracy: 1e-9)
            }
        }
    }
}

/// A host theme can't push the first layer's primary actions under IAB's 5:1.
final class DecisionContrastGuardTests: XCTestCase {
    // TCF-CHECK: P11
    func testLowContrastHostDecisionColoursFallBackToStock() {
        var host = ConsentTheme(radius: .init(md: 6))
        host.colors.primary = ConsentThemeColor(light: 0x00796B)
        // 2.2:1 in light, fine in dark: one weak appearance is enough to fall back.
        host.colors.decision = ConsentThemeColor(light: 0x8A8A8A, dark: 0x000000)
        host.colors.textOnDecision = ConsentThemeColor(light: 0xFFFFFF, dark: 0xFFFFFF)
        XCTAssertLessThan(host.decisionContrast, 5)
        var reports: [String] = []
        let guarded = host.withReadableDecisions { reports.append($0) }
        XCTAssertEqual(guarded.colors.decision, ConsentTheme.Colors.default.decision)
        XCTAssertEqual(guarded.colors.textOnDecision, ConsentTheme.Colors.default.textOnDecision)
        XCTAssertGreaterThanOrEqual(guarded.decisionContrast, 5)
        // Only the decision colours change.
        XCTAssertEqual(guarded.colors.primary, host.colors.primary)
        XCTAssertEqual(guarded.radius.md, 6)
        XCTAssertEqual(reports.count, 1)
        XCTAssertTrue(reports[0].contains("5:1"), reports[0])
    }

    // TCF-CHECK: P11
    func testInfoPlistDecisionOverridesAreGuardedToo() {
        let theme = ConsentTheme.default.applying(infoDictionary: [
            ConsentTheme.InfoPlistKey.decision: "#777777",
            ConsentTheme.InfoPlistKey.textOnDecision: "#888888",
        ])
        XCTAssertEqual(theme.colors.decision, ConsentThemeColor(light: 0x777777))
        let guarded = theme.withReadableDecisions { _ in }
        XCTAssertEqual(guarded.colors.decision, ConsentTheme.Colors.default.decision)
        XCTAssertEqual(guarded.colors.textOnDecision, ConsentTheme.Colors.default.textOnDecision)
    }

    // TCF-CHECK: P11
    func testPrimaryButtonSlotColoursAreGuardedToo() {
        var host = ConsentTheme.default
        host.slots[.buttonPrimary] = .init(color: ConsentThemeColor(light: 0xFFFFFF), backgroundColor: ConsentThemeColor(light: 0xBBBBBB),
            borderRadius: 4)
        XCTAssertLessThan(host.decisionContrast, 5)
        let guarded = host.withReadableDecisions { _ in }
        XCTAssertEqual(guarded.decisionFill, ConsentTheme.Colors.default.decision)
        XCTAssertEqual(guarded.decisionLabel, ConsentTheme.Colors.default.textOnDecision)
        // The slot keeps what is not a colour.
        XCTAssertEqual(guarded.slots[.buttonPrimary]?.borderRadius, 4)
    }

    // TCF-CHECK: P11
    func testReadableHostDecisionColoursAreKept() {
        var host = ConsentTheme.default
        // The demo's brand theme: teal decisions at 5.3:1 light and 7:1 dark.
        host.colors.decision = ConsentThemeColor(light: 0x00796B, dark: 0x4FD1C0)
        host.colors.textOnDecision = ConsentThemeColor(light: 0xFFFFFF, dark: 0x06302A)
        var reports = 0
        XCTAssertEqual(host.withReadableDecisions { _ in reports += 1 }, host)
        XCTAssertEqual(ConsentTheme.default.withReadableDecisions { _ in reports += 1 }, .default)
        XCTAssertEqual(reports, 0)
    }

    func testFallbackIsLoggedOncePerProcess() {
        final class Lines: @unchecked Sendable { var values: [String] = [] }
        let lines = Lines()
        let report = DecisionContrastLog.once { lines.values.append($0) }
        report("first")
        report("second")
        XCTAssertEqual(lines.values, ["first"])
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
        XCTAssertFalse(ConsentTheme.default.brand.isHidden)
        XCTAssertNil(ConsentTheme.default.brand.name)
        XCTAssertNil(ConsentTheme.default.brand.markImageName)
        XCTAssertTrue(ConsentTheme.Brand.hidden.isHidden)
        let hidden = ConsentTheme.default.applying(infoDictionary: [ConsentTheme.InfoPlistKey.brand: false])
        XCTAssertTrue(hidden.brand.isHidden)
        XCTAssertEqual(hidden.applying(infoDictionary: [ConsentTheme.InfoPlistKey.brand: "yes"]).brand.isHidden, false)
        XCTAssertEqual(hidden.applying(infoDictionary: [ConsentTheme.InfoPlistKey.brand: "maybe"]).brand.isHidden, true)
        let named = ConsentTheme.default.applying(infoDictionary: [ConsentTheme.InfoPlistKey.brandName: "Pantry"])
        XCTAssertEqual(named.brand, ConsentTheme.Brand(name: "Pantry"))
    }

    func testStockThemeUsesTheSystemTypeface() {
        XCTAssertEqual(ConsentTheme.default.typography.headlineFont, .sansSerif)
        XCTAssertEqual(ConsentTheme().typography.headlineFont, .sansSerif)
    }
}

#if canImport(SwiftUI) && canImport(UIKit)
import SwiftUI
import UIKit

final class ThemeColorCacheTests: XCTestCase {
    /// SwiftUI skips a view whose inputs compare equal, so every read of a theme colour must be.
    func testRepeatedReadsReturnTheSameColour() {
        let primary = ConsentTheme.Colors.default.primary
        XCTAssertEqual(primary.color, primary.color)
        XCTAssertEqual(primary.color, ConsentThemeColor(light: primary.light, dark: primary.dark).color)
        XCTAssertTrue(primary.uiColor() === primary.uiColor())
        XCTAssertTrue(primary.uiColor(alpha: 0.5) === primary.uiColor(alpha: 0.5))
        XCTAssertFalse(primary.uiColor(alpha: 0.5) === primary.uiColor())
        XCTAssertFalse(primary.uiColor() === ConsentTheme.Colors.default.text.uiColor())
    }

    func testCachedColoursStillFollowTheAppearance() {
        let color = ConsentThemeColor(light: 0x335CFF, dark: 0x8CA2FF)
        _ = color.uiColor()
        let light = color.uiColor().resolvedColor(with: UITraitCollection(userInterfaceStyle: .light))
        let dark = color.uiColor(alpha: 0.5).resolvedColor(with: UITraitCollection(userInterfaceStyle: .dark))
        XCTAssertEqual(light, UIColor(rgb: 0x335CFF))
        XCTAssertEqual(dark, UIColor(rgb: 0x8CA2FF).withAlphaComponent(0.5))
    }
}

final class TypeScaleTests: XCTestCase {
    func testRolesKeepTheirRatioToTheGroupToken() {
        let scale = ConsentTheme.Typography.FontSize(sm: 14, base: 16, lg: 30)
        XCTAssertEqual(Font.TextStyle.subheadline.size(in: scale), 14)
        XCTAssertEqual(Font.TextStyle.footnote.size(in: scale) ?? 0, 14 * 13 / 15, accuracy: 1e-9)
        XCTAssertEqual(Font.TextStyle.body.size(in: scale), 16)
        XCTAssertEqual(Font.TextStyle.headline.size(in: scale), 16)
        XCTAssertEqual(Font.TextStyle.largeTitle.size(in: scale), 30)
        XCTAssertNil(Font.TextStyle.body.size(in: .init()))
    }

    /// The failure row lays its text out in UIKit, so it needs the theme's size too.
    func testUIKitFontsFollowTheTypeScale() {
        // The font comes back already scaled for the current text size; scaling it again throws.
        let themed = ConsentTheme(typography: .init(fontSize: .init(sm: 20))).uiFont(.subheadline)
        XCTAssertEqual(themed.pointSize, UIFontMetrics(forTextStyle: .subheadline).scaledValue(for: 20), accuracy: 0.5)
        let stock = ConsentTheme.default.uiFont(.subheadline)
        XCTAssertEqual(stock.pointSize, UIFont.preferredFont(forTextStyle: .subheadline).pointSize, accuracy: 0.5)
        // A family the app does not bundle falls back to the system face rather than nothing.
        XCTAssertEqual(ConsentTheme(typography: .init(fontFamily: "NotBundled-Regular")).uiFont(.subheadline).pointSize,
            stock.pointSize, accuracy: 0.5)
    }
}
#endif
