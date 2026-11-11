#if canImport(C15tCore)
import C15tCore
#endif
import Foundation

/// Installation failures leave optional SDKs gated. Retry after protected data is available.
public enum C15tAppleInstallationError: Error, Equatable, Sendable {
    case invalidBackendURL
    /// The IAB settings are outside the TCF ranges. No CMP ID is written for them.
    case invalidIABConfiguration
    case protectedStorageUnavailable
    case unbootstrappedCore
}

/// Production installation for SwiftUI, UIKit and RN. No UI or JS runtime is required.
public struct C15tAppleConfiguration: Sendable {
    public enum Transport: Sendable {
        case hosted(URL)
        case selfHosted(URL)
        /// Durable local state and an undelivered queue, with no policy resolution.
        case offline
        /// Preview only. Async commands have no transport.
        case disabled
    }

    public enum Storage: Sendable {
        case keychain(service: String = "com.c15t.core")
        /// Development only. Consent is not Keychain-protected.
        case file(directory: URL? = nil)
        /// Preview only. Nothing survives relaunch.
        case memory

        public func makeStore() throws -> any ConsentStore {
            switch self {
            case let .keychain(service):
                #if canImport(Security)
                return KeychainStore(service: service)
                #else
                throw C15tAppleInstallationError.protectedStorageUnavailable
                #endif
            case let .file(directory):
                if let directory { return FileStore(directory: directory) }
                return try FileStore(namespace: Bundle.main.bundleIdentifier ?? "com.c15t")
            case .memory:
                return InMemoryStore()
            }
        }
    }

    public let transport: Transport
    public let storage: Storage
    public var initURL: URL?
    public var domain: String?
    public var consentCategories: [ConsentCategory]?
    public var vendors: [Int]?
    public var overrides: ConsentOverrides
    public var gpc: Bool?
    public var bundledPolicy: BundledPolicyResource?
    /// The policy in source control. Used only with the `offline` or `disabled`
    /// transport, where it is the only policy source.
    public var policy: ConsentPolicy?
    /// Why a declared in-code policy was refused. The core reports it as `policy-invalid`.
    public var policyError: String?
    /// Registered CMP identity and publisher settings. `nil` turns IAB TCF off.
    ///
    /// With a value, the installed core writes `IABTCF_CmpSdkID` and
    /// `IABTCF_CmpSdkVersion` to standard `UserDefaults` at startup and can commit
    /// IAB choices. There is no default CMP ID.
    public var iab: IABConfiguration?

    /// The host reported as `x-c15t-platform: <platform>-><version>` on hosted
    /// requests. `apple` for a Swift app; the React Native bridge sets `rn`, so the
    /// backend can tell the two apart now that `x-c15t-version` carries no prefix.
    public var platform = "apple"

    /// Choose hosted or self-hosted explicitly. Keychain is the default store.
    public init(
        transport: Transport,
        storage: Storage = .keychain(),
        initURL: URL? = nil,
        domain: String? = nil,
        consentCategories: [ConsentCategory]? = nil,
        vendors: [Int]? = nil,
        overrides: ConsentOverrides = .default(),
        gpc: Bool? = nil,
        bundledPolicy: BundledPolicyResource? = nil,
        policy: ConsentPolicy? = nil,
        policyError: String? = nil,
        iab: IABConfiguration? = nil
    ) {
        self.transport = transport
        self.storage = storage
        self.initURL = initURL
        self.domain = domain
        self.consentCategories = consentCategories
        self.vendors = vendors
        self.overrides = overrides
        self.gpc = gpc
        self.bundledPolicy = bundledPolicy
        self.policy = policy
        self.policyError = policyError
        self.iab = iab
    }

    /// Build the native transport. HTTP is allowed only for exact loopback hosts.
    public func makeTransport(client: any HTTPTransport = URLSession.shared) throws -> (any C15tTransport)? {
        switch transport {
        case let .hosted(url), let .selfHosted(url):
            try C15tApple.validate(url)
            if let initURL { try C15tApple.validate(initURL) }
            return HostedTransport(
                baseURL: url, initURL: initURL, domain: domain,
                extraHeaders: ["x-c15t-platform": "\(platform)->\(C15tApple.version)"],
                client: client
            )
        case .offline: return OfflineTransport(domain: domain ?? "offline")
        case .disabled: return nil
        }
    }

    /// Configure one core with protected storage and the native platform key projection.
    /// - Throws: ``C15tAppleInstallationError/invalidIABConfiguration`` when ``iab`` is out of range,
    ///   before any store or transport is built.
    public func makeCoreConfiguration() throws -> CoreConfig {
        if let iab, C15tApple.iabIssue(iab) != nil {
            throw C15tAppleInstallationError.invalidIABConfiguration
        }
        // The two modes do not mix: an in-code policy needs a transport with no backend.
        let noBackend: Bool
        switch transport {
        case .offline, .disabled: noBackend = true
        case .hosted, .selfHosted: noBackend = false
        }
        return CoreConfig(
            store: try storage.makeStore(), bundledPolicy: noBackend ? nil : bundledPolicy,
            policy: noBackend ? policy : nil, policyError: noBackend ? policyError : nil,
            transport: try makeTransport(),
            consentCategories: consentCategories, vendors: vendors, iab: iab,
            overrides: overrides, gpc: gpc, storageBus: UserDefaultsStorageBus()
        )
    }
}

/// Installs and hydrates the process-wide engine before returning it to any adapter.
public enum C15tApple {
    /// Version of the Apple platform module, released with this native source package.
    public static let version = C15t.version
    /// Optional ATT requests share one process-wide flight across native hosts and RN.
    public static let tracking = C15tTrackingController()
    private static let lock = NSRecursiveLock()
    private static var foreground: C15tForegroundObserver?
    private static var reachability: C15tReachability?

