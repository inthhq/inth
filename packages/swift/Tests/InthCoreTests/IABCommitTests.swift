import Foundation
import XCTest

@_spi(InthInternal) @testable import InthCore

final class IABCommitTests: XCTestCase {
    struct Vector: Decodable {
        struct Case: Decodable {
            let id: String
            let configuration: IABConfiguration
            let choices: IABChoices
            let tcString: String
        }
        let invalidChoices: [IABChoices]
        let invalidConfigurations: [IABConfiguration]
        let now: Int64
        let gvl: GlobalVendorList
        let cases: [Case]
    }
    static let fixtureURL = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        .appendingPathComponent("native-protocol/iab/commit-cases.json")
    func fixture() throws -> Vector {
        try InthJSON.decode(Vector.self, from: Data(contentsOf: Self.fixtureURL))
    }

    func boot(
        _ vector: Vector, configuration: IABConfiguration?, store: any ConsentStore,
        http: StubHTTP = StubHTTP(), user: KernelUser? = nil, clock: TestClock? = nil,
        bus: (any TcStorageBusWriting)? = nil
    ) async throws -> ConsentCore {
        let gvl = try InthJSON.parse(InthJSON.encode(vector.gvl))!
        var body = Fixture.initBody(
            policyResolution: Fixture.matchedResolution(policy: Fixture.rule(model: "iab")))
        var fields = InthJSON.parse(body)!.objectValue!
        fields["gvl"] = gvl
        body = try InthJSON.encode(JSONValue.object(fields))
        http.initResponse = HTTPResponse(status: 200, body: body)
        http.setSavesFail(true)
        let core = ConsentCore()
        core.bootstrap(
            CoreConfig(
                store: store, transport: Fixture.transport(http), iab: configuration,
                user: user, now: { clock?.now ?? vector.now }, initRetry: .disabled, flushPendingOnBootstrap: false, storageBus: bus))
        await core.waitUntilIdle()
        return core
    }

    func testSameVersionDisclosureChangeCannotExtendAnExistingGrant() async throws {
        let vector = try fixture()
        let http = StubHTTP()
        let core = try await boot(vector, configuration: vector.cases[0].configuration,
                                  store: InMemoryStore(), http: http)
        XCTAssertEqual(core.save(.all).status, .committed)
        await core.waitUntilIdle()
        var fields = InthJSON.parse(http.initResponse.body)!.objectValue!
        var gvl = fields["gvl"]!.objectValue!
        var vendors = gvl["vendors"]!.objectValue!
        var vendor = vendors["1"]!.objectValue!
        vendor["name"] = .string("Changed disclosure on the same version")
        vendors["1"] = .object(vendor)
        gvl["vendors"] = .object(vendors)
        fields["gvl"] = .object(gvl)
        http.initResponse = HTTPResponse(status: 200, body: try InthJSON.encode(JSONValue.object(fields)))
        core.refresh()
        await core.waitUntilIdle()
        XCTAssertNil(core.iabConsent())
        XCTAssertFalse(core.isIABAllowed(vendorId: 1, purposeId: 1, basis: .consent))
        XCTAssertFalse(core.isAllowed(.marketing))
        XCTAssertEqual(core.pendingSaveCount(), 0)
    }

    struct LifecycleVector: Decodable {
        struct Case: Decodable { let id: String; let gvl: GlobalVendorList; let retain: Bool }
        let gvl: GlobalVendorList
        let cases: [Case]
    }

