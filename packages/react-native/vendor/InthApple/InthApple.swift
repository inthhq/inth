#if canImport(InthCore)
@_spi(InthInternal) import InthCore
#endif
import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// Installation failures leave optional SDKs gated. Retry after protected data is available.
public enum InthAppleInstallationError: Error, Equatable, Sendable, LocalizedError, CustomStringConvertible {
    /// `backendURL` is not an Inth project URL. The value says which rule failed.
    case invalidBackendURL(InthProjectURLError)
    /// `dryRun` is on in a release build. No core was started.
    case dryRunInReleaseBuild
    /// The IAB settings are outside the TCF ranges. No CMP ID is written for them.
    case invalidIABConfiguration
    case protectedStorageUnavailable
    case unbootstrappedCore

    public var description: String {
        switch self {
        case let .invalidBackendURL(error): return error.message
        case .dryRunInReleaseBuild: return InthBuild.dryRunRefusal()
        case .invalidIABConfiguration:
            return "The IAB settings are outside the TCF ranges. InthApple.iabIssue(_:) names the field."
        case .protectedStorageUnavailable:
            return "Consent storage is not available yet. Retry after protected data is available."
        case .unbootstrappedCore:
            return "The installed consent core was never started."
        }
    }

    public var errorDescription: String? { description }
}

/// Production installation for SwiftUI, UIKit and RN. No UI or JS runtime is required.
public struct InthAppleConfiguration: Sendable {
    public enum Storage: Sendable {
        case keychain(service: String = "com.inth.core")
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
                throw InthAppleInstallationError.protectedStorageUnavailable
                #endif
            case let .file(directory):
                if let directory { return FileStore(directory: directory) }
                return try FileStore(namespace: Bundle.main.bundleIdentifier ?? "com.inth")
            case .memory:
                return InMemoryStore()
            }
        }
    }

    /// The project URL from your Inth dashboard, such as `https://your-project.inth.app`.
    /// A missing scheme means `https`. Any other host is refused at install.
    public let backendURL: String
    /// Development and CI only. Everything works as normal and consent records are
    /// dropped: not queued, not sent. A release build refuses to install with it. In a
    /// debug build it also lets `backendURL` be any `https` URL or `http` on a loopback host.
    public var dryRun: Bool
    public let storage: Storage
    /// The `property` each consent record names: the app's bundle identifier unless
    /// set here. Sent lowercase.
    public var property: String?
    public var consentCategories: [ConsentCategory]?
    public var vendors: [Int]?
    public var overrides: ConsentOverrides
    public var gpc: Bool?
    public var bundledPolicy: BundledPolicyResource?
    /// The policy in source control. With one, the device resolves the rules locally
    /// and never calls `/init`. Records still go to `backendURL`. It does not mix with
    /// ``bundledPolicy``, which wins when both are set.
    public var policy: ConsentPolicy?
    /// Why a declared in-code policy was refused. The core reports it as `policy-invalid`.
    public var policyError: String?
    /// Registered CMP identity and publisher settings. `nil` turns IAB TCF off.
    ///
    /// With a value, the installed core writes `IABTCF_CmpSdkID` and
    /// `IABTCF_CmpSdkVersion` to standard `UserDefaults` at startup and can commit
    /// IAB choices. There is no default CMP ID.
    public var iab: IABConfiguration?
    /// Turns on the IAB GPP string and the `IABGPP_*` keys in standard `UserDefaults`.
    /// `nil`, the default, writes no GPP signal.
    public var gpp: GPPOptions?

    /// The host reported as `x-inth-platform: <platform>-><version>` on hosted
    /// requests. `apple` for a Swift app; the React Native bridge sets `rn`, so the
    /// backend can tell the two apart.
    public var platform = "apple"

    /// Keychain is the default store.
    public init(
        backendURL: String,
        dryRun: Bool = false,
        storage: Storage = .keychain(),
        property: String? = nil,
        consentCategories: [ConsentCategory]? = nil,
        vendors: [Int]? = nil,
        overrides: ConsentOverrides = .default(),
        gpc: Bool? = nil,
        bundledPolicy: BundledPolicyResource? = nil,
        policy: ConsentPolicy? = nil,
        policyError: String? = nil,
        iab: IABConfiguration? = nil,
        gpp: GPPOptions? = nil
    ) {
        self.backendURL = backendURL
        self.dryRun = dryRun
        self.storage = storage
        self.property = property
        self.consentCategories = consentCategories
        self.vendors = vendors
        self.overrides = overrides
        self.gpc = gpc
        self.bundledPolicy = bundledPolicy
        self.policy = policy
        self.policyError = policyError
        self.iab = iab
        self.gpp = gpp
    }

    /// The checked project URL in its normal form: `https://<host>`, no trailing slash.
    ///
    /// The same string reaches the transport and the bundled policy binding. The save
    /// body's `property` is not derived from it: see ``resolvedProperty``.
    /// - Throws: ``InthAppleInstallationError/dryRunInReleaseBuild`` for `dryRun` in a
    ///   release build, or ``InthAppleInstallationError/invalidBackendURL(_:)``.
    public func normalizedBackendURL() throws -> URL {
        if dryRun, !InthBuild.isDebug { throw InthAppleInstallationError.dryRunInReleaseBuild }
        do {
            return try InthProjectURL.normalize(backendURL, relaxed: dryRun)
        } catch let error as InthProjectURLError {
            throw InthAppleInstallationError.invalidBackendURL(error)
        }
    }

    /// The save body's `property`: the configured value, otherwise the main bundle's
    /// identifier, lowercased. `nil` only for a process with neither, such as a test
    /// runner, where the transport falls back to the project URL's host.
    public var resolvedProperty: String? {
        (property ?? Bundle.main.bundleIdentifier)?.lowercased()
    }

    /// Build the hosted transport for the checked project URL. Internal API.
    @_spi(InthInternal) public func makeTransport(
        client: any HTTPTransport = URLSession.shared
    ) throws -> any InthTransport {
        HostedTransport(
            baseURL: try normalizedBackendURL(), property: resolvedProperty,
            extraHeaders: ["x-inth-platform": "\(platform)->\(InthApple.version)"],
            client: client
        )
    }

    /// Configure one core with protected storage and the native platform key projection.
    /// Internal API: `InthApple.install(InthAppleConfiguration)` calls it.
    /// - Throws: ``InthAppleInstallationError/invalidIABConfiguration`` when ``iab`` is out of range,
    ///   and the errors of ``normalizedBackendURL()``, before any store is built.
    @_spi(InthInternal) public func makeCoreConfiguration() throws -> CoreConfig {
        try makeCoreConfiguration(transport: try makeTransport())
    }

    /// ``makeCoreConfiguration()`` with `transport` in place of the hosted one. Every
    /// check still runs. Tests pass `nil` to start a core that opens no socket.
    @_spi(InthInternal) public func makeCoreConfiguration(
        transport: (any InthTransport)?
    ) throws -> CoreConfig {
        if let iab, InthApple.iabIssue(iab) != nil {
            throw InthAppleInstallationError.invalidIABConfiguration
        }
        let endpoint = try normalizedBackendURL()
        // A manifest is bound to the normal form, whatever spelling the app passed.
        let bundle = bundledPolicy.map {
            BundledPolicyResource(data: $0.data, endpoint: endpoint.absoluteString)
        }
        // An in-code policy and a bundled manifest do not mix. The manifest wins.
        return CoreConfig(
            store: try storage.makeStore(), bundledPolicy: bundle,
            policy: bundle == nil ? policy : nil, policyError: bundle == nil ? policyError : nil,
            transport: transport, dryRun: dryRun,
            consentCategories: consentCategories, vendors: vendors, iab: iab,
            overrides: overrides, gpc: gpc, storageBus: UserDefaultsStorageBus(), gpp: gpp
        )
    }
}

