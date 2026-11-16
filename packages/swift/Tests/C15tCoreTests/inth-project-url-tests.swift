import Foundation
import XCTest

@_spi(C15tInternal) @testable import C15tCore

/// The project URL rule, driven by the fixture the Kotlin and TypeScript SDKs also run.
final class InthProjectURLTests: XCTestCase {
    private func fixture() throws -> JSONValue {
        let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("protocol/project-url/cases.json")
        return try XCTUnwrap(C15tJSON.parse(Data(contentsOf: url)))
    }

    func testAllowedHostSuffixesMatchTheSharedFixture() throws {
        let listed = try XCTUnwrap(fixture()["allowedHostSuffixes"]?.arrayValue).compactMap(\.stringValue)
        XCTAssertEqual(InthProjectURL.allowedHostSuffixes, listed)
    }

    func testEveryReasonCodeIsTheFixturesReasonCode() throws {
        let listed = try XCTUnwrap(fixture()["reasons"]?.objectValue).keys
        XCTAssertEqual(Set(InthProjectURLError.Reason.allCases.map(\.rawValue)), Set(listed))
    }

    func testStrictCasesMatchTheSharedFixture() throws {
        try run("strict", relaxed: false)
    }

    func testRelaxedCasesMatchTheSharedFixture() throws {
        try run("relaxed", relaxed: true)
    }

    func testTheErrorSaysWhatToWriteAndQuotesTheInput() {
        XCTAssertThrowsError(try InthProjectURL.normalize(" https://consent.example.com ")) { error in
            let refused = error as? InthProjectURLError
            XCTAssertEqual(refused?.reason, .host)
            XCTAssertEqual(
                refused?.message,
                "backendURL must be the project URL from your Inth dashboard, such as "
                    + "https://your-project.inth.app. Got \" https://consent.example.com \": "
                    + "the host must be a project host under *.inth.app.")
            XCTAssertEqual(refused?.message, error.localizedDescription)
        }
        XCTAssertThrowsError(try InthProjectURL.normalize("", option: "com.c15t.backend.url")) { error in
            XCTAssertTrue(String(describing: error).hasPrefix("com.c15t.backend.url must be the project URL"))
        }
    }

    private func run(_ mode: String, relaxed: Bool) throws {
        let cases = try XCTUnwrap(fixture()[mode])
        let accepted = try XCTUnwrap(cases["accept"]?.arrayValue)
        let rejected = try XCTUnwrap(cases["reject"]?.arrayValue)
        XCTAssertFalse(accepted.isEmpty)
        XCTAssertFalse(rejected.isEmpty)
        for item in accepted {
            let input = try XCTUnwrap(item["input"]?.stringValue)
            let expected = try XCTUnwrap(item["normalized"]?.stringValue)
            XCTAssertEqual(
                try InthProjectURL.normalize(input, relaxed: relaxed).absoluteString, expected,
                "\(mode) accept \"\(input)\"")
        }
        for item in rejected {
            let input = try XCTUnwrap(item["input"]?.stringValue)
            let reason = try XCTUnwrap(item["reason"]?.stringValue)
            XCTAssertThrowsError(
                try InthProjectURL.normalize(input, relaxed: relaxed), "\(mode) reject \"\(input)\""
            ) { error in
                XCTAssertEqual((error as? InthProjectURLError)?.reason.rawValue, reason, "\(mode) reject \"\(input)\"")
            }
        }
    }
}
