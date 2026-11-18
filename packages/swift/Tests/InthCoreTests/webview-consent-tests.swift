import Foundation
import XCTest

@_spi(InthInternal) @testable import InthCore

/// The Swift half of "WebView consent" in `packages/native-protocol/CONTRACT.md`. The scripts
/// themselves run in a browser in the `@c15t/core` and `@c15t/browser` tests.
final class WebViewConsentTests: XCTestCase {
    static let protocolDirectory = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        .appendingPathComponent("native-protocol/webview")

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

    /// The GPP string the snapshot carries is the one the page receives, at document
    /// start and in every update.
    func testTheSnapshotGPPStringReachesTheInjectedPayload() throws {
        var draft = ConsentSnapshot.Draft(current: .coldStart)
        draft.ready = true
        draft.policyPending = false
        draft.gppString = "DBABMA~CQ"
        let state = WebViewConsentState(snapshot: draft.build(revision: 3), tcString: nil)
        XCTAssertEqual(state.gppString, "DBABMA~CQ")
        let script = try WebViewConsentScript(allowedOrigins: ["https://app.example"], token: "t0k3n", requestKey: "k3y")
        XCTAssertTrue(script.documentStart(state).contains(#""gppString":"DBABMA~CQ""#))
        XCTAssertTrue(script.update(state).contains(#""gppString":"DBABMA~CQ""#))
    }

    func testARevokedStateDeniesEverythingAndCarriesNoStrings() throws {
        let state = try object(WebViewConsentState.revoked(decided).json())
        XCTAssertEqual(state["ready"] as? Bool, false)
        XCTAssertTrue(state["tcString"] is NSNull)
        XCTAssertEqual(state["revision"] as? Int, 7)
        let permissions = try XCTUnwrap(state["permissions"] as? [String: Bool])
        XCTAssertEqual(permissions, [
            "necessary": true, "functionality": false, "experience": false, "measurement": false, "marketing": false,
        ])
    }

    func testARevocationReachesOnlyTheGivenOrigins() throws {
        let script = try WebViewConsentScript(
            allowedOrigins: ["https://old.example", "https://kept.example"], token: "t0k3n", requestKey: "k3y")
        XCTAssertEqual(
            script.revoke(fromOrigins: ["https://OLD.example/"], previous: decided),
            "\(WebViewConsentScripts.update)([\"https://old.example\"],\"t0k3n\",\(WebViewConsentState.revoked(decided).json()));"
        )
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
        let script = try WebViewConsentScript(allowedOrigins: ["https://app.example"], token: "t0k3n", requestKey: "k3y")
        XCTAssertEqual(
            script.documentStart(decided),
            "\(WebViewConsentScripts.documentStart)([\"https://app.example\"],\"t0k3n\",\"k3y\",\(decided.json()));"
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
    }

    func testAPreferencesRequestMustCarryTheKeyOnlyTheTopFrameHolds() throws {
        let script = try WebViewConsentScript(allowedOrigins: ["https://app.example"], requestKey: "k3y")
        XCTAssertTrue(script.isPreferencesRequest(#"{"type":"c15t:open-preferences","key":"k3y"}"#))
        // What a frame that can post to the channel, but cannot read the key, can send.
        XCTAssertFalse(script.isPreferencesRequest(#"{"type":"c15t:open-preferences"}"#))
        XCTAssertFalse(script.isPreferencesRequest(#"{"type":"c15t:open-preferences","key":"guess"}"#))
        XCTAssertFalse(script.isPreferencesRequest(nil))
    }

    func testAReplacementKeepsBothSecretsForTheNewOrigins() throws {
        let first = try WebViewConsentScript(allowedOrigins: ["https://app.example"], token: "t0k3n", requestKey: "k3y")
        let next = try first.replacingOrigins(["https://www.example.com"])
        XCTAssertEqual(next.origins, ["https://www.example.com"])
        XCTAssertEqual(
            next.update(decided),
            "\(WebViewConsentScripts.update)([\"https://www.example.com\"],\"t0k3n\",\(decided.json()));"
        )
        XCTAssertTrue(next.isPreferencesRequest(#"{"type":"c15t:open-preferences","key":"k3y"}"#))
    }
}
