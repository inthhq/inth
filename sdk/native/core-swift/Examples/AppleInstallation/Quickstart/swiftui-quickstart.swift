// #region docs:swift-quickstart-app title="MyApp.swift"
import C15tApple
import C15tConsentUI
import SwiftUI

@main
struct MyApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
                .c15tConsent(
                    C15tAppleConfiguration(
                        backendURL: "https://your-project.inth.app",
                        consentCategories: [.necessary, .measurement, .marketing]
                    ),
                    privacyPolicyURL: URL(string: "https://example.com/privacy")!
                )
        }
    }
}
// #endregion docs:swift-quickstart-app
