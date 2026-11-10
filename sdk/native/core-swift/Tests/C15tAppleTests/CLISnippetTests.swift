import C15tApple
import C15tCore
import XCTest

/// The offline install `c15t setup offline` prints for a Swift app.
///
/// Compiling `cliOfflineInstall` is the check that the printed code matches this
/// package's API. `packages/cli/src/__tests__/mobile/mobile-setup.test.ts` reads the
/// lines between the markers and fails when the CLI prints anything else, so change
/// both together.
final class CLISnippetTests: XCTestCase {
    /// Never called: installing would touch the Keychain.
    private func cliOfflineInstall() throws -> ConsentCore {
        // c15t-cli-snippet:start
        let policy = try ConsentPolicy(rules: [
            PolicyRule(id: "everywhere", match: PolicyMatch(fallback: true, isDefault: true), model: .optIn, prompt: .choice),
        ])
        let core = try C15tApple.install(C15tAppleConfiguration(
            transport: .offline,
            consentCategories: [.necessary, .measurement, .marketing],
            policy: policy
        ))
        // c15t-cli-snippet:end
        return core
    }

    func testThePrintedRuleIsOneTheCoreAccepts() throws {
        let policy = try ConsentPolicy(rules: [
            PolicyRule(id: "everywhere", match: PolicyMatch(fallback: true, isDefault: true), model: .optIn, prompt: .choice),
        ])
        XCTAssertEqual(policy.rules.count, 1)
    }
}
