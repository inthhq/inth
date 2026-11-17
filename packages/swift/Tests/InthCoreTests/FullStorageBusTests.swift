import Foundation
import XCTest
@_spi(InthInternal) @testable import InthCore

final class FullStorageBusTests: XCTestCase {
    // TCF-CHECK: T3
    // TCF-CHECK: T4
    func testIndependentOracleRowsReachActualDefaultsWithNativeTypes() throws {
        let data = try Data(contentsOf: IABCommitTests.fixtureURL.deletingLastPathComponent().appendingPathComponent("storage-bus-cases.json"))
        let rows = try XCTUnwrap(InthJSON.parse(data)?["cases"]?.arrayValue)
        let suite = "inth-bus-oracle-" + UUID().uuidString
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let bus = UserDefaultsStorageBus(defaults: defaults)
        for row in rows {
            let tcString = try XCTUnwrap(row["tcString"]?.stringValue)
            let saved = IABCommittedConsent(configuration: IABConfiguration(cmpId: 53, cmpVersion: 7, publisherCountryCode: "GB"),
                choices: IABChoices(), subjectId: "sub_test", externalId: nil, fingerprint: "f", vendorListVersion: 42,
                policyVersion: 5, consentVersion: 1, createdAt: 0, actionAt: 0, tcString: tcString,
                disclosureID: nil, addtlConsent: nil, adTechProvidersID: nil)
            var draft = ConsentSnapshot.Draft(current: .coldStart)
            draft.policyPending = false
            draft.resolution = PolicyResolutionInfo(status: .matched, policyId: "de-1", fingerprint: "f")
            let envelope = StoredEnvelope(snapshot: draft.build(revision: 1), noticeDismissal: nil,
                policyResolution: Fixture.matchedResolution(policy: Fixture.rule(model: "iab")), storedAt: 0, iabConsent: saved)
            bus.write(TcStorageBus.values(for: envelope))
            let expectedRows = try XCTUnwrap(row["values"]?.objectValue)
            XCTAssertEqual(Set(defaults.dictionaryRepresentation().keys.filter { TcStorageBusKeys.allNames.contains($0) }),
                Set(expectedRows.keys).union([TcStorageBusKeys.gdprApplies]))
            for (key, expected) in expectedRows {
                let actual = defaults.object(forKey: key)
                if let n = expected.intValue {
                    XCTAssertFalse(actual is String, key)
                    XCTAssertEqual((actual as? NSNumber)?.intValue, Int(n), key)
                } else {
                    XCTAssertEqual(actual as? String, expected.stringValue, key)
                }
            }
        }
        bus.clear()
        for key in TcStorageBusKeys.allNames { XCTAssertNil(defaults.object(forKey: key), key) }
    }
}

extension FullStorageBusTests {
    func testCoreInitializesRestoresRejectsAndExpiresBeforeAnyJS() async throws {
        let helper = AdditionalConsentTests()
        let v = try helper.fixture()
        let suite = "inth-full-core-bus-" + UUID().uuidString
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = BusRejectingStore()
        let bus = UserDefaultsStorageBus(defaults: defaults)
        defaults.set("foreign-stale-grant", forKey: TcStorageBusKeys.tcString)
        let pending = ConsentCore()
        pending.bootstrap(CoreConfig(store: InMemoryStore(), iab: v.configuration,
            now: { v.now }, flushPendingOnBootstrap: false, storageBus: bus))
        XCTAssertEqual(defaults.integer(forKey: TcStorageBusKeys.cmpSdkID), v.configuration.cmpId)
        XCTAssertEqual(defaults.integer(forKey: TcStorageBusKeys.cmpSdkVersion), v.configuration.cmpVersion)
        XCTAssertNil(defaults.object(forKey: TcStorageBusKeys.tcString))
        XCTAssertNil(defaults.object(forKey: TcStorageBusKeys.gdprApplies))
        await pending.waitUntilIdle()

        let first = try await helper.boot(v, store: store, bus: bus)
        XCTAssertEqual(first.save(.all).status, .committed)
        await first.waitUntilIdle()
        let saved = try XCTUnwrap(first.iabConsent())
        let purposeBits = defaults.string(forKey: TcStorageBusKeys.purposeConsents)
        let previous = defaults.dictionaryRepresentation().filter { TcStorageBusKeys.allNames.contains($0.key) }
        store.reject = true
        XCTAssertEqual(first.save(.necessary).status, .rejected)
        XCTAssertTrue(NSDictionary(dictionary: previous).isEqual(to: defaults.dictionaryRepresentation().filter { TcStorageBusKeys.allNames.contains($0.key) }))
        store.reject = false
        bus.clear()
        let clock = TestClock(v.now)
        let cold = ConsentCore()
        cold.bootstrap(CoreConfig(store: store, iab: v.configuration, now: clock.reading,
            flushPendingOnBootstrap: false, storageBus: bus))
        XCTAssertEqual(defaults.string(forKey: TcStorageBusKeys.tcString), saved.tcString)
        defaults.set("wrong", forKey: TcStorageBusKeys.purposeConsents)
        cold.rebuildTcStorageBus()
        XCTAssertEqual(defaults.string(forKey: TcStorageBusKeys.purposeConsents), purposeBits)
        clock.advance(by: 8 * 86_400_000)
        cold.rebuildTcStorageBus()
        XCTAssertNil(defaults.object(forKey: TcStorageBusKeys.tcString))
        XCTAssertNil(defaults.object(forKey: TcStorageBusKeys.addtlConsent))
        store.reject = true
        cold.hydrate()
        cold.hydrate()
        XCTAssertNil(defaults.object(forKey: TcStorageBusKeys.tcString))
        XCTAssertFalse(cold.isAdTechProviderAllowed(1))
        store.reject = false
        cold.reset()
        XCTAssertNil(defaults.object(forKey: TcStorageBusKeys.tcString))
        XCTAssertEqual(defaults.integer(forKey: TcStorageBusKeys.cmpSdkID), v.configuration.cmpId)
        await cold.waitUntilIdle()
    }

