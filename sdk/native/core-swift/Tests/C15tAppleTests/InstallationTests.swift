import C15tApple
import C15tCore
import Foundation
import XCTest

final class InstallationTests: XCTestCase {
    override func setUp() {
        super.setUp()
        C15tApple.shutdown()
        C15t.resetForTests()
    }

    override func tearDown() {
        C15tApple.shutdown()
        C15t.resetForTests()
        super.tearDown()
    }

    func testColdHydrationReturnsStoredGrantBeforeAnyNetworkAndGatesDoNoIO() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = CountingStore(FileStore(directory: directory))
        let first = try await grantedCore(store: store)
        let subject = first.snapshot().subject
        C15tApple.shutdown()
        C15t.resetForTests()

        let cold = try C15tApple.install(configuration(store: store))
        XCTAssertTrue(cold.isAllowed(.marketing), "hydrate before install returns")
        XCTAssertEqual(cold.snapshot().subject, subject)
        let reads = store.reads
        let writes = store.writes
        for _ in 0..<100 {
            XCTAssertTrue(C15t.isAllowed(.marketing))
            XCTAssertEqual(C15t.decision(for: .marketing), .granted)
        }
        XCTAssertEqual(store.reads, reads)
        XCTAssertEqual(store.writes, writes)
        await cold.waitUntilIdle()
    }

    func testRepeatedAndConcurrentInstallKeepOneEngineAndNeverTouchTheSecondStore() throws {
        let store = CountingStore(InMemoryStore())
        let first = try C15tApple.install(configuration(store: store))
        let refused = CountingStore(InMemoryStore())
        refused.refuseWrites = true
        DispatchQueue.concurrentPerform(iterations: 20) { _ in
            XCTAssertTrue((try? C15tApple.install(self.configuration(store: refused))) === first)
        }
        XCTAssertEqual(refused.reads, 0)
        XCTAssertEqual(refused.writes, 0)
        XCTAssertTrue(C15t.current === first)
    }

    func testConcurrentColdInstallCreatesOneHydratedEngine() {
        let store = CountingStore(InMemoryStore())
        let instances = InstalledInstances()
        DispatchQueue.concurrentPerform(iterations: 20) { _ in
            do {
                let core = try C15tApple.install(self.configuration(store: store))
                XCTAssertTrue(core.isBootstrapped)
                XCTAssertNotNil(core.snapshot().subject, "hydration finished before return")
                instances.append(core)
            } catch { XCTFail("Concurrent install failed: \(error)") }
        }
        XCTAssertEqual(instances.values.count, 20)
        for instance in instances.values { XCTAssertTrue(instance === C15t.current) }
    }

    func testTrackingReadsPermissionChangesWithoutChangingConsent() async throws {
        let core = try C15tApple.install(configuration(store: InMemoryStore()))
        let status = TrackingStatus()
        let tracking = C15tTrackingController(
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
        XCTAssertEqual(C15tApple.version, C15tSDK.version)
    }

    func testHostedModesAcceptOnlyExactHTTPLoopbackHosts() async throws {
        for backend in ["http://localhost:8787", "http://127.0.0.1:8787", "http://[::1]:8787", "https://consent.example.com"] {
            for mode in [C15tAppleConfiguration.Transport.hosted(URL(string: backend)!), .selfHosted(URL(string: backend)!)] {
                let http = try FixtureHTTP()
                let configured = C15tAppleConfiguration(transport: mode, storage: .memory, initURL: URL(string: backend + "/custom-init"))
                let native = try XCTUnwrap(configured.makeTransport(client: http))
                let core = try C15tApple.install(configuration(store: InMemoryStore(), transport: native))
                XCTAssertTrue(core.isBootstrapped)
                await core.waitUntilIdle()
                let requestURL = try XCTUnwrap(http.requests.first?.url)
                XCTAssertEqual(requestURL.scheme, configured.initURL?.scheme)
                XCTAssertEqual(requestURL.host, configured.initURL?.host)
                XCTAssertEqual(requestURL.port, configured.initURL?.port)
                XCTAssertEqual(requestURL.path, configured.initURL?.path)
                C15tApple.shutdown()
                C15t.resetForTests()
            }
        }
    }

    func testNonLoopbackHTTPAndLookalikesRefuseInstallationBeforeStorage() throws {
        for backend in ["http://invalid.example", "http://localhost.evil.example", "http://localhost.", "http://127.0.0.1.evil.example", "http://127.0.0.2", "http://[::2]", "http://localhost@evil.example", "https://user:password@consent.example.com", "ftp://localhost", "/relative"] {
            for overrideInit in [false, true] {
                let store = CountingStore(InMemoryStore())
                let transport = HostedTransport(
                    baseURL: URL(string: overrideInit ? "https://consent.example.com" : backend)!,
                    initURL: overrideInit ? URL(string: backend)! : nil
                )
                XCTAssertThrowsError(try C15tApple.install(configuration(store: store, transport: transport)), backend) {
                    XCTAssertEqual($0 as? C15tAppleInstallationError, .invalidBackendURL)
                }
                XCTAssertNil(C15t.current, backend)
                XCTAssertEqual(store.writes, 0, backend)
                XCTAssertFalse(C15t.isAllowed(.marketing))
            }
        }
    }

    func testUnavailableProtectedStorageDoesNotPublishAnEngineAndCanRetry() throws {
        let store = CountingStore(InMemoryStore())
        store.refuseWrites = true
        XCTAssertThrowsError(try C15tApple.install(configuration(store: store))) {
            XCTAssertEqual($0 as? C15tAppleInstallationError, .protectedStorageUnavailable)
        }
        XCTAssertNil(C15t.current)
        XCTAssertFalse(C15t.isAllowed(.marketing))
        store.refuseWrites = false
        let core = try C15tApple.install(configuration(store: store))
        XCTAssertTrue(core.isBootstrapped)
        XCTAssertFalse(core.isAllowed(.marketing))
    }

    func testReadbackFailureAndProbeCleanupFailureRefuseInstallation() {
        for mode in ["read", "delete"] {
            let store = CountingStore(InMemoryStore())
            store.refuseReads = mode == "read"
            store.refuseDeletes = mode == "delete"
            XCTAssertThrowsError(try C15tApple.install(configuration(store: store)))
            XCTAssertNil(C15t.current)
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
        C15tApple.shutdown()
        C15t.resetForTests()
        let cold = try C15tApple.install(configuration(store: store))
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
        C15tApple.shutdown()
        C15t.resetForTests()

        store.failNextRead = StorageKey.subject
        XCTAssertThrowsError(try C15tApple.install(configuration(store: store))) {
            XCTAssertEqual($0 as? C15tAppleInstallationError, .protectedStorageUnavailable)
        }
        XCTAssertNil(C15t.current)
        XCTAssertEqual(keys.map { store.data(for: $0) }, original)

        let cold = try C15tApple.install(configuration(store: store))
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
            C15tApple.shutdown()
            C15t.resetForTests()

            store.failNextRead = failingKey
            XCTAssertThrowsError(try C15tApple.install(configuration(store: store))) {
                XCTAssertEqual($0 as? C15tAppleInstallationError, .protectedStorageUnavailable)
            }
            XCTAssertNil(C15t.current)
            XCTAssertEqual(keys.map { store.data(for: $0) }, original)

            let cold = try C15tApple.install(configuration(store: store))
            XCTAssertFalse(cold.isAllowed(.marketing))
            XCTAssertNil(cold.snapshot().explicitChoice)
            XCTAssertEqual(cold.pendingSaveCount(), 0)
            await cold.waitUntilIdle()
            C15tApple.shutdown()
            C15t.resetForTests()
        }
    }

    func testMalformedSubjectDropsOrphanedGrantAndQueue() async throws {
        let store = CountingStore(InMemoryStore())
        _ = try await grantedCore(store: store, keepQueued: true)
        store.set(Data("{truncated".utf8), for: StorageKey.subject)
        C15tApple.shutdown()
        C15t.resetForTests()
        let cold = try C15tApple.install(configuration(store: store))
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
        C15tApple.shutdown()
        C15t.resetForTests()
        XCTAssertThrowsError(try C15tApple.install(configuration(store: store)))
        XCTAssertNil(C15t.current)
        XCTAssertFalse(C15t.isAllowed(.marketing))
    }

    func testForegroundSubscriptionStopsAndReattachesOnce() async throws {
        let http = try FixtureHTTP()
        let core = try C15tApple.install(configuration(store: InMemoryStore(), transport: transport(http)))
        await core.waitUntilIdle()
        _ = try C15tApple.install(configuration(store: InMemoryStore()))
        let initial = http.requests.count
        NotificationCenter.default.post(name: C15tForegroundObserver.didBecomeActive, object: nil)
        await core.waitUntilIdle()
        XCTAssertEqual(http.requests.count, initial + 1)
        C15tApple.shutdown()
        C15tApple.shutdown()
        NotificationCenter.default.post(name: C15tForegroundObserver.didBecomeActive, object: nil)
        await core.waitUntilIdle()
        XCTAssertEqual(http.requests.count, initial + 1)
        XCTAssertTrue(C15tApple.attach(core))
        XCTAssertTrue(C15tApple.attach(core))
        NotificationCenter.default.post(name: C15tForegroundObserver.didBecomeActive, object: nil)
        await core.waitUntilIdle()
        XCTAssertEqual(http.requests.count, initial + 2)
    }

    func testHostedAndSelfHostedMetadataNamesNativeModulesOnEveryRequest() async throws {
        for mode in [C15tAppleConfiguration.Transport.hosted(URL(string: "https://consent.example.com")!), .selfHosted(URL(string: "https://consent.example.com")!)] {
            let http = try FixtureHTTP()
            let configured = C15tAppleConfiguration(transport: mode, initURL: URL(string: "https://init.example.com/custom"))
            let native = try XCTUnwrap(configured.makeTransport(client: http))
            _ = await native.performInit(InitContext(overrides: try JSONDecoder().decode(KernelOverridesWire.self, from: Data("{}".utf8)), user: nil, subjectId: "subject"))
            _ = await native.sendSave(Data("{}".utf8))
            _ = await native.patchIdentity(subjectId: "subject", externalId: "external", identityProvider: nil)
            XCTAssertEqual(http.requests.count, 3)
            XCTAssertEqual(http.requests.first?.url, configured.initURL)
            for request in http.requests {
                XCTAssertEqual(request.headers[C15tSDK.versionHeader], C15tSDK.version)
                XCTAssertEqual(request.headers["x-c15t-platform"], "apple->\(C15tApple.version)")
                XCTAssertFalse(request.headers.values.contains { $0.hasPrefix("rn->") })
            }
        }
    }

    func testInvalidProductionURLAndUnstartedAttachmentAreRefused() {
        XCTAssertThrowsError(try C15tApple.install(C15tAppleConfiguration(transport: .hosted(URL(string: "http://example.com")!))))
        XCTAssertFalse(C15tApple.attach(ConsentCore()))
        XCTAssertNil(C15t.current)
    }

    private func configuration(store: any ConsentStore, transport: (any C15tTransport)? = nil) -> CoreConfig {
        CoreConfig(store: store, transport: transport, consentCategories: [.necessary, .marketing, .measurement, .experience, .functionality], now: { 1_770_000_000_000 }, initRetry: .disabled, flushPendingOnBootstrap: false)
    }

    private func transport(_ http: FixtureHTTP) -> HostedTransport {
        HostedTransport(baseURL: URL(string: "https://consent.example.com")!, client: http)
    }

    private func grantedCore(store: any ConsentStore, keepQueued: Bool = false) async throws -> ConsentCore {
        let http = try FixtureHTTP(failSaves: keepQueued)
        let core = try C15tApple.install(configuration(store: store, transport: transport(http)))
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
        if refuseWrites || (data == nil && refuseDeletes) || (data == nil && refuseDeletesExceptProbe && key != "com.c15t.installation.probe") { return false }
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
        let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("../../../protocol/native-envelope-opt-in-grants.json")
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
    private var value: C15tTrackingPlatformStatus = .denied
    var current: C15tTrackingPlatformStatus {
        get { lock.lock(); defer { lock.unlock() }; return value }
        set { lock.lock(); defer { lock.unlock() }; value = newValue }
    }
}
