import CryptoKit
import Foundation
import XCTest

@testable import C15tCore

final class BundledPolicyTests: XCTestCase {
    private var vector: JSONValue {
        get throws {
            let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
                .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
                .appendingPathComponent("protocol/bundled-policy/parity.json")
            return try XCTUnwrap(C15tJSON.parse(Data(contentsOf: url)))
        }
    }
    private func resource(_ patch: (inout [String: JSONValue]) -> Void = { _ in }) throws
        -> BundledPolicyResource
    {
        let v = try vector
        var body = try XCTUnwrap(
            C15tJSON.parse(Data(v["resource"]!["payload"]!.stringValue!.utf8))?.objectValue)
        patch(&body)
        let payload = String(data: try C15tJSON.encode(JSONValue.object(body)), encoding: .utf8)!
        let wrapper = JSONValue.object([
            "payload": .string(payload),
            "sha256": .string(
                SHA256.hash(data: Data(payload.utf8)).map { String(format: "%02x", $0) }.joined()),
        ])
        return BundledPolicyResource(
            data: try C15tJSON.encode(wrapper), endpoint: v["endpoint"]!.stringValue!)
    }
    func testTypeScriptMatchingAndLocaleParity() throws {
        let v = try vector
        let resource = try resource()
        let now = v["now"]!.intValue!
        for row in v["cases"]!.arrayValue! {
            let inputs = row["inputs"]!
            let result = try XCTUnwrap(
                resource.resolve(
                    overrides: ConsentOverrides(
                        country: inputs["country"]?.stringValue,
                        region: inputs["region"]?.stringValue,
                        language: inputs["language"]!.stringValue!), now: now))
            XCTAssertEqual(result.response.policyResolution, row["expected"])
            XCTAssertEqual(result.response.location?.countryCode, inputs["country"]?.stringValue)
            XCTAssertEqual(
                result.response.translations?.language, row["expectedLanguage"]?.stringValue)
            XCTAssertNil(result.response.subjectId)
            XCTAssertNil(result.response.records)
            XCTAssertNil(result.response.policySnapshotToken)
        }
    }
    func testInvalidAuthorityCannotBootstrap() throws {
        let now = try vector["now"]!.intValue!
        let variants: [(inout [String: JSONValue]) -> Void] = [
            { $0["endpoint"] = .string("https://wrong.example.test") },
            { $0["schemaVersion"] = .integer(2) },
            { $0["expiresAt"] = .integer(now) },
            { $0["issuedAt"] = .integer(now + 1) },
            { $0["policyPacks"] = .array([]) },
        ]
        for patch in variants {
            XCTAssertNil(try resource(patch).resolve(overrides: .default(), now: now))
        }
        XCTAssertNil(
            BundledPolicyResource(
                data: Data("corrupt".utf8), endpoint: "https://wrong.example.test"
            ).resolve(overrides: .default(), now: now))
    }
    func testColdOfflineCommitRestoreCachePrecedenceAndExpiry() async throws {
        let store = InMemoryStore()
        let clock = TestClock(try vector["now"]!.intValue!)
        let bundle = try resource()
        func boot(_ resource: BundledPolicyResource) -> ConsentCore {
            let core = ConsentCore()
            core.bootstrap(
                CoreConfig(
                    store: store, bundledPolicy: resource, transport: OfflineTransport.offline(),
                    consentCategories: ConsentCategory.allCases, now: clock.reading,
                    initRetry: .disabled))
            return core
        }
        let core = boot(bundle)
        XCTAssertTrue(core.snapshot().ready)
        XCTAssertFalse(core.snapshot().policyPending)
        XCTAssertEqual(core.snapshot().promptRequirement.kind, .choice)
        for category in OptionalConsentCategory.ordered {
            XCTAssertFalse(core.isAllowed(category.category))
        }
        XCTAssertEqual(core.save(.all).status, .committed)
        await core.waitUntilIdle()
        XCTAssertTrue(core.isAllowed(.measurement))
        XCTAssertEqual(core.pendingSaveCount(), 1)
        let saved = core.snapshot().explicitChoice
        let older = try resource { body in
            var packs = body["policyPacks"]!.arrayValue!
            for index in packs.indices {
                var pack = packs[index].objectValue!
                var wire = pack["policyResolution"]!.objectValue!
                var fps = wire["fingerprints"]!.objectValue!
                fps["choice"] = .string(String(repeating: "a", count: 64))
                wire["fingerprints"] = .object(fps)
                pack["policyResolution"] = .object(wire)
                packs[index] = .object(pack)
            }
            body["policyPacks"] = .array(packs)
        }
        let restored = boot(older)
        await restored.waitUntilIdle()
        XCTAssertEqual(restored.snapshot().explicitChoice, saved)
        XCTAssertTrue(restored.isAllowed(.measurement))
        XCTAssertEqual(restored.save(.necessary).status, .committed)
        await restored.waitUntilIdle()
        XCTAssertFalse(boot(bundle).isAllowed(.measurement))
        clock.advance(by: 604_800_000)
        XCTAssertFalse(restored.isAllowed(.measurement))
        XCTAssertTrue(restored.snapshot().policyPending)
        XCTAssertNotEqual(restored.save(.all).status, .committed)
        XCTAssertTrue(boot(bundle).snapshot().policyPending)
    }
    func testExpiredCategoryAndIabBundlesAllowDurableWithdrawalWithoutRestoringGrants() async throws {
        for (name, restartBeforeWithdrawal) in [("parity", false), ("parity", true), ("iab", false), ("iab", true)] {
            let url = IABCommitTests.fixtureURL.deletingLastPathComponent().deletingLastPathComponent()
                .appendingPathComponent("bundled-policy/\(name).json")
            let source = try XCTUnwrap(C15tJSON.parse(Data(contentsOf: url)))
            let startedAt = source["now"]!.intValue!
            let endpoint = source["endpoint"]!.stringValue!
            var body = C15tJSON.parse(Data(source["resource"]!["payload"]!.stringValue!.utf8))!.objectValue!
            body["expiresAt"] = .integer(startedAt + 60_000)
            let payload = String(decoding: try XCTUnwrap(C15tJSON.encode(JSONValue.object(body))), as: UTF8.self)
            let raw = try XCTUnwrap(C15tJSON.encode(JSONValue.object([
                "payload": .string(payload),
                "sha256": .string(SHA256.hash(data: Data(payload.utf8)).map { String(format: "%02x", $0) }.joined()),
            ])))
            let resource = BundledPolicyResource(data: raw, endpoint: endpoint)
            let configuration = try source["configuration"].map { try C15tJSON.decode(IABConfiguration.self, from: XCTUnwrap(C15tJSON.encode($0))) }
            let selected = try XCTUnwrap(resource.resolve(overrides: .default(), now: startedAt))
            let store = InMemoryStore(), clock = TestClock(startedAt), http = StubHTTP()
            http.initResponse = HTTPResponse(status: 503)
            http.setSavesFail(true)
            func boot() async -> ConsentCore {
                let core = ConsentCore()
                await core.bootstrapAndSettle(CoreConfig(store: store, bundledPolicy: resource,
                    transport: Fixture.transport(http), consentCategories: ConsentCategory.allCases,
                    iab: configuration, now: clock.reading, initRetry: .disabled))
                return core
            }
            let first = await boot()
            XCTAssertEqual(first.save(.all).status, .committed, name)
            await first.waitUntilIdle()
            let queue = PendingSaveQueue(store: store, now: clock.reading)
            let grant = try XCTUnwrap(queue.entries().first)
            XCTAssertFalse(grant.isProtectedWithdrawal)
            XCTAssertTrue(first.isAllowed(.measurement))
            clock.advance(by: 60_001)
            let expired: ConsentCore
            if restartBeforeWithdrawal { expired = await boot() } else { expired = first }
            XCTAssertTrue(expired.snapshot().policyPending)
            XCTAssertNotEqual(expired.save(.all).status, .committed)
            XCTAssertNotEqual(expired.save(.custom([.measurement: true])).status, .committed)
            let revision = expired.snapshot().revision
            XCTAssertEqual(expired.save(.necessary, expectedRevision: revision - 1).error?.code, "concurrent-change")
            XCTAssertEqual(expired.save(.necessary, expectedRevision: revision).status, .committed, name)
            await expired.waitUntilIdle()
            XCTAssertEqual(queue.entries().count, 1)
            let withdrawal = try XCTUnwrap(queue.entries().first)
            XCTAssertTrue(withdrawal.isProtectedWithdrawal, name)
            XCTAssertNotEqual(grant.body, withdrawal.body)
            XCTAssertEqual(withdrawal.actionAt, clock.now)
            XCTAssertTrue(expired.snapshot().policyPending)
            let restored = await boot()
            XCTAssertEqual(queue.entries().map(\.body), [withdrawal.body])
            for category in OptionalConsentCategory.ordered { XCTAssertFalse(restored.isAllowed(category.category)) }
            let sentBefore = http.recordedSaveRequests.count
            http.setSavesFail(false)
            restored.flushPending()
            await restored.waitUntilIdle()
            XCTAssertTrue(queue.entries().isEmpty)
            XCTAssertEqual(http.recordedSaveRequests.dropFirst(sentBefore).map(\.body), [withdrawal.body])
            var online: [String: JSONValue] = ["policyResolution": selected.response.policyResolution!]
            online["gvl"] = body["disclosures"]?["gvl"]?["data"]
            online["adTechProviders"] = body["disclosures"]?["atp"]?["providers"]
            http.initResponse = HTTPResponse(status: 200, headers: ["x-c15t-policy-contract": "1"], body: try XCTUnwrap(C15tJSON.encode(JSONValue.object(online))))
            restored.refresh()
            await restored.waitUntilIdle()
            XCTAssertNil(restored.bundledPolicyInfo)
            XCTAssertFalse(restored.snapshot().policyPending)
            for category in OptionalConsentCategory.ordered { XCTAssertFalse(restored.isAllowed(category.category), name) }
        }
    }

