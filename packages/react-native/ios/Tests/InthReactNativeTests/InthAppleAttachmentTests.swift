import Darwin
@_spi(InthInternal) import InthApple
@_spi(InthInternal) import InthCore
@_spi(InthInternal) import InthReactNativeBridge
import XCTest

final class InthAppleAttachmentTests: XCTestCase {
    override func tearDown() {
        InthApple.shutdown()
        Inth.resetForTests()
        super.tearDown()
    }

    func testDryRunLoopbackHTTPInstallsBeforeJavaScript() {
        InthApple.shutdown()
        Inth.resetForTests()
        // dryRun in a debug build is how a developer points the app at a local backend.
        let infoPlist: [String: Any] = [
            "com.inth.dryRun": true,
            "com.inth.backend.url": "http://localhost:8787",
            InthBridgeConfiguration.InfoPlistKey.storageMode: "memory"
        ]
        let configuration = InthBridgeConfiguration.from(infoPlist: infoPlist)
        XCTAssertEqual(configuration.storageMode, .memory)
        guard configuration.storageMode == .memory else { return }
        XCTAssertTrue(InthReactNativeBootstrap.start(infoPlist: infoPlist))
        XCTAssertTrue(Inth.current?.isBootstrapped == true)
        XCTAssertFalse(Inth.isAllowed(.marketing))
    }

    func testInvalidBackendURLLogsTheStartupRefusal() throws {
        InthApple.shutdown()
        Inth.resetForTests()
        let configuration = InthBridgeConfiguration.from(infoPlist: [
            "com.inth.backend.url": "http://invalid.example",
            InthBridgeConfiguration.InfoPlistKey.storageMode: "memory"
        ])
        XCTAssertEqual(configuration.storageMode, .memory)
        guard configuration.storageMode == .memory else { return }
        let pipe = Pipe()
        let original = dup(STDERR_FILENO)
        XCTAssertGreaterThanOrEqual(original, 0)
        guard original >= 0 else { return }
        fflush(stderr)
        dup2(pipe.fileHandleForWriting.fileDescriptor, STDERR_FILENO)
        let started = InthReactNativeBootstrap.start(configuration: configuration)
        fflush(stderr)
        dup2(original, STDERR_FILENO)
        close(original)
        try pipe.fileHandleForWriting.close()
        let diagnostic = String(decoding: pipe.fileHandleForReading.readDataToEndOfFile(), as: UTF8.self)
        XCTAssertFalse(started)
        XCTAssertNil(Inth.current)
        XCTAssertTrue(
            diagnostic.contains(
                "com.inth.backend.url must be the project URL from your Inth dashboard, such as "
                    + "https://your-project.inth.app. Got \"http://invalid.example\": the scheme must be https."),
            diagnostic)
        XCTAssertEqual(configuration.configurationIssue()?.code, "INTH_CONFIGURATION_BACKEND_URL")
    }

    func testRNUsesTheEngineHydratedByTheStandaloneInstaller() throws {
        InthApple.shutdown()
        Inth.resetForTests()
        let core = try InthApple.install(CoreConfig(store: InMemoryStore()))
        let handler = InthModuleHandler(startCore: {
            XCTFail("RN must attach without another bootstrap")
            return false
        })
        XCTAssertTrue(handler.ensureCore())
        XCTAssertTrue(Inth.current === core)
        let payload = jsonObject(handler.snapshotPayload())
        XCTAssertEqual((payload["subject"] as? [String: Any])?["subjectId"] as? String, core.snapshot().subject?.id)
        XCTAssertFalse(core.isAllowed(.marketing))
        XCTAssertTrue(InthReactNativeBootstrap.install(core))
        XCTAssertTrue(Inth.current === core)
    }
}
