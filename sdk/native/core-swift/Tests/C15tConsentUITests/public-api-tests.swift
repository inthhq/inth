import C15tCore
import C15tConsentUI
import Foundation
import XCTest

/// Uses only the public API, as a host app does. No `@testable` import in this file.
@MainActor
final class PublicAPITests: XCTestCase {
    /// A host's settings screen reopens privacy choices with one public call, after any decision.
    // TCF-CHECK: P31
    func testHostCanResurfacePreferencesFromItsOwnSettings() async throws {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        let body = try Data(contentsOf: root.appendingPathComponent("examples/consent-demo/fixtures/iab-init.json"))
        let core = ConsentCore()
        core.bootstrap(CoreConfig(store: InMemoryStore(),
            transport: HostedTransport(baseURL: URL(string: "https://fixture.invalid")!, client: Peer(body)),
            iab: IABConfiguration(cmpId: 53, cmpVersion: 7, publisherCountryCode: "GB"), initRetry: .disabled))
        await core.waitUntilIdle()
        XCTAssertEqual(core.save(.all).status, .committed)
        let presenter = ConsentPresenter(core: core, autoPresent: false)
        XCTAssertNil(presenter.presentationID, "nothing is owed, so nothing opens by itself")
        presenter.presentPreferences()
        XCTAssertNotNil(presenter.presentationID)
        XCTAssertTrue(presenter.preferences)
        XCTAssertTrue(presenter.iab)
        XCTAssertEqual(presenter.disclosure?.vendors.count, 3)
        // The reopened draft starts from what was saved.
        XCTAssertEqual(presenter.choices.purposeConsents, core.iabConsent()?.choices.purposeConsents)
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
