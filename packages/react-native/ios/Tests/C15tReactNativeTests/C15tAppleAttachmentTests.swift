import Darwin
@_spi(C15tInternal) import C15tApple
@_spi(C15tInternal) import C15tCore
@_spi(C15tInternal) import C15tReactNativeBridge
import XCTest

final class C15tAppleAttachmentTests: XCTestCase {
    override func tearDown() {
        C15tApple.shutdown()
        C15t.resetForTests()
        super.tearDown()
    }

    func testDryRunLoopbackHTTPInstallsBeforeJavaScript() {
        C15tApple.shutdown()
        C15t.resetForTests()
        // dryRun in a debug build is how a developer points the app at a local backend.
        let infoPlist: [String: Any] = [
            "com.c15t.dryRun": true,
            "com.c15t.backend.url": "http://localhost:8787",
            C15tBridgeConfiguration.InfoPlistKey.storageMode: "memory"
        ]
        let configuration = C15tBridgeConfiguration.from(infoPlist: infoPlist)
        XCTAssertEqual(configuration.storageMode, .memory)
        guard configuration.storageMode == .memory else { return }
        XCTAssertTrue(C15tReactNativeBootstrap.start(infoPlist: infoPlist))
        XCTAssertTrue(C15t.current?.isBootstrapped == true)
        XCTAssertFalse(C15t.isAllowed(.marketing))
    }

    func testInvalidBackendURLLogsTheStartupRefusal() throws {
        C15tApple.shutdown()
        C15t.resetForTests()
        let configuration = C15tBridgeConfiguration.from(infoPlist: [
            "com.c15t.backend.url": "http://invalid.example",
            C15tBridgeConfiguration.InfoPlistKey.storageMode: "memory"
        ])
        XCTAssertEqual(configuration.storageMode, .memory)
        guard configuration.storageMode == .memory else { return }
        let pipe = Pipe()
        let original = dup(STDERR_FILENO)
        XCTAssertGreaterThanOrEqual(original, 0)
        guard original >= 0 else { return }
        fflush(stderr)
        dup2(pipe.fileHandleForWriting.fileDescriptor, STDERR_FILENO)
        let started = C15tReactNativeBootstrap.start(configuration: configuration)
        fflush(stderr)
        dup2(original, STDERR_FILENO)
        close(original)
        try pipe.fileHandleForWriting.close()
        let diagnostic = String(decoding: pipe.fileHandleForReading.readDataToEndOfFile(), as: UTF8.self)
        XCTAssertFalse(started)
        XCTAssertNil(C15t.current)
        XCTAssertTrue(
            diagnostic.contains(
                "com.c15t.backend.url must be the project URL from your Inth dashboard, such as "
                    + "https://your-project.inth.app. Got \"http://invalid.example\": the scheme must be https."),
            diagnostic)
        XCTAssertEqual(configuration.configurationIssue()?.code, "C15T_CONFIGURATION_BACKEND_URL")
    }

    func testRNUsesTheEngineHydratedByTheStandaloneInstaller() throws {
        C15tApple.shutdown()
        C15t.resetForTests()
        let core = try C15tApple.install(CoreConfig(store: InMemoryStore()))
        let handler = C15tModuleHandler(startCore: {
            XCTFail("RN must attach without another bootstrap")
            return false
        })
        XCTAssertTrue(handler.ensureCore())
        XCTAssertTrue(C15t.current === core)
        let payload = jsonObject(handler.snapshotPayload())
        XCTAssertEqual((payload["subject"] as? [String: Any])?["subjectId"] as? String, core.snapshot().subject?.id)
        XCTAssertFalse(core.isAllowed(.marketing))
        XCTAssertTrue(C15tReactNativeBootstrap.install(core))
        XCTAssertTrue(C15t.current === core)
    }
}
