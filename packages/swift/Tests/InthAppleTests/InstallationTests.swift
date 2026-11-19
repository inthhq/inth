@_spi(InthInternal) import InthApple
@_spi(InthInternal) import InthCore
import Foundation
import XCTest

final class InstallationTests: XCTestCase {
    override func setUp() {
        super.setUp()
        InthApple.shutdown()
        Inth.resetForTests()
    }

    override func tearDown() {
        InthBuild.simulate(debug: nil)
        InthApple.shutdown()
        Inth.resetForTests()
        super.tearDown()
    }

    func testColdHydrationReturnsStoredGrantBeforeAnyNetworkAndGatesDoNoIO() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = CountingStore(FileStore(directory: directory))
        let first = try await grantedCore(store: store)
        let subject = first.snapshot().subject
        InthApple.shutdown()
        Inth.resetForTests()

        let cold = try InthApple.install(configuration(store: store))
        XCTAssertTrue(cold.isAllowed(.marketing), "hydrate before install returns")
        XCTAssertEqual(cold.snapshot().subject, subject)
        let reads = store.reads
        let writes = store.writes
        for _ in 0..<100 {
            XCTAssertTrue(Inth.isAllowed(.marketing))
            XCTAssertEqual(Inth.decision(for: .marketing), .granted)
        }
        XCTAssertEqual(store.reads, reads)
        XCTAssertEqual(store.writes, writes)
        await cold.waitUntilIdle()
    }

    func testRepeatedAndConcurrentInstallKeepOneEngineAndNeverTouchTheSecondStore() throws {
        let store = CountingStore(InMemoryStore())
        let first = try InthApple.install(configuration(store: store))
        let refused = CountingStore(InMemoryStore())
        refused.refuseWrites = true
        DispatchQueue.concurrentPerform(iterations: 20) { _ in
            XCTAssertTrue((try? InthApple.install(self.configuration(store: refused))) === first)
        }
        XCTAssertEqual(refused.reads, 0)
        XCTAssertEqual(refused.writes, 0)
        XCTAssertTrue(Inth.current === first)
    }

    func testConcurrentColdInstallCreatesOneHydratedEngine() {
        let store = CountingStore(InMemoryStore())
        let instances = InstalledInstances()
        DispatchQueue.concurrentPerform(iterations: 20) { _ in
            do {
                let core = try InthApple.install(self.configuration(store: store))
                XCTAssertTrue(core.isBootstrapped)
                XCTAssertNotNil(core.snapshot().subject, "hydration finished before return")
                instances.append(core)
            } catch { XCTFail("Concurrent install failed: \(error)") }
        }
        XCTAssertEqual(instances.values.count, 20)
        for instance in instances.values { XCTAssertTrue(instance === Inth.current) }
    }

    func testTrackingReadsPermissionChangesWithoutChangingConsent() async throws {
        let core = try InthApple.install(configuration(store: InMemoryStore()))
        let status = TrackingStatus()
        let tracking = InthTrackingController(
            trackingPlatformStatus: { status.current },
            trackingPromptStringPresent: { true },
            trackingPrompt: { completion in completion(status.current) },
            trackingExpandedInterfaceAvailable: { false }
        )
        let denied = expectation(description: "denied authorization returned")
        tracking.request {
            XCTAssertEqual(try? $0.get().status, .denied)
            denied.fulfill()
        }
        await fulfillment(of: [denied], timeout: 1)
        status.current = .authorized
        let authorized = expectation(description: "changed authorization returned")
        tracking.request {
            XCTAssertEqual(try? $0.get().status, .authorized)
            authorized.fulfill()
        }
        await fulfillment(of: [authorized], timeout: 1)
        XCTAssertFalse(core.isAllowed(.marketing))
    }

    func testNativeSourcePackageSharesOneVersion() {
        XCTAssertEqual(InthApple.version, Inth.version)
    }

    func testDryRunInADebugBuildReachesLoopbackAndStagingHosts() async throws {
        for backend in ["http://localhost:8787", "http://127.0.0.1:8787", "http://[::1]:8787", "https://consent.example.com"] {
            let http = try FixtureHTTP()
            let configured = InthAppleConfiguration(backendURL: backend, dryRun: true, storage: .memory)
            let native = try configured.makeTransport(client: http)
            let core = try InthApple.install(configuration(store: InMemoryStore(), transport: native))
            XCTAssertTrue(core.isBootstrapped)
            await core.waitUntilIdle()
            let requestURL = try XCTUnwrap(http.requests.first?.url)
            let expected = try XCTUnwrap(URL(string: backend + "/init"))
            XCTAssertEqual(requestURL.scheme, expected.scheme)
            XCTAssertEqual(requestURL.host, expected.host)
            XCTAssertEqual(requestURL.port, expected.port)
            XCTAssertEqual(requestURL.path, expected.path)
            InthApple.shutdown()
            Inth.resetForTests()
        }
    }

    func testNonLoopbackHTTPAndLookalikesRefuseInstallation() throws {
        for backend in ["http://invalid.example", "http://localhost.evil.example", "http://localhost.", "http://127.0.0.1.evil.example", "http://127.0.0.2", "http://[::2]", "http://localhost@evil.example", "https://user:password@consent.example.com", "ftp://localhost", "/relative"] {
            for dryRun in [false, true] {
                let configured = InthAppleConfiguration(backendURL: backend, dryRun: dryRun, storage: .memory)
                XCTAssertThrowsError(try InthApple.install(configured), backend) {
                    guard case .invalidBackendURL = $0 as? InthAppleInstallationError else {
                        return XCTFail("\(backend): \($0)")
                    }
                }
                XCTAssertNil(Inth.current, backend)
                XCTAssertFalse(Inth.isAllowed(.marketing))
            }
        }
    }

    func testOnlyAnInthProjectURLInstalls() throws {
        for (backend, reason) in [
            ("https://consent.example.com", InthProjectURLError.Reason.host),
            ("http://localhost:8787", .scheme),
            ("https://acme.inth.app/api/c15t", .path),
            ("", .empty),
        ] {
            XCTAssertThrowsError(
                try InthApple.install(InthAppleConfiguration(backendURL: backend, storage: .memory)), backend
            ) { error in
                guard case let .invalidBackendURL(refused) = error as? InthAppleInstallationError else {
                    return XCTFail("\(backend): \(error)")
                }
                XCTAssertEqual(refused.reason, reason, backend)
                XCTAssertEqual(refused.input, backend)
                XCTAssertTrue(
                    error.localizedDescription.hasPrefix(
                        "backendURL must be the project URL from your Inth dashboard, such as "
                            + "https://your-project.inth.app. Got \"\(backend)\": "),
                    error.localizedDescription)
            }
            XCTAssertNil(Inth.current, backend)
        }
    }

    func testTheNormalFormReachesTheTransportTheDomainAndTheBundledPolicy() throws {
        let configured = InthAppleConfiguration(
            backendURL: " Acme.Inth.App/ ", storage: .memory,
            bundledPolicy: BundledPolicyResource(data: Data(), endpoint: "https://Acme.Inth.App/"),
            policy: try ConsentPolicy(rules: [
                PolicyRule(id: "everywhere", match: PolicyMatch(fallback: true, isDefault: true), model: .optIn, prompt: .choice),
            ]))
        let core = try configured.makeCoreConfiguration()
        let hosted = try XCTUnwrap(core.transport as? HostedTransport)
        XCTAssertEqual(hosted.baseURL.absoluteString, "https://acme.inth.app")
        XCTAssertEqual(hosted.policyEndpoint?.absoluteString, "https://acme.inth.app")
        XCTAssertEqual(hosted.domain, "acme.inth.app")
        XCTAssertEqual(core.bundledPolicy?.endpoint, "https://acme.inth.app")
        XCTAssertNil(core.policy, "a bundled manifest and an in-code policy do not mix")
        XCTAssertFalse(core.dryRun)
    }

    func testDryRunIsRefusedInAReleaseBuildOnBothDoors() throws {
        InthBuild.simulate(debug: false)
        defer { InthBuild.simulate(debug: nil) }
        let configured = InthAppleConfiguration(backendURL: "https://acme.inth.app", dryRun: true, storage: .memory)
        XCTAssertThrowsError(try InthApple.install(configured)) { error in
            XCTAssertEqual(error as? InthAppleInstallationError, .dryRunInReleaseBuild)
            XCTAssertEqual(
                error.localizedDescription,
                "dryRun is for development and CI and cannot run in a release build. "
                    + "Remove dryRun (pass it only inside #if DEBUG).")
        }
        XCTAssertNil(Inth.current)
        XCTAssertThrowsError(try InthApple.install(CoreConfig(store: InMemoryStore(), dryRun: true))) {
            XCTAssertEqual($0 as? InthAppleInstallationError, .dryRunInReleaseBuild)
        }
        XCTAssertNil(Inth.current)
        // dryRun does not relax the host rule in a release build either.
        XCTAssertThrowsError(
            try InthAppleConfiguration(backendURL: "http://localhost:8787", dryRun: true).normalizedBackendURL())
        XCTAssertNoThrow(try InthApple.install(
            InthAppleConfiguration(backendURL: "https://acme.inth.app", storage: .memory, policy: everywhere())))
    }

    func testDryRunInstallSavesLocallyAndQueuesNothing() async throws {
        let core = try InthApple.install(InthAppleConfiguration(
            backendURL: "http://localhost:8787", dryRun: true, storage: .memory,
            consentCategories: [.necessary, .marketing], policy: everywhere()))
        await core.waitUntilIdle()
        XCTAssertFalse(core.snapshot().policyPending, "the in-code policy answers with no network")
        XCTAssertEqual(core.save(.all).status, .committed)
        await core.waitUntilIdle()
        XCTAssertTrue(core.isAllowed(.marketing))
        XCTAssertEqual(core.pendingSaveCount(), 0)
    }

    func testUnavailableProtectedStorageDoesNotPublishAnEngineAndCanRetry() throws {
        let store = CountingStore(InMemoryStore())
        store.refuseWrites = true
        XCTAssertThrowsError(try InthApple.install(configuration(store: store))) {
            XCTAssertEqual($0 as? InthAppleInstallationError, .protectedStorageUnavailable)
        }
        XCTAssertNil(Inth.current)
        XCTAssertFalse(Inth.isAllowed(.marketing))
        store.refuseWrites = false
        let core = try InthApple.install(configuration(store: store))
        XCTAssertTrue(core.isBootstrapped)
        XCTAssertFalse(core.isAllowed(.marketing))
    }

    func testReadbackFailureAndProbeCleanupFailureRefuseInstallation() {
        for mode in ["read", "delete"] {
            let store = CountingStore(InMemoryStore())
            store.refuseReads = mode == "read"
            store.refuseDeletes = mode == "delete"
            XCTAssertThrowsError(try InthApple.install(configuration(store: store)))
            XCTAssertNil(Inth.current)
        }
    }

    func testMissingSubjectDropsOrphanedGrantAndQueueBeforeHydration() async throws {
        let store = CountingStore(InMemoryStore())
        let first = try await grantedCore(store: store, keepQueued: true)
        XCTAssertEqual(first.pendingSaveCount(), 1)
        let previousSubject = first.snapshot().subject?.id
        XCTAssertNotNil(store.data(for: StorageKey.snapshot))
        // Model loss of the protected identity while other items survive.
        XCTAssertTrue(store.set(nil, for: StorageKey.subject))
        InthApple.shutdown()
        Inth.resetForTests()
        let cold = try InthApple.install(configuration(store: store))
        XCTAssertNotEqual(cold.snapshot().subject?.id, previousSubject)
        XCTAssertFalse(cold.isAllowed(.marketing))
        XCTAssertNil(cold.snapshot().explicitChoice)
        XCTAssertEqual(cold.pendingSaveCount(), 0)
        await cold.waitUntilIdle()
    }

    func testTransientSubjectReadFailurePreservesConsentAndCanRetry() async throws {
        let store = CountingStore(InMemoryStore())
        let first = try await grantedCore(store: store, keepQueued: true)
        let subject = first.snapshot().subject
        let keys = [StorageKey.subject, StorageKey.snapshot, StorageKey.pendingSaves]
        let original = keys.map { store.data(for: $0) }
        InthApple.shutdown()
        Inth.resetForTests()

        store.failNextRead = StorageKey.subject
        XCTAssertThrowsError(try InthApple.install(configuration(store: store))) {
            XCTAssertEqual($0 as? InthAppleInstallationError, .protectedStorageUnavailable)
        }
        XCTAssertNil(Inth.current)
        XCTAssertEqual(keys.map { store.data(for: $0) }, original)

        let cold = try InthApple.install(configuration(store: store))
        XCTAssertEqual(cold.snapshot().subject, subject)
        XCTAssertTrue(cold.isAllowed(.marketing))
        XCTAssertEqual(cold.pendingSaveCount(), 1)
        await cold.waitUntilIdle()
    }

    func testOrphanReadFailuresAbortBeforeDeletingAnyRecord() async throws {
        for failingKey in [StorageKey.snapshot, StorageKey.pendingSaves] {
            let store = CountingStore(InMemoryStore())
            _ = try await grantedCore(store: store, keepQueued: true)
            XCTAssertTrue(store.set(nil, for: StorageKey.subject))
            let keys = [StorageKey.snapshot, StorageKey.pendingSaves]
            let original = keys.map { store.data(for: $0) }
            InthApple.shutdown()
            Inth.resetForTests()

            store.failNextRead = failingKey
            XCTAssertThrowsError(try InthApple.install(configuration(store: store))) {
                XCTAssertEqual($0 as? InthAppleInstallationError, .protectedStorageUnavailable)
            }
            XCTAssertNil(Inth.current)
            XCTAssertEqual(keys.map { store.data(for: $0) }, original)

            let cold = try InthApple.install(configuration(store: store))
            XCTAssertFalse(cold.isAllowed(.marketing))
            XCTAssertNil(cold.snapshot().explicitChoice)
            XCTAssertEqual(cold.pendingSaveCount(), 0)
            await cold.waitUntilIdle()
            InthApple.shutdown()
            Inth.resetForTests()
        }
    }

    func testMalformedSubjectDropsOrphanedGrantAndQueue() async throws {
        let store = CountingStore(InMemoryStore())
        _ = try await grantedCore(store: store, keepQueued: true)
        store.set(Data("{truncated".utf8), for: StorageKey.subject)
        InthApple.shutdown()
        Inth.resetForTests()
        let cold = try InthApple.install(configuration(store: store))
        XCTAssertFalse(cold.isAllowed(.marketing))
        XCTAssertNil(cold.snapshot().explicitChoice)
        XCTAssertEqual(cold.pendingSaveCount(), 0)
        await cold.waitUntilIdle()
    }

    func testFailedOrphanCleanupCannotRestoreTheOldGrant() async throws {
        let store = CountingStore(InMemoryStore())
        _ = try await grantedCore(store: store)
        XCTAssertTrue(store.set(nil, for: StorageKey.subject))
        store.refuseDeletesExceptProbe = true
        InthApple.shutdown()
        Inth.resetForTests()
        XCTAssertThrowsError(try InthApple.install(configuration(store: store)))
        XCTAssertNil(Inth.current)
        XCTAssertFalse(Inth.isAllowed(.marketing))
    }

    func testForegroundSubscriptionStopsAndReattachesOnce() async throws {
        let http = try FixtureHTTP()
        let core = try InthApple.install(configuration(store: InMemoryStore(), transport: transport(http)))
        await core.waitUntilIdle()
        _ = try InthApple.install(configuration(store: InMemoryStore()))
        let initial = http.requests.count
        NotificationCenter.default.post(name: InthForegroundObserver.didBecomeActive, object: nil)
        await core.waitUntilIdle()
        XCTAssertEqual(http.requests.count, initial + 1)
        InthApple.shutdown()
        InthApple.shutdown()
        NotificationCenter.default.post(name: InthForegroundObserver.didBecomeActive, object: nil)
        await core.waitUntilIdle()
        XCTAssertEqual(http.requests.count, initial + 1)
        XCTAssertTrue(InthApple.attach(core))
        XCTAssertTrue(InthApple.attach(core))
        NotificationCenter.default.post(name: InthForegroundObserver.didBecomeActive, object: nil)
        await core.waitUntilIdle()
        XCTAssertEqual(http.requests.count, initial + 2)
    }

    func testHostedMetadataNamesNativeModulesOnEveryRequest() async throws {
        let http = try FixtureHTTP()
        let configured = InthAppleConfiguration(backendURL: "https://acme.inth.app")
        let native = try configured.makeTransport(client: http)
        _ = await native.performInit(InitContext(overrides: try JSONDecoder().decode(KernelOverridesWire.self, from: Data("{}".utf8)), user: nil, subjectId: "subject"))
        _ = await native.sendSave(Data("{}".utf8))
        _ = await native.patchIdentity(subjectId: "subject", externalId: "external", identityProvider: nil)
        XCTAssertEqual(http.requests.count, 3)
        XCTAssertEqual(http.requests.first?.url, URL(string: "https://acme.inth.app/init"))
        for request in http.requests {
            XCTAssertEqual(request.headers[Inth.versionHeader], Inth.version)
            XCTAssertEqual(request.headers["x-inth-platform"], "apple->\(InthApple.version)")
            XCTAssertFalse(request.headers.values.contains { $0.hasPrefix("rn->") })
        }
    }

    func testInvalidProductionURLAndUnstartedAttachmentAreRefused() {
        XCTAssertThrowsError(try InthApple.install(InthAppleConfiguration(backendURL: "http://example.com")))
        XCTAssertFalse(InthApple.attach(ConsentCore()))
        XCTAssertNil(Inth.current)
    }

    private func configuration(store: any ConsentStore, transport: (any InthTransport)? = nil) -> CoreConfig {
        CoreConfig(store: store, transport: transport, consentCategories: [.necessary, .marketing, .measurement, .experience, .functionality], now: { 1_770_000_000_000 }, initRetry: .disabled, flushPendingOnBootstrap: false)
    }

    private func everywhere() throws -> ConsentPolicy {
        try ConsentPolicy(rules: [
            PolicyRule(id: "everywhere", match: PolicyMatch(fallback: true, isDefault: true), model: .optIn, prompt: .choice),
        ])
    }

    private func transport(_ http: FixtureHTTP) -> HostedTransport {
        HostedTransport(baseURL: URL(string: "https://consent.example.com")!, client: http)
    }

    private func grantedCore(store: any ConsentStore, keepQueued: Bool = false) async throws -> ConsentCore {
        let http = try FixtureHTTP(failSaves: keepQueued)
        let core = try InthApple.install(configuration(store: store, transport: transport(http)))
        await core.waitUntilIdle()
        XCTAssertEqual(core.save(.all).status, .committed)
        await core.waitUntilIdle()
        XCTAssertTrue(core.isAllowed(.marketing))
        return core
    }
}

