@_spi(C15tInternal) @testable import C15tReactNativeBridge
@_spi(C15tInternal) import C15tCore
import Foundation
import XCTest

/// Serves one `/init` body and refuses every save, so a commit stays queued on the device.
final class ServedInit: HTTPTransport, @unchecked Sendable {
    let body: Data
    init(body: Data) { self.body = body }
    func send(_ request: HTTPRequest) async throws -> HTTPResponse {
        request.url.path.hasSuffix("/init")
            ? HTTPResponse(status: 200, headers: ["x-c15t-policy-contract": "1"], body: body)
            : HTTPResponse(status: 503)
    }
}

let protocolDirectory = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
    .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
    .deletingLastPathComponent().deletingLastPathComponent().appendingPathComponent("packages/native-protocol")

func protocolObject(_ path: String) throws -> [String: Any] {
    let data = try Data(contentsOf: protocolDirectory.appendingPathComponent(path))
    return try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
}

func headlessFixture() throws -> [String: Any] { try protocolObject("iab/headless-disclosure-cases.json") }

/// A core that served the fixture's list and providers under an IAB policy, as a device holds it.
func headlessIABCore() async throws -> ConsentCore {
    let fixture = try headlessFixture()
    let list = try protocolObject("iab/\(try XCTUnwrap(fixture["vendorList"] as? String))")
    // A served IAB policy, unchanged, from the kernel-generated evaluation fixture.
    let evaluation = try protocolObject("evaluation-narrow-iab-no-receipt.json")
    let input = try XCTUnwrap(evaluation["input"] as? [String: Any])
    let transport = try XCTUnwrap(input["transport"] as? [String: Any])
    var body = try XCTUnwrap(transport["body"] as? [String: Any])
    body["gvl"] = list["gvl"]
    body["adTechProviders"] = list["adTechProviders"]
    body["customVendors"] = fixture["customVendors"]
    let configuration = try JSONDecoder().decode(
        IABConfiguration.self, from: JSONSerialization.data(withJSONObject: try XCTUnwrap(fixture["configuration"])))
    let now = try XCTUnwrap(fixture["now"] as? NSNumber).int64Value
    let core = ConsentCore()
    core.bootstrap(CoreConfig(
        store: InMemoryStore(),
        transport: HostedTransport(
            baseURL: URL(string: "https://consent.example.com")!,
            client: ServedInit(body: try JSONSerialization.data(withJSONObject: body))),
        iab: configuration, now: { now }, initRetry: .disabled, flushPendingOnBootstrap: false))
    await core.waitUntilIdle()
    return core
}

/// The `iab` slot the bridge sends for `core`.
func headlessIABSlot(_ core: ConsentCore) -> [String: Any] {
    (jsonObject(C15tPayload.snapshot(core.snapshot(), iabConsent: core.iabConsent(),
        iabAcceptAll: core.iabAcceptAllChoices(), iabPresentation: core.iabPresentation(),
        iabCustomVendors: core.iabCustomVendors()))["iab"]
        as? [String: Any]) ?? [:]
}

/// What a React Native screen drawing its own TCF UI receives and commits, under publisher
/// restrictions and Google Additional Consent providers.
///
/// `packages/native-protocol/iab/headless-disclosure-cases.json` is generated from the web code
/// (`packages/sdk/iab/src/__tests__/native-headless-disclosure.test.ts`). Kotlin's
/// `C15tPayloadTest` runs the same cases through its bridge.
final class C15tHeadlessIABTests: XCTestCase {
    func fixture() throws -> [String: Any] { try headlessFixture() }
    func core() async throws -> ConsentCore { try await headlessIABCore() }

    func iabSlot(_ core: ConsentCore) -> [String: Any] { headlessIABSlot(core) }

    func commit(_ core: ConsentCore, choices: Any) throws -> [String: Any] {
        let intent: [String: Any] = [
            "action": "iab", "choices": choices, "consents": [String: Any](), "revision": core.snapshot().revision,
        ]
        let raw = String(decoding: try JSONSerialization.data(withJSONObject: intent), as: UTF8.self)
        return jsonObject(C15tPayload.commit(raw, core: core))
    }

    func testTheSnapshotCarriesTheDisclosureTheStockScreensDraw() async throws {
        let fixture = try fixture()
        let slot = iabSlot(try await core())
        XCTAssertEqual(slot["editable"] as? Bool, true)
        XCTAssertEqual(slot["headlessUnsupported"] as? [String], [])
        var disclosure = try XCTUnwrap(slot["disclosure"] as? [String: Any])
        XCTAssertEqual(disclosure.removeValue(forKey: "consentStorageMaxDays") as? Int, 30,
            "the policy's 30-day choice validity")
        XCTAssertEqual(disclosure as NSDictionary, try XCTUnwrap(fixture["disclosure"] as? NSDictionary))
        XCTAssertEqual(slot["acceptAll"] as? NSDictionary, try XCTUnwrap(fixture["acceptAll"] as? NSDictionary))
        XCTAssertEqual(slot["customVendors"] as? NSArray, try XCTUnwrap(fixture["customVendors"] as? NSArray))
    }

    func testAHeadlessCommitWritesTheStringsTheStockSaveWrites() async throws {
        for row in try XCTUnwrap(try fixture()["cases"] as? [[String: Any]]) {
            let id = row["id"] as? String ?? "?"
            let core = try await core()
            let result = try commit(core, choices: try XCTUnwrap(row["choices"]))
            XCTAssertEqual(result["ok"] as? Bool, true, "\(id): \(result)")
            let committed = try XCTUnwrap(iabSlot(core)["committed"] as? [String: Any], id)
            XCTAssertEqual(committed["tcString"] as? String, row["tcString"] as? String, id)
            XCTAssertEqual(committed["addtlConsent"] as? String, row["addtlConsent"] as? String, id)
            let choices = try XCTUnwrap(row["choices"] as? [String: Any], id)
            XCTAssertEqual((committed["choices"] as? [String: Any])?["customVendorConsents"] as? [String] ?? [],
                choices["customVendorConsents"] as? [String] ?? [], id)
        }
    }

    func testAHeadlessCommitThatContradictsARestrictionIsRefused() async throws {
        for row in try XCTUnwrap(try fixture()["conflicts"] as? [[String: Any]]) {
            let id = row["id"] as? String ?? "?"
            let core = try await core()
            let result = try commit(core, choices: try XCTUnwrap(row["choices"]))
            XCTAssertEqual(result["ok"] as? Bool, false, id)
            XCTAssertEqual(result["reason"] as? String, "invalid-iab-choices", id)
            XCTAssertNil(core.iabConsent(), "\(id): nothing is recorded")
        }
    }

    func testEditingNeedsTheDisclosure() async throws {
        let core = try await core()
        let snapshot = core.snapshot()
        let withoutDisclosure = (jsonObject(C15tPayload.snapshot(snapshot, iabAcceptAll: core.iabAcceptAllChoices()))["iab"]
            as? [String: Any]) ?? [:]
        XCTAssertEqual(withoutDisclosure["editable"] as? Bool, false)
        XCTAssertTrue(withoutDisclosure["acceptAll"] is NSNull)
        XCTAssertTrue(withoutDisclosure["disclosure"] is NSNull)
    }
}
