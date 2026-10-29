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
}