    func testSharedDisclosureLifecycleCasesRejectOpenDraftAndObsoleteReplay() async throws {
        let source = try fixture()
        let data = try Data(contentsOf: Self.fixtureURL.deletingLastPathComponent().appendingPathComponent("lifecycle-cases.json"))
        let lifecycle = try InthJSON.decode(LifecycleVector.self, from: data)
        for row in lifecycle.cases {
            let vector = Vector(invalidChoices: [], invalidConfigurations: [], now: source.now,
                                gvl: lifecycle.gvl, cases: source.cases)
            let http = StubHTTP()
            let store = InMemoryStore()
            let core = try await boot(vector, configuration: vector.cases[0].configuration, store: store, http: http)
            XCTAssertEqual(core.iabStatus().availability, .fresh)
            XCTAssertEqual(core.save(.all).status, .committed)
            await core.waitUntilIdle()
            let saved = try XCTUnwrap(core.iabConsent())
            let draft = try XCTUnwrap(core.openIABDraft())
            var fields = InthJSON.parse(http.initResponse.body)!.objectValue!
            fields["gvl"] = InthJSON.parse(try InthJSON.encode(row.gvl))!
            http.initResponse = HTTPResponse(status: 200, body: try InthJSON.encode(JSONValue.object(fields)))
            core.refresh()
            await core.waitUntilIdle()
            XCTAssertEqual(core.iabConsent() == saved, row.retain, row.id)
            XCTAssertEqual(core.pendingSaveCount() > 0, row.retain, row.id)
            XCTAssertEqual(core.saveIAB(draft, categories: [.marketing: true]).error?.code, "concurrent-change", row.id)
            XCTAssertEqual(core.globalVendorList()?.standardTexts, row.gvl.standardTexts)
            let cold = ConsentCore()
            cold.bootstrap(CoreConfig(store: store, iab: vector.cases[0].configuration,
                                      now: { vector.now }, flushPendingOnBootstrap: false))
            XCTAssertEqual(cold.iabConsent() == saved, row.retain, row.id)
            XCTAssertEqual(cold.iabStatus().availability, .cached)
        }
    }

    // TCF-CHECK: T7
    func testCachedOfflineStaleAndMissingListsDoNotInventConsent() async throws {
        let vector = try fixture()
        let store = InMemoryStore()
        let core = try await boot(vector, configuration: vector.cases[0].configuration, store: store)
        XCTAssertEqual(core.save(.all).status, .committed)
        await core.waitUntilIdle()
        let clock = TestClock(vector.now)
        let cold = ConsentCore()
        let http = StubHTTP()
        http.initResponse = HTTPResponse(status: 503, body: Data("{}".utf8))
        http.setSavesFail(true)
        http.holdsInit = true
        cold.bootstrap(CoreConfig(store: store, transport: Fixture.transport(http),
            iab: vector.cases[0].configuration, iabListMaxAgeMs: 1000, now: clock.reading,
            initRetry: .disabled, flushPendingOnBootstrap: false))
        XCTAssertEqual(cold.iabStatus().availability, .cached)
        http.releaseInit()
        await cold.waitUntilIdle()
        XCTAssertEqual(cold.iabStatus().availability, .offline)
        XCTAssertNotNil(cold.openIABDraft())
        clock.advance(by: 1000)
        XCTAssertEqual(cold.iabStatus().availability, .stale)
        XCTAssertNil(cold.iabConsent())
        XCTAssertNil(cold.openIABDraft())
        XCTAssertFalse(cold.isAllowed(.marketing))
        XCTAssertFalse(cold.snapshot().effectivePermissions.marketing)
        XCTAssertEqual(cold.decision(for: .marketing), .denied)
        XCTAssertEqual(cold.save(.all).error?.code, "iab-list-stale")
        cold.refresh()
        await cold.waitUntilIdle()
        XCTAssertEqual(cold.pendingSaveCount(), 1, "stale disclosure suspends the queued grant until refresh")
        XCTAssertEqual(cold.save(.necessary).status, .committed)
        await cold.waitUntilIdle()
        XCTAssertEqual(cold.pendingSaveCount(), 1)
        let missing = ConsentCore()
        missing.bootstrap(CoreConfig(iab: vector.cases[0].configuration, now: clock.reading))
        XCTAssertEqual(missing.iabStatus().availability, .missing)
        XCTAssertNil(missing.openIABDraft())
    }