    func testOfflineIabDisclosuresUseOriginalDatesAndRefuseMissingOrStaleAuthority() async throws {
        let url = IABCommitTests.fixtureURL.deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("bundled-policy/iab.json")
        let v = try XCTUnwrap(C15tJSON.parse(Data(contentsOf: url)))
        let now = v["now"]!.intValue!
        let configuration = try C15tJSON.decode(
            IABConfiguration.self, from: C15tJSON.encode(v["configuration"]!))
        for fault in [
            "valid", "missing-gvl", "stale-gvl", "future-gvl", "missing-atp", "stale-atp",
            "future-atp",
        ] {
            var body = C15tJSON.parse(Data(v["resource"]!["payload"]!.stringValue!.utf8))!
                .objectValue!
            var disclosures = body["disclosures"]!.objectValue!
            let key = fault.hasSuffix("gvl") ? "gvl" : "atp"
            if fault.hasPrefix("missing") { disclosures.removeValue(forKey: key) }
            if fault.hasPrefix("stale") || fault.hasPrefix("future") {
                var disclosure = disclosures[key]!.objectValue!
                disclosure["fetchedAt"] = .integer(
                    fault.hasPrefix("stale") ? now - 604_800_000 : now + 1)
                disclosures[key] = .object(disclosure)
            }
            body["disclosures"] = .object(disclosures)
            let payload = String(
                data: try C15tJSON.encode(JSONValue.object(body)), encoding: .utf8)!
            let raw = try XCTUnwrap(
                C15tJSON.encode(
                    JSONValue.object([
                        "payload": .string(payload),
                        "sha256": .string(
                            SHA256.hash(data: Data(payload.utf8)).map { String(format: "%02x", $0) }
                                .joined()),
                    ])))
            let store = InMemoryStore()
            let core = ConsentCore()
            core.bootstrap(
                CoreConfig(
                    store: store,
                    bundledPolicy: BundledPolicyResource(
                        data: raw, endpoint: v["endpoint"]!.stringValue!),
                    transport: OfflineTransport.offline(), iab: configuration, now: { now },
                    initRetry: .disabled))
            await core.waitUntilIdle()
            if fault == "valid" {
                XCTAssertNotNil(core.openIABDraft())
                XCTAssertEqual(core.save(.all).status, .committed)
                await core.waitUntilIdle()
                let envelope = try XCTUnwrap(
                    store.data(for: StorageKey.snapshot).flatMap(StoredEnvelope.decode))
                XCTAssertEqual(envelope.iabListFetchedAt, now - 1000)
                XCTAssertEqual(envelope.additionalConsentList?.fetchedAt, now - 2000)
                let relaunched = ConsentCore()
                relaunched.bootstrap(
                    CoreConfig(
                        store: store,
                        bundledPolicy: BundledPolicyResource(
                            data: raw, endpoint: v["endpoint"]!.stringValue!), iab: configuration,
                        now: { now + 5000 }))
                XCTAssertNotNil(relaunched.iabConsent())
                XCTAssertEqual(relaunched.adTechProviderDisclosures()?.map(\.id), [1, 2])
            } else {
                XCTAssertNil(core.openIABDraft(), fault)
                XCTAssertNotEqual(core.save(.all).status, .committed, fault)
                XCTAssertFalse(core.isAllowed(.marketing), fault)
                if fault == "stale-atp" { XCTAssertNotNil(core.adTechProviderDisclosures()) }
                if fault == "stale-gvl" { XCTAssertNotNil(core.globalVendorList()) }
            }
        }
    }

