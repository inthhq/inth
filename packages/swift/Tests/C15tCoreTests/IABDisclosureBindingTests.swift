import Foundation
import XCTest

@_spi(C15tInternal) @testable import C15tCore

extension IABCommitTests {
    func testKnownDisclosureNormalizationRetainsItsDigest() throws {
        var normalized = try fixture().gvl
        normalized.additionalFields = nil
        XCTAssertEqual(try IABAuthority.disclosureID(normalized), "gvl-v2:e11338afe79056b7eec405277d79991bb8a5cc4fd3aa90e531ffd568ea4fc03f")
    }

    func testLegacyProjectedDisclosureBindingCannotRestoreAuthority() async throws {
        let source = try fixture()
        var gvl = source.gvl
        gvl.additionalFields = nil
        let vector = Vector(invalidChoices: [], invalidConfigurations: [], now: source.now, gvl: gvl, cases: source.cases)
        let store = InMemoryStore()
        let first = try await boot(vector, configuration: source.cases[0].configuration, store: store)
        XCTAssertEqual(first.save(.all).status, .committed)
        await first.waitUntilIdle()
        let oldBinding = "e11338afe79056b7eec405277d79991bb8a5cc4fd3aa90e531ffd568ea4fc03f"
        let raw = try XCTUnwrap(store.data(for: StorageKey.snapshot))
        let envelope = try XCTUnwrap(C15tJSON.parse(raw))
        let legacy = disclosureReplacing(["iabConsent", "disclosureID"], in: envelope, value: .string(oldBinding))
        store.set(try XCTUnwrap(C15tJSON.encode(legacy)), for: StorageKey.snapshot)
        let cold = ConsentCore()
        cold.bootstrap(CoreConfig(store: store, iab: source.cases[0].configuration,
                                  now: { source.now }, flushPendingOnBootstrap: false))
        XCTAssertNil(cold.iabConsent())
        XCTAssertFalse(cold.isIABAllowed(vendorId: 1, purposeId: 1, basis: .consent))
        XCTAssertFalse(cold.isAllowed(.marketing))
    }

    func testUnknownDisclosureChangesInvalidateGrantsAfterColdLaunch() async throws {
        let source = try fixture()
        let document = try XCTUnwrap(C15tJSON.parse(C15tJSON.encode(source.gvl)))
        for path in [["futureField"], ["vendors", "1", "futureField"], ["purposes", "1", "futureField"],
                     ["vendors", "1", "urls"], ["vendors", "1", "dataRetention"],
                     ["vendors", "1", "overflow"], ["standardTexts"]] {
            let before = disclosureReplacing(path, in: document, value: disclosureValue(path, "before"))
            let after = disclosureReplacing(path, in: document, value: disclosureValue(path, "after"))
            let gvl = try XCTUnwrap(GlobalVendorList.read(from: before))
            let vector = Vector(invalidChoices: [], invalidConfigurations: [], now: source.now,
                                gvl: gvl, cases: source.cases)
            let store = InMemoryStore()
            let http = StubHTTP()
            let first = try await boot(vector, configuration: source.cases[0].configuration, store: store, http: http)
            XCTAssertEqual(first.save(.all).status, .committed, path.joined(separator: "."))
            await first.waitUntilIdle()
            let saved = try XCTUnwrap(first.iabConsent())
            let cold = ConsentCore()
            cold.bootstrap(CoreConfig(store: store, iab: source.cases[0].configuration,
                                      now: { source.now }, flushPendingOnBootstrap: false))
            XCTAssertEqual(cold.iabConsent(), saved)
            let restored = try XCTUnwrap(cold.globalVendorList())
            let wire = try XCTUnwrap(C15tJSON.parse(C15tJSON.encode(restored)))
            if path.last == "dataRetention" {
                XCTAssertEqual(disclosureAt(path, in: wire)?["futureField"], .string("before"))
            } else {
                XCTAssertEqual(disclosureAt(path, in: wire), disclosureValue(path, "before"))
            }
            XCTAssertEqual(try IABAuthority.disclosureID(restored), try IABAuthority.disclosureID(gvl))

            var fields = C15tJSON.parse(http.initResponse.body)!.objectValue!
            fields["gvl"] = after
            http.initResponse = HTTPResponse(status: 200, body: try C15tJSON.encode(JSONValue.object(fields)))
            first.refresh()
            await first.waitUntilIdle()
            XCTAssertNil(first.iabConsent(), path.joined(separator: "."))
            XCTAssertFalse(first.isIABAllowed(vendorId: 1, purposeId: 1, basis: .consent))
            XCTAssertEqual(first.pendingSaveCount(), 0)
        }
    }

