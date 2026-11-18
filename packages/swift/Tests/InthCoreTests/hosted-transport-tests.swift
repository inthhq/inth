@_spi(InthInternal) @testable import InthCore
import Foundation
import XCTest

/// The hosted transport on the `/v1` wire: three routes, no version headers, one error
/// body, and the canonical subject id read back from a `200`.
final class HostedTransportTests: XCTestCase {
    private let endpoint = URL(string: "https://consent.example.com")!
    private let context = InitContext(
        overrides: KernelOverridesWire(country: "GB", region: nil, language: "en", gpc: nil),
        user: nil, subjectId: "019c1c38-a400-7100-8000-000000000002")

    func testEveryRequestUsesAV1RouteAndNoVersionHeader() async throws {
        let gateway = V1OnlyGateway()
        let transports: [HostedTransport] = [
            .hosted(projectURL: endpoint, client: gateway),
            HostedTransport(baseURL: endpoint, client: gateway),
        ]
        for transport in transports {
            let initialized = await transport.performInit(context)
            XCTAssertNoThrow(try initialized.get())
            let saved = await transport.sendSave(Data("{}".utf8))
            XCTAssertNoThrow(try saved.get())
            let linked = await transport.linkSubject(
                subjectId: "sub_1119tDZHoarNxm6kSm3BN6ze9d", externalId: "user_123",
                identityProvider: "clerk", identityToken: "token")
            XCTAssertNoThrow(try linked.get())
        }
        XCTAssertEqual(gateway.paths, [
            "/v1/consent/init", "/v1/consent/records", "/v1/subjects/sub_1119tDZHoarNxm6kSm3BN6ze9d/link",
            "/v1/consent/init", "/v1/consent/records", "/v1/subjects/sub_1119tDZHoarNxm6kSm3BN6ze9d/link",
        ])
    }

    func testLinkSendsTheTokenOnlyInItsOwnBody() async throws {
        let gateway = V1OnlyGateway()
        let transport = HostedTransport(baseURL: endpoint, client: gateway)
        _ = await transport.linkSubject(
            subjectId: "019c1c38-a400-7100-8000-000000000002", externalId: "user_123",
            identityProvider: nil, identityToken: "token-1")
        let body = try XCTUnwrap(InthJSON.parse(XCTUnwrap(gateway.bodies.last)))
        XCTAssertEqual(body, .object(["externalId": .string("user_123"), "identityToken": .string("token-1")]))
    }

    func testA200NamesTheCanonicalSubjectId() async throws {
        let gateway = V1OnlyGateway()
        gateway.answer = #"{"subjectId":"0193e5a8-6f00-7c3a-8a1b-5d2e7f9a0b1c","recordId":"rec_1","link":{"stored":false,"reason":"invalid_token"}}"#
        let transport = HostedTransport(baseURL: endpoint, client: gateway)
        let named = await transport.sendSave(Data("{}".utf8))
        XCTAssertEqual(try named.get(), "0193e5a8-6f00-7c3a-8a1b-5d2e7f9a0b1c")
        gateway.answer = "{}"
        let unnamed = await transport.sendSave(Data("{}".utf8))
        XCTAssertNil(try unnamed.get())
    }

    func testTheErrorBodyGivesCodeRequestIdAndMessage() {
        let structured = InthError.http(HTTPResponse(
            status: 401,
            headers: ["x-request-id": "req_header"],
            body: Data(#"{"error":{"code":"identity_token_invalid","message":"Token expired"},"requestId":"req_body"}"#.utf8)))
        XCTAssertEqual(structured, .httpStatus(
            status: 401, code: "identity_token_invalid", requestId: "req_body", message: "Token expired"))
        for part in ["401", "identity_token_invalid", "req_body", "Token expired"] {
            XCTAssertTrue(structured.message.contains(part), structured.message)
        }
        XCTAssertTrue(structured.isPermanentlyRejected)

        // A gateway page: no code, the header's request id, the raw text.
        let raw = InthError.http(HTTPResponse(
            status: 503, headers: ["X-Request-Id": "req_header"], body: Data("upstream down".utf8)))
        XCTAssertEqual(raw, .httpStatus(status: 503, code: nil, requestId: "req_header", message: "upstream down"))
        XCTAssertFalse(raw.isPermanentlyRejected)
    }

    func testPropertyIsLowercaseAndFallsBackToTheProjectHost() {
        XCTAssertEqual(HostedTransport(baseURL: URL(string: "https://Consent.Example.com")!).property, "consent.example.com")
        XCTAssertEqual(HostedTransport(baseURL: endpoint, property: "Com.Example.App").property, "com.example.app")
    }
}

/// Answers `200` only on the three `/v1` routes, and only without a version header.
private final class V1OnlyGateway: HTTPTransport, @unchecked Sendable {
    private let lock = Lock()
    private var recorded: [HTTPRequest] = []
    var answer = "{}"

    var paths: [String] { lock.withLock { recorded.map(\.url.path) } }
    var bodies: [Data] { lock.withLock { recorded.compactMap(\.body) } }

    func send(_ request: HTTPRequest) async throws -> HTTPResponse {
        lock.withLock { recorded.append(request) }
        let path = request.url.path
        let routed = request.method == .get
            ? path == "/v1/consent/init"
            : path == "/v1/consent/records" || path.hasPrefix("/v1/subjects/") && path.hasSuffix("/link")
        guard routed, request.headers["x-c15t-version"] == nil,
            request.headers["x-c15t-policy-contract"] == nil
        else {
            return HTTPResponse(status: 404, body: Data(#"{"error":{"code":"not_found","message":"no"}}"#.utf8))
        }
        return HTTPResponse(status: 200, body: Data(lock.withLock { answer }.utf8))
    }
}
