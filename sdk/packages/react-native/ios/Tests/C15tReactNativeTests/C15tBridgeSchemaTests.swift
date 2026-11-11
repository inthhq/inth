@testable import C15tReactNativeBridge
import C15tCore
import Foundation
import XCTest

/// Every bridge payload this binding writes or reads, against
/// `native/protocol/bridge/payloads.json`.
///
/// The bridge carries JSON strings, so no compiler sees a key renamed on one side. That
/// file is generated from `src/protocol/bridge-schema.ts`, whose own type test holds the
/// TypeScript protocol types to it. Renaming a key here without renaming it there fails
/// this test, and the reverse fails the TypeScript one. Kotlin runs the same checks in
/// `BridgeSchemaTest.kt`.
final class C15tBridgeSchemaTests: XCTestCase {
    /// `native/protocol/bridge/payloads.json`, resolved from this file because `swift test`
    /// may start anywhere.
    private static let schemaURL = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent() // C15tReactNativeTests
        .deletingLastPathComponent() // Tests
        .deletingLastPathComponent() // ios
        .deletingLastPathComponent() // react-native
        .deletingLastPathComponent() // packages
        .deletingLastPathComponent() // repository root
        .appendingPathComponent("native/protocol/bridge/payloads.json")

    private func payloads() throws -> [String: Any] {
        let data = try Data(contentsOf: Self.schemaURL)
        let document = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        return try XCTUnwrap(document["payloads"] as? [String: Any])
    }

    private func fields(_ name: String) throws -> [String: Any] {
        let payload = try XCTUnwrap(try payloads()[name] as? [String: Any], "payloads.json declares no \(name)")
        return try XCTUnwrap(payload["fields"] as? [String: Any])
    }

