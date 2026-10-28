import Darwin
import C15tApple
import C15tCore
import C15tReactNativeBridge
import XCTest

final class C15tAppleAttachmentTests: XCTestCase {
    override func tearDown() {
        C15tApple.shutdown()
        C15t.resetForTests()
        super.tearDown()
    }

    func testInfoPlistLoopbackHTTPInstallsBeforeJavaScript() {
        C15tApple.shutdown()
        C15t.resetForTests()
        XCTAssertTrue(C15tReactNativeBootstrap.start(infoPlist: [
            "com.c15t.backend.mode": "self-hosted",
            "com.c15t.backend.url": "http://localhost:8787",
            "com.c15t.storage.mode": "memory"
        ]))
        XCTAssertTrue(C15t.current?.isBootstrapped == true)
        XCTAssertFalse(C15t.isAllowed(.marketing))
    }

    func testInvalidBackendURLLogsTheStartupRefusal() throws {
        C15tApple.shutdown()
        C15t.resetForTests()
        let configuration = C15tBridgeConfiguration.from(infoPlist: [
            "com.c15t.backend.mode": "hosted",
            "com.c15t.backend.url": "http://invalid.example",
            "com.c15t.storage.mode": "memory"
        ])
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
        XCTAssertTrue(diagnostic.contains("Apple installation failed"), diagnostic)
        XCTAssertTrue(diagnostic.contains("invalidBackendURL"), diagnostic)
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
