@_spi(InthInternal) @testable import InthReactNativeBridge
@_spi(InthInternal) import InthCore
import XCTest

/// Event behaviour, and the rule that exactly one core is running.
final class InthChangePumpTests: XCTestCase {
    func testOneSnapshotEventPerRevisionAndRepeatsAreDropped() {
        let sink = RecordingSink()
        let pump = InthChangePump(sink: sink)

        pump.onSnapshot(ConsentSnapshot(revision: 1, policyPending: false))
        pump.onSnapshot(ConsentSnapshot(revision: 1, policyPending: false))
        pump.onSnapshot(ConsentSnapshot(revision: 2, policyPending: false))

        XCTAssertEqual(sink.payloads(for: "snapshot").count, 2)
        XCTAssertEqual(jsonObject(sink.payloads(for: "snapshot").last ?? "{}")["revision"] as? Int, 2)
    }

    func testInitializedFiresOnceAndNotWhilePolicyIsPending() {
        let sink = RecordingSink()
        let pump = InthChangePump(sink: sink)

        // A cold start publishes, but nothing has resolved, so the app must not be
        // told it is initialized.
        pump.onSnapshot(ConsentSnapshot(revision: 1, policyPending: true))
        XCTAssertEqual(sink.events.filter { $0 == "initialized" }.count, 0)

        pump.onSnapshot(ConsentSnapshot(revision: 2, policyPending: false))
        pump.onSnapshot(ConsentSnapshot(revision: 3, policyPending: false))
        XCTAssertEqual(sink.events.filter { $0 == "initialized" }.count, 1, "a one-shot announcement")
    }

    func testErrorEventCarriesCodeAndMessage() {
        let sink = RecordingSink()
        InthChangePump(sink: sink).onError(code: "save-rejected", message: "HTTP 422 invalid_request")

        let payload = jsonObject(sink.payloads(for: "error").first ?? "{}")
        XCTAssertEqual(payload["code"] as? String, "save-rejected")
    }

    func testSubscriberReportsTheCoreCurrentSnapshotOnAttach() {
        let core = ConsentCore()
        core.bootstrap(CoreConfig(store: InMemoryStore()))
        let sink = RecordingSink()
        let subscriber = InthCoreSubscriber(sink: sink)

        // Attaching after bootstrap must not lose the state the core already
        // published, so it reports the live snapshot once.
        subscriber.attach(to: core)
        XCTAssertEqual(sink.payloads(for: "snapshot").count, 1)
        XCTAssertEqual(
            jsonObject(sink.payloads(for: "snapshot").first ?? "{}")["revision"] as? Int,
            core.snapshot().revision
        )

        // Attaching twice must not double-report or double-subscribe.
        subscriber.attach(to: core)
        XCTAssertEqual(sink.payloads(for: "snapshot").count, 1)

        subscriber.detach()
    }

    func testSubscriberStopsDeliveringAfterDetach() {
        let core = ConsentCore()
        core.bootstrap(CoreConfig(store: InMemoryStore()))
        let sink = RecordingSink()
        let subscriber = InthCoreSubscriber(sink: sink)
        subscriber.attach(to: core)
        subscriber.detach()
        // Attaching reports the live snapshot once, so compare against what detach
        // left behind rather than against zero.
        let emittedBeforeDetach = sink.events.count
        XCTAssertGreaterThan(emittedBeforeDetach, 0)

        // `dismissNotice` publishes a revision without needing a resolved policy, so
        // it is a cheap way to prove the observer really went away.
        core.dismissNotice()
        XCTAssertEqual(
            sink.events.count, emittedBeforeDetach,
            "a detached subscriber must not emit: \(sink.events)"
        )
    }
}

/// The launch configuration, and the one-core rule the bridge exists to enforce.
final class InthBootstrapTests: XCTestCase {
    override func setUp() {
        super.setUp()
        Inth.resetForTests()
    }

    override func tearDown() {
        InthBuild.simulate(debug: nil)
        Inth.resetForTests()
        super.tearDown()
    }

    func testEmptyPlistHasNoProjectURLAndDoesNotStart() {
        let configuration = InthBridgeConfiguration.from(infoPlist: [:])

        XCTAssertTrue(configuration.autoBootstrap, "automatic startup is the default")
        XCTAssertNil(configuration.backendURL, "a made-up host would send consent somewhere nobody chose")
        XCTAssertFalse(configuration.dryRun)
        XCTAssertEqual(configuration.storageMode, .keychain)
        XCTAssertFalse(configuration.overrides.language.isEmpty, "translations need exactly one language")

        let issue = configuration.configurationIssue()
        XCTAssertEqual(issue?.code, "INTH_CONFIGURATION_BACKEND_URL")
        XCTAssertTrue(
            issue?.message.hasPrefix(
                "com.inth.backend.url must be the project URL from your Inth dashboard, such as "
                    + "https://your-project.inth.app. Got \"\": the value is empty.") == true,
            issue?.message ?? "")
        XCTAssertFalse(startWithoutNetwork(infoPlist: [InthBridgeConfiguration.InfoPlistKey.storageMode: "memory"]))
        XCTAssertNil(Inth.current, "no project URL leaves the core uninstalled")
    }