    func testEveryEncoderWritesTheKeysTheSchemaDeclares() throws {
        let subject = SubjectSnapshot(id: "sub_1", externalId: "user-1")
        let committed = CommitResult(
            status: .committed,
            revision: 7,
            permissions: .necessaryOnly,
            consentAction: .all,
            confirmed: [.marketing: true]
        )
        let rejected = CommitResult(
            status: .rejected,
            revision: 7,
            permissions: .necessaryOnly,
            consentAction: .all,
            error: CoreErrorInfo(code: "policy-pending", message: "no policy yet")
        )
        let failed = ConsentSnapshot(
            resolution: PolicyResolutionInfo(status: .failed, policyId: nil, fingerprint: nil, reason: "transport"),
            subject: subject,
            location: LocationContext(countryCode: "DE", regionCode: nil),
            error: CoreErrorInfo(code: "unsupported-contract", message: "producer speaks 2")
        )

        let samples: [(String, String)] = [
            ("bootstrap", C15tPayload.bootstrap(snapshot: ConsentSnapshot(subject: subject), hasStoredSnapshot: true)),
            ("bootstrap", C15tPayload.bootstrap(snapshot: ConsentSnapshot(), hasStoredSnapshot: false)),
            ("snapshot", C15tPayload.snapshot(.coldStart)),
            ("snapshot", C15tPayload.snapshot(failed)),
            ("commitResult", C15tPayload.commitResult(committed, snapshot: ConsentSnapshot(subject: subject))),
            ("commitResult", C15tPayload.commitResult(rejected, snapshot: ConsentSnapshot())),
            ("commitResult", C15tPayload.invalidIntent(raw: #"{"action":"maybe"}"#)),
            ("commitResult", C15tPayload.notBootstrapped()),
            ("trackingAuthorization", C15tPayload.trackingAuthorization(.notDetermined)),
            (
                "trackingRequest",
                C15tPayload.trackingRequestResult(
                    C15tTrackingRequestResult(status: .notDetermined, stage: .additionalInformation, presentation: .expanded)
                )
            ),
            (
                "trackingRequest",
                C15tPayload.trackingRequestResult(
                    C15tTrackingRequestResult(status: .restricted, stage: .final, presentation: nil)
                )
            ),
            ("snapshotEvent", C15tPayload.snapshotEvent(revision: 3)),
            ("initializedEvent", C15tPayload.initializedEvent(revision: 3)),
            ("errorEvent", C15tPayload.errorEvent(code: "transport-unavailable", message: "offline")),
            ("presenterSession", C15tPayload.consentHostSession(.presented(sessionID: "one", presentation: .prompt))),
            ("presenterSession", C15tPayload.consentHostSession(.alreadyPresented(sessionID: "one", presentation: .preferences))),
            ("presenterSession", C15tPayload.consentHostSession(.notRequired)),
            ("presenterOutcome", C15tPayload.consentHostOutcome(.committed(sessionID: "one", revision: 4))),
            ("presenterOutcome", C15tPayload.consentHostOutcome(.unavailable(sessionID: "one", revision: 4))),
        ]

        var problems: [String] = []
        for (name, raw) in samples {
            let declared = try fields(name)
            problems += describe(declared, jsonObject(raw), path: "\(name).")
        }
        XCTAssertEqual(problems, [], "payloads that drifted from native/protocol/bridge/payloads.json")

        // Optional keys are skipped when absent, so prove this binding can produce every
        // subject key the schema declares. A declared key no core models fails here.
        let snapshotFields = try fields("snapshot")
        let subjectFields = try XCTUnwrap((snapshotFields["subject"] as? [String: Any])?["fields"] as? [String: Any])
        let encoded = try XCTUnwrap(jsonObject(C15tPayload.snapshot(failed))["subject"] as? [String: Any])
        XCTAssertEqual(Set(encoded.keys), Set(subjectFields.keys))

        let all = try payloads()
        let jsToNative = all.filter { (($0.value as? [String: Any])?["direction"] as? String) == "js-to-native" }.keys
        XCTAssertEqual(Set(samples.map { $0.0 }).union(jsToNative), Set(all.keys), "every payload needs a sample here")
    }

    func testTheCommitIntentDecoderReadsTheKeysTheSchemaDeclares() throws {
        let intent = try fields("commitIntent")
        // Every list a headless TCF draft names, empty: the shape, not a valid choice.
        let lists = [
            "purposeConsents", "purposeLegitimateInterests", "purposeObjections",
            "vendorConsents", "vendorLegitimateInterests", "vendorObjections", "specialFeatureOptIns",
            "publisherConsents", "publisherLegitimateInterests", "publisherCustomConsents",
            "publisherCustomLegitimateInterests",
        ]
        func sample(_ action: String) -> [String: Any] {
            var document: [String: Any] = [:]
            for key in intent.keys {
                switch key {
                case "action": document[key] = action
                case "choices": document[key] = Dictionary(uniqueKeysWithValues: lists.map { ($0, [Int]()) })
                case "consents": document[key] = ["measurement": true, "marketing": false]
                case "revision": document[key] = 3
                default: XCTFail("commitIntent.\(key) has no sample here; add one")
                }
            }
            return document
        }
        // `choices` belongs to an `iab` intent only; every other declared key is an explicit one's.
        var explicit = sample("explicit")
        explicit["choices"] = nil
        XCTAssertEqual(
            C15tPayload.parseCommitIntent(try encode(explicit)),
            .custom([.measurement: true, .marketing: false])
        )
        guard case .iab = C15tPayload.parseCommitIntent(try encode(sample("iab"))) else {
            return XCTFail("an iab intent with every declared key must decode")
        }

        let action = try XCTUnwrap(intent["action"] as? [String: Any])
        for value in try XCTUnwrap(action["values"] as? [String]) where value != "explicit" && value != "iab" {
            let raw = try encode(["action": value])
            XCTAssertNotNil(
                C15tPayload.parseCommitIntent(raw),
                "action \"\(value)\" from the schema must decode"
            )
        }
    }

    func testAnIntentThatNamesAScopeIsRefusedNotWidened() {
        // Dropping `categories` would apply "all" to the whole choice scope, which is
        // more than a caller that scoped it asked for.
        for raw in [
            #"{"action":"all","categories":["measurement"]}"#,
            #"{"action":"necessary","categories":["measurement"]}"#,
            #"{"action":"explicit","consents":{"measurement":true},"categories":["measurement"]}"#,
            // A bulk action carrying consents conflicts with itself.
            #"{"action":"all","consents":{"marketing":false}}"#,
            #"{"action":"necessary","consents":{"marketing":true}}"#,
        ] {
            XCTAssertNil(C15tPayload.parseCommitIntent(raw), raw)
        }
    }

    func testTheOverridesDecoderReadsTheKeysTheSchemaDeclares() throws {
        var document: [String: Any] = [:]
        for key in try fields("overridesInput").keys {
            switch key {
            case "country": document[key] = "DE"
            case "region": document[key] = "BY"
            case "language": document[key] = "de"
            case "gpc": document[key] = true
            default: XCTFail("overridesInput.\(key) has no sample here; add one")
            }
        }
        let current = ConsentOverrides(country: nil, region: nil, language: "en", gpc: nil)

        let raw = try encode(document)
        guard case let .success(read) = C15tPayload.parseOverrides(raw, current: current) else {
            return XCTFail("a document naming every declared key must apply")
        }
        XCTAssertEqual(read, ConsentOverrides(country: "DE", region: "BY", language: "de", gpc: true))
    }

    private func encode(_ document: [String: Any]) throws -> String {
        String(decoding: try JSONSerialization.data(withJSONObject: document), as: UTF8.self)
    }

    /// One line per way `value` departs from `fields`; unknown keys count, since a rename is one.
    private func describe(_ fields: [String: Any], _ value: [String: Any], path: String) -> [String] {
        var problems: [String] = []
        for (key, raw) in fields {
            guard let field = raw as? [String: Any] else { continue }
            let at = path + key
            guard let item = value[key] else {
                if field["required"] as? Bool == true { problems.append("\(at): required, absent") }
                continue
            }
            if item is NSNull {
                if field["nullable"] as? Bool != true { problems.append("\(at): null, not nullable") }
                continue
            }
            let type = field["type"] as? String ?? "?"
            guard kind(of: item) == type else {
                problems.append("\(at): expected \(type), found \(kind(of: item))")
                continue
            }
            if let values = field["values"] as? [String], let text = item as? String, !values.contains(text) {
                problems.append("\(at): \"\(text)\" is not one of \(values)")
            }
            if let nested = field["fields"] as? [String: Any], !nested.isEmpty, let object = item as? [String: Any] {
                problems += describe(nested, object, path: "\(at).")
            }
        }
        for key in value.keys.sorted() where fields[key] == nil {
            problems.append("\(path)\(key): not declared")
        }
        return problems
    }

    private func kind(of value: Any) -> String {
        switch value {
        case is NSNull: return "null"
        case is [String: Any]: return "object"
        case is [Any]: return "array"
        case is String: return "string"
        case let number as NSNumber:
            return CFGetTypeID(number) == CFBooleanGetTypeID() ? "boolean" : "number"
        default: return "unknown"
        }
    }
}
