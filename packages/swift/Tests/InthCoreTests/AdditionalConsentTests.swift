import Foundation
import XCTest
@_spi(InthInternal) @testable import InthCore

final class AdditionalConsentTests: XCTestCase {
    struct Vector: Decodable {
        struct Case: Decodable { let id: String; let consented: [Int]; let purposeConsents: [Int]; let expected: String }
        let now: Int64
        let configuration: IABConfiguration
        let gvl: GlobalVendorList
        let providers: [AdTechProvider]
        let cases: [Case]
    }
    func fixture() throws -> Vector {
        try InthJSON.decode(Vector.self, from: Data(contentsOf: IABCommitTests.fixtureURL.deletingLastPathComponent()
            .appendingPathComponent("additional-consent-cases.json")))
    }
    func response(_ v: Vector, providers: JSONValue? = nil) throws -> HTTPResponse {
        var fields = InthJSON.parse(Fixture.initBody(policyResolution: Fixture.matchedResolution(policy: Fixture.rule(model: "iab"))))!.objectValue!
        fields["gvl"] = InthJSON.parse(try InthJSON.encode(v.gvl))!
        fields["adTechProviders"] = try providers ?? InthJSON.parse(InthJSON.encode(v.providers))!
        return HTTPResponse(status: 200, body: try InthJSON.encode(JSONValue.object(fields)))
    }
    func boot(_ v: Vector, store: any ConsentStore = InMemoryStore(), bus: (any TcStorageBusWriting)? = nil,
              http: StubHTTP = StubHTTP(), clock: TestClock? = nil,
              listMaxAgeMs: Int64 = 604_800_000) async throws -> ConsentCore {
        http.initResponse = try response(v)
        http.setSavesFail(true)
        let core = ConsentCore()
        core.bootstrap(CoreConfig(store: store, transport: Fixture.transport(http), iab: v.configuration,
            iabListMaxAgeMs: listMaxAgeMs, now: clock?.reading ?? { v.now },
            initRetry: .disabled, flushPendingOnBootstrap: false, storageBus: bus))
        await core.waitUntilIdle()
        return core
    }

    func testGoogleConformanceAndActualNativeSaveBodies() async throws {
        let v = try fixture()
        for row in v.cases {
            XCTAssertEqual(try AdditionalConsent.encode(consented: row.consented,
                disclosed: v.providers.map(\.id), purposeConsents: row.purposeConsents), row.expected)
            let store = InMemoryStore()
            let http = StubHTTP()
            let core = try await boot(v, store: store, http: http)
            var draft = try XCTUnwrap(core.openIABDraft())
            draft.choices.purposeConsents = row.purposeConsents
            draft.choices.adTechProviderConsents = row.consented
            XCTAssertEqual(core.saveIAB(draft, categories: [.marketing: true]).status, .committed)
            await core.waitUntilIdle()
            let saved = try XCTUnwrap(core.iabConsent())
            XCTAssertEqual(saved.addtlConsent, row.expected, row.id)
            let entry = try XCTUnwrap(store.data(for: StorageKey.snapshot).flatMap(StoredEnvelope.decode)?.pendingSaves?.first)
            XCTAssertEqual(InthJSON.parse(entry.body)?["addtlConsent"]?.stringValue, row.expected)
            XCTAssertEqual(http.recordedSaveRequests.first?.body, entry.body)
            if let path = ProcessInfo.processInfo.environment["INTH_AC_SAVE_EVIDENCE_DIR"] {
                try FileManager.default.createDirectory(atPath: path, withIntermediateDirectories: true)
                try entry.body.write(to: URL(fileURLWithPath: path).appendingPathComponent("swift-" + row.id + ".json"))
            }
        }
        XCTAssertThrowsError(try AdditionalConsent.encode(consented: [999], disclosed: [1], purposeConsents: [1,3,4]))
        XCTAssertThrowsError(try AdditionalConsent.encode(consented: [1,1], disclosed: [1], purposeConsents: [1,3,4]))
        XCTAssertThrowsError(try AdditionalConsent.encode(consented: [], disclosed: [0], purposeConsents: []))
    }