    func testAProjectURLBuildsTheHostedTransportOnItsNormalForm() throws {
        var configuration = InthBridgeConfiguration.from(infoPlist: [
            InthBridgeConfiguration.InfoPlistKey.backendURL: " Your-Project.Inth.App/ ",
        ])
        configuration.storageMode = .memory
        XCTAssertNil(configuration.configurationIssue())

        let core = try XCTUnwrap(configuration.makeCoreConfiguration())
        let transport = try XCTUnwrap(core.transport as? HostedTransport)
        XCTAssertEqual(transport.baseURL, URL(string: "https://your-project.inth.app"))
        // No `com.inth.backend.property`: records name the app's bundle identifier.
        XCTAssertEqual(transport.property, (Bundle.main.bundleIdentifier ?? "your-project.inth.app").lowercased())
        // ENG-530: a React Native app reports `rn`, not the Swift app's `apple`.
        XCTAssertEqual(transport.extraHeaders["x-inth-platform"], "rn->\(Inth.version)")
        XCTAssertFalse(core.dryRun)
    }

    func testADeclaredPropertyReachesTheTransportLowercased() throws {
        var configuration = InthBridgeConfiguration.from(infoPlist: [
            InthBridgeConfiguration.InfoPlistKey.backendURL: testProjectURL,
            "com.inth.backend.property": "Com.Acme.App",
        ])
        configuration.storageMode = .memory

        let core = try XCTUnwrap(configuration.makeCoreConfiguration())
        let transport = try XCTUnwrap(core.transport as? HostedTransport)
        XCTAssertEqual(transport.property, "com.acme.app")
    }

    func testAHostThatIsNotAnInthProjectDoesNotStart() {
        for backend in ["https://consent.example.com", "http://localhost:8787", "https://your-project.inth.app/api"] {
            var configuration = memoryConfiguration()
            configuration.backendURL = backend
            XCTAssertEqual(configuration.configurationIssue()?.code, "INTH_CONFIGURATION_BACKEND_URL", backend)
            XCTAssertNil(configuration.makeCoreConfiguration(), backend)
            XCTAssertFalse(startMemoryCore(configuration), backend)
            XCTAssertNil(Inth.current, backend)
        }
    }

    func testDryRunIsReadFromThePlistAndRelaxesTheHostInADebugBuild() throws {
        var configuration = InthBridgeConfiguration.from(infoPlist: [
            InthBridgeConfiguration.InfoPlistKey.backendURL: "http://localhost:8787",
            InthBridgeConfiguration.InfoPlistKey.dryRun: true,
        ])
        configuration.storageMode = .memory
        XCTAssertTrue(configuration.dryRun)
        XCTAssertNil(configuration.configurationIssue())
        XCTAssertTrue(try XCTUnwrap(configuration.makeCoreConfiguration()).dryRun)

        XCTAssertTrue(startMemoryCore(configuration))
        XCTAssertNotNil(Inth.current)
    }

    func testDryRunInAReleaseBuildDoesNotStart() {
        InthBuild.simulate(debug: false)
        defer { InthBuild.simulate(debug: nil) }
        var configuration = memoryConfiguration()
        configuration.dryRun = true

        let issue = configuration.configurationIssue()
        XCTAssertEqual(issue?.code, "INTH_CONFIGURATION_DRY_RUN")
        XCTAssertTrue(
            issue?.message.hasPrefix(
                "dryRun is for development and CI and cannot run in a release build. Remove dryRun "
                    + "(com.inth.dryRun in Info.plist, or dryRun in the Expo plugin options).") == true,
            issue?.message ?? "")
        XCTAssertNil(configuration.makeCoreConfiguration())
        XCTAssertFalse(startMemoryCore(configuration))
        XCTAssertNil(Inth.current, "a refused dryRun leaves the core uninstalled")

        // The same build starts once dryRun is gone.
        configuration.dryRun = false
        XCTAssertTrue(startMemoryCore(configuration))
    }

