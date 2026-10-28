import Foundation
import XCTest

@testable import C15tCore

/// Delivery obligations survive local-authority invalidation.
final class IABDeliveryTests: XCTestCase {
    typealias Vector = IABCommitTests.Vector

    func initBody(_ vector: Vector, listVersion: Int? = nil) throws -> Data {
        var gvl = try C15tJSON.parse(C15tJSON.encode(vector.gvl))!.objectValue!
        if let listVersion { gvl["vendorListVersion"] = .number(Double(listVersion)) }
        var fields = C15tJSON.parse(
            Fixture.initBody(policyResolution: Fixture.matchedResolution(policy: Fixture.rule(model: "iab")))
        )!.objectValue!
        fields["gvl"] = .object(gvl)
        return try C15tJSON.encode(JSONValue.object(fields))
    }

    func boot(_ vector: Vector, store: any ConsentStore, http: StubHTTP, user: KernelUser? = nil) async throws
        -> ConsentCore
    {
        http.initResponse = HTTPResponse(status: 200, body: try initBody(vector))
        let core = ConsentCore()
        core.bootstrap(
            CoreConfig(
                store: store, transport: Fixture.transport(http), iab: vector.cases[0].configuration,
                user: user, now: { vector.now }, initRetry: .disabled, flushPendingOnBootstrap: false))
        await core.waitUntilIdle()
        return core
    }

    /// Repro A: calling identify again with the same external id wipes IAB consent.
    func testRepeatedIdentifyPreservesConsentAndFrozenQueue() async throws {
        let vector = try IABCommitTests().fixture()
        let http = StubHTTP()
        http.setSavesFail(true)
        let store = InMemoryStore()
        let core = try await boot(vector, store: store, http: http, user: KernelUser(externalId: "u1"))
        XCTAssertEqual(core.save(.all).status, .committed)
        await core.waitUntilIdle()
        XCTAssertNotNil(core.iabConsent(), "precondition: committed")
        let pending = store.data(for: StorageKey.snapshot).flatMap(StoredEnvelope.decode)?.pendingSaves
        core.identify(KernelUser(externalId: "u1"))
        await core.waitUntilIdle()
        XCTAssertEqual(store.data(for: StorageKey.snapshot).flatMap(StoredEnvelope.decode)?.pendingSaves, pending)
        XCTAssertNotNil(core.iabConsent(), "identify with the unchanged external id should not erase consent")
    }

    /// Repro B: an undelivered withdrawal is deleted when the list version changes.
    func testWithdrawalSurvivesListRefresh() async throws {
        let vector = try IABCommitTests().fixture()
        let http = StubHTTP()
        http.setSavesFail(false)
        let store = InMemoryStore()
        let core = try await boot(vector, store: store, http: http)
        XCTAssertEqual(core.save(.all).status, .committed)
        await core.waitUntilIdle()
        http.setSavesFail(true)
        XCTAssertEqual(core.save(.necessary).status, .committed)
        await core.waitUntilIdle()
        XCTAssertEqual(core.pendingSaveCount(), 1)
        // The weekly GVL update arrives with the next /init.
        http.initResponse = HTTPResponse(status: 200, body: try initBody(vector, listVersion: 43))
        core.refresh()
        await core.waitUntilIdle()
        http.setSavesFail(false)
        let before = http.recordedSaveRequests.count
        core.flushPending()
        await core.waitUntilIdle()
        let withdrawalSent = http.recordedSaveRequests.dropFirst(before).contains {
            $0.body.flatMap { C15tJSON.parse($0) }?["tcString"]?.stringValue == vector.cases[1].tcString
        }
        XCTAssertTrue(withdrawalSent, "the committed withdrawal must still reach the backend")
    }

    /// Repro C: logout with no attached user also wipes consent.
    func testAnonymousLogoutPreservesConsent() async throws {
        let vector = try IABCommitTests().fixture()
        let core = try await boot(vector, store: InMemoryStore(), http: StubHTTP())
        XCTAssertEqual(core.save(.all).status, .committed)
        await core.waitUntilIdle()
        let saved = core.iabConsent()
        core.logout()
        await core.waitUntilIdle()
        XCTAssertEqual(core.iabConsent(), saved)
    }
    func testWithdrawalSurvivesInvalidationRestartAndReconnect() async throws {
        let vector = try IABCommitTests().fixture()
        for change in ["list", "expiry", "clock", "config", "model", "fingerprint", "identify", "logout", "reset"] {
            let store = InMemoryStore()
            let http = StubHTTP()
            let core = try await boot(vector, store: store, http: http, user: KernelUser(externalId: "u1"))
            XCTAssertEqual(core.save(.all).status, .committed)
            await core.waitUntilIdle()
            http.setSavesFail(true)
            XCTAssertEqual(core.save(.necessary).status, .committed)
            await core.waitUntilIdle()
            let frozen = try XCTUnwrap(store.data(for: StorageKey.snapshot).flatMap(StoredEnvelope.decode)?.pendingSaves?.last?.body)
            var configuration = vector.cases[0].configuration
            var now = vector.now
            var user: KernelUser? = KernelUser(externalId: "u1")
            switch change {
            case "list":
                http.initResponse = HTTPResponse(status: 200, body: try initBody(vector, listVersion: 43))
                core.refresh()
            case "expiry": now += 400 * 86_400_000
            case "clock": now -= 600_001
            case "config":
                var object = C15tJSON.parse(try C15tJSON.encode(configuration))!.objectValue!
                object["cmpVersion"] = .number(Double(configuration.cmpVersion + 1))
                configuration = try C15tJSON.decode(IABConfiguration.self, from: C15tJSON.encode(JSONValue.object(object)))
            case "model", "fingerprint":
                var fields = C15tJSON.parse(try initBody(vector))!.objectValue!
                if change == "model" {
                    fields["policyResolution"] = Fixture.matchedResolution(policy: Fixture.rule(model: "opt-out"))
                } else {
                    var wire = fields["policyResolution"]!.objectValue!
                    var fingerprints = wire["fingerprints"]!.objectValue!
                    fingerprints["choice"] = .string(String(repeating: "d", count: 64))
                    wire["fingerprints"] = .object(fingerprints)
                    fields["policyResolution"] = .object(wire)
                }
                http.initResponse = HTTPResponse(status: 200, body: try C15tJSON.encode(JSONValue.object(fields)))
                core.refresh()
            case "identify": core.identify(KernelUser(externalId: "u2")); user = KernelUser(externalId: "u2")
            case "logout": core.logout(); user = nil
            case "reset": core.reset()
            default: XCTFail("Unknown case")
            }
            await core.waitUntilIdle()
            XCTAssertTrue(store.data(for: StorageKey.snapshot).flatMap(StoredEnvelope.decode)?.pendingSaves?.contains { $0.body == frozen } == true, change)
            let offline = StubHTTP()
            offline.setSavesFail(true)
            let cold = ConsentCore()
            cold.bootstrap(CoreConfig(store: store, transport: Fixture.transport(offline), iab: configuration,
                user: user, now: { now }, initRetry: .disabled, flushPendingOnBootstrap: false))
            await cold.waitUntilIdle()
            cold.flushPending()
            await cold.waitUntilIdle()
            XCTAssertEqual(cold.pendingSaveCount(), 1, change)
            offline.setSavesFail(false)
            let before = offline.recordedSaveRequests.count
            cold.flushPending()
            await cold.waitUntilIdle()
            XCTAssertEqual(offline.recordedSaveRequests.dropFirst(before).map(\.body), [frozen], change)
            XCTAssertEqual(cold.pendingSaveCount(), 0, change)
        }
    }

}
