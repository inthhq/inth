@_spi(C15tInternal) import C15tApple
@_spi(C15tInternal) import C15tCore
import Foundation
import XCTest

/// Native cores answered by the opt-in fixture, shared by the integration tests.
extension XCTestCase {
    func resolvedCore(store: InMemoryStore = InMemoryStore()) async throws -> ConsentCore {
        let core = ConsentCore()
        try await bootstrap(core, store: store)
        return core
    }

    func bootstrap(_ core: ConsentCore, store: InMemoryStore = InMemoryStore()) async throws {
        let transport = HostedTransport(baseURL: URL(string: "https://consent.example.com")!, client: try AnalyticsFixtureHTTP())
        core.bootstrap(config(store: store, transport: transport))
        await core.waitUntilIdle()
        XCTAssertTrue(core.isReady())
    }

    func config(store: InMemoryStore, transport: (any C15tTransport)? = nil) -> CoreConfig {
        CoreConfig(
            store: store,
            transport: transport,
            consentCategories: [.necessary, .measurement, .marketing, .experience],
            now: { 1_770_000_000_000 },
            initRetry: .disabled,
            flushPendingOnBootstrap: false
        )
    }
}

final class AnalyticsFixtureHTTP: HTTPTransport, @unchecked Sendable {
    private let body: Data
    init() throws {
        let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("../../../protocol/native-envelope-opt-in-grants.json")
        let fixture = try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: url))
        body = try JSONEncoder().encode(XCTUnwrap(fixture["input"]?["transport"]?["body"]))
    }
    func send(_ request: HTTPRequest) async throws -> HTTPResponse {
        HTTPResponse(status: 200, body: request.method == .get ? body : Data("{}".utf8))
    }
}

/// Vendor calls recorded as strings, safe to append from any queue.
final class VendorCalls: @unchecked Sendable {
    private let lock = NSLock()
    private var recorded: [String] = []
    var all: [String] { lock.lock(); defer { lock.unlock() }; return recorded }
    func append(_ call: String) { lock.lock(); defer { lock.unlock() }; recorded.append(call) }
    /// Returns and clears the recorded calls.
    @discardableResult
    func drain() -> [String] { lock.lock(); defer { lock.unlock() }; let out = recorded; recorded = []; return out }
}

extension GoogleAdsConsent {
    static let granted = GoogleAdsConsent(adStorage: true, adUserData: true, adPersonalization: true)
    static let denied = GoogleAdsConsent(adStorage: false, adUserData: false, adPersonalization: false)
}
