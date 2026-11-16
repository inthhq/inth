#if canImport(UIKit)
import C15tApple
import C15tConsentUI
import C15tCore
import SwiftUI
import UIKit
import XCTest

/// The consent-screen entry points `c15t setup` prints for a Swift app: SwiftUI, UIKit and
/// the privacy-settings call.
///
/// Compiling these is the check that the printed code matches this package's API.
/// `packages/cli/src/__tests__/mobile/mobile-setup.test.ts` reads the lines between each
/// pair of markers and fails when the CLI prints anything else, so change both together.
@MainActor
final class CLIEntrySnippetTests: XCTestCase {
    private struct ContentView: View {
        var body: some View { EmptyView() }
    }

    /// Never called: the configuration would install an engine.
    private func cliSwiftUIEntry() -> some View {
        let view =
            // c15t-cli-snippet:swiftui:start
            ContentView()
                .c15tConsent(
                    C15tAppleConfiguration(
                        backendURL: "https://your-project.inth.app",
                        consentCategories: [.necessary, .measurement, .marketing]
                    ),
                    privacyPolicyURL: URL(string: "https://app.example/privacy")!
                )
            // c15t-cli-snippet:swiftui:end
        return view
    }

    /// Never called, like ``cliSwiftUIEntry()``.
    private func cliUIKitEntry(_ window: UIWindow) {
        // c15t-cli-snippet:uikit:start
        window.rootViewController = ConsentRootViewController(
            root: UIHostingController(rootView: ContentView()),
            configuration: C15tAppleConfiguration(
                backendURL: "https://your-project.inth.app",
                consentCategories: [.necessary, .measurement, .marketing]
            ),
            privacyPolicyURL: URL(string: "https://app.example/privacy")!
        )
        // c15t-cli-snippet:uikit:end
    }

    func testThePrivacySettingsCallIsSafeWithNoPrompt() {
        // c15t-cli-snippet:privacy-settings:start
        ConsentPrompt.current?.presentPreferences()
        // c15t-cli-snippet:privacy-settings:end
    }
}
#endif
