import C15tApple
import C15tCore
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
        let backend = testing ? nil : Bundle.main.object(forInfoDictionaryKey: "C15tBackendURL") as? String
        let privacy = Bundle.main.object(forInfoDictionaryKey: "C15tPrivacyPolicyURL") as? String
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
            guard let url = URL(string: backend), url.scheme == "https", url.host != nil,
                  url.user == nil, url.password == nil else { throw ConfigurationError.invalidBackend }
            guard let privacy = configured(privacy), let privacyURL = URL(string: privacy),
                  privacyURL.scheme == "https", privacyURL.host != nil else { throw ConfigurationError.missingPrivacyPolicy }
            backendURL = url
            privacyPolicyURL = privacyURL
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
        let service = testing ? "com.c15t.examples.swiftui.tests" : "com.c15t.examples.swiftui.demo"
        let store = KeychainStore(service: service)
        if testing && ProcessInfo.processInfo.arguments.contains("--reset-demo") { store.removeAll() }
        return try C15tApple.install(CoreConfig(
            store: store, transport: DemoTransport(unavailable: demoUnavailable),
            consentCategories: [.necessary, .measurement], initRetry: .disabled
        ))
    }

    // #region docs:swiftui-hosted title="Sources/sample-configuration.swift"
    private func installHosted(backendURL: URL) throws -> ConsentCore {
        try C15tApple.install(C15tAppleConfiguration(
            transport: .hosted(backendURL),
            storage: .keychain(service: "com.c15t.examples.swiftui.hosted"),
            consentCategories: [.necessary, .measurement]
        ))
    }
    // #endregion docs:swiftui-hosted
}

enum ConfigurationError: LocalizedError {
    case invalidBackend, missingPrivacyPolicy
    var errorDescription: String? {
        switch self {
        case .invalidBackend: return "Set C15T_BACKEND_URL to your HTTPS Inth project URL."
        case .missingPrivacyPolicy: return "Set C15T_PRIVACY_POLICY_URL to your app's HTTPS privacy policy."
        }
    }
}