    func testActualDefaultsColdRestoreRejectedCommitWithdrawalIdentityAndReset() async throws {
        let v = try fixture()
        let suite = "inth-ac-" + UUID().uuidString
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = ACRejectingStore()
        let core = try await boot(v, store: store, bus: UserDefaultsStorageBus(defaults: defaults))
        XCTAssertEqual(core.save(.all).status, .committed)
        await core.waitUntilIdle()
        let granted = try XCTUnwrap(core.iabConsent())
        XCTAssertEqual(defaults.string(forKey: TcStorageBusKeys.addtlConsent), "2~1.2.3.4.10~dv.")
        XCTAssertTrue(defaults.object(forKey: TcStorageBusKeys.addtlConsent) is String)
        XCTAssertEqual(defaults.string(forKey: TcStorageBusKeys.tcString), granted.tcString)
        let before = store.data(for: StorageKey.snapshot)
        store.reject = true
        XCTAssertEqual(core.save(.necessary).status, .rejected)
        XCTAssertEqual(store.data(for: StorageKey.snapshot), before)
        XCTAssertEqual(defaults.string(forKey: TcStorageBusKeys.addtlConsent), granted.addtlConsent)
        store.reject = false
        let cold = ConsentCore()
        defaults.removeObject(forKey: TcStorageBusKeys.addtlConsent)
        cold.bootstrap(CoreConfig(store: store, iab: v.configuration, now: { v.now },
            flushPendingOnBootstrap: false, storageBus: UserDefaultsStorageBus(defaults: defaults)))
        XCTAssertEqual(cold.iabConsent()?.addtlConsent, granted.addtlConsent)
        XCTAssertEqual(defaults.string(forKey: TcStorageBusKeys.addtlConsent), granted.addtlConsent)
        XCTAssertEqual(cold.save(.necessary).status, .committed)
        XCTAssertEqual(defaults.string(forKey: TcStorageBusKeys.addtlConsent), "2~~dv.1.2.3.4.10")
        cold.identify(KernelUser(externalId: "new-user"))
        XCTAssertNil(defaults.object(forKey: TcStorageBusKeys.addtlConsent))
        XCTAssertNil(cold.iabConsent())
        XCTAssertEqual(cold.pendingSaveCount(), 1)
        cold.reset()
        XCTAssertNil(defaults.object(forKey: TcStorageBusKeys.addtlConsent))
    }

    func testListChangesInvalidationAndStaleListCannotReplayGrants() async throws {
        let v = try fixture()
        for change in ["added", "removed", "empty", "invalid"] {
            let http = StubHTTP()
            let store = InMemoryStore()
            let core = try await boot(v, store: store, http: http)
            XCTAssertEqual(core.save(.all).status, .committed)
            await core.waitUntilIdle()
            let draft = try XCTUnwrap(core.openIABDraft())
            var providers = v.providers
            if change == "added" { providers.append(AdTechProvider(id: 99, name: "New", policyUrl: "https://new.example/privacy")) }
            if change == "removed" { providers.removeFirst() }
            if change == "empty" { providers = [] }
            let update: JSONValue = change == "invalid" ? .string("invalid") : InthJSON.parse(try InthJSON.encode(providers))!
            http.initResponse = try response(v, providers: update)
            core.refresh()
            await core.waitUntilIdle()
            XCTAssertNil(core.iabConsent(), change)
            XCTAssertEqual(core.pendingSaveCount(), 0)
            XCTAssertEqual(core.saveIAB(draft, categories: [:]).error?.code, "concurrent-change")
            if change == "added" {
                XCTAssertEqual(core.save(.all).status, .committed)
                XCTAssertTrue(core.iabConsent()?.addtlConsent?.contains("99") == true)
            }
        }
        let store = InMemoryStore()
        let core = try await boot(v, store: store)
        XCTAssertEqual(core.save(.all).status, .committed)
        await core.waitUntilIdle()
        let clock = TestClock(v.now + 1000)
        let cold = ConsentCore()
        cold.bootstrap(CoreConfig(store: store, iab: v.configuration, iabListMaxAgeMs: 1000,
                                  now: clock.reading, flushPendingOnBootstrap: false))
        XCTAssertNil(cold.iabConsent())
        XCTAssertEqual(cold.pendingSaveCount(), 0)
        XCTAssertEqual(cold.additionalConsentStatus(), .stale)
    }