    func testGVLToleranceDoesNotAdmitUnknownConsentAuthority() async throws {
        let source = try fixture()
        let store = InMemoryStore()
        let document = try XCTUnwrap(C15tJSON.parse(C15tJSON.encode(source.gvl)))
        let gvl = try XCTUnwrap(GlobalVendorList.read(from: disclosureReplacing(["futureField"], in: document, value: .string("legal"))))
        let vector = Vector(invalidChoices: [], invalidConfigurations: [], now: source.now, gvl: gvl, cases: source.cases)
        let core = try await boot(vector, configuration: source.cases[0].configuration, store: store)
        XCTAssertEqual(core.save(.all).status, .committed)
        await core.waitUntilIdle()
        let raw = try XCTUnwrap(store.data(for: StorageKey.snapshot))
        XCTAssertNotNil(StoredEnvelope.decode(raw))
        let envelope = try XCTUnwrap(C15tJSON.parse(raw))
        let tampered = disclosureReplacing(["iabConsent", "futureAuthority"], in: envelope, value: .bool(true))
        XCTAssertNil(StoredEnvelope.decode(try XCTUnwrap(C15tJSON.encode(tampered))))
    }

    func testUnknownDisclosureKeysAreOrderIndependentAndNarrowWithTheirVendor() throws {
        let source = try fixture()
        var document = try XCTUnwrap(C15tJSON.parse(C15tJSON.encode(source.gvl)))
        document = disclosureReplacing(["futureField"], in: document, value: .object(["z": .integer(1), "a": .string("legal")]))
        document = disclosureReplacing(["vendors", "1", "futureField"], in: document, value: .string("kept"))
        document = disclosureReplacing(["vendors", "2", "futureField"], in: document, value: .string("removed"))
        let gvl = try XCTUnwrap(GlobalVendorList.read(from: document))
        let reordered = try XCTUnwrap(GlobalVendorList.read(from: disclosureReversed(document)))
        XCTAssertEqual(try IABAuthority.disclosureID(gvl), try IABAuthority.disclosureID(reordered))
        let narrowed = gvl.narrowed(toVendorIds: [1])
        let wire = try XCTUnwrap(C15tJSON.parse(C15tJSON.encode(narrowed)))
        XCTAssertEqual(wire["futureField"], document["futureField"])
        XCTAssertEqual(wire["vendors"]?["1"]?["futureField"], .string("kept"))
        XCTAssertNil(wire["vendors"]?["2"])
        let changedRemoved = disclosureReplacing(["vendors", "2", "futureField"], in: document, value: .string("irrelevant"))
        let other = try XCTUnwrap(GlobalVendorList.read(from: changedRemoved)).narrowed(toVendorIds: [1])
        XCTAssertEqual(try IABAuthority.disclosureID(narrowed), try IABAuthority.disclosureID(other))
    }
}

private func disclosureValue(_ path: [String], _ text: String) -> JSONValue {
    if path.last == "urls" {
        return .array([.object(["langId": .string("EN"), "futureField": .string(text)])])
    }
    if path.last == "dataRetention" {
        return .object(["stdRetention": .integer(30), "futureField": .string(text)])
    }
    if path.last == "overflow" {
        return .object(["httpGetLimit": .integer(1024), "futureField": .string(text)])
    }
    if path.last == "standardTexts" {
        return .object(["features": .string("Features"), "futureField": .string(text)])
    }
    return .object(["legal": .string(text), "nested": .array([.integer(1), .null])])
}

private func disclosureAt(_ path: [String], in value: JSONValue) -> JSONValue? {
    path.reduce(Optional(value)) { $0?[$1] }
}

private func disclosureReplacing(_ path: [String], in value: JSONValue, value replacement: JSONValue) -> JSONValue {
    guard let key = path.first else { return replacement }
    var fields = value.objectValue ?? [:]
    fields[key] = disclosureReplacing(Array(path.dropFirst()), in: fields[key] ?? .object([:]), value: replacement)
    return .object(fields)
}

private func disclosureReversed(_ value: JSONValue) -> JSONValue {
    switch value {
    case .object(let fields): return .object(Dictionary(uniqueKeysWithValues: fields.sorted { $0.key > $1.key }.map { ($0.key, disclosureReversed($0.value)) }))
    case .array(let items): return .array(items.map(disclosureReversed))
    default: return value
    }
}
