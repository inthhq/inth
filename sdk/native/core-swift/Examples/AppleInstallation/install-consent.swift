// #region docs:apple-install title="install-consent.swift"
import C15tApple
import C15tCore
import Foundation

/// Replace the project URL before running either example app.
enum InstallConsent {
    @discardableResult
    static func install() throws -> ConsentCore {
        try C15tApple.install(C15tAppleConfiguration(
            transport: .hosted(URL(string: "https://your-project.inth.app")!),
            consentCategories: [.necessary, .measurement, .marketing]
        ))
    }
}
// #endregion docs:apple-install