    func testSuccessfulListlessInitClearsOfflineWithoutRenewingTheList() async throws {
        let vector = try fixture()
        let store = InMemoryStore()
        let http = StubHTTP()
        let clock = TestClock(vector.now)
        let core = try await boot(vector, configuration: vector.cases[0].configuration,
                                  store: store, http: http, clock: clock)
        XCTAssertEqual(core.save(.all).status, .committed)
        await core.waitUntilIdle()
        http.initResponse = HTTPResponse(status: 503, body: Data("{}".utf8))
        core.refresh()
        await core.waitUntilIdle()
        XCTAssertEqual(core.iabStatus().availability, .offline)
        clock.advance(by: 10)
        http.initResponse = Fixture.initResponse(policyResolution: Fixture.matchedResolution(
            policy: Fixture.rule(model: "iab")))
        core.refresh()
        await core.waitUntilIdle()
        XCTAssertEqual(core.iabStatus().availability, .fresh)
        let envelope = try XCTUnwrap(store.data(for: StorageKey.snapshot).flatMap(StoredEnvelope.decode))
        XCTAssertEqual(envelope.iabListFetchedAt, vector.now)
        XCTAssertNotNil(core.iabConsent())
    }

    func testFailedInitKeepsAnOpenDraftOnUnchangedUsableDisclosure() async throws {
        let vector = try fixture()
        let http = StubHTTP()
        let core = try await boot(vector, configuration: vector.cases[0].configuration,
                                  store: InMemoryStore(), http: http)
        let draft = try XCTUnwrap(core.openIABDraft())
        let before = core.snapshot()
        let observer = IABRetryObserver()
        let observation = core.onChange { observer.consentDidChange($0) }
        let gates = SendableBox([Bool]())
        let subscription = core.gate(OptionalConsentCategory.marketing) { value in
            gates.mutate { $0.append(value) }
        }
        http.initResponse = HTTPResponse(status: 503, body: Data("{}".utf8))
        core.refresh()
        await core.waitUntilIdle()
        XCTAssertEqual(core.snapshot().revision, before.revision)
        XCTAssertTrue(observer.revisions.value.isEmpty, "An unchanged retry must not publish the same revision")
        observation.cancel()
        XCTAssertEqual(gates.value, [false])
        subscription.cancel()
        XCTAssertEqual(core.iabStatus().availability, .offline)
        XCTAssertEqual(core.saveIAB(draft, categories: [:]).status, .committed)
    }

    func testListExpiryNotifiesExistingGatesAndSeedsLateGatesDenied() async throws {
        let vector = try fixture()
        let store = InMemoryStore()
        let first = try await boot(vector, configuration: vector.cases[0].configuration, store: store)
        XCTAssertEqual(first.save(.all).status, .committed)
        await first.waitUntilIdle()
        let clock = TestClock(vector.now)
        let core = ConsentCore()
        core.bootstrap(CoreConfig(store: store, iab: vector.cases[0].configuration,
                                  iabListMaxAgeMs: 100, now: clock.reading,
                                  initRetry: .disabled, flushPendingOnBootstrap: false))
        let booleans = SendableBox([Bool]())
        let decisions = SendableBox([ConsentDecision]())
        let expired = expectation(description: "existing gate receives expiry")
        let decisionExpired = expectation(description: "decision gate receives expiry")
        let boolGate = core.gate(OptionalConsentCategory.marketing) { allowed in
            booleans.mutate { $0.append(allowed) }
            if !allowed { expired.fulfill() }
        }
        let decisionGate = core.gate(ConsentCategory.marketing) { decision in
            decisions.mutate { $0.append(decision) }
            if decision == .denied { decisionExpired.fulfill() }
        }
        XCTAssertEqual(booleans.value, [true])
        XCTAssertEqual(decisions.value, [.granted])
        XCTAssertEqual(core.snapshot().nextDeadline, vector.now + 100)
        clock.advance(by: 100)
        await fulfillment(of: [expired, decisionExpired], timeout: 1)
        XCTAssertEqual(booleans.value, [true, false])
        XCTAssertEqual(decisions.value, [.granted, .denied])
        XCTAssertFalse(core.snapshot().effectivePermissions.marketing)
        XCTAssertFalse(core.isAllowed(.marketing))
        XCTAssertEqual(core.decision(for: .marketing), .denied)
        let lateBoolean = SendableBox([Bool]())
        let lateDecision = SendableBox([ConsentDecision]())
        let lateBoolGate = core.gate(OptionalConsentCategory.marketing) { value in
            lateBoolean.mutate { $0.append(value) }
        }
        let lateDecisionGate = core.gate(ConsentCategory.marketing) { value in
            lateDecision.mutate { $0.append(value) }
        }
        XCTAssertEqual(lateBoolean.value, [false])
        XCTAssertEqual(lateDecision.value, [.denied])
        boolGate.cancel()
        decisionGate.cancel()
        lateBoolGate.cancel()
        lateDecisionGate.cancel()
    }

