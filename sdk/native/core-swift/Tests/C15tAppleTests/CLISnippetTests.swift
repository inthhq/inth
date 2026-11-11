import C15tApple
import C15tCore
import XCTest

/// The code `c15t setup` prints for a Swift app: the offline install and the hosted
/// configuration.
///
/// Compiling these is the check that the printed code matches this package's API.
/// `packages/cli/src/__tests__/mobile/mobile-setup.test.ts` reads the lines between
/// each pair of markers and fails when the CLI prints anything else, so change both
/// together.
final class CLISnippetTests: XCTestCase {
    /// Never called: installing would touch the Keychain.
    private func cliOfflineInstall() throws -> ConsentCore {
        // c15t-cli-snippet:offline:start
        let policy = try ConsentPolicy(rules: [
            PolicyRule(id: "everywhere", match: PolicyMatch(fallback: true, isDefault: true), model: .optIn, prompt: .choice),
        ])
        let core = try C15tApple.install(C15tAppleConfiguration(
            transport: .offline,
            consentCategories: [.necessary, .measurement, .marketing],
            policy: policy
        ))
        // c15t-cli-snippet:offline:end
        return core
    }

    /// The configuration `c15t setup` prints for hosted mode, with the default categories.
    private func cliHostedConfiguration() -> C15tAppleConfiguration {
        let configuration =
            // c15t-cli-snippet:hosted:start
            C15tAppleConfiguration(
                transport: .hosted(URL(string: "https://your-project.inth.app")!),
                consentCategories: [.necessary, .measurement, .marketing]
            )
            // c15t-cli-snippet:hosted:end
        return configuration
    }

    func testTheHostedConfigurationKeepsTheCategories() {
        XCTAssertEqual(cliHostedConfiguration().consentCategories, [.necessary, .measurement, .marketing])
    }

    func testThePrintedRuleIsOneTheCoreAccepts() throws {
        let policy = try ConsentPolicy(rules: [
            PolicyRule(id: "everywhere", match: PolicyMatch(fallback: true, isDefault: true), model: .optIn, prompt: .choice),
        ])
        XCTAssertEqual(policy.rules.count, 1)
    }
}