    func testRetiredBackendKeysRefuseTheLaunchAndNameTheReplacement() {
        let expected: [(key: String, value: String, says: [String])] = [
            ("com.inth.backend.mode", "hosted", ["Hosted is the only mode", "com.inth.backend.url"]),
            ("com.inth.backend.mode", "self-hosted", ["Mobile works only with Inth"]),
            ("com.inth.backend.mode", "offline", ["com.inth.dryRun"]),
            ("com.inth.backend.mode", "none", ["com.inth.reactnative.AutoBootstrap"]),
            ("com.inth.backend.initUrl", "https://app.example.com/init", ["Policy is fetched from com.inth.backend.url"]),
        ]
        for (key, value, says) in expected {
            let plist: [String: Any] = [
                InthBridgeConfiguration.InfoPlistKey.backendURL: testProjectURL,
                InthBridgeConfiguration.InfoPlistKey.storageMode: "memory",
                key: value,
            ]
            XCTAssertEqual(InthBridgeConfiguration.retiredKeys(in: plist).map(\.key), [key])
            guard let issue = InthBridgeConfiguration.retirementIssue(in: plist) else {
                XCTFail("\(key) must produce a readable refusal")
                continue
            }
            XCTAssertEqual(issue.code, "INTH_CONFIGURATION_RETIRED")
            XCTAssertTrue(issue.message.contains(key), "name the key: \(issue.message)")
            for phrase in says {
                XCTAssertTrue(issue.message.contains(phrase), "\(key)=\(value) should say \"\(phrase)\": \(issue.message)")
            }
            XCTAssertFalse(startWithoutNetwork(infoPlist: plist), key)
            XCTAssertNil(Inth.current, key)
        }
    }

    func testUnreadableValuesFallBackToTheSafeOption() {
        let configuration = InthBridgeConfiguration.from(infoPlist: [
            InthBridgeConfiguration.InfoPlistKey.storageMode: "nonsense",
            InthBridgeConfiguration.InfoPlistKey.categories: ["marketing", "telepathy"],
        ])

        XCTAssertEqual(configuration.storageMode, .keychain, "an unparseable store must not become plaintext")
        XCTAssertEqual(configuration.consentCategories, [.marketing], "unknown categories are dropped, not trusted")
    }

    /// The declared vendor scope, from `Info.plist` entry to ``CoreConfig/vendors``.
    ///
    /// The plugin writes one comma-separated string on both platforms, and a host also
    /// types the key into a plist by hand. A reader that honoured only the plugin's shape
    /// would silently ignore the hand-written one, so the shapes below are the ones a
    /// shipping app can actually arrive with. The cases mirror
    /// `DeclaredVendorsTest` on Android id for id, because a scope that prunes on one
    /// platform and not the other is a disclosure bug that only shows up in production:
    /// spaces around an id are decoration, an entry that is not a positive whole number
    /// is dropped rather than trusted, repeats collapse, and nothing usable is not a
    /// declaration at all.
    func testDeclaredVendorsParseFromEveryShapeAHostCanWrite() throws {
        let keyed = InthBridgeConfiguration.from(infoPlist: [
            InthBridgeConfiguration.InfoPlistKey.backendURL: testProjectURL,
            InthBridgeConfiguration.InfoPlistKey.vendors: "755, 42,8, 42",
        ])
        XCTAssertEqual(keyed.vendors, [755, 42, 8], "declaration order, spaces trimmed, repeats dropped")
        // `.memory` so the assertion does not depend on a Keychain being available on
        // the machine running this; every other field rides through unchanged.
        var intoCore = keyed
        intoCore.storageMode = .memory
        XCTAssertEqual(
            try XCTUnwrap(intoCore.makeCoreConfiguration()).vendors,
            [755, 42, 8],
            "the declaration reaches the core that prunes with it"
        )

        // An unquoted plist number is the likeliest hand-written spelling for one
        // partner, and an array is what a host copying the categories key would expect.
        XCTAssertEqual(InthBridgeConfiguration.declaredVendors(42), [42])
        XCTAssertEqual(InthBridgeConfiguration.declaredVendors([42, 8]), [42, 8])
        XCTAssertEqual(InthBridgeConfiguration.declaredVendors(["42, 8", "755"]), [42, 8, 755])

        // An id the served list does not carry stays in the declaration: pruning a served
        // document never adds an entry to satisfy a scope.
        XCTAssertEqual(InthBridgeConfiguration.declaredVendors("999999,42"), [999_999, 42])
    }

    func testAnUnusableVendorDeclarationIsNotAScope() throws {
        // "vendor-42" and 0 are the typos this exists for: trusting either would name a
        // disclosure the framework never assigned, or none at all. Absent and empty both
        // read as no scope, which keeps every vendor the backend serves.
        for raw: Any? in ["", "   ", " , , ", "vendor-42", "0", "-3, 7.5", "vendor, google"] {
            XCTAssertNil(InthBridgeConfiguration.declaredVendors(raw), "\(String(describing: raw)) is not a scope")
        }

        let configuration = InthBridgeConfiguration.from(infoPlist: [
            InthBridgeConfiguration.InfoPlistKey.backendURL: testProjectURL,
            InthBridgeConfiguration.InfoPlistKey.vendors: "vendor-42",
        ])
        XCTAssertNil(configuration.vendors)
        var unusableIntoCore = configuration
        unusableIntoCore.storageMode = .memory
        XCTAssertNil(try XCTUnwrap(unusableIntoCore.makeCoreConfiguration()).vendors)
    }