private final class CountingStore: ConsentStore, @unchecked Sendable {
    let underlying: any ConsentStore
    private let lock = NSLock()
    private var counts = (reads: 0, writes: 0)
    var refuseWrites = false
    var refuseReads = false
    var refuseDeletes = false
    var refuseDeletesExceptProbe = false
    var failNextRead: String?
    init(_ underlying: any ConsentStore) { self.underlying = underlying }
    var reads: Int { lock.lock(); defer { lock.unlock() }; return counts.reads }
    var writes: Int { lock.lock(); defer { lock.unlock() }; return counts.writes }
    func data(for key: String) -> Data? {
        try? read(for: key)
    }
    func read(for key: String) throws -> Data? {
        lock.lock(); counts.reads += 1; lock.unlock()
        if failNextRead == key {
            failNextRead = nil
            throw ReadFailure.unavailable
        }
        if refuseReads { throw ReadFailure.unavailable }
        return try underlying.read(for: key)
    }
    private enum ReadFailure: Error { case unavailable }
    @discardableResult
    func set(_ data: Data?, for key: String) -> Bool {
        lock.lock(); counts.writes += 1; lock.unlock()
        if refuseWrites || (data == nil && refuseDeletes) || (data == nil && refuseDeletesExceptProbe && key != "com.inth.installation.probe") { return false }
        return underlying.set(data, for: key)
    }
}

