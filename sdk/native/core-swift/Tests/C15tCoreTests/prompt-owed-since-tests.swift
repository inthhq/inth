import Foundation
import XCTest
@testable import C15tCore

/// `promptOwedSince` names each owed prompt, so a reader that skipped snapshots still sees a new one.
final class PromptOwedSinceTests: XCTestCase {
    func testTheSamePromptOwedAgainGetsANewIdentifier() async throws {
        let core = try await boot()
        let first = try XCTUnwrap(core.snapshot().promptOwedSince)
        XCTAssertEqual(core.snapshot().promptRequirement.kind, .choice)

        // An unrelated revision keeps the identifier.
        let before = core.snapshot().revision
        core.refresh()
        await core.waitUntilIdle()
        XCTAssertGreaterThan(core.snapshot().revision, before)
        XCTAssertEqual(core.snapshot().promptOwedSince, first)

        XCTAssertEqual(core.save(.all).status, .committed)
        XCTAssertNil(core.snapshot().promptOwedSince, "nothing is owed")

        core.reset()
        await core.waitUntilIdle()
        XCTAssertEqual(core.snapshot().promptRequirement.kind, .choice)
        let again = try XCTUnwrap(core.snapshot().promptOwedSince)
        XCTAssertNotEqual(again, first, "the same requirement owed again is a new prompt")
    }

    func testTheIdentifierStaysOutOfTheKernelWire() async throws {
        let core = try await boot()
        XCTAssertNotNil(core.snapshot().promptOwedSince)
        guard case let .object(fields)? = C15tJSON.parse(try C15tJSON.encode(core.snapshot())) else {
            return XCTFail("the snapshot is not a JSON object")
        }
        XCTAssertNil(fields["promptOwedSince"])
    }

    private func boot() async throws -> ConsentCore {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        let body = try Data(contentsOf: root.appendingPathComponent("examples/consent-demo/fixtures/category-init.json"))
        let core = ConsentCore()
        core.bootstrap(CoreConfig(store: InMemoryStore(),
            transport: HostedTransport(baseURL: URL(string: "https://fixture.invalid")!, client: Peer(body)),
            initRetry: .disabled))
        await core.waitUntilIdle()
        return core
    }

    private struct Peer: HTTPTransport {
        let body: Data
        init(_ body: Data) { self.body = body }
        func send(_ request: HTTPRequest) async throws -> HTTPResponse {
            request.method == .get
                ? HTTPResponse(status: 200, headers: ["x-c15t-policy-contract": "1"], body: body)
                : HTTPResponse(status: 503)
        }
    }
}
