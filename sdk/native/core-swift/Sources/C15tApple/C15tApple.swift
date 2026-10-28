#if canImport(C15tCore)
import C15tCore
#endif
import Foundation

/// Installation failures leave optional SDKs gated. Retry after protected data is available.
public enum C15tAppleInstallationError: Error, Equatable, Sendable {
    case invalidBackendURL
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

    /// Choose hosted or self-hosted explicitly. Keychain is the default store.
    public init(
        transport: Transport,
        storage: Storage = .keychain(),
        initURL: URL? = nil,
        domain: String? = nil,
        consentCategories: [ConsentCategory]? = nil,
        vendors: [Int]? = nil,
        overrides: ConsentOverrides = .default(),
        gpc: Bool? = nil
    ) {
        self.transport = transport
        self.storage = storage
        self.initURL = initURL
        self.domain = domain
        self.consentCategories = consentCategories
        self.vendors = vendors
        self.overrides = overrides
        self.gpc = gpc
    }

    /// Build the native transport. HTTP is allowed only for exact loopback hosts.
    public func makeTransport(client: any HTTPTransport = URLSession.shared) throws -> (any C15tTransport)? {
        switch transport {
        case let .hosted(url), let .selfHosted(url):
            try C15tApple.validate(url)
            if let initURL { try C15tApple.validate(initURL) }
            return HostedTransport(
                baseURL: url, initURL: initURL, domain: domain,
                extraHeaders: ["x-c15t-platform": "apple->\(C15tApple.version)"],
                client: client
            )
        case .offline: return OfflineTransport(domain: domain ?? "offline")
        case .disabled: return nil
        }
    }

    /// Configure one core with protected storage and the native platform key projection.
    public func makeCoreConfiguration() throws -> CoreConfig {
        CoreConfig(
            store: try storage.makeStore(), transport: try makeTransport(),
            consentCategories: consentCategories, vendors: vendors,
            overrides: overrides, gpc: gpc, storageBus: UserDefaultsStorageBus()
        )
    }
}

/// Installs and hydrates the process-wide engine before returning it to any adapter.
public enum C15tApple {
    /// Version of the Apple platform module, released with this native source package.
    public static let version = C15tSDK.version
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
                C15t.current?.flushPending()
                C15t.current?.refresh()
            })
            observer.install()
            foreground = observer
        }
        if reachability == nil {
            reachability = C15tReachability.register(onGained: { C15t.current?.flushPending() })
        }
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

        // Missing or unreadable identity cannot lend a previous subject's grant to a new id.
        // Keep the existing core API; sanitation belongs before its first hydration.
        let decoded = store.data(for: StorageKey.subject).flatMap {
            try? JSONDecoder().decode(SubjectIdentity.self, from: $0)
        }
        let identity = decoded.flatMap { try? SubjectIdentity(id: $0.id) }
        if identity == nil {
            for key in [StorageKey.snapshot, StorageKey.pendingSaves] where store.data(for: key) != nil {
                guard store.set(nil, for: key) else {
                    throw C15tAppleInstallationError.protectedStorageUnavailable
                }
            }
        }
    }
}
