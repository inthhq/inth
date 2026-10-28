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
