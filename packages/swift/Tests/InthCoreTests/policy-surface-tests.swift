import Foundation
import XCTest
@_spi(InthInternal) @testable import InthCore

/// `packages/native-protocol/policy-surface/cases.json`: how a matched rule's `surface` reads,
/// and the phone layout it resolves to. The expected answers are `readPolicyResolutionWire` in
/// `@inth/sdk-schema` and `resolveLayout` in `@inth/sdk-core`;
/// `packages/sdk/core/src/libs/__tests__/policy-surface-native-fixture.test.ts` checks them on
/// every run, and `PolicySurfaceTest.kt` runs the same cases through `StrictPolicyReader`.
final class PolicySurfaceFixtureTests: XCTestCase {
    static let fixtureURL = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        .deletingLastPathComponent().appendingPathComponent("native-protocol/policy-surface/cases.json")

    func testEveryCaseReadsAsTheWebReadsIt() throws {
        let cases = try XCTUnwrap(InthJSON.parse(Data(contentsOf: Self.fixtureURL))?.objectValue?["cases"]?.arrayValue)
        XCTAssertGreaterThan(cases.count, 20)
        for item in cases {
            let testCase = try XCTUnwrap(item.objectValue)
            let id = testCase["id"]?.stringValue ?? "?"
            let expected = try XCTUnwrap(testCase["expected"]?.objectValue, id)
            switch PolicyWireReader.read(testCase["input"]?.objectValue?["policyResolution"]) {
            case let .resolved(resolved):
                XCTAssertEqual(expected["status"]?.stringValue, "matched", id)
                XCTAssertEqual(resolved.resolution.surface, try decode(PolicySurface.self, expected["surface"]), id)
                XCTAssertEqual(resolved.resolution.layout, try decode(PolicyLayout.self, expected["layout"]), id)
            case let .rejected(reason, message):
                XCTAssertEqual(expected["status"]?.stringValue, "failed", "\(id): \(message)")
                XCTAssertEqual(reason.rawValue, expected["reason"]?.stringValue, "\(id): \(message)")
            }
        }
    }

    /// A surface travels on the snapshot and in the stored envelope, so it must encode back to
    /// exactly the canonical JSON it was read from.
    func testSurfaceAndLayoutEncodeAsTheirWireShape() throws {
        let info = PolicyResolutionInfo(
            status: .matched, policyId: "eu", fingerprint: "f",
            surface: PolicySurface(container: .banner(.top), edgeStyle: .flush),
            layout: PolicyLayout(type: .banner, placement: .bannerTop, flow: .expandInPlace, blocking: false, edgeStyle: .flush))
        let encoder = JSONEncoder()
        encoder.outputFormatting = .sortedKeys
        let json = try XCTUnwrap(String(data: encoder.encode(info), encoding: .utf8))
        XCTAssertEqual(
            json,
            #"{"fingerprint":"f","layout":{"blocking":false,"edgeStyle":"flush","flow":"expand-in-place","placement":"banner-top","type":"banner"},"policyId":"eu","status":"matched","surface":{"container":{"edge":"top","type":"banner"},"edgeStyle":"flush"}}"#)
        XCTAssertEqual(try JSONDecoder().decode(PolicyResolutionInfo.self, from: Data(json.utf8)), info)
    }

    /// A rule without a surface keeps the snapshot it had before `surface` existed.
    func testNoSurfaceLeavesTheResolutionAsItWas() throws {
        let encoder = JSONEncoder()
        encoder.outputFormatting = .sortedKeys
        let json = try XCTUnwrap(String(
            data: encoder.encode(PolicyResolutionInfo(status: .matched, policyId: "eu", fingerprint: "f")), encoding: .utf8))
        XCTAssertEqual(json, #"{"fingerprint":"f","policyId":"eu","status":"matched"}"#)
    }

    private func decode<Value: Decodable>(_ type: Value.Type, _ value: JSONValue?) throws -> Value? {
        guard let value, !value.isNull else { return nil }
        return try JSONDecoder().decode(type, from: JSONEncoder().encode(value))
    }
}
