// #region docs:apple-install title="install-consent.swift"
import InthApple
import InthCore
import Foundation

/// Replace the project URL before running either example app.
enum InstallConsent {
    @discardableResult
    static func install() throws -> ConsentCore {
        try InthApple.install(InthAppleConfiguration(
            backendURL: "https://your-project.inth.app",
            consentCategories: [.necessary, .measurement, .marketing]
        ))
    }
}
// #endregion docs:apple-install