    func testHostedRefreshPreservesSameFingerprintAndRepromptsForChangedFingerprint() async throws {
        let store = InMemoryStore()
        let clock = TestClock(try vector["now"]!.intValue!)
        let bundle = try resource()
        let core = ConsentCore()
        core.bootstrap(CoreConfig(store: store, bundledPolicy: bundle, now: clock.reading))
        XCTAssertEqual(core.save(.all).status, .committed)
        await core.waitUntilIdle()
        let saved = core.snapshot().explicitChoice
        let selected = try XCTUnwrap(bundle.resolve(overrides: .default(), now: clock.now))
        let http = StubHTTP()
        http.initResponse = Fixture.initResponse(
            policyResolution: selected.response.policyResolution)
        let online = ConsentCore()
        await online.bootstrapAndSettle(
            CoreConfig(
                store: store, bundledPolicy: bundle, transport: Fixture.transport(http),
                now: clock.reading, initRetry: .disabled))
        XCTAssertNil(online.bundledPolicyInfo)
        XCTAssertEqual(online.snapshot().explicitChoice, saved)
        XCTAssertTrue(online.isAllowed(.measurement))
        var wire = selected.response.policyResolution!.objectValue!
        var fingerprints = wire["fingerprints"]!.objectValue!
        fingerprints["choice"] = .string(String(repeating: "d", count: 64))
        wire["fingerprints"] = .object(fingerprints)
        http.initResponse = Fixture.initResponse(policyResolution: .object(wire))
        online.refresh()
        await online.waitUntilIdle()
        XCTAssertEqual(online.snapshot().promptRequirement.kind, .choice)
        XCTAssertFalse(online.isAllowed(.measurement))
    }

