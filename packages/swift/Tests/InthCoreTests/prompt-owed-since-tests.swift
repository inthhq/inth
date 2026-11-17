import Foundation
import XCTest
@_spi(C15tInternal) @testable import C15tCore

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

    /// A bundled policy rebuilds the readable snapshot from a draft. Observers must still get the
    /// identifier, or a presenter that sees only the latest callback keeps a prompt suppressed.
    func testObserversGetTheIdentifierWhenTheReadableViewIsRebuilt() throws {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        let vector = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: root.appendingPathComponent("native-protocol/bundled-policy/parity.json"))) as? [String: Any])
        let resource = try JSONSerialization.data(withJSONObject: XCTUnwrap(vector["resource"]))
        let now = try XCTUnwrap(vector["now"] as? Int64)
        let core = ConsentCore()
        core.bootstrap(CoreConfig(store: InMemoryStore(),
            bundledPolicy: BundledPolicyResource(data: resource, endpoint: try XCTUnwrap(vector["endpoint"] as? String)),
            consentCategories: ConsentCategory.allCases, now: { now }, initRetry: .disabled))
        let recorder = Recorder()
        let subscription = core.onChange { recorder.record($0) }
        defer { subscription.cancel() }

        XCTAssertEqual(core.save(.all).status, .committed)
        core.reset()
        let owed = try XCTUnwrap(core.snapshot().promptOwedSince)
        XCTAssertEqual(recorder.last?.revision, core.snapshot().revision)
        XCTAssertEqual(recorder.last?.promptOwedSince, owed, "the observer sees the same identifier as a read")
    }

    private final class Recorder: @unchecked Sendable {
        private let lock = NSLock()
        private var latest: ConsentSnapshot?
        var last: ConsentSnapshot? { lock.withLock { latest } }
        func record(_ snapshot: ConsentSnapshot) { lock.withLock { latest = snapshot } }
    }

    private func boot() async throws -> ConsentCore {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        let body = try Data(contentsOf: root.appendingPathComponent("../examples/native/consent-demo/fixtures/category-init.json"))
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