    /// Install once. Later calls return the same hydrated core and keep its original config.
    /// - Throws: An installation error when URLs or durable storage are unavailable.
    @discardableResult
    public static func install(_ configuration: C15tAppleConfiguration) throws -> ConsentCore {
        lock.lock()
        defer { lock.unlock() }
        if let core = C15t.current { return try installed(core) }
        return try install(configuration.makeCoreConfiguration())
    }

    /// Install custom native services. The caller owns their protection and retry policy.
    /// Storage must support a verified write/read/delete before any engine is published.
    @discardableResult
    public static func install(_ configuration: CoreConfig) throws -> ConsentCore {
        lock.lock()
        defer { lock.unlock() }
        if let core = C15t.current { return try installed(core) }
        if let transport = configuration.transport as? HostedTransport {
            try validate(transport.baseURL)
            try validate(transport.initURL)
        }
        try prepare(configuration.store)
        let core = C15t.bootstrap(configuration)
        return try installed(core)
    }

    /// Attach an already hydrated host engine. An unstarted engine is refused.
    @discardableResult
    public static func attach(_ core: ConsentCore) -> Bool {
        lock.lock()
        defer { lock.unlock() }
        guard core.isBootstrapped, C15t.install(core) else { return false }
        armLifecycle()
        return true
    }

    private static func installed(_ core: ConsentCore) throws -> ConsentCore {
        guard core.isBootstrapped else { throw C15tAppleInstallationError.unbootstrappedCore }
        armLifecycle()
        return core
    }

    /// Stop platform subscriptions. The engine and its cached permissions remain installed.
    /// A later install or attach starts one registration of each kind again.
    public static func shutdown() {
        lock.lock()
        defer { lock.unlock() }
        foreground?.uninstall()
        reachability?.unregister()
        foreground = nil
        reachability = nil
    }

    private static func armLifecycle() {
        if foreground == nil {
            let observer = C15tForegroundObserver(onForeground: {
                C15t.current?.replayThenRefresh()
            })
            observer.install()
            foreground = observer
        }
        if reachability == nil {
            reachability = C15tReachability.register(onGained: { C15t.current?.replayThenRefresh() })
        }
    }

    /// Explain why `configuration` cannot be used for IAB TCF, or return `nil` when it can.
    ///
    /// These are the ranges the core enforces before it writes a CMP ID or encodes a
    /// TC String: CMP ID 2 to 4095, CMP version 0 to 4095, consent screen 0 to 63 and
    /// two uppercase letters for the publisher country and consent language.
    /// - Returns: A sentence naming the first invalid field, or `nil`.
    public static func iabIssue(_ configuration: IABConfiguration) -> String? {
        func letters(_ value: String) -> Bool {
            value.utf8.count == 2 && value.utf8.allSatisfy { (65...90).contains($0) }
        }
        if !(2...4095).contains(configuration.cmpId) {
            return "CMP ID \(configuration.cmpId) is outside 2 to 4095. Use the ID IAB Europe registered for your CMP."
        }
        if !(0...4095).contains(configuration.cmpVersion) {
            return "CMP version \(configuration.cmpVersion) is outside 0 to 4095."
        }
        if !letters(configuration.publisherCountryCode) {
            return "Publisher country code \"\(configuration.publisherCountryCode)\" is not two uppercase letters."
        }
        if !(0...63).contains(configuration.consentScreen) {
            return "Consent screen \(configuration.consentScreen) is outside 0 to 63."
        }
        if !letters(configuration.consentLanguage) {
            return "Consent language \"\(configuration.consentLanguage)\" is not two uppercase letters."
        }
        if !(0...63).contains(configuration.numCustomPurposes) {
            return "Custom purpose count \(configuration.numCustomPurposes) is outside 0 to 63."
        }
        return nil
    }

    static func validate(_ url: URL) throws {
        let scheme = url.scheme?.lowercased()
        let host = url.host?.lowercased()
        // Foundation versions differ on whether URL.host keeps IPv6 brackets.
        let loopback = host == "localhost" || host == "127.0.0.1" || host == "::1" || host == "[::1]"
        guard let host, !host.isEmpty,
              scheme == "https" || (scheme == "http" && loopback),
              url.user == nil, url.password == nil else {
            throw C15tAppleInstallationError.invalidBackendURL
        }
    }

    private static func prepare(_ store: any ConsentStore) throws {
        let probeKey = "com.c15t.installation.probe"
        let probe = Data(UUID().uuidString.utf8)
        guard store.set(probe, for: probeKey) else {
            throw C15tAppleInstallationError.protectedStorageUnavailable
        }
        let readable = store.data(for: probeKey) == probe
        let removed = store.set(nil, for: probeKey)
        guard readable, removed else { throw C15tAppleInstallationError.protectedStorageUnavailable }

        do {
            let decoded = try store.read(for: StorageKey.subject).flatMap {
                try? JSONDecoder().decode(SubjectIdentity.self, from: $0)
            }
            let identity = decoded.flatMap { try? SubjectIdentity(id: $0.id) }
            if identity == nil {
                // Finish all reads before deleting either orphaned item.
                let orphaned = try [StorageKey.snapshot, StorageKey.pendingSaves].filter {
                    try store.read(for: $0) != nil
                }
                for key in orphaned {
                    guard store.set(nil, for: key) else {
                        throw C15tAppleInstallationError.protectedStorageUnavailable
                    }
                }
            }
        } catch {
            throw C15tAppleInstallationError.protectedStorageUnavailable
        }
    }
}
