import InthApple
import InthCore
import XCTest

/// The configuration `c15t setup` prints for a Swift app.
///
/// Compiling it is the check that the printed code matches this package's API.
/// `packages/cli/vendor/c15t-mobile/src/__tests__/mobile/mobile-setup.test.ts` reads the lines between
/// the markers and fails when the CLI prints anything else, so change both
/// together.
final class CLISnippetTests: XCTestCase {
    /// The configuration `c15t setup` prints, with the default categories.
    private func cliHostedConfiguration() -> InthAppleConfiguration {
        let configuration =
            // inth-cli-snippet:hosted:start
            InthAppleConfiguration(
                backendURL: "https://your-project.inth.app",
                consentCategories: [.necessary, .measurement, .marketing]
            )
            // inth-cli-snippet:hosted:end
        return configuration
    }

    func testTheHostedConfigurationKeepsTheCategories() {
        XCTAssertEqual(cliHostedConfiguration().consentCategories, [.necessary, .measurement, .marketing])
    }

    func testThePrintedProjectURLIsOneTheInstallAccepts() throws {
        XCTAssertEqual(
            try cliHostedConfiguration().normalizedBackendURL().absoluteString, "https://your-project.inth.app")
    }
}
