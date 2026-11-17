import Foundation
import XCTest

@_spi(InthInternal) @testable import InthCore

/// `dryRun`: everything on the device works, and no record leaves it.
final class DryRunTests: XCTestCase {
    private var clock: TestClock!
    private var store: InMemoryStore!
    private var http: StubHTTP!

    override func setUp() {
        super.setUp()
        clock = TestClock()
        store = InMemoryStore()
        http = StubHTTP()
        http.initResponse = Fixture.initResponse(policyResolution: Fixture.matchedResolution())
        Inth.resetForTests()
    }

    override func tearDown() {
        InthBuild.simulate(debug: nil)
        Inth.resetForTests()
        super.tearDown()
    }

    private func config(dryRun: Bool, bus: (any TcStorageBusWriting)? = nil, gpp: GPPOptions? = nil) -> CoreConfig {
        CoreConfig(
            store: store, transport: Fixture.transport(http), dryRun: dryRun,
            overrides: .default(language: "en"), now: clock.reading, initRetry: .disabled,
            storageBus: bus, gpp: gpp)
    }

    func testDryRunSaveChangesTheSnapshotAndPersistsButSendsNothing() async throws {
        let core = ConsentCore()
        let events = SendableBox([CoreEvent]())
        let stream = core.eventStream
        let pump = Task { for await event in stream { events.mutate { $0.append(event) } } }
        defer { pump.cancel() }

        await core.bootstrapAndSettle(config(dryRun: true))
        XCTAssertEqual(http.recordedInitRequests.count, 1, "dryRun still previews the hosted policy")
        XCTAssertFalse(core.snapshot().policyPending)
        XCTAssertEqual(core.snapshot().promptRequirement.kind, .choice)

        let result = core.save(.all)
        XCTAssertEqual(result.status, .committed)
        XCTAssertFalse(result.queued, "a dry-run save succeeds and queues nothing")
        core.identify(KernelUser(externalId: "user-1", identityProvider: nil))
        core.flushPending()
        core.logout()
        await core.waitUntilIdle()

        XCTAssertTrue(core.isAllowed(.marketing))
        XCTAssertEqual(core.snapshot().promptRequirement.kind, PromptRequirement.none.kind)
        XCTAssertEqual(http.recordedSaveRequests.count, 0, "no record is sent")
        XCTAssertEqual(http.recordedIdentityRequests.count, 0, "no identity call is sent")
        XCTAssertEqual(core.pendingSaveCount(), 0, "no record is queued")
        XCTAssertFalse(events.value.contains { if case .saveQueued = $0 { return true } else { return false } })

        // The choice is on disk: a normal launch reads it and still owes the backend nothing.
        let next = ConsentCore()
        await next.bootstrapAndSettle(config(dryRun: false))
        XCTAssertTrue(next.isAllowed(.marketing))
        XCTAssertEqual(next.pendingSaveCount(), 0)
        XCTAssertEqual(http.recordedSaveRequests.count, 0)
    }

    func testDryRunStillWritesTheConsentSignals() async throws {
        let body = Fixture.initBody(policyResolution: Fixture.matchedResolution(
            policy: Fixture.rule(model: "opt-out", rights: ["disclosure", "opt-out", "preferences"])))
        var fields = InthJSON.parse(body)?.objectValue ?? [:]
        fields["location"] = .object(["countryCode": .string("US"), "regionCode": .null])
        http.initResponse = .json(String(decoding: InthJSON.encode(.object(fields)) ?? Data("{}".utf8), as: UTF8.self))
        let bus = RecordingBus()
        let core = ConsentCore()
        await core.bootstrapAndSettle(config(dryRun: true, bus: bus, gpp: GPPOptions()))
        let before = try XCTUnwrap(core.snapshot().gppString)

        XCTAssertEqual(core.save(.necessary).status, .committed)
        await core.waitUntilIdle()

        let after = try XCTUnwrap(core.snapshot().gppString)
        XCTAssertNotEqual(after, before, "the refusal reaches the GPP string")
        XCTAssertEqual(bus.live[GPPStorageBusKeys.hdrGppString], .text(after))
        XCTAssertEqual(http.recordedSaveRequests.count, 0)
        XCTAssertEqual(core.pendingSaveCount(), 0)
    }