    func testChoiceExpiryNotifiesGatesBeforeTheListExpires() async throws {
        let vector = try fixture()
        let http = StubHTTP()
        let clock = TestClock(vector.now)
        let core = try await boot(vector, configuration: vector.cases[0].configuration,
                                  store: InMemoryStore(), http: http, clock: clock)
        var fields = InthJSON.parse(http.initResponse.body)!.objectValue!
        fields["policyResolution"] = Fixture.matchedResolution(
            policy: Fixture.rule(model: "iab", choiceMs: 100))
        http.initResponse = HTTPResponse(status: 200, body: try InthJSON.encode(JSONValue.object(fields)))
        core.refresh()
        await core.waitUntilIdle()
        XCTAssertEqual(core.save(.all).status, .committed)
        await core.waitUntilIdle()
        let expired = expectation(description: "choice expiry disables an existing gate")
        let subscription = core.gate(ConsentCategory.marketing) { decision in
            if decision == .denied { expired.fulfill() }
        }
        XCTAssertEqual(core.snapshot().nextDeadline, vector.now + 100)
        clock.advance(by: 100)
        await fulfillment(of: [expired], timeout: 1)
        XCTAssertEqual(core.iabStatus().availability, .fresh)
        XCTAssertNil(core.iabConsent())
        XCTAssertEqual(core.decision(for: .marketing), .denied)
        subscription.cancel()
    }

    func testADeadlineDoesNotRetainTheCore() async throws {
        let vector = try fixture()
        let store = InMemoryStore()
        let first = try await boot(vector, configuration: vector.cases[0].configuration, store: store)
        XCTAssertEqual(first.save(.all).status, .committed)
        await first.waitUntilIdle()
        weak var released: ConsentCore?
        do {
            let cached = ConsentCore()
            released = cached
            cached.bootstrap(CoreConfig(store: store, iab: vector.cases[0].configuration,
                                        now: { vector.now }, flushPendingOnBootstrap: false))
            await cached.waitUntilIdle()
            XCTAssertTrue(cached.isAllowed(.marketing))
        }
        XCTAssertNil(released)
    }

    func testCustomIABSaveRequiresDisclosureRevision() async throws {
        let vector = try fixture()
        let core = try await boot(vector, configuration: vector.cases[0].configuration, store: InMemoryStore())
        XCTAssertEqual(core.save(.iab(IABChoices(), categories: [:])).error?.code, "iab-draft-required")
    }

    func testCategorySaveCannotClaimIABCommitWithoutConfiguration() async throws {
        let vector = try fixture()
        let core = try await boot(vector, configuration: nil, store: InMemoryStore())
        let result = core.save(.all)
        XCTAssertEqual(result.status, .rejected)
        XCTAssertEqual(result.error?.code, "iab-unavailable")
        XCTAssertFalse(core.isAllowed(.marketing))
    }

    func testSharedChoicesProduceReferenceStringsAndExactBackendPayload() async throws {
        let vector = try fixture()
        for row in vector.cases {
            let store = InMemoryStore()
            let http = StubHTTP()
            let core = try await boot(vector, configuration: row.configuration, store: store, http: http)
            let result = core.save(.iab(row.choices, categories: [.marketing: row.id != "reject"]), expectedRevision: core.snapshot().revision)
            XCTAssertEqual(result.status, .committed, row.id)
            let committed = try XCTUnwrap(core.iabConsent())
            XCTAssertEqual(committed.tcString, row.tcString, row.id)
            XCTAssertEqual(committed.choices, row.choices, row.id)
            let envelope = try XCTUnwrap(store.data(for: StorageKey.snapshot).flatMap(StoredEnvelope.decode))
            XCTAssertEqual(envelope.iabConsent, committed)
            let entry = try XCTUnwrap(envelope.pendingSaves?.first)
            XCTAssertEqual(InthJSON.parse(entry.body)?["tcString"]?.stringValue, row.tcString)
            await core.waitUntilIdle()
            XCTAssertEqual(http.recordedSaveRequests.first?.body, entry.body)
            XCTAssertEqual(core.pendingSaveCount(), 1)
            if let path = ProcessInfo.processInfo.environment["INTH_IAB_SAVE_EVIDENCE_DIR"] {
                try FileManager.default.createDirectory(atPath: path, withIntermediateDirectories: true)
                try entry.body.write(
                    to: URL(fileURLWithPath: path).appendingPathComponent("swift-\(row.id).json"))
            }
            if row.id == "restriction" {
                XCTAssertTrue(core.isIABAllowed(vendorId: 2, purposeId: 2, basis: .consent))
            }
            if row.id == "custom" {
                XCTAssertTrue(core.isIABAllowed(vendorId: 1, purposeId: 1, basis: .consent))
                XCTAssertFalse(core.isIABAllowed(vendorId: 2, purposeId: 7, basis: .legitimateInterest))
            }
        }
    }