    func testStartInstallsOneCoreAndLaterCallsAttachToIt() {
        XCTAssertNil(Inth.current)
        XCTAssertTrue(startMemoryCore())

        guard let first = Inth.current else { return XCTFail("expected a running core") }
        XCTAssertTrue(startMemoryCore())

        XCTAssertTrue(Inth.current === first, "a second start must attach, not install a second kernel")
        XCTAssertTrue(InthReactNativeBootstrap.isRunning)
    }

    func testAnAppOwnedCoreIsAdoptedInsteadOfStartingAnother() {
        let appCore = ConsentCore()
        appCore.bootstrap(CoreConfig(store: InMemoryStore()))

        XCTAssertTrue(InthReactNativeBootstrap.install(appCore))
        XCTAssertTrue(startMemoryCore())
        XCTAssertTrue(Inth.current === appCore, "the bridge reads the core the app started")
    }

    func testAutoBootstrapOptOutLeavesReadsDenyAll() {
        var configuration = memoryConfiguration()
        configuration.autoBootstrap = false

        XCTAssertFalse(startMemoryCore(configuration))
        XCTAssertNil(Inth.current)
        // Failing closed rather than inventing a store is what the contract asks for.
        let snapshot = Inth.snapshot()
        XCTAssertFalse(snapshot.ready)
        XCTAssertTrue(snapshot.policyPending)
        XCTAssertEqual(snapshot.effectivePermissions.marketing, false)
    }

    func testStartHonoursThePlistOptOutKey() {
        XCTAssertFalse(InthReactNativeBootstrap.start(infoPlist: [
            InthBridgeConfiguration.InfoPlistKey.autoBootstrap: false,
        ]))
        XCTAssertNil(Inth.current)
    }

    func testMemoryStoreIsUsedWhenConfigured() {
        let store = memoryConfiguration().makeStore()
        XCTAssertTrue(store is InMemoryStore)
    }
    func testARetiredTestModeKeyRefusesTheLaunch() {
        // `com.inth.test` set an override that does not exist. Starting anyway would
        // run a core whose configuration is a guess, and the host would keep believing
        // a mode was on. Deny-all plus one readable reason is the honest answer.
        let plist: [String: Any] = [
            InthBridgeConfiguration.InfoPlistKey.backendURL: "https://example.eu.c15t.app",
            "com.inth.test": "gpc",
        ]

        let retired = InthBridgeConfiguration.retiredKeys(in: plist)
        XCTAssertEqual(retired.map(\.key), ["com.inth.test"])

        guard let issue = InthBridgeConfiguration.retirementIssue(in: plist) else {
            return XCTFail("a retired key must produce a readable refusal")
        }
        XCTAssertEqual(issue.code, "INTH_CONFIGURATION_RETIRED")
        XCTAssertTrue(issue.message.contains("com.inth.test"), "name the key: \(issue.message)")
        XCTAssertTrue(issue.message.contains("com.inth.forceGPC"), "name the key to use instead: \(issue.message)")
        XCTAssertFalse(
            InthReactNativeBootstrap.start(infoPlist: plist),
            "the core must not start from a configuration this build cannot read"
        )
        XCTAssertNil(Inth.current, "and nothing may be installed behind the refusal")
    }

    func testAGPCKeyIsADetectedSignalAndNeverAnOverride() {
        // The two collapse into one field if the plist key feeds both, which is the
        // distinction the contract keeps apart and the evaluator depends on.
        let configuration = InthBridgeConfiguration.from(infoPlist: [
            InthBridgeConfiguration.InfoPlistKey.forceGPC: true,
        ])

        XCTAssertEqual(configuration.gpc, true, "the host reported a signal")
        XCTAssertNil(configuration.overrides.gpc, "which is not an override")
    }

    func testAPlistWithoutRetiredKeysIsValid() {
        let plist: [String: Any] = [
            InthBridgeConfiguration.InfoPlistKey.backendURL: "https://example.eu.c15t.app",
            InthBridgeConfiguration.InfoPlistKey.forceGPC: true,
            InthBridgeConfiguration.InfoPlistKey.language: "de",
        ]

        XCTAssertTrue(InthBridgeConfiguration.retiredKeys(in: plist).isEmpty)
        XCTAssertNil(InthBridgeConfiguration.retirementIssue(in: plist))
    }

}
