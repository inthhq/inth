@_spi(C15tInternal) @testable import C15tReactNativeBridge
@_spi(C15tInternal) import C15tCore
import XCTest

/// Event behaviour, and the rule that exactly one core is running.
final class C15tChangePumpTests: XCTestCase {
    func testOneSnapshotEventPerRevisionAndRepeatsAreDropped() {
        let sink = RecordingSink()
        let pump = C15tChangePump(sink: sink)

        pump.onSnapshot(ConsentSnapshot(revision: 1, policyPending: false))
        pump.onSnapshot(ConsentSnapshot(revision: 1, policyPending: false))
        pump.onSnapshot(ConsentSnapshot(revision: 2, policyPending: false))

        XCTAssertEqual(sink.payloads(for: "snapshot").count, 2)
        XCTAssertEqual(jsonObject(sink.payloads(for: "snapshot").last ?? "{}")["revision"] as? Int, 2)
    }

    func testInitializedFiresOnceAndNotWhilePolicyIsPending() {
        let sink = RecordingSink()
        let pump = C15tChangePump(sink: sink)

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
        C15tChangePump(sink: sink).onError(code: "unsupported-contract", message: "backend refused the wire")

        let payload = jsonObject(sink.payloads(for: "error").first ?? "{}")
        XCTAssertEqual(payload["code"] as? String, "unsupported-contract")
    }

