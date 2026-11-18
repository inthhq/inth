// The local demo injects its own transport, which is internal API. An app needs
// only `import InthApple` and `import InthCore`, as `installHosted` shows.
@_spi(InthInternal) import InthApple
@_spi(InthInternal) import InthCore
import Foundation

struct SampleConfiguration {
    let backendURL: URL?
    let privacyPolicyURL: URL
    let headless: Bool
    let demoUnavailable: Bool
    var isDemo: Bool { backendURL == nil }

    static func load() throws -> Self {
        let arguments = ProcessInfo.processInfo.arguments
        // UI tests opt into a separate Keychain service and never use a configured backend.
        let testing = arguments.contains("--ui-testing")
        let backend = testing ? nil : Bundle.main.object(forInfoDictionaryKey: "InthBackendURL") as? String
        let privacy = Bundle.main.object(forInfoDictionaryKey: "InthPrivacyPolicyURL") as? String
        return try Self(
            backend: backend, privacy: privacy,
            headless: arguments.contains("--headless"),
            demoUnavailable: arguments.contains("--demo-unavailable")
        )
    }

    init(backend: String?, privacy: String?, headless: Bool, demoUnavailable: Bool) throws {
        func configured(_ value: String?) -> String? {
            guard let value, !value.isEmpty, !value.hasPrefix("$(") else { return nil }
            return value
        }
        if let backend = configured(backend) {
            guard let url = try? InthProjectURL.normalize(backend) else { throw ConfigurationError.invalidBackend }
            guard let privacy = configured(privacy), let policyURL = URL(string: privacy),
                  policyURL.scheme == "https", policyURL.host != nil else { throw ConfigurationError.missingPrivacyPolicy }
            backendURL = url
            privacyPolicyURL = policyURL
        } else {
            backendURL = nil
            // Placeholder for this local demonstration, never presented as the app's policy.
            privacyPolicyURL = URL(string: "https://example.com/privacy")!
        }
        self.headless = headless
        self.demoUnavailable = demoUnavailable
    }

    func install() throws -> ConsentCore {
        if let backendURL { return try installHosted(backendURL: backendURL) }
        let testing = ProcessInfo.processInfo.arguments.contains("--ui-testing")
        let service = testing ? "com.inth.examples.swiftui.tests" : "com.inth.examples.swiftui.demo"
        let store = KeychainStore(service: service)
        if testing && ProcessInfo.processInfo.arguments.contains("--reset-demo") { store.removeAll() }
        return try InthApple.install(CoreConfig(
            store: store, transport: DemoTransport(unavailable: demoUnavailable),
            consentCategories: [.necessary, .measurement], initRetry: .disabled
        ))
    }

    // #region docs:swiftui-hosted title="Sources/sample-configuration.swift"
    private func installHosted(backendURL: URL) throws -> ConsentCore {
        try InthApple.install(InthAppleConfiguration(
            backendURL: backendURL.absoluteString,
            storage: .keychain(service: "com.inth.examples.swiftui.hosted"),
            consentCategories: [.necessary, .measurement]
        ))
    }
    // #endregion docs:swiftui-hosted
}

enum ConfigurationError: LocalizedError {
    case invalidBackend, missingPrivacyPolicy
    var errorDescription: String? {
        switch self {
        case .invalidBackend: return "Set C15T_BACKEND_URL to the project URL from your Inth dashboard, such as https://your-project.inth.app."
        case .missingPrivacyPolicy: return "Set C15T_PRIVACY_POLICY_URL to your app's HTTPS privacy policy."
        }
    }
}
