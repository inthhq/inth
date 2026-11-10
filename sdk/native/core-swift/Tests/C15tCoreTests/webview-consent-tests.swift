import Foundation
import XCTest

@testable import C15tCore

/// The Swift half of "WebView consent" in `native/CONTRACT.md`. The scripts
/// themselves run in a browser in the `@c15t/core` and `@c15t/browser` tests.
final class WebViewConsentTests: XCTestCase {
    static let protocolDirectory = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        .appendingPathComponent("protocol/webview")

    struct OriginCases: Decodable {
        struct Case: Decodable {
            let input: String
            let origin: String?
        }
        let cases: [Case]
    }

    let decided = WebViewConsentState(
        ready: true,
        revision: 7,
        model: "iab",
        permissions: ConsentState(functionality: true, measurement: true),
        tcString: "CQ-tc"
    )

    func object(_ json: String) throws -> [String: Any] {
        try XCTUnwrap(JSONSerialization.jsonObject(with: Data(json.utf8)) as? [String: Any])
    }

    func testOriginsNormalizeLikeEveryOtherPlatform() throws {
        let data = try Data(contentsOf: Self.protocolDirectory.appendingPathComponent("origins.json"))
        let fixture = try JSONDecoder().decode(OriginCases.self, from: data)
        XCTAssertGreaterThan(fixture.cases.count, 20)
        for entry in fixture.cases {
            XCTAssertEqual(WebViewConsentScript.normalize(entry.input), entry.origin, "origin for \"\(entry.input)\"")
        }
    }

    func testGeneratedScriptsAreTheProtocolFiles() throws {
        func read(_ name: String) throws -> String {
            var source = try String(contentsOf: Self.protocolDirectory.appendingPathComponent(name), encoding: .utf8)
                .trimmingCharacters(in: .whitespacesAndNewlines)
            if source.hasSuffix(";") { source.removeLast() }
            return source
        }
        XCTAssertEqual(WebViewConsentScripts.documentStart, try read("document-start.js"))
        XCTAssertEqual(WebViewConsentScripts.update, try read("update.js"))
    }

    func testAHelperRefusesAnEmptyOrUnsafeOriginList() throws {
        XCTAssertThrowsError(try WebViewConsentScript(allowedOrigins: []))
        XCTAssertThrowsError(try WebViewConsentScript(allowedOrigins: ["https://example.com", "http://example.com"]))
        XCTAssertThrowsError(try WebViewConsentScript(allowedOrigins: ["*"]))
        let script = try WebViewConsentScript(allowedOrigins: ["https://example.com", "https://EXAMPLE.com:443/"])
        XCTAssertEqual(script.origins, ["https://example.com"])
    }

    func testTheStateCarriesConsentAndNothingElse() throws {
        let state = try object(decided.json())
        XCTAssertEqual(Set(state.keys), ["version", "ready", "revision", "model", "permissions", "tcString", "gppString"])
        XCTAssertEqual(state["model"] as? String, "iab")
        XCTAssertEqual(state["tcString"] as? String, "CQ-tc")
        XCTAssertTrue(state["gppString"] is NSNull)
        let permissions = try XCTUnwrap(state["permissions"] as? [String: Bool])
        XCTAssertEqual(permissions["measurement"], true)
        XCTAssertEqual(permissions["marketing"], false)
    }

    func testNothingIsGrantedBeforeTheCoreIsReady() throws {
        let pending = WebViewConsentState(
            ready: false, revision: 1, model: "opt-in",
            permissions: ConsentState(functionality: true, experience: true, measurement: true, marketing: true),
            tcString: nil
        )
        let permissions = try XCTUnwrap(try object(pending.json())["permissions"] as? [String: Bool])
        XCTAssertEqual(permissions, [
            "necessary": true, "functionality": false, "experience": false, "measurement": false, "marketing": false,
        ])
    }

    func testScriptsCallTheProtocolFunctions() throws {
        let script = try WebViewConsentScript(allowedOrigins: ["https://app.example"], token: "t0k3n")
        XCTAssertEqual(
            script.documentStart(decided),
            "\(WebViewConsentScripts.documentStart)([\"https://app.example\"],\"t0k3n\",\(decided.json()));"
        )
        XCTAssertEqual(
            script.update(decided),
            "\(WebViewConsentScripts.update)([\"https://app.example\"],\"t0k3n\",\(decided.json()));"
        )
    }

    func testEveryHelperDrawsItsOwnToken() {
        let first = WebViewConsentScript.newToken()
        XCTAssertEqual(first.count, 32)
        XCTAssertTrue(first.allSatisfy { $0.isHexDigit && !$0.isUppercase })
        XCTAssertNotEqual(first, WebViewConsentScript.newToken())
    }

    func testOnlyListedOriginsMayAskForPreferences() throws {
        let script = try WebViewConsentScript(allowedOrigins: ["https://app.example"])
        XCTAssertTrue(script.isAllowed("https://app.example"))
        XCTAssertTrue(script.isAllowed("https://app.example/"))
        XCTAssertFalse(script.isAllowed("https://evil.example"))
        XCTAssertFalse(script.isAllowed(nil))
        XCTAssertTrue(WebViewConsentScript.isOpenPreferencesMessage(#"{"type":"c15t:open-preferences"}"#))
        XCTAssertFalse(WebViewConsentScript.isOpenPreferencesMessage(#"{"type":"c15t:save"}"#))
    }
}