private final class FixtureHTTP: HTTPTransport, @unchecked Sendable {
    private let lock = NSLock()
    private var recorded: [HTTPRequest] = []
    private let body: Data
    private let failSaves: Bool
    var requests: [HTTPRequest] { lock.lock(); defer { lock.unlock() }; return recorded }
    init(failSaves: Bool = false) throws {
        self.failSaves = failSaves
        let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("../../../native-protocol/native-envelope-opt-in-grants.json")
        let fixture = try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: url))
        body = try JSONEncoder().encode(XCTUnwrap(fixture["input"]?["transport"]?["body"]))
    }
    private func record(_ request: HTTPRequest) {
        lock.lock(); defer { lock.unlock() }; recorded.append(request)
    }
    func send(_ request: HTTPRequest) async throws -> HTTPResponse {
        record(request)
        return HTTPResponse(status: request.method == .post && failSaves ? 503 : 200, headers: [:], body: request.method == .get ? body : Data("{}".utf8))
    }
}

private final class InstalledInstances: @unchecked Sendable {
    private let lock = NSLock()
    private var installed: [ConsentCore] = []
    var values: [ConsentCore] { lock.lock(); defer { lock.unlock() }; return installed }
    func append(_ core: ConsentCore) { lock.lock(); defer { lock.unlock() }; installed.append(core) }
}

private final class TrackingStatus: @unchecked Sendable {
    private let lock = NSLock()
    private var value: InthTrackingPlatformStatus = .denied
    var current: InthTrackingPlatformStatus {
        get { lock.lock(); defer { lock.unlock() }; return value }
        set { lock.lock(); defer { lock.unlock() }; value = newValue }
    }
}
