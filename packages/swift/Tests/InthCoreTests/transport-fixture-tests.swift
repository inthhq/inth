@_spi(InthInternal) @testable import InthCore
import Foundation
import XCTest

/// The hosted transport, held to `packages/native-protocol/transport/cases.json`, which
/// the Kotlin core runs too.
final class TransportFixtureTests: XCTestCase {
    private func fixture() throws -> JSONValue {
        let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("native-protocol/transport/cases.json")
        return try XCTUnwrap(InthJSON.parse(Data(contentsOf: url)))
    }

    private func cases(_ key: String) throws -> [JSONValue] {
        let listed = try XCTUnwrap(fixture()[key]?.arrayValue)
        XCTAssertFalse(listed.isEmpty, key)
        return listed
    }

    private func transport(_ answer: HTTPResponse = HTTPResponse(status: 200, body: Data("{}".utf8)))
        throws -> (HostedTransport, RecordingClient)
    {
        let client = RecordingClient(answer: answer)
        let projectURL = try XCTUnwrap(fixture()["projectUrl"]?.stringValue.flatMap(URL.init(string:)))
        return (HostedTransport(baseURL: projectURL, client: client), client)
    }

    func testInitGoesToTheFixtureURL() async throws {
        for item in try cases("init") {
            let overrides = try XCTUnwrap(item["overrides"])
            let (transport, client) = try transport()
            _ = await transport.performInit(InitContext(
                overrides: KernelOverridesWire(
                    country: overrides["country"]?.stringValue,
                    region: overrides["region"]?.stringValue,
                    language: overrides["language"]?.stringValue,
                    gpc: overrides["gpc"]?.boolValue),
                user: nil, subjectId: "019c1c38-a400-7100-8000-000000000002"))
            let request = try XCTUnwrap(client.requests.first)
            XCTAssertEqual(request.method, .get, item["name"]?.stringValue ?? "")
            XCTAssertEqual(request.url.absoluteString, item["url"]?.stringValue, item["name"]?.stringValue ?? "")
        }
    }

    func testRecordsGoToTheFixtureRoute() async throws {
        let records = try XCTUnwrap(fixture()["records"])
        let (transport, client) = try transport()
        _ = await transport.sendSave(Data("{}".utf8))
        let request = try XCTUnwrap(client.requests.first)
        XCTAssertEqual(request.method.rawValue, records["method"]?.stringValue)
        XCTAssertEqual(request.url.absoluteString, records["url"]?.stringValue)
        XCTAssertEqual(request.body, Data("{}".utf8))
    }

    func testLinkSendsTheFixtureURLAndBody() async throws {
        for item in try cases("link") {
            let name = item["name"]?.stringValue ?? ""
            let (transport, client) = try transport()
            _ = await transport.linkSubject(
                subjectId: try XCTUnwrap(item["subjectId"]?.stringValue),
                externalId: try XCTUnwrap(item["externalId"]?.stringValue),
                identityProvider: item["identityProvider"]?.stringValue,
                identityToken: try XCTUnwrap(item["identityToken"]?.stringValue))
            let request = try XCTUnwrap(client.requests.first)
            XCTAssertEqual(request.method.rawValue, item["method"]?.stringValue, name)
            XCTAssertEqual(request.url.absoluteString, item["url"]?.stringValue, name)
            XCTAssertEqual(InthJSON.parse(try XCTUnwrap(request.body)), item["body"], name)
        }
    }

    func testA2xxNamesTheFixtureSubjectId() async throws {
        for item in try cases("success") {
            let body = Data((item["body"]?.stringValue ?? "").utf8)
            let (transport, _) = try transport(HTTPResponse(status: 200, body: body))
            let named = try await transport.sendSave(Data("{}".utf8)).get()
            XCTAssertEqual(named, item["subjectId"]?.stringValue, item["name"]?.stringValue ?? "")
        }
    }

    func testAFailureReadsAsTheFixtureSays() async throws {
        for item in try cases("failure") {
            let name = item["name"]?.stringValue ?? ""
            let headers = (item["headers"]?.objectValue ?? [:]).compactMapValues(\.stringValue)
            let response = HTTPResponse(
                status: Int(try XCTUnwrap(item["status"]?.intValue)),
                headers: headers,
                body: Data((item["body"]?.stringValue ?? "").utf8))
            let (transport, _) = try transport(response)
            guard case let .failure(error) = await transport.sendSave(Data("{}".utf8)) else {
                return XCTFail("\(name): a non-2xx must fail")
            }
            XCTAssertEqual(error, .httpStatus(
                status: response.status,
                code: item["code"]?.stringValue,
                requestId: item["requestId"]?.stringValue,
                message: try XCTUnwrap(item["message"]?.stringValue)), name)
            XCTAssertEqual(error.isPermanentlyRejected, item["permanent"]?.boolValue, name)
        }
    }
}

/// Records each request and answers every one the same way.
private final class RecordingClient: HTTPTransport, @unchecked Sendable {
    private let lock = Lock()
    private var recorded: [HTTPRequest] = []
    private let answer: HTTPResponse

    init(answer: HTTPResponse) { self.answer = answer }

    var requests: [HTTPRequest] { lock.withLock { recorded } }

    func send(_ request: HTTPRequest) async throws -> HTTPResponse {
        lock.withLock { recorded.append(request) }
        return answer
    }
}
