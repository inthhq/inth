// #region docs:swift-quickstart-app title="MyApp.swift"
import InthApple
import InthConsentUI
import SwiftUI

@main
struct MyApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
                .inthConsent(
                    InthAppleConfiguration(
                        backendURL: "https://your-project.inth.app",
                        consentCategories: [.necessary, .measurement, .marketing]
                    ),
                    privacyPolicyURL: URL(string: "https://example.com/privacy")!
                )
        }
    }
}
// #endregion docs:swift-quickstart-app
