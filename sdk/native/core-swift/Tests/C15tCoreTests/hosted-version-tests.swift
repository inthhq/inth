@_spi(C15tInternal) import C15tCore
import Foundation
import XCTest

final class HostedVersionTests: XCTestCase {
    func testSemverOnlyGatewayAcceptsEveryDefaultHostedRequest() async throws {
        let endpoint = URL(string: "https://consent.example.com")!
        let gateway = SemverOnlyGateway()
        let transports: [HostedTransport] = [
            .hosted(projectURL: endpoint, client: gateway),
            HostedTransport(baseURL: endpoint, client: gateway),
        ]
        let context = InitContext(
            overrides: KernelOverridesWire(country: "GB", region: nil, language: "en", gpc: nil),
            user: nil, subjectId: "subject")
        for transport in transports {
            let initialized = await transport.performInit(context)
            XCTAssertNoThrow(try initialized.get())
            let saved = await transport.sendSave(Data("{}".utf8))
            XCTAssertNoThrow(try saved.get())
            let identified = await transport.patchIdentity(
                subjectId: "subject", externalId: "external", identityProvider: nil)
            XCTAssertNoThrow(try identified.get())
        }
    }
}

private struct SemverOnlyGateway: HTTPTransport {
    func send(_ request: HTTPRequest) async throws -> HTTPResponse {
        // Hosted gateways accept the SDK version separately from platform attribution.
        guard request.headers[C15t.versionHeader] == C15t.version else {
            return HTTPResponse(status: 400, body: Data("Version not supported".utf8))
        }
        return HTTPResponse(
            status: 200,
            headers: [C15t.policyContractHeader: "1"],
            body: Data("{}".utf8))
    }
}
