import C15tApple
import C15tCore
import XCTest

/// The configuration `c15t setup` prints for a Swift app.
///
/// Compiling it is the check that the printed code matches this package's API.
/// `packages/cli/src/__tests__/mobile/mobile-setup.test.ts` reads the lines between
/// the markers and fails when the CLI prints anything else, so change both
/// together.
final class CLISnippetTests: XCTestCase {
    /// The configuration `c15t setup` prints, with the default categories.
    private func cliHostedConfiguration() -> C15tAppleConfiguration {
        let configuration =
            // c15t-cli-snippet:hosted:start
            C15tAppleConfiguration(
                backendURL: "https://your-project.inth.app",
                consentCategories: [.necessary, .measurement, .marketing]
            )
            // c15t-cli-snippet:hosted:end
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