    func testMarkerOrderingRejectedPartialPublicationAndRecoveryInActualDefaults() throws {
        let suite = "inth-bus-fault-" + UUID().uuidString
        let defaults = FaultingBusDefaults(suiteName: suite)
        defer { defaults.removePersistentDomain(forName: suite) }
        let bus = UserDefaultsStorageBus(defaults: defaults)
        let values: [String: TcBusValue] = [
            TcStorageBusKeys.cmpSdkID: .number(53), TcStorageBusKeys.tcString: .text("new-tc"),
            TcStorageBusKeys.purposeConsents: .text("101"), TcStorageBusKeys.addtlConsent: .text("2~1~dv."),
            TcStorageBusKeys.publisherRestrictions + "2": .text("_1"),
        ]
        defaults.set("old-tc", forKey: TcStorageBusKeys.tcString)
        defaults.set("old-ac", forKey: TcStorageBusKeys.addtlConsent)
        defaults.set("old-vector", forKey: TcStorageBusKeys.purposeConsents)
        defaults.rejectKey = TcStorageBusKeys.purposeConsents
        bus.write(values)
        XCTAssertNil(defaults.object(forKey: TcStorageBusKeys.tcString))
        XCTAssertNil(defaults.object(forKey: TcStorageBusKeys.addtlConsent))
        XCTAssertNil(defaults.object(forKey: TcStorageBusKeys.purposeConsents))
        defaults.rejectKey = nil
        defaults.operations = []
        bus.write(values)
        XCTAssertEqual(defaults.string(forKey: TcStorageBusKeys.tcString), "new-tc")
        XCTAssertEqual(defaults.operations.first, "remove:" + TcStorageBusKeys.tcString)
        XCTAssertEqual(defaults.operations.last, "set:" + TcStorageBusKeys.tcString)
        XCTAssertEqual(defaults.rowsAtTC?[TcStorageBusKeys.purposeConsents] as? String, "101")
        XCTAssertEqual(defaults.rowsAtTC?[TcStorageBusKeys.addtlConsent] as? String, "2~1~dv.")
        XCTAssertEqual(defaults.rowsAtTC?[TcStorageBusKeys.publisherRestrictions + "2"] as? String, "_1")
        bus.write([TcStorageBusKeys.cmpSdkID: .number(53)])
        XCTAssertNil(defaults.object(forKey: TcStorageBusKeys.publisherRestrictions + "2"))
    }

    func testFailedInvalidationRemovesVendorGrantsWhileDiskRetainsTheOldEnvelope() async throws {
        let helper = AdditionalConsentTests()
        let v = try helper.fixture()
        let suite = "inth-bus-invalidation-" + UUID().uuidString
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = BusRejectingStore()
        let http = StubHTTP()
        let core = try await helper.boot(v, store: store,
            bus: UserDefaultsStorageBus(defaults: defaults), http: http)
        XCTAssertEqual(core.save(.all).status, .committed)
        await core.waitUntilIdle()
        let before = store.data(for: StorageKey.snapshot)
        XCTAssertNotNil(defaults.object(forKey: TcStorageBusKeys.tcString))
        XCTAssertNotNil(defaults.object(forKey: TcStorageBusKeys.addtlConsent))

        store.reject = true
        http.initResponse = try helper.response(v, providers: .array([]))
        core.refresh()
        await core.waitUntilIdle()
        XCTAssertEqual(store.data(for: StorageKey.snapshot), before)
        XCTAssertNil(core.iabConsent())
        XCTAssertNil(defaults.object(forKey: TcStorageBusKeys.tcString))
        XCTAssertNil(defaults.object(forKey: TcStorageBusKeys.addtlConsent))
        XCTAssertEqual(defaults.integer(forKey: TcStorageBusKeys.cmpSdkID), v.configuration.cmpId)
    }

