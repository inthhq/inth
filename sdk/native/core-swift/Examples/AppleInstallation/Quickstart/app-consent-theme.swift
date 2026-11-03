// #region docs:swift-app-theme title="AppConsentTheme.swift"
import C15tConsentUI
import SwiftUI

enum AppConsentTheme {
    static var value: ConsentTheme {
        var theme = ConsentTheme.c15t
        theme.brand = .init(name: "My app", markImageName: "AppPrivacyMark")
        theme.copy = .init(
            headline: "Your privacy choices",
            introduction: "Choose whether this app may measure usage and personalize marketing. You can change your choices in Privacy settings."
        )
        theme.colors.accent = ConsentThemeColor(light: 0x2255CC, dark: 0xADC6FF)
        theme.colors.onAccent = ConsentThemeColor(light: 0xFFFFFF, dark: 0x10234D)
        theme.headlineFont = .sansSerif
        theme.cornerRadius = 16
        theme.branding = .inth
        return theme
    }
}
// #endregion docs:swift-app-theme

@MainActor
private func brandedConsentRoot(consent: ConsentModel, privacyPolicyURL: URL) -> some View {
    // #region docs:swift-themed-root title="MyApp.swift"
    ConsentRoot(
        consent: consent,
        privacyPolicyURL: privacyPolicyURL,
        theme: AppConsentTheme.value
    )
    // #endregion docs:swift-themed-root
}
