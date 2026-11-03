// #region docs:swift-quickstart-app title="MyApp.swift"
import SwiftUI

@main
@MainActor
struct MyApp: App {
    @StateObject private var consent = ConsentModel(
        backendURL: URL(string: "https://your-project.inth.app")!
    )

    var body: some Scene {
        WindowGroup {
            ConsentRoot(
                consent: consent,
                privacyPolicyURL: URL(string: "https://example.com/privacy")!
            )
        }
    }
}
// #endregion docs:swift-quickstart-app