    func testDryRunNeverFlushesAnEarlierQueueAndASaveDropsIt() async {
        let first = ConsentCore()
        await first.bootstrapAndSettle(config(dryRun: false))
        http.setSavesFail(true)
        XCTAssertEqual(first.save(.all).status, .committed)
        await first.waitUntilIdle()
        XCTAssertEqual(first.pendingSaveCount(), 1)
        XCTAssertEqual(http.recordedSaveRequests.count, 1)
        let owed = first.pendingSaveBodies()
        http.setSavesFail(false)

        let dry = ConsentCore()
        await dry.bootstrapAndSettle(config(dryRun: true))
        clock.advance(by: 1_000)
        dry.flushPending()
        dry.replayThenRefresh()
        await dry.waitUntilIdle()
        XCTAssertEqual(dry.pendingSaveBodies(), owed, "without a save the earlier record is still owed")
        XCTAssertEqual(dry.save(.necessary).status, .committed)
        await dry.waitUntilIdle()

        XCTAssertFalse(dry.isAllowed(.marketing))
        XCTAssertEqual(http.recordedSaveRequests.count, 1, "nothing was sent in the dry run")
        XCTAssertEqual(dry.pendingSaveCount(), 0, "the old grant cannot replay after the withdrawal")
    }

    func testDryRunIsRefusedInAReleaseBuild() {
        InthBuild.simulate(debug: false)
        XCTAssertFalse(InthBuild.isDebug)
        XCTAssertEqual(
            InthBuild.dryRunRefusal(),
            "dryRun is for development and CI and cannot run in a release build. "
                + "Remove dryRun (pass it only inside #if DEBUG).")

        let core = ConsentCore()
        core.bootstrap(config(dryRun: true))
        XCTAssertFalse(core.isBootstrapped)

        let returned = Inth.bootstrap(config(dryRun: true))
        XCTAssertFalse(returned.isBootstrapped)
        XCTAssertNil(Inth.current, "no core is installed")
        XCTAssertEqual(http.recordedInitRequests.count, 0)

        InthBuild.simulate(debug: true)
        core.bootstrap(config(dryRun: true))
        XCTAssertTrue(core.isBootstrapped)
    }

    func testInCodePolicyDeliversRecordsThroughTheHostedTransport() async throws {
        let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("native-protocol/local-policy/parity.json")
        let rules = try XCTUnwrap(InthJSON.parse(Data(contentsOf: url))?["rules"])
        let policy = try ConsentPolicy(json: XCTUnwrap(InthJSON.encode(.object(["rules": rules]))))
        let core = ConsentCore()
        await core.bootstrapAndSettle(CoreConfig(
            store: store, policy: policy, transport: Fixture.transport(http),
            consentCategories: ConsentCategory.allCases, now: clock.reading, initRetry: .disabled))

        XCTAssertEqual(http.recordedInitRequests.count, 0, "the rules are resolved on the device")
        XCTAssertFalse(core.snapshot().policyPending)
        XCTAssertEqual(core.save(.all).status, .committed)
        await core.waitUntilIdle()
        XCTAssertEqual(http.recordedSaveRequests.count, 1, "the record goes to the backend")
        XCTAssertEqual(core.pendingSaveCount(), 0)
    }

    /// Spec test 4: the transport fails, the record queues, the transport recovers, a flush delivers.
    func testHostedModeDeliversAQueuedRecordAfterReconnect() async {
        let core = ConsentCore()
        await core.bootstrapAndSettle(config(dryRun: false))
        http.setSavesFail(true)
        let saved = core.save(.all)
        XCTAssertEqual(saved.status, .committed)
        XCTAssertTrue(saved.queued)
        await core.waitUntilIdle()
        XCTAssertEqual(core.pendingSaveCount(), 1)
        let owed = core.pendingSaveBodies()

        http.setSavesFail(false)
        core.replayThenRefresh()
        await core.waitUntilIdle()

        XCTAssertEqual(core.pendingSaveCount(), 0)
        XCTAssertEqual(http.recordedSaveRequests.count, 2)
        XCTAssertEqual(http.lastSaveBody, owed.first, "the replay sends the bytes that were queued")
    }
}