    func testConfiguredConsentLanguageIsEncodedInCommittedString() async throws {
        let vector = try fixture()
        for language in ["DE", "FR"] {
            var configuration = vector.cases[0].configuration
            configuration.consentLanguage = language
            let core = try await boot(vector, configuration: configuration, store: InMemoryStore())
            XCTAssertEqual(core.save(.all).status, .committed)
            let committed = try XCTUnwrap(core.iabConsent())
            guard case .decoded(let decoded) = TcStringWireReader.read(committed.tcString) else {
                return XCTFail("Committed TC string must decode")
            }
            XCTAssertEqual(decoded.consentLanguage, language)
            XCTAssertEqual(committed.configuration.consentLanguage, language)
        }
    }

    func testRealFileRestartHydratesChoicesAndReplaysIdenticalBytes() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = FileStore(directory: directory)
        let vector = try fixture()
        let row = vector.cases[2]
        let first = try await boot(vector, configuration: row.configuration, store: store)
        let firstResult = first.save(.iab(row.choices, categories: [.marketing: true]), expectedRevision: first.snapshot().revision)
        XCTAssertEqual(firstResult.status, .committed, String(describing: firstResult.error))
        await first.waitUntilIdle()
        let before = try XCTUnwrap(
            store.data(for: StorageKey.snapshot).flatMap(StoredEnvelope.decode)?.pendingSaves?.first?.body)
        let http = StubHTTP()
        http.setSavesFail(true)
        http.initResponse = HTTPResponse(status: 503, body: Data("{}".utf8))
        let second = ConsentCore()
        second.bootstrap(CoreConfig(store: FileStore(directory: directory), transport: Fixture.transport(http),
            iab: row.configuration, now: { vector.now }, initRetry: .disabled, flushPendingOnBootstrap: false))
        XCTAssertEqual(second.iabConsent()?.choices, row.choices)
        XCTAssertEqual(second.iabConsent()?.tcString, row.tcString)
        XCTAssertTrue(second.isAllowed(.marketing))
        second.flushPending()
        await second.waitUntilIdle()
        XCTAssertTrue(http.recordedSaveRequests.allSatisfy { $0.body == before })
        XCTAssertFalse(http.recordedSaveRequests.isEmpty)
    }

    func testFailedAtomicWriteLeavesStateBytesAndQueueUnchanged() async throws {
        let vector = try fixture()
        let store = FailingIABStore()
        let core = try await boot(vector, configuration: vector.cases[0].configuration, store: store)
        let before = core.snapshot()
        let bytes = store.data(for: StorageKey.snapshot)
        store.fail = true
        let result = core.save(.all)
        XCTAssertEqual(result.status, .rejected)
        XCTAssertEqual(result.error?.code, "queue-write-failed")
        XCTAssertEqual(core.snapshot(), before)
        XCTAssertEqual(store.data(for: StorageKey.snapshot), bytes)
        XCTAssertNil(core.iabConsent())
        XCTAssertEqual(core.pendingSaveCount(), 0)
    }

    func testFailedWithdrawalKeepsTheLastDurableGrantAndBody() async throws {
        let vector = try fixture()
        let store = FailingIABStore()
        let core = try await boot(vector, configuration: vector.cases[0].configuration, store: store)
        XCTAssertEqual(core.save(.all).status, .committed)
        await core.waitUntilIdle()
        let before = core.snapshot()
        let authority = core.iabConsent()
        let bytes = store.data(for: StorageKey.snapshot)
        store.fail = true
        XCTAssertEqual(core.save(.necessary).error?.code, "queue-write-failed")
        XCTAssertEqual(core.snapshot(), before)
        XCTAssertEqual(core.iabConsent(), authority)
        XCTAssertEqual(store.data(for: StorageKey.snapshot), bytes)
        XCTAssertEqual(core.pendingSaveCount(), 1)
    }

    // TCF-CHECK: T10
    func testAStoredTcStringWithUnequalDatesIsDroppedOnLaunch() async throws {
        let vector = try fixture()
        let store = InMemoryStore()
        let core = try await boot(vector, configuration: vector.cases[0].configuration, store: store)
        XCTAssertEqual(core.save(.all).status, .committed)
        await core.waitUntilIdle()
        // An earlier build wrote Created a day before LastUpdated.
        let saved = try XCTUnwrap(core.iabConsent()?.tcString)
        let older = try XCTUnwrap(Self.movingCreated(saved, byDays: -1))
        guard case let .decoded(before) = TcStringWireReader.read(saved),
              case let .decoded(after) = TcStringWireReader.read(older) else { return XCTFail("unreadable TC String") }
        XCTAssertEqual(before.created, before.lastUpdated)
        XCTAssertNotEqual(after.created, after.lastUpdated)
        let stored = try XCTUnwrap(store.data(for: StorageKey.snapshot).flatMap { String(data: $0, encoding: .utf8) })
        XCTAssertTrue(stored.contains(saved))
        XCTAssertTrue(store.set(Data(stored.replacingOccurrences(of: saved, with: older).utf8), for: StorageKey.snapshot))

        let bus = RecordingBus()
        let restored = try await boot(vector, configuration: vector.cases[0].configuration, store: store, bus: bus)
        XCTAssertNil(restored.iabConsent(), "a T10-invalid string must not survive launch")
        XCTAssertNil(restored.snapshot().explicitChoice, "the person is asked again")
        XCTAssertNil(bus.live[TcStorageBusKeys.tcString])
        XCTAssertFalse(bus.ops.contains { if case let .write(values) = $0 { return values[TcStorageBusKeys.tcString] == .text(older) }; return false })
    }

    /// The core segment with Created moved by whole days, as an older encoder wrote it.
    static func movingCreated(_ tcString: String, byDays days: Int64) -> String? {
        let parts = tcString.split(separator: ".", omittingEmptySubsequences: false)
        guard let core = parts.first else { return nil }
        var base64 = core.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        while base64.count % 4 != 0 { base64 += "=" }
        guard var bytes = Data(base64Encoded: base64).map(Array.init) else { return nil }
        func read(_ offset: Int, _ width: Int) -> Int64 {
            (0..<width).reduce(Int64(0)) { value, i in
                let bit = offset + i
                return value << 1 | Int64((bytes[bit / 8] >> (7 - bit % 8)) & 1)
            }
        }
        func write(_ value: Int64, _ offset: Int, _ width: Int) {
            for i in 0..<width {
                let bit = offset + i, on = (value >> Int64(width - 1 - i)) & 1 == 1
                bytes[bit / 8] = on ? bytes[bit / 8] | (1 << (7 - bit % 8)) : bytes[bit / 8] & ~(1 << (7 - bit % 8))
            }
        }
        // Version 6 bits, then Created 36 bits in deciseconds.
        write(read(6, 36) + days * 864_000, 6, 36)
        let encoded = Data(bytes).base64EncodedString()
            .replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
        return ([encoded] + parts.dropFirst().map(String.init)).joined(separator: ".")
    }

    // TCF-CHECK: T2
    // TCF-CHECK: T3
    func testWithdrawalSupersedesQueuedGrantAndSurvivesRestart() async throws {
        let vector = try fixture()
        let store = InMemoryStore()
        let core = try await boot(vector, configuration: vector.cases[0].configuration, store: store)
        XCTAssertEqual(core.save(.all).status, .committed)
        XCTAssertEqual(core.iabConsent()?.tcString, vector.cases[0].tcString)
        let grantAt = core.iabConsent()?.actionAt
        let createdAt = core.iabConsent()?.createdAt
        XCTAssertEqual(core.save(.necessary).status, .committed)
        XCTAssertGreaterThan(core.iabConsent()!.actionAt, grantAt!)
        XCTAssertEqual(core.iabConsent()?.createdAt, createdAt)
        XCTAssertEqual(core.iabConsent()?.tcString, vector.cases[1].tcString)
        await core.waitUntilIdle()
        XCTAssertEqual(core.iabConsent()?.consentVersion, 2)
        XCTAssertEqual(core.iabConsent()?.choices, IABChoices())
        let entries = try XCTUnwrap(
            store.data(for: StorageKey.snapshot).flatMap(StoredEnvelope.decode)?.pendingSaves)
        XCTAssertEqual(entries.count, 1)
        XCTAssertEqual(InthJSON.parse(entries[0].body)?["tcString"]?.stringValue, core.iabConsent()?.tcString)
        let restored = try await boot(vector, configuration: vector.cases[0].configuration, store: store)
        XCTAssertEqual(restored.iabConsent()?.choices, IABChoices())
        XCTAssertFalse(restored.isAllowed(.marketing))
    }

    func testInvalidDraftAndObjectionConflictAreRejectedWithoutMutation() async throws {
        let vector = try fixture()
        let core = try await boot(
            vector, configuration: vector.cases[0].configuration, store: InMemoryStore())
        let revision = core.snapshot().revision
        for invalid in vector.invalidChoices {
            XCTAssertEqual(core.save(.iab(invalid, categories: [:]), expectedRevision: core.snapshot().revision).error?.code, "invalid-iab-choices")
        }
        XCTAssertEqual(core.snapshot().revision, revision)
        XCTAssertEqual(core.pendingSaveCount(), 0)
    }

    func testConcurrentCommitsKeepTheLatestDurableDecisionAndStaleDraftIsRejected() async throws {
        let vector = try fixture()
        let store = InMemoryStore()
        let core = try await boot(vector, configuration: vector.cases[0].configuration, store: store)
        let revision = core.snapshot().revision
        DispatchQueue.concurrentPerform(iterations: 20) { index in
            _ = core.save(index.isMultiple(of: 2) ? .all : .necessary)
        }
        await core.waitUntilIdle()
        let saved = try XCTUnwrap(core.iabConsent())
        XCTAssertGreaterThan(saved.consentVersion, 0)
        let envelope = try XCTUnwrap(store.data(for: StorageKey.snapshot).flatMap(StoredEnvelope.decode))
        XCTAssertEqual(saved, envelope.iabConsent)
        let pending = envelope.pendingSaves ?? []
        XCTAssertEqual(pending.last.flatMap { InthJSON.parse($0.body)?["tcString"]?.stringValue }, saved.tcString)
        XCTAssertTrue(pending.dropLast().allSatisfy { $0.isProtectedWithdrawal })
        XCTAssertEqual(core.save(.necessary, expectedRevision: revision).error?.code, "concurrent-change")
        XCTAssertEqual(saved, core.iabConsent())
    }

    func testChangedConfigurationAndTamperedStringRequireFreshIABConsent() async throws {
        let vector = try fixture()
        let store = InMemoryStore()
        var configuration = vector.cases[0].configuration
        let core = try await boot(vector, configuration: configuration, store: store)
        XCTAssertEqual(core.save(.all).status, .committed)
        await core.waitUntilIdle()
        configuration.cmpVersion += 1
        let cold = try await boot(vector, configuration: configuration, store: store)
        XCTAssertNil(cold.iabConsent())
        XCTAssertFalse(cold.isAllowed(.marketing))
        XCTAssertEqual(cold.pendingSaveCount(), 0)
        XCTAssertEqual(cold.save(.all).status, .committed)
        await cold.waitUntilIdle()
        let raw = try XCTUnwrap(store.data(for: StorageKey.snapshot))
        var envelope = try XCTUnwrap(InthJSON.parse(raw)?.objectValue)
        var iab = try XCTUnwrap(envelope["iabConsent"]?.objectValue)
        iab["tcString"] = .string("invalid")
        envelope["iabConsent"] = .object(iab)
        store.set(try InthJSON.encode(JSONValue.object(envelope)), for: StorageKey.snapshot)
        let tampered = try await boot(vector, configuration: configuration, store: store)
        XCTAssertNil(tampered.iabConsent())
        XCTAssertFalse(tampered.isAllowed(.marketing))
        XCTAssertEqual(tampered.pendingSaveCount(), 0)
    }

    func testInvalidConfigurationCannotCommitAndExpiredStateCannotReplay() async throws {
        let vector = try fixture()
        for configuration in vector.invalidConfigurations {
            let core = try await boot(vector, configuration: configuration, store: InMemoryStore())
            XCTAssertEqual(core.save(.all).error?.code, "invalid-iab-choices")
            XCTAssertNil(core.iabConsent())
            XCTAssertFalse(core.isAllowed(.marketing))
        }
        let store = InMemoryStore()
        let configuration = vector.cases[0].configuration
        let first = try await boot(vector, configuration: configuration, store: store)
        XCTAssertEqual(first.save(.all).status, .committed)
        await first.waitUntilIdle()
        let later = Vector(
            invalidChoices: vector.invalidChoices, invalidConfigurations: vector.invalidConfigurations,
            now: vector.now + 31_536_000_001, gvl: vector.gvl, cases: vector.cases)
        let http = StubHTTP()
        let cold = try await boot(later, configuration: configuration, store: store, http: http)
        XCTAssertNil(cold.iabConsent())
        XCTAssertFalse(cold.isIABAllowed(vendorId: 1, purposeId: 1, basis: .consent))
        XCTAssertFalse(cold.isAllowed(.marketing))
        cold.flushPending()
        await cold.waitUntilIdle()
        XCTAssertTrue(http.recordedSaveRequests.isEmpty)
    }

    func testIdentityLogoutResetAndFailedTransitionsCannotRestoreGrant() async throws {
        let vector = try fixture()
        let config = vector.cases[0].configuration
        for operation in ["identify", "logout", "reset"] {
            let store = FailingIABStore()
            let core = try await boot(vector, configuration: config, store: store)
            if operation == "logout" { core.identify(KernelUser(externalId: "current")) }
            XCTAssertEqual(core.save(.all).status, .committed)
            await core.waitUntilIdle()
            let granted = core.iabConsent()
            let bytes = store.data(for: StorageKey.snapshot)
            store.fail = true
            if operation == "identify" { core.identify(KernelUser(externalId: "next")) }
            if operation == "logout" { core.logout() }
            if operation == "reset" { core.reset() }
            XCTAssertEqual(core.iabConsent(), granted)
            XCTAssertEqual(store.data(for: StorageKey.snapshot), bytes)
            store.fail = false
            if operation == "identify" { core.identify(KernelUser(externalId: "next")) }
            if operation == "logout" { core.logout() }
            if operation == "reset" { core.reset() }
            await core.waitUntilIdle()
            XCTAssertNil(core.iabConsent())
            XCTAssertEqual(core.pendingSaveCount(), 0)
            XCTAssertFalse(core.isAllowed(.marketing))
            let cold = try await boot(vector, configuration: config, store: store)
            XCTAssertNil(cold.iabConsent())
            XCTAssertFalse(cold.isAllowed(.marketing))
            XCTAssertEqual(cold.save(.all).status, .committed)
            XCTAssertGreaterThan(cold.iabConsent()!.actionAt, granted!.actionAt)
        }
    }
}

private final class FailingIABStore: ConsentStore, @unchecked Sendable {
    let inner = InMemoryStore()
    var fail = false
    func data(for key: String) -> Data? { inner.data(for: key) }
    func set(_ data: Data?, for key: String) -> Bool {
        if fail && key == StorageKey.snapshot { return false }
        return inner.set(data, for: key)
    }
}

private final class IABRetryObserver: @unchecked Sendable {
    let revisions = SendableBox([Int]())
    func consentDidChange(_ snapshot: ConsentSnapshot) {
        revisions.mutate { $0.append(snapshot.revision) }
    }
}