    func testExpiredStoredAuthorityAdoptsNewResourceAndDeadlineNotifiesGate() async throws {
        let store = InMemoryStore()
        let clock = TestClock(try vector["now"]!.intValue!)
        let old = try resource { $0["expiresAt"] = .integer(clock.now + 100) }
        let first = ConsentCore()
        first.bootstrap(CoreConfig(store: store, bundledPolicy: old, now: clock.reading))
        XCTAssertEqual(first.save(.all).status, .committed)
        await first.waitUntilIdle()
        let revision = first.snapshot().revision
        let expired = expectation(
            description: "Bundle expiry closes the gate without a read or network")
        let gate = first.gate(.measurement) { if !$0 { expired.fulfill() } }
        clock.advance(by: 100)
        await fulfillment(of: [expired], timeout: 3)
        gate.cancel()
        XCTAssertGreaterThan(first.snapshot().revision, revision)
        XCTAssertFalse(first.isReady())
        let newer = try resource {
            $0["issuedAt"] = .integer(clock.now)
            $0["expiresAt"] = .integer(clock.now + 100000)
            $0["manifestRevision"] = .string("newer-manifest")
        }
        let relaunched = ConsentCore()
        relaunched.bootstrap(CoreConfig(store: store, bundledPolicy: newer, now: clock.reading))
        XCTAssertFalse(relaunched.snapshot().policyPending)
        XCTAssertEqual(relaunched.bundledPolicyInfo?.manifestRevision, "newer-manifest")
        XCTAssertTrue(relaunched.isAllowed(.measurement))
    }

    func testPermissiveKnownPolicyDoesNotSupplyImplicitBundleGrants() throws {
        let core = ConsentCore()
        let now = try vector["now"]!.intValue!
        core.bootstrap(
            CoreConfig(
                bundledPolicy: try resource(),
                overrides: ConsentOverrides(country: "US", region: nil, language: "fr-CA"),
                now: { now }))
        XCTAssertFalse(core.snapshot().policyPending)
        XCTAssertEqual(core.snapshot().resolution.policyId, "us_permissive")
        XCTAssertNil(core.snapshot().explicitChoice)
        for category in OptionalConsentCategory.ordered {
            XCTAssertFalse(core.isAllowed(category.category))
        }
    }

}