    func testSubscriberReportsTheCoreCurrentSnapshotOnAttach() {
        let core = ConsentCore()
        core.bootstrap(CoreConfig(store: InMemoryStore()))
        let sink = RecordingSink()
        let subscriber = C15tCoreSubscriber(sink: sink)

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
        let subscriber = C15tCoreSubscriber(sink: sink)
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
final class C15tBootstrapTests: XCTestCase {
    override func setUp() {
        super.setUp()
        C15t.resetForTests()
    }

    override func tearDown() {
        C15tBuild.simulate(debug: nil)
        C15t.resetForTests()
        super.tearDown()
    }

    func testEmptyPlistHasNoProjectURLAndDoesNotStart() {
        let configuration = C15tBridgeConfiguration.from(infoPlist: [:])

        XCTAssertTrue(configuration.autoBootstrap, "automatic startup is the default")
        XCTAssertNil(configuration.backendURL, "a made-up host would send consent somewhere nobody chose")
        XCTAssertFalse(configuration.dryRun)
        XCTAssertEqual(configuration.storageMode, .keychain)
        XCTAssertFalse(configuration.overrides.language.isEmpty, "translations need exactly one language")

        let issue = configuration.configurationIssue()
        XCTAssertEqual(issue?.code, "C15T_CONFIGURATION_BACKEND_URL")
        XCTAssertTrue(
            issue?.message.hasPrefix(
                "com.c15t.backend.url must be the project URL from your Inth dashboard, such as "
                    + "https://your-project.inth.app. Got \"\": the value is empty.") == true,
            issue?.message ?? "")
        XCTAssertFalse(startWithoutNetwork(infoPlist: [C15tBridgeConfiguration.InfoPlistKey.storageMode: "memory"]))
        XCTAssertNil(C15t.current, "no project URL leaves the core uninstalled")
    }

    func testAProjectURLBuildsTheHostedTransportOnItsNormalForm() throws {
        var configuration = C15tBridgeConfiguration.from(infoPlist: [
            C15tBridgeConfiguration.InfoPlistKey.backendURL: " Your-Project.Inth.App/ ",
        ])
        configuration.storageMode = .memory
        XCTAssertNil(configuration.configurationIssue())

        let core = try XCTUnwrap(configuration.makeCoreConfiguration())
        let transport = try XCTUnwrap(core.transport as? HostedTransport)
        XCTAssertEqual(transport.baseURL, URL(string: "https://your-project.inth.app"))
        XCTAssertEqual(transport.domain, "your-project.inth.app")
        // ENG-530: a React Native app reports `rn`, not the Swift app's `apple`.
        XCTAssertEqual(transport.extraHeaders["x-c15t-platform"], "rn->\(C15t.version)")
        XCTAssertFalse(core.dryRun)
    }

    func testAHostThatIsNotAnInthProjectDoesNotStart() {
        for backend in ["https://consent.example.com", "http://localhost:8787", "https://your-project.inth.app/api"] {
            var configuration = memoryConfiguration()
            configuration.backendURL = backend
            XCTAssertEqual(configuration.configurationIssue()?.code, "C15T_CONFIGURATION_BACKEND_URL", backend)
            XCTAssertNil(configuration.makeCoreConfiguration(), backend)
            XCTAssertFalse(startMemoryCore(configuration), backend)
            XCTAssertNil(C15t.current, backend)
        }
    }

    func testDryRunIsReadFromThePlistAndRelaxesTheHostInADebugBuild() throws {
        var configuration = C15tBridgeConfiguration.from(infoPlist: [
            C15tBridgeConfiguration.InfoPlistKey.backendURL: "http://localhost:8787",
            C15tBridgeConfiguration.InfoPlistKey.dryRun: true,
        ])
        configuration.storageMode = .memory
        XCTAssertTrue(configuration.dryRun)
        XCTAssertNil(configuration.configurationIssue())
        XCTAssertTrue(try XCTUnwrap(configuration.makeCoreConfiguration()).dryRun)

        XCTAssertTrue(startMemoryCore(configuration))
        XCTAssertNotNil(C15t.current)
    }

    func testDryRunInAReleaseBuildDoesNotStart() {
        C15tBuild.simulate(debug: false)
        defer { C15tBuild.simulate(debug: nil) }
        var configuration = memoryConfiguration()
        configuration.dryRun = true

        let issue = configuration.configurationIssue()
        XCTAssertEqual(issue?.code, "C15T_CONFIGURATION_DRY_RUN")
        XCTAssertTrue(
            issue?.message.hasPrefix(
                "dryRun is for development and CI and cannot run in a release build. Remove dryRun "
                    + "(com.c15t.dryRun in Info.plist, or dryRun in the Expo plugin options).") == true,
            issue?.message ?? "")
        XCTAssertNil(configuration.makeCoreConfiguration())
        XCTAssertFalse(startMemoryCore(configuration))
        XCTAssertNil(C15t.current, "a refused dryRun leaves the core uninstalled")

        // The same build starts once dryRun is gone.
        configuration.dryRun = false
        XCTAssertTrue(startMemoryCore(configuration))
    }

    func testRetiredBackendKeysRefuseTheLaunchAndNameTheReplacement() {
        let expected: [(key: String, value: String, says: [String])] = [
            ("com.c15t.backend.mode", "hosted", ["Hosted is the only mode", "com.c15t.backend.url"]),
            ("com.c15t.backend.mode", "self-hosted", ["Mobile works only with Inth"]),
            ("com.c15t.backend.mode", "offline", ["com.c15t.dryRun"]),
            ("com.c15t.backend.mode", "none", ["com.c15t.reactnative.AutoBootstrap"]),
            ("com.c15t.backend.initUrl", "https://app.example.com/init", ["Policy is fetched from com.c15t.backend.url"]),
        ]
        for (key, value, says) in expected {
            let plist: [String: Any] = [
                C15tBridgeConfiguration.InfoPlistKey.backendURL: testProjectURL,
                C15tBridgeConfiguration.InfoPlistKey.storageMode: "memory",
                key: value,
            ]
            XCTAssertEqual(C15tBridgeConfiguration.retiredKeys(in: plist).map(\.key), [key])
            guard let issue = C15tBridgeConfiguration.retirementIssue(in: plist) else {
                XCTFail("\(key) must produce a readable refusal")
                continue
            }
            XCTAssertEqual(issue.code, "C15T_CONFIGURATION_RETIRED")
            XCTAssertTrue(issue.message.contains(key), "name the key: \(issue.message)")
            for phrase in says {
                XCTAssertTrue(issue.message.contains(phrase), "\(key)=\(value) should say \"\(phrase)\": \(issue.message)")
            }
            XCTAssertFalse(startWithoutNetwork(infoPlist: plist), key)
            XCTAssertNil(C15t.current, key)
        }
    }

    func testUnreadableValuesFallBackToTheSafeOption() {
        let configuration = C15tBridgeConfiguration.from(infoPlist: [
            C15tBridgeConfiguration.InfoPlistKey.storageMode: "nonsense",
            C15tBridgeConfiguration.InfoPlistKey.categories: ["marketing", "telepathy"],
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
        let keyed = C15tBridgeConfiguration.from(infoPlist: [
            C15tBridgeConfiguration.InfoPlistKey.backendURL: testProjectURL,
            C15tBridgeConfiguration.InfoPlistKey.vendors: "755, 42,8, 42",
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
        XCTAssertEqual(C15tBridgeConfiguration.declaredVendors(42), [42])
        XCTAssertEqual(C15tBridgeConfiguration.declaredVendors([42, 8]), [42, 8])
        XCTAssertEqual(C15tBridgeConfiguration.declaredVendors(["42, 8", "755"]), [42, 8, 755])

        // An id the served list does not carry stays in the declaration: pruning a served
        // document never adds an entry to satisfy a scope.
        XCTAssertEqual(C15tBridgeConfiguration.declaredVendors("999999,42"), [999_999, 42])
    }

    func testAnUnusableVendorDeclarationIsNotAScope() throws {
        // "vendor-42" and 0 are the typos this exists for: trusting either would name a
        // disclosure the framework never assigned, or none at all. Absent and empty both
        // read as no scope, which keeps every vendor the backend serves.
        for raw: Any? in ["", "   ", " , , ", "vendor-42", "0", "-3, 7.5", "vendor, google"] {
            XCTAssertNil(C15tBridgeConfiguration.declaredVendors(raw), "\(String(describing: raw)) is not a scope")
        }

        let configuration = C15tBridgeConfiguration.from(infoPlist: [
            C15tBridgeConfiguration.InfoPlistKey.backendURL: testProjectURL,
            C15tBridgeConfiguration.InfoPlistKey.vendors: "vendor-42",
        ])
        XCTAssertNil(configuration.vendors)
        var unusableIntoCore = configuration
        unusableIntoCore.storageMode = .memory
        XCTAssertNil(try XCTUnwrap(unusableIntoCore.makeCoreConfiguration()).vendors)
    }

    func testStartInstallsOneCoreAndLaterCallsAttachToIt() {
        XCTAssertNil(C15t.current)
        XCTAssertTrue(startMemoryCore())

        guard let first = C15t.current else { return XCTFail("expected a running core") }
        XCTAssertTrue(startMemoryCore())

        XCTAssertTrue(C15t.current === first, "a second start must attach, not install a second kernel")
        XCTAssertTrue(C15tReactNativeBootstrap.isRunning)
    }

    func testAnAppOwnedCoreIsAdoptedInsteadOfStartingAnother() {
        let appCore = ConsentCore()
        appCore.bootstrap(CoreConfig(store: InMemoryStore()))

        XCTAssertTrue(C15tReactNativeBootstrap.install(appCore))
        XCTAssertTrue(startMemoryCore())
        XCTAssertTrue(C15t.current === appCore, "the bridge reads the core the app started")
    }

    func testAutoBootstrapOptOutLeavesReadsDenyAll() {
        var configuration = memoryConfiguration()
        configuration.autoBootstrap = false

        XCTAssertFalse(startMemoryCore(configuration))
        XCTAssertNil(C15t.current)
        // Failing closed rather than inventing a store is what the contract asks for.
        let snapshot = C15t.snapshot()
        XCTAssertFalse(snapshot.ready)
        XCTAssertTrue(snapshot.policyPending)
        XCTAssertEqual(snapshot.effectivePermissions.marketing, false)
    }

    func testStartHonoursThePlistOptOutKey() {
        XCTAssertFalse(C15tReactNativeBootstrap.start(infoPlist: [
            C15tBridgeConfiguration.InfoPlistKey.autoBootstrap: false,
        ]))
        XCTAssertNil(C15t.current)
    }

    func testMemoryStoreIsUsedWhenConfigured() {
        let store = memoryConfiguration().makeStore()
        XCTAssertTrue(store is InMemoryStore)
    }
    func testARetiredTestModeKeyRefusesTheLaunch() {
        // `com.c15t.test` set an override that does not exist. Starting anyway would
        // run a core whose configuration is a guess, and the host would keep believing
        // a mode was on. Deny-all plus one readable reason is the honest answer.
        let plist: [String: Any] = [
            C15tBridgeConfiguration.InfoPlistKey.backendURL: "https://example.eu.c15t.app",
            "com.c15t.test": "gpc",
        ]

        let retired = C15tBridgeConfiguration.retiredKeys(in: plist)
        XCTAssertEqual(retired.map(\.key), ["com.c15t.test"])

        guard let issue = C15tBridgeConfiguration.retirementIssue(in: plist) else {
            return XCTFail("a retired key must produce a readable refusal")
        }
        XCTAssertEqual(issue.code, "C15T_CONFIGURATION_RETIRED")
        XCTAssertTrue(issue.message.contains("com.c15t.test"), "name the key: \(issue.message)")
        XCTAssertTrue(issue.message.contains("com.c15t.forceGPC"), "name the key to use instead: \(issue.message)")
        XCTAssertFalse(
            C15tReactNativeBootstrap.start(infoPlist: plist),
            "the core must not start from a configuration this build cannot read"
        )
        XCTAssertNil(C15t.current, "and nothing may be installed behind the refusal")
    }

    func testAGPCKeyIsADetectedSignalAndNeverAnOverride() {
        // The two collapse into one field if the plist key feeds both, which is the
        // distinction the contract keeps apart and the evaluator depends on.
        let configuration = C15tBridgeConfiguration.from(infoPlist: [
            C15tBridgeConfiguration.InfoPlistKey.forceGPC: true,
        ])

        XCTAssertEqual(configuration.gpc, true, "the host reported a signal")
        XCTAssertNil(configuration.overrides.gpc, "which is not an override")
    }

    func testAPlistWithoutRetiredKeysIsValid() {
        let plist: [String: Any] = [
            C15tBridgeConfiguration.InfoPlistKey.backendURL: "https://example.eu.c15t.app",
            C15tBridgeConfiguration.InfoPlistKey.forceGPC: true,
            C15tBridgeConfiguration.InfoPlistKey.language: "de",
        ]

        XCTAssertTrue(C15tBridgeConfiguration.retiredKeys(in: plist).isEmpty)
        XCTAssertNil(C15tBridgeConfiguration.retirementIssue(in: plist))
    }

}
