import CryptoKit
import Foundation
import XCTest

@_spi(InthInternal) @testable import InthCore

final class BundledPolicyTests: XCTestCase {
    private var vector: JSONValue {
        get throws {
            let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
                .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
                .appendingPathComponent("native-protocol/bundled-policy/parity.json")
            return try XCTUnwrap(InthJSON.parse(Data(contentsOf: url)))
        }
    }
    private func resource(_ patch: (inout [String: JSONValue]) -> Void = { _ in }) throws
        -> BundledPolicyResource
    {
        let v = try vector
        var body = try XCTUnwrap(
            InthJSON.parse(Data(v["resource"]!["payload"]!.stringValue!.utf8))?.objectValue)
        patch(&body)
        let payload = String(data: try InthJSON.encode(JSONValue.object(body)), encoding: .utf8)!
        let wrapper = JSONValue.object([
            "payload": .string(payload),
            "sha256": .string(
                SHA256.hash(data: Data(payload.utf8)).map { String(format: "%02x", $0) }.joined()),
        ])
        return BundledPolicyResource(
            data: try InthJSON.encode(wrapper), endpoint: v["endpoint"]!.stringValue!)
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
    func testEveryMalformedSharedResourceIsRefusedOrCarriesNoUsableVendorList() throws {
        let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("native-protocol/bundled-policy/invalid-resources.json")
        let fixture = try XCTUnwrap(InthJSON.parse(Data(contentsOf: url)))
        var problems: [String] = []
        for row in try XCTUnwrap(fixture["cases"]?.arrayValue) {
            let name = row["name"]?.stringValue ?? "?"
            let data = try XCTUnwrap(InthJSON.encode(row["resource"] ?? .null))
            let selection = BundledPolicyResource(data: data, endpoint: row["endpoint"]?.stringValue ?? "")
                .resolve(overrides: .default(), now: row["now"]?.intValue ?? 0)
            if row["expect"]?.stringValue == "refused" {
                if selection != nil { problems.append("\(name): accepted") }
            } else if let selection, selection.response.gvl != nil, selection.gvlFetchedAt != nil {
                problems.append("\(name): usable list")
            } else if selection == nil {
                problems.append("\(name): refused")
            }
        }
        XCTAssertEqual(problems, [])
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
                    store: store, bundledPolicy: resource, transport: UnreachableTransport(),
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
        XCTAssertFalse(restored.snapshot().policyPending)
        XCTAssertTrue(restored.isPolicyStale)
        XCTAssertEqual(restored.save(.all).status, .committed)
        await restored.waitUntilIdle()
        XCTAssertTrue(boot(bundle).isAllowed(.measurement))
    }
    func testNoticeDismissalSurvivesOfflineRestartPastManifestExpiry() async throws {
        let clock = TestClock(try vector["now"]!.intValue!)
        let bundle = try resource { body in
            body["expiresAt"] = .integer(clock.now + 60_000)
            var packs = body["policyPacks"]!.arrayValue!
            let index = packs.firstIndex { $0["policyResolution"]?["policyId"]?.stringValue == "us_permissive" }!
            var pack = packs[index].objectValue!
            var wire = pack["policyResolution"]!.objectValue!
            var policy = wire["policy"]!.objectValue!
            policy["prompt"] = .string("notice")
            policy["actions"] = .object([
                "allowed": .array([.string("dismiss")]),
                "required": .array([]),
                "equivalent": .array([]),
            ])
            wire["policy"] = .object(policy)
            pack["policyResolution"] = .object(wire)
            packs[index] = .object(pack)
            body["policyPacks"] = .array(packs)
        }
        let store = InMemoryStore()
        func boot() async -> ConsentCore {
            let core = ConsentCore()
            await core.bootstrapAndSettle(CoreConfig(
                store: store, bundledPolicy: bundle, transport: UnreachableTransport(),
                consentCategories: ConsentCategory.allCases,
                overrides: ConsentOverrides(country: "US", region: nil, language: "en"),
                now: clock.reading, initRetry: .disabled))
            return core
        }
        let first = await boot()
        XCTAssertEqual(first.snapshot().promptRequirement.kind, .notice)
        XCTAssertTrue(first.dismissNotice())
        XCTAssertNil(first.snapshot().explicitChoice)
        for category in OptionalConsentCategory.ordered {
            XCTAssertFalse(first.isAllowed(category.category))
        }
        clock.advance(by: 60_001)
        let restored = await boot()
        XCTAssertFalse(restored.snapshot().policyPending)
        XCTAssertTrue(restored.isPolicyStale)
        XCTAssertNil(restored.snapshot().explicitChoice)
        for category in OptionalConsentCategory.ordered {
            XCTAssertFalse(restored.isAllowed(category.category))
        }
        XCTAssertEqual(restored.save(.all).status, .committed)
    }

    func testExpiredCategoryAndIabBundlesKeepRecordingGrantsAndWithdrawals() async throws {
        let cases: [(String, Bool, String?)] = [("parity", false, nil), ("parity", true, nil), ("iab", false, nil), ("iab", true, nil)]
        for (name, restartBeforeWithdrawal, country) in cases {
            let url = IABCommitTests.fixtureURL.deletingLastPathComponent().deletingLastPathComponent()
                .appendingPathComponent("bundled-policy/\(name).json")
            let source = try XCTUnwrap(InthJSON.parse(Data(contentsOf: url)))
            let startedAt = source["now"]!.intValue!
            let endpoint = source["endpoint"]!.stringValue!
            var body = InthJSON.parse(Data(source["resource"]!["payload"]!.stringValue!.utf8))!.objectValue!
            body["expiresAt"] = .integer(startedAt + 60_000)
            let payload = String(decoding: try XCTUnwrap(InthJSON.encode(JSONValue.object(body))), as: UTF8.self)
            let raw = try XCTUnwrap(InthJSON.encode(JSONValue.object([
                "payload": .string(payload),
                "sha256": .string(SHA256.hash(data: Data(payload.utf8)).map { String(format: "%02x", $0) }.joined()),
            ])))
            let resource = BundledPolicyResource(data: raw, endpoint: endpoint)
            let configuration = try source["configuration"].map { try InthJSON.decode(IABConfiguration.self, from: XCTUnwrap(InthJSON.encode($0))) }
            let overrides = ConsentOverrides(country: country, region: nil, language: "en")
            let selected = try XCTUnwrap(resource.resolve(overrides: overrides, now: startedAt))
            let store = InMemoryStore(), clock = TestClock(startedAt), http = StubHTTP()
            http.initResponse = HTTPResponse(status: 503)
            http.setSavesFail(true)
            func boot(_ categories: [ConsentCategory]? = ConsentCategory.allCases) async -> ConsentCore {
                let core = ConsentCore()
                await core.bootstrapAndSettle(CoreConfig(store: store, bundledPolicy: resource,
                    transport: HostedTransport(baseURL: URL(string: endpoint)!, client: http), consentCategories: categories,
                    iab: configuration, overrides: overrides, now: clock.reading, initRetry: .disabled))
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
            let narrowed: [ConsentCategory]? = [.necessary, .measurement]
            if restartBeforeWithdrawal { expired = await boot(narrowed) } else { expired = first }
            XCTAssertFalse(expired.snapshot().policyPending, name)
            XCTAssertTrue(expired.isPolicyStale, name)
            let revision = expired.snapshot().revision
            XCTAssertEqual(expired.save(.necessary, expectedRevision: revision - 1).error?.code, "concurrent-change")
            XCTAssertEqual(expired.save(.necessary, expectedRevision: revision).status, .committed, name)
            await expired.waitUntilIdle()
            let withdrawal = try XCTUnwrap(queue.entries().last)
            let frozen = try XCTUnwrap(InthJSON.parse(withdrawal.body))
            XCTAssertEqual(frozen["preferences"]?["measurement"]?.boolValue, false, name)
            XCTAssertNotEqual(grant.body, withdrawal.body)
            XCTAssertEqual(withdrawal.actionAt, clock.now)
            XCTAssertFalse(expired.isAllowed(.measurement), name)
            let restored = await boot(narrowed)
            XCTAssertEqual(queue.entries().last?.body, withdrawal.body)
            XCTAssertFalse(restored.isAllowed(.measurement), name)
            var online: [String: JSONValue] = ["policyResolution": selected.response.policyResolution!]
            online["gvl"] = body["disclosures"]?["gvl"]?["data"]
            online["adTechProviders"] = body["disclosures"]?["atp"]?["providers"]
            http.initResponse = HTTPResponse(status: 200, headers: ["x-c15t-policy-contract": "1"], body: try XCTUnwrap(InthJSON.encode(JSONValue.object(online))))
            restored.refresh()
            await restored.waitUntilIdle()
            XCTAssertNil(restored.bundledPolicyInfo)
            XCTAssertFalse(restored.snapshot().policyPending)
            XCTAssertFalse(restored.isAllowed(.measurement), name)
        }
    }

    func testStoredBundleUsesConfiguredEndpointWithoutSeedResource() async throws {
        for mode in ["same", "different", "unconfigured"] {
            let bundle = try resource()
            let clock = TestClock(try vector["now"]!.intValue!), store = InMemoryStore(), http = StubHTTP()
            http.initResponse = HTTPResponse(status: 503)
            http.setSavesFail(true)
            let hosted = HostedTransport(baseURL: URL(string: bundle.endpoint)!, client: http)
            let first = ConsentCore()
            await first.bootstrapAndSettle(CoreConfig(store: store, bundledPolicy: bundle,
                transport: hosted, now: clock.reading, initRetry: .disabled))
            XCTAssertEqual(first.save(.all).status, .committed)
            await first.waitUntilIdle()
            let next = ConsentCore()
            let transport: (any InthTransport)? = mode == "same" ? hosted : mode == "different"
                ? HostedTransport(baseURL: URL(string: "https://other.example.test")!, client: http) : nil
            await next.bootstrapAndSettle(CoreConfig(store: store, transport: transport,
                now: clock.reading, initRetry: .disabled))
            XCTAssertEqual(next.isReady(), mode == "same", mode)
            XCTAssertEqual(next.isAllowed(.measurement), mode == "same", mode)
            XCTAssertEqual(next.save(.necessary).status == .committed, mode == "same", mode)
        }
    }

    func testConfiguredEndpointRejectsMismatchedSeedOnBootstrapAndOverrideChange() async throws {
        let bundle = try resource(), http = StubHTTP()
        http.initResponse = HTTPResponse(status: 503)
        let core = ConsentCore()
        let now = try vector["now"]!.intValue!
        await core.bootstrapAndSettle(CoreConfig(bundledPolicy: bundle,
            transport: HostedTransport(baseURL: URL(string: "https://other.example.test")!, client: http),
            now: { now }, initRetry: .disabled))
        XCTAssertTrue(core.snapshot().policyPending)
        XCTAssertNil(core.bundledPolicyInfo)
        core.setOverrides(ConsentOverrides(country: "US", region: nil, language: "en"))
        await core.waitUntilIdle()
        XCTAssertTrue(core.snapshot().policyPending)
        XCTAssertNil(core.bundledPolicyInfo)
        XCTAssertNotEqual(core.save(.necessary).status, .committed)
    }

    func testOfflineIabDisclosuresUseOriginalDatesAndRefuseMissingOrStaleAuthority() async throws {
        let url = IABCommitTests.fixtureURL.deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("bundled-policy/iab.json")
        let v = try XCTUnwrap(InthJSON.parse(Data(contentsOf: url)))
        let now = v["now"]!.intValue!
        let configuration = try InthJSON.decode(
            IABConfiguration.self, from: InthJSON.encode(v["configuration"]!))
        // An older CLI wrote no `customVendors`; an unreadable list still loads the bundle, with none.
        for fault in [
            "valid", "missing-gvl", "stale-gvl", "future-gvl", "missing-atp", "stale-atp",
            "future-atp", "no-custom-vendors", "invalid-custom-vendors",
        ] {
            var body = InthJSON.parse(Data(v["resource"]!["payload"]!.stringValue!.utf8))!
                .objectValue!
            var disclosures = body["disclosures"]!.objectValue!
            let key = fault.hasSuffix("gvl") ? "gvl" : "atp"
            if fault.hasPrefix("missing") { disclosures.removeValue(forKey: key) }
            if fault == "no-custom-vendors" { disclosures.removeValue(forKey: "customVendors") }
            if fault == "invalid-custom-vendors" { disclosures["customVendors"] = .string("invalid") }
            if fault.hasPrefix("stale") || fault.hasPrefix("future") {
                var disclosure = disclosures[key]!.objectValue!
                disclosure["fetchedAt"] = .integer(
                    fault.hasPrefix("stale") ? now - 604_800_000 : now + 1)
                disclosures[key] = .object(disclosure)
            }
            body["disclosures"] = .object(disclosures)
            let payload = String(
                data: try InthJSON.encode(JSONValue.object(body)), encoding: .utf8)!
            let raw = try XCTUnwrap(
                InthJSON.encode(
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
                    transport: UnreachableTransport(), iab: configuration, now: { now },
                    initRetry: .disabled))
            await core.waitUntilIdle()
            if fault == "valid" || fault.hasSuffix("custom-vendors") {
                XCTAssertNotNil(core.openIABDraft(), fault)
                // A launch served only by the bundle lists its custom vendors, and Accept all
                // grants them.
                let listed = fault == "valid" ? ["internal-ads"] : []
                XCTAssertEqual(core.iabCustomVendors().map(\.id), listed, fault)
                XCTAssertEqual(core.save(.all).status, .committed, fault)
                XCTAssertEqual(core.iabConsent()?.choices.customVendorConsents, listed, fault)
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

    /// A bundle from an older CLI has no `customVendors` key. Adopted over a held list, it keeps the
    /// list and its grants: unlike a live `/init`, its silence says nothing about the publisher.
    func testANewerBundleWithoutCustomVendorsKeepsTheHeldList() async throws {
        let url = IABCommitTests.fixtureURL.deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("bundled-policy/iab.json")
        let v = try XCTUnwrap(InthJSON.parse(Data(contentsOf: url)))
        let now = v["now"]!.intValue!
        let endpoint = v["endpoint"]!.stringValue!
        let configuration = try InthJSON.decode(
            IABConfiguration.self, from: InthJSON.encode(v["configuration"]!))
        let original = InthJSON.parse(Data(v["resource"]!["payload"]!.stringValue!.utf8))!
            .objectValue!
        func resource(_ body: [String: JSONValue]) throws -> BundledPolicyResource {
            let payload = String(data: try InthJSON.encode(JSONValue.object(body)), encoding: .utf8)!
            let digest = SHA256.hash(data: Data(payload.utf8)).map { String(format: "%02x", $0) }
                .joined()
            let data = try XCTUnwrap(InthJSON.encode(
                JSONValue.object(["payload": .string(payload), "sha256": .string(digest)])))
            return BundledPolicyResource(data: data, endpoint: endpoint)
        }
        let store = InMemoryStore()
        let first = ConsentCore()
        first.bootstrap(
            CoreConfig(
                store: store, bundledPolicy: try resource(original),
                transport: UnreachableTransport(), iab: configuration, now: { now },
                initRetry: .disabled))
        await first.waitUntilIdle()
        XCTAssertEqual(first.save(.all).status, .committed)
        XCTAssertEqual(first.iabConsent()?.choices.customVendorConsents, ["internal-ads"])
        await first.waitUntilIdle()

        var newer = original
        newer["issuedAt"] = .integer(now + 1000)
        var disclosures = newer["disclosures"]!.objectValue!
        disclosures.removeValue(forKey: "customVendors")
        newer["disclosures"] = .object(disclosures)
        let second = ConsentCore()
        second.bootstrap(
            CoreConfig(
                store: store, bundledPolicy: try resource(newer),
                transport: UnreachableTransport(), iab: configuration, now: { now + 5000 },
                initRetry: .disabled))
        await second.waitUntilIdle()
        XCTAssertEqual(second.iabCustomVendors().map(\.id), ["internal-ads"])
        XCTAssertEqual(second.iabConsent()?.choices.customVendorConsents, ["internal-ads"])
    }

    /// A newer bundle that lists none withdraws the vendor and its grant, and the withdrawal is
    /// stored: a relaunch with the older bundle, which is not adopted again, must not bring it back.
    func testANewerBundleListingNoneWithdrawsThemAcrossARelaunch() async throws {
        let url = IABCommitTests.fixtureURL.deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("bundled-policy/iab.json")
        let v = try XCTUnwrap(InthJSON.parse(Data(contentsOf: url)))
        let now = v["now"]!.intValue!
        let endpoint = v["endpoint"]!.stringValue!
        let configuration = try InthJSON.decode(
            IABConfiguration.self, from: InthJSON.encode(v["configuration"]!))
        let original = InthJSON.parse(Data(v["resource"]!["payload"]!.stringValue!.utf8))!
            .objectValue!
        let store = InMemoryStore()
        func launch(_ body: [String: JSONValue], at: Int64) async throws -> ConsentCore {
            let payload = String(data: try InthJSON.encode(JSONValue.object(body)), encoding: .utf8)!
            let digest = SHA256.hash(data: Data(payload.utf8)).map { String(format: "%02x", $0) }
                .joined()
            let data = try XCTUnwrap(InthJSON.encode(
                JSONValue.object(["payload": .string(payload), "sha256": .string(digest)])))
            let core = ConsentCore()
            core.bootstrap(
                CoreConfig(
                    store: store, bundledPolicy: BundledPolicyResource(data: data, endpoint: endpoint),
                    transport: UnreachableTransport(), iab: configuration, now: { at },
                    initRetry: .disabled))
            await core.waitUntilIdle()
            return core
        }
        let first = try await launch(original, at: now)
        XCTAssertEqual(first.save(.all).status, .committed)
        await first.waitUntilIdle()

        var withdrawn = original
        withdrawn["issuedAt"] = .integer(now + 1000)
        var disclosures = withdrawn["disclosures"]!.objectValue!
        disclosures["customVendors"] = .array([])
        withdrawn["disclosures"] = .object(disclosures)
        let second = try await launch(withdrawn, at: now + 5000)
        XCTAssertEqual(second.iabCustomVendors(), [])
        XCTAssertEqual(second.iabConsent()?.choices.customVendorConsents, [])

        let third = try await launch(original, at: now + 6000)
        XCTAssertEqual(third.iabCustomVendors(), [])
        XCTAssertFalse(third.isCustomVendorAllowed("internal-ads"))
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
                store: store, bundledPolicy: bundle, transport: HostedTransport(baseURL: URL(string: bundle.endpoint)!, client: http),
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

    func testManifestExpiringInUseKeepsPromptingAndEmitsPolicyStaleOnce() async throws {
        let clock = TestClock(try vector["now"]!.intValue!)
        let expiry = clock.now + 100
        let bundle = try resource { $0["expiresAt"] = .integer(expiry) }
        let core = ConsentCore()
        await core.bootstrapAndSettle(CoreConfig(
            bundledPolicy: bundle, transport: UnreachableTransport(),
            consentCategories: ConsentCategory.allCases, now: clock.reading, initRetry: .disabled))
        XCTAssertFalse(core.isPolicyStale)
        let stream = core.eventStream
        let stale = expectation(description: "policyStale once")
        let listener = Task {
            for await event in stream {
                if case let .policyStale(authority) = event {
                    XCTAssertEqual(authority.expiresAt, expiry)
                    stale.fulfill()
                }
            }
        }
        clock.advance(by: 100)
        await fulfillment(of: [stale], timeout: 3)
        XCTAssertTrue(core.isPolicyStale)
        XCTAssertFalse(core.snapshot().policyPending)
        XCTAssertNotEqual(core.snapshot().error?.code, "bundled-policy-unusable")
        XCTAssertTrue(core.isReady())
        for category in OptionalConsentCategory.ordered {
            XCTAssertFalse(core.isAllowed(category.category))
        }
        XCTAssertEqual(core.save(.all).status, .committed)
        await core.waitUntilIdle()
        XCTAssertTrue(core.isAllowed(.measurement))
        listener.cancel()
    }

    func testFirstOfflineLaunchWithExpiredManifestPromptsAndEmitsPolicyStale() async throws {
        let clock = TestClock(try vector["now"]!.intValue! + 604_800_000)
        let store = InMemoryStore()
        let core = ConsentCore()
        let stream = core.eventStream
        core.bootstrap(CoreConfig(
            store: store, bundledPolicy: try resource(), transport: UnreachableTransport(),
            consentCategories: ConsentCategory.allCases, now: clock.reading, initRetry: .disabled))
        var stale: BundledPolicyAuthority?
        for await event in stream {
            if case let .policyStale(authority) = event { stale = authority }
            if case .initialized = event { break }
        }
        XCTAssertEqual(stale, core.bundledPolicyInfo)
        XCTAssertTrue(core.isPolicyStale)
        XCTAssertFalse(core.snapshot().policyPending)
        XCTAssertEqual(core.snapshot().promptRequirement.kind, .choice)
        for category in OptionalConsentCategory.ordered {
            XCTAssertFalse(core.isAllowed(category.category))
        }
        XCTAssertEqual(core.save(.custom([.measurement: true])).status, .committed)
        await core.waitUntilIdle()
        XCTAssertTrue(core.isAllowed(.measurement))
        XCTAssertFalse(core.isAllowed(.marketing))
        XCTAssertEqual(core.pendingSaveCount(), 1)
    }

    func testPrecedenceIsLiveThenCachedThenBundled() async throws {
        let bundle = try resource()
        let clock = TestClock(try vector["now"]!.intValue!)
        let selected = try XCTUnwrap(bundle.resolve(overrides: .default(), now: clock.now))
        let offline = StubHTTP()
        offline.initResponse = HTTPResponse(status: 503)
        let live = StubHTTP()
        live.initResponse = Fixture.initResponse(policyResolution: selected.response.policyResolution)
        func boot(_ store: InMemoryStore, _ http: StubHTTP) async -> ConsentCore {
            let core = ConsentCore()
            await core.bootstrapAndSettle(CoreConfig(
                store: store, bundledPolicy: bundle,
                transport: HostedTransport(baseURL: URL(string: bundle.endpoint)!, client: http),
                now: clock.reading, initRetry: .disabled))
            return core
        }
        let airplane = await boot(InMemoryStore(), offline)
        XCTAssertNotNil(airplane.bundledPolicyInfo)
        XCTAssertFalse(airplane.snapshot().policyPending)
        let store = InMemoryStore()
        let online = await boot(store, live)
        XCTAssertNil(online.bundledPolicyInfo)
        XCTAssertFalse(online.snapshot().policyPending)
        let cached = await boot(store, offline)
        XCTAssertNil(cached.bundledPolicyInfo)
        XCTAssertFalse(cached.snapshot().policyPending)
        clock.advance(by: 604_800_000)
        let later = await boot(store, offline)
        XCTAssertNil(later.bundledPolicyInfo)
        XCTAssertFalse(later.isPolicyStale)
        XCTAssertFalse(later.snapshot().policyPending)
    }

    func testStaleOrOlderStoredManifestGivesWayToNewerBundle() async throws {
        let store = InMemoryStore()
        let clock = TestClock(try vector["now"]!.intValue!)
        let start = clock.now
        let old = try resource { $0["expiresAt"] = .integer(start + 100) }
        let first = ConsentCore()
        first.bootstrap(CoreConfig(store: store, bundledPolicy: old, now: clock.reading))
        XCTAssertEqual(first.save(.all).status, .committed)
        await first.waitUntilIdle()
        clock.advance(by: 100)
        XCTAssertTrue(first.isPolicyStale)
        XCTAssertTrue(first.isAllowed(.measurement))
        let newer = try resource {
            $0["issuedAt"] = .integer(clock.now)
            $0["expiresAt"] = .integer(start + 100000)
            $0["manifestRevision"] = .string("newer-manifest")
        }
        let relaunched = ConsentCore()
        relaunched.bootstrap(CoreConfig(store: store, bundledPolicy: newer, now: clock.reading))
        XCTAssertFalse(relaunched.snapshot().policyPending)
        XCTAssertFalse(relaunched.isPolicyStale)
        XCTAssertEqual(relaunched.bundledPolicyInfo?.manifestRevision, "newer-manifest")
        XCTAssertTrue(relaunched.isAllowed(.measurement))
        await relaunched.waitUntilIdle()
        clock.advance(by: 1)
        let newest = try resource {
            $0["issuedAt"] = .integer(clock.now)
            $0["expiresAt"] = .integer(start + 200000)
            $0["manifestRevision"] = .string("newest-manifest")
        }
        let upgraded = ConsentCore()
        upgraded.bootstrap(CoreConfig(store: store, bundledPolicy: newest, now: clock.reading))
        XCTAssertEqual(upgraded.bundledPolicyInfo?.manifestRevision, "newest-manifest")
        await upgraded.waitUntilIdle()
        let downgraded = ConsentCore()
        downgraded.bootstrap(CoreConfig(store: store, bundledPolicy: newer, now: clock.reading))
        XCTAssertEqual(downgraded.bundledPolicyInfo?.manifestRevision, "newest-manifest")
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