    func testBusPublicationsLeaveHotReadsAvailable() async throws {
        let helper = AdditionalConsentTests()
        let v = try helper.fixture()
        for operation in ["save", "refresh", "hydrate", "rebuild", "identify", "reset"] {
            let bus = ReadCheckingBus()
            let core = try await helper.boot(v, bus: bus)
            XCTAssertEqual(core.save(.all).status, .committed)
            await core.waitUntilIdle()
            let reads = SendableBox([Bool]())
            bus.onWrite = {
                let completed = DispatchSemaphore(value: 0)
                DispatchQueue.global().async {
                    _ = core.snapshot(); _ = core.iabConsent(); _ = core.isAllowed(.marketing)
                    completed.signal()
                }
                reads.mutate { $0.append(completed.wait(timeout: .now() + 1) == .success) }
            }
            switch operation {
            case "save": XCTAssertEqual(core.save(.necessary).status, .committed)
            case "refresh": core.refresh()
            case "hydrate": core.hydrate()
            case "rebuild": core.rebuildTcStorageBus()
            case "identify": core.identify(KernelUser(externalId: "next-user"))
            case "reset": core.reset()
            default: XCTFail("Unknown operation")
            }
            await core.waitUntilIdle()
            bus.onWrite = nil
            XCTAssertFalse(reads.value.isEmpty, operation)
            XCTAssertTrue(reads.value.allSatisfy { $0 }, "Bus IO held the state lock during \(operation)")
        }
    }

    func testGrantThatExpiresDuringDurableWriteNeverReachesTheBus() async throws {
        let helper = AdditionalConsentTests()
        let v = try helper.fixture()
        let clock = TestClock(v.now)
        let store = MutationSerializationTests.BlockingStore()
        let bus = RecordingBus()
        let core = try await helper.boot(v, store: store, bus: bus, clock: clock, listMaxAgeMs: 500)
        store.arm()
        let save = Task.detached { core.save(.all) }
        XCTAssertEqual(store.entered.wait(timeout: .now() + 5), .success)
        clock.advance(by: 500)
        store.resume.signal()
        let result = await save.value
        XCTAssertEqual(result.status, .committed)
        XCTAssertNil(core.iabConsent())
        XCTAssertNil(bus.live[TcStorageBusKeys.tcString])
        XCTAssertNil(bus.live[TcStorageBusKeys.addtlConsent])
        XCTAssertEqual(bus.live[TcStorageBusKeys.cmpSdkID], .number(v.configuration.cmpId))
        await core.waitUntilIdle()
    }
}

extension FullStorageBusTests {
    func testAnIdenticalTableIsWrittenOnceAndAChangedRowForcesARewrite() {
        let suite = "inth-bus-unchanged-" + UUID().uuidString
        let defaults = FaultingBusDefaults(suiteName: suite)
        defer { defaults.removePersistentDomain(forName: suite) }
        let bus = UserDefaultsStorageBus(defaults: defaults)
        let values: [String: TcBusValue] = [
            TcStorageBusKeys.cmpSdkID: .number(53), TcStorageBusKeys.gdprApplies: .number(0),
            TcStorageBusKeys.tcString: .text("tc"), TcStorageBusKeys.purposeConsents: .text("101"),
        ]
        bus.write(values)
        XCTAssertEqual(defaults.operations.last, "set:" + TcStorageBusKeys.tcString)

        defaults.operations = []
        bus.write(values)
        XCTAssertEqual(defaults.operations, [], "an unchanged table is not rewritten")

        defaults.set("tampered", forKey: TcStorageBusKeys.purposeConsents)
        defaults.operations = []
        bus.write(values)
        XCTAssertEqual(defaults.string(forKey: TcStorageBusKeys.purposeConsents), "101")
        XCTAssertEqual(defaults.operations.first, "remove:" + TcStorageBusKeys.tcString)

        // A new instance, like a new process, always publishes in full.
        defaults.operations = []
        UserDefaultsStorageBus(defaults: defaults).write(values)
        XCTAssertEqual(defaults.operations.last, "set:" + TcStorageBusKeys.tcString)
    }
}

private final class ReadCheckingBus: TcStorageBusWriting, @unchecked Sendable {
    var onWrite: (@Sendable () -> Void)?
    func write(_ values: [String: TcBusValue]) { onWrite?() }
    func clear() { onWrite?() }
}

private final class BusRejectingStore: ConsentStore, @unchecked Sendable {
    let memory = InMemoryStore()
    var reject = false
    func data(for key: String) -> Data? { memory.data(for: key) }
    func set(_ data: Data?, for key: String) -> Bool {
        if reject && key == StorageKey.snapshot { return false }
        return memory.set(data, for: key)
    }
}

private final class FaultingBusDefaults: UserDefaults, @unchecked Sendable {
    var rejectKey: String?
    var operations: [String] = []
    var rowsAtTC: [String: Any]?
    init(suiteName: String) { super.init(suiteName: suiteName)! }
    override func set(_ value: Any?, forKey key: String) {
        operations.append("set:" + key)
        if key != rejectKey || value == nil { super.set(value, forKey: key) }
        if key == TcStorageBusKeys.tcString { rowsAtTC = dictionaryRepresentation() }
    }
    override func removeObject(forKey key: String) {
        operations.append("remove:" + key)
        super.removeObject(forKey: key)
    }
}
