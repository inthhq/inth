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

final class IdentityTests: XCTestCase {
    func testBrandDefaultsToTheHostAppAndCanBeHidden() {
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

    func testDisplayNamePrefersTheBundleDisplayName() {
        XCTAssertEqual(HostIdentity.displayName(infoDictionary: ["CFBundleDisplayName": "Consent demo", "CFBundleName": "C15tConsentDemo"], fallback: "process"), "Consent demo")
        XCTAssertEqual(HostIdentity.displayName(infoDictionary: ["CFBundleDisplayName": "  ", "CFBundleName": "C15tConsentDemo"], fallback: "process"), "C15tConsentDemo")
        XCTAssertEqual(HostIdentity.displayName(infoDictionary: [:], fallback: "process"), "process")
        XCTAssertEqual(HostIdentity.initial(of: "pantry"), "P")
        XCTAssertEqual(HostIdentity.initial(of: "  "), "")
    }

    func testIconNamesComeFromTheCompiledCatalogueLargestFirst() {
        let info: [String: Any] = [
            "CFBundleIcons": ["CFBundlePrimaryIcon": ["CFBundleIconName": "AppIcon", "CFBundleIconFiles": ["AppIcon60x60", "AppIcon76x76"]]],
            "CFBundleIcons~ipad": ["CFBundlePrimaryIcon": ["CFBundleIconFiles": ["AppIcon76x76", "AppIcon83.5x83.5"]]],
        ]
        XCTAssertEqual(HostIdentity.iconImageNames(infoDictionary: info), ["AppIcon", "AppIcon76x76", "AppIcon60x60", "AppIcon83.5x83.5"])
        XCTAssertEqual(HostIdentity.iconImageNames(infoDictionary: [:]), [])
    }
}