    func testFileRestartReplaysExactAdditionalConsentBody() async throws {
        let v = try fixture()
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: dir) }
        let store = FileStore(directory: dir)
        let first = try await boot(v, store: store)
        XCTAssertEqual(first.save(.all).status, .committed)
        await first.waitUntilIdle()
        let before = try XCTUnwrap(store.data(for: StorageKey.snapshot).flatMap(StoredEnvelope.decode)?.pendingSaves?.first?.body)
        let http = StubHTTP()
        http.initResponse = HTTPResponse(status: 503, body: Data("{}".utf8))
        http.setSavesFail(true)
        let second = ConsentCore()
        second.bootstrap(CoreConfig(store: FileStore(directory: dir), transport: Fixture.transport(http), iab: v.configuration,
            now: { v.now }, initRetry: .disabled, flushPendingOnBootstrap: false))
        second.flushPending()
        await second.waitUntilIdle()
        XCTAssertEqual(second.iabConsent()?.addtlConsent, "2~1.2.3.4.10~dv.")
        XCTAssertFalse(http.recordedSaveRequests.isEmpty)
        XCTAssertTrue(http.recordedSaveRequests.allSatisfy { $0.body == before })
    }

    func testATPExpiryNotifiesGatesAndRemovesGrantAfterGVLOnlyRefresh() async throws {
        let v = try fixture()
        let clock = TestClock(v.now)
        let http = StubHTTP()
        let store = InMemoryStore()
        let suite = "inth-ac-expiry-" + UUID().uuidString
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let core = try await boot(v, store: store, bus: UserDefaultsStorageBus(defaults: defaults),
                                  http: http, clock: clock, listMaxAgeMs: 500)
        XCTAssertEqual(core.save(.all).status, .committed)
        await core.waitUntilIdle()
        XCTAssertEqual(core.pendingSaveCount(), 1)
        XCTAssertNotNil(defaults.string(forKey: TcStorageBusKeys.addtlConsent))

        clock.advance(by: 250)
        var fields = InthJSON.parse(try response(v).body)!.objectValue!
        fields.removeValue(forKey: "adTechProviders")
        http.initResponse = HTTPResponse(status: 200, body: try InthJSON.encode(JSONValue.object(fields)))
        core.refresh()
        await core.waitUntilIdle()
        let envelope = try XCTUnwrap(store.data(for: StorageKey.snapshot).flatMap(StoredEnvelope.decode))
        XCTAssertEqual(envelope.iabListFetchedAt, v.now + 250)
        XCTAssertEqual(envelope.additionalConsentList?.fetchedAt, v.now)

        let booleans = SendableBox([Bool]())
        let decisions = SendableBox([ConsentDecision]())
        let expired = expectation(description: "ATP expiry disables the boolean gate")
        let decisionExpired = expectation(description: "ATP expiry disables the decision gate")
        let boolGate = core.gate(OptionalConsentCategory.marketing) { allowed in
            booleans.mutate { $0.append(allowed) }
            if !allowed { expired.fulfill() }
        }
        let decisionGate = core.gate(ConsentCategory.marketing) { decision in
            decisions.mutate { $0.append(decision) }
            if decision == .denied { decisionExpired.fulfill() }
        }
        defer { boolGate.cancel(); decisionGate.cancel() }
        XCTAssertEqual(booleans.value, [true])
        XCTAssertEqual(decisions.value, [.granted])

        clock.advance(by: 250)
        await fulfillment(of: [expired, decisionExpired], timeout: 1)
        XCTAssertEqual(booleans.value, [true, false])
        XCTAssertEqual(decisions.value, [.granted, .denied])
        XCTAssertNil(core.iabConsent())
        XCTAssertEqual(core.additionalConsentStatus(), .stale)
        XCTAssertEqual(core.iabStatus().availability, .fresh)
        XCTAssertEqual(core.pendingSaveCount(), 0)
        XCTAssertNil(defaults.object(forKey: TcStorageBusKeys.addtlConsent))
    }

    func testFailedInitKeepsATPConsentDraftAndDurableEnvelopeUnchanged() async throws {
        let v = try fixture()
        let store = InMemoryStore()
        let http = StubHTTP()
        let core = try await boot(v, store: store, http: http)
        XCTAssertEqual(core.save(.all).status, .committed)
        await core.waitUntilIdle()
        let draft = try XCTUnwrap(core.openIABDraft())
        let before = core.snapshot()
        let envelope = store.data(for: StorageKey.snapshot)
        let gates = SendableBox([Bool]())
        let subscription = core.gate(OptionalConsentCategory.marketing) { allowed in
            gates.mutate { $0.append(allowed) }
        }
        defer { subscription.cancel() }
        http.initResponse = HTTPResponse(status: 503, body: Data("{}".utf8))
        core.refresh()
        await core.waitUntilIdle()
        XCTAssertEqual(core.snapshot().revision, before.revision)
        XCTAssertEqual(core.snapshot().error, before.error)
        XCTAssertEqual(store.data(for: StorageKey.snapshot), envelope)
        XCTAssertEqual(gates.value, [true])
        XCTAssertEqual(core.additionalConsentStatus(), .offline)
        XCTAssertEqual(core.saveIAB(draft, categories: [.marketing: true]).status, .committed)
    }

    func testWithdrawalKeepsExactACBodyAcrossListIdentityResetAndRestart() async throws {
        let v = try fixture()
        for change in ["list", "identity", "reset", "expiry"] {
            let store = InMemoryStore()
            let http = StubHTTP()
            let first = try await boot(v, store: store, http: http)
            XCTAssertEqual(first.save(.all).status, .committed)
            await first.waitUntilIdle()
            XCTAssertEqual(first.save(.necessary).status, .committed)
            await first.waitUntilIdle()
            let frozen = try XCTUnwrap(first.pendingSaveBodies().first)
            XCTAssertEqual(InthJSON.parse(frozen)?["addtlConsent"]?.stringValue, "2~~dv.1.2.3.4.10")
            switch change {
            case "list":
                http.initResponse = try response(v, providers: .array([]))
                first.refresh()
            case "identity": first.identify(KernelUser(externalId: "new-owner"))
            case "reset": first.reset()
            default: break
            }
            await first.waitUntilIdle()
            XCTAssertEqual(first.pendingSaveBodies(), [frozen], change)
            let online = StubHTTP()
            let cold = ConsentCore()
            cold.bootstrap(CoreConfig(store: store, transport: Fixture.transport(online), iab: v.configuration,
                now: { v.now + (change == "expiry" ? 400 * 86_400_000 : 0) }, initRetry: .disabled,
                flushPendingOnBootstrap: false))
            cold.flushPending()
            await cold.waitUntilIdle()
            XCTAssertEqual(online.recordedSaveRequests.map(\.body), [frozen], change)
            XCTAssertEqual(cold.pendingSaveCount(), 0, change)
        }
    }
}

private final class ACRejectingStore: ConsentStore, @unchecked Sendable {
    let store = InMemoryStore()
    var reject = false
    func data(for key: String) -> Data? { store.data(for: key) }
    func set(_ data: Data?, for key: String) -> Bool {
        if reject && key == StorageKey.snapshot { return false }
        return store.set(data, for: key)
    }
}