/// Installs and hydrates the process-wide engine before returning it to any adapter.
public enum InthApple {
    /// Version of the Apple platform module, released with this native source package.
    public static let version = Inth.version
    /// Optional ATT requests share one process-wide flight across native hosts and RN.
    public static let tracking = InthTrackingController()
    private static let lock = NSRecursiveLock()
    private static var foreground: InthForegroundObserver?
    private static var reachability: InthReachability?

    /// Install once. Later calls return the same hydrated core and keep its original config.
    /// - Throws: An installation error when `backendURL` is not an Inth project URL,
    ///   `dryRun` is on in a release build, or durable storage is unavailable.
    @discardableResult
    public static func install(_ configuration: InthAppleConfiguration) throws -> ConsentCore {
        lock.lock()
        defer { lock.unlock() }
        if let core = Inth.current { return try installed(core) }
        return try install(configuration.makeCoreConfiguration())
    }

    /// Internal API for tests and first-party fixtures. It does not check the backend
    /// host. It still refuses `dryRun` in a release build.
    /// Storage must support a verified write/read/delete before any engine is published.
    @discardableResult
    @_spi(InthInternal) public static func install(_ configuration: CoreConfig) throws -> ConsentCore {
        lock.lock()
        defer { lock.unlock() }
        if let core = Inth.current { return try installed(core) }
        if configuration.dryRun, !InthBuild.isDebug {
            throw InthAppleInstallationError.dryRunInReleaseBuild
        }
        try prepare(configuration.store)
        let core = Inth.bootstrap(configuration)
        return try installed(core)
    }

    /// Attach an already hydrated host engine. An unstarted engine is refused.
    @discardableResult
    public static func attach(_ core: ConsentCore) -> Bool {
        lock.lock()
        defer { lock.unlock() }
        guard core.isBootstrapped, Inth.install(core) else { return false }
        armLifecycle()
        return true
    }

    private static func installed(_ core: ConsentCore) throws -> ConsentCore {
        guard core.isBootstrapped else { throw InthAppleInstallationError.unbootstrappedCore }
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
            let observer = InthForegroundObserver(onForeground: {
                Inth.current?.replayThenRefresh()
            })
            observer.install()
            foreground = observer
        }
        if reachability == nil {
            reachability = InthReachability.register(onGained: { Inth.current?.replayThenRefresh() })
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

    private static func prepare(_ store: any ConsentStore) throws {
        let probeKey = "com.inth.installation.probe"
        let probe = Data(UUID().uuidString.utf8)
        guard store.set(probe, for: probeKey) else {
            throw InthAppleInstallationError.protectedStorageUnavailable
        }
        let readable = store.data(for: probeKey) == probe
        let removed = store.set(nil, for: probeKey)
        guard readable, removed else { throw InthAppleInstallationError.protectedStorageUnavailable }

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
                        throw InthAppleInstallationError.protectedStorageUnavailable
                    }
                }
            }
        } catch {
            throw InthAppleInstallationError.protectedStorageUnavailable
        }
    }
}
