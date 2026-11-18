import Foundation
import XCTest

@_spi(InthInternal) @testable import InthCore

/// Linking a person, adopting the canonical subject id, and the idempotency key, as
/// `packages/native-protocol/CONTRACT.md` "Subject identity" and "Saving" describe them.
final class SubjectLinkTests: XCTestCase {
    private static let c15tId = "sub_2VZxR7YmNpKq3WfLs8TgHd"
    private static let canonical = "0193e5a8-6f00-7c3a-8a1b-5d2e7f9a0b1c"
    private let optOutRights = ["disclosure", "opt-out", "preferences"]

    private var clock: TestClock!
    private var store: InMemoryStore!
    private var http: StubHTTP!

    override func setUp() {
        super.setUp()
        clock = TestClock()
        store = InMemoryStore()
        http = StubHTTP()
        http.initResponse = Fixture.initResponse(policyResolution: Fixture.matchedResolution(
            policy: Fixture.rule(model: "opt-out", rights: optOutRights)
        ))
    }

    private func started(subjectId: String? = nil) async -> ConsentCore {
        if let subjectId { store.encode(["id": subjectId], for: StorageKey.subject) }
        let core = ConsentCore()
        await core.bootstrapAndSettle(Fixture.configured(
            store: store, transport: Fixture.transport(http), clock: clock))
        return core
    }

    private func errors(of core: ConsentCore) -> (SendableBox<[CoreErrorInfo]>, Task<Void, Never>) {
        let seen = SendableBox([CoreErrorInfo]())
        let stream = core.eventStream
        let pump = Task {
            for await event in stream {
                if case let .error(info) = event { seen.mutate { $0.append(info) } }
            }
        }
        return (seen, pump)
    }

    // MARK: - Linking

    func testIdentifySendsALinkOnlyWithATokenAndNeverStoresTheToken() async throws {
        let core = await started()
        core.identify(KernelUser(externalId: "user_123", identityProvider: "clerk"))
        await core.waitUntilIdle()
        XCTAssertTrue(http.recordedIdentityRequests.isEmpty, "no token, no request")
        XCTAssertEqual(core.snapshot().subject?.externalId, "user_123", "the identity is still kept locally")

        core.identify(KernelUser(externalId: "user_123", identityProvider: "clerk"), identityToken: "secret-token")
        core.save(.all)
        await core.waitUntilIdle()

        let link = try XCTUnwrap(http.recordedIdentityRequests.first)
        XCTAssertEqual(http.recordedIdentityRequests.count, 1)
        XCTAssertEqual(link.url.path, "/v1/subjects/\(core.snapshot().subject?.id ?? "")/link")
        XCTAssertEqual(InthJSON.parse(link.body ?? Data()), .object([
            "externalId": .string("user_123"),
            "identityProvider": .string("clerk"),
            "identityToken": .string("secret-token"),
        ]))

        let save = try XCTUnwrap(InthJSON.parse(http.lastSaveBody ?? Data()))
        XCTAssertEqual(save["externalId"]?.stringValue, "user_123")
        XCTAssertEqual(save["identityProvider"]?.stringValue, "clerk")
        XCTAssertNil(save["identityToken"], "a queued body outlives the token")
        XCTAssertNil(save["externalSubjectId"])
        for key in [StorageKey.subject, StorageKey.snapshot, StorageKey.pendingSaves] {
            let text = String(decoding: store.data(for: key) ?? Data(), as: UTF8.self)
            XCTAssertFalse(text.contains("secret-token"), "\(key) holds the identity token")
        }
    }

    func testAFailedLinkReportsTheBackendCodeAndKeepsTheLocalIdentity() async throws {
        let core = await started()
        let (seen, pump) = errors(of: core)
        defer { pump.cancel() }
        http.linkResponse = HTTPResponse(
            status: 401, headers: ["x-request-id": "req_link"],
            body: Data(#"{"error":{"code":"identity_token_invalid","message":"Token expired"}}"#.utf8))

        core.identify(KernelUser(externalId: "user_123"), identityToken: "stale")
        await core.waitUntilIdle()
        try? await Task.sleep(nanoseconds: 20_000_000)

        let error = try XCTUnwrap(seen.value.first { $0.code == "http-status" })
        for part in ["401", "identity_token_invalid", "req_link"] {
            XCTAssertTrue(error.message.contains(part), error.message)
        }
        XCTAssertEqual(core.snapshot().subject?.externalId, "user_123")
        XCTAssertEqual(http.recordedIdentityRequests.count, 1, "a link is not queued or retried")
    }

    // MARK: - Canonical id

    func testACanonicalIdFromASaveReplacesTheStoredIdOnceAndKeepsTheDecision() async throws {
        let core = await started(subjectId: Self.c15tId)
        XCTAssertEqual(core.snapshot().subject?.id, Self.c15tId, "a stored c15t id is adopted as it is")
        http.saveResponse = .json(#"{"subjectId":"\#(Self.canonical)","stored":true}"#)
        let publications = SendableBox(0)
        let subscription = core.onChange { _ in publications.mutate { $0 += 1 } }
        defer { subscription.cancel() }

        let committed = core.save(.necessary)
        XCTAssertEqual(committed.status, .committed)
        let decided = core.snapshot()
        await core.waitUntilIdle()

        let after = core.snapshot()
        XCTAssertEqual(after.subject?.id, Self.canonical)
        XCTAssertEqual(after.revision, decided.revision + 1, "the identity change is one revision")
        XCTAssertEqual(after.explicitChoice, decided.explicitChoice, "the decision is unchanged")
        XCTAssertEqual(after.effectivePermissions, decided.effectivePermissions)
        let bodies = http.recordedSaveRequests.compactMap { InthJSON.parse($0.body ?? Data()) }
        XCTAssertEqual(bodies.map { $0["subjectId"]?.stringValue }, [Self.c15tId], "the frozen body keeps its id")

        // Slot and envelope moved together, so a relaunch keeps the decision.
        let stored = try XCTUnwrap(InthJSON.parse(store.data(for: StorageKey.subject) ?? Data()))
        XCTAssertEqual(stored["id"]?.stringValue, Self.canonical)
        let envelope = try XCTUnwrap(store.data(for: StorageKey.snapshot).flatMap(StoredEnvelope.decode))
        XCTAssertEqual(envelope.snapshot.subject?.id, Self.canonical)

        let relaunched = ConsentCore()
        let (seen, pump) = errors(of: relaunched)
        defer { pump.cancel() }
        await relaunched.bootstrapAndSettle(Fixture.configured(
            store: store, transport: nil, clock: clock))
        XCTAssertEqual(relaunched.snapshot().subject?.id, Self.canonical)
        XCTAssertEqual(relaunched.snapshot().explicitChoice, decided.explicitChoice)
        XCTAssertFalse(seen.value.contains { $0.code.hasPrefix("subject-id-") })
    }

    func testBodiesQueuedUnderTheReplacedIdAreStillDelivered() async throws {
        let core = await started(subjectId: Self.c15tId)
        http.setSavesFail(true)
        core.save(.custom([.marketing: false]))
        clock.advance(by: 1)
        core.save(.custom([.measurement: true]))
        await core.waitUntilIdle()
        XCTAssertEqual(core.pendingSaveCount(), 2)

        http.setSavesFail(false)
        http.saveResponse = .json(#"{"subjectId":"\#(Self.canonical)"}"#)
        core.flushPending()
        await core.waitUntilIdle()

        XCTAssertEqual(core.snapshot().subject?.id, Self.canonical)
        XCTAssertEqual(core.pendingSaveCount(), 0, "a body frozen with the c15t id is still this subject's")
    }

    func testAnIdThatIsNotAUUIDv7IsIgnored() async {
        let core = await started(subjectId: Self.c15tId)
        let before = core.snapshot().revision
        http.saveResponse = .json(#"{"subjectId":"sub_1119tDZHoarNxm6kSm3BN6ze9d"}"#)
        core.save(.necessary)
        await core.waitUntilIdle()
        XCTAssertEqual(core.snapshot().subject?.id, Self.c15tId)
        XCTAssertEqual(core.snapshot().revision, before + 1, "only the save moved the revision")
    }

    func testALinkThatNamesTheCanonicalIdIsAdopted() async {
        let core = await started(subjectId: Self.c15tId)
        http.linkResponse = .json(#"{"subjectId":"\#(Self.canonical)","externalId":"user_123","verifiedBy":"identity_token"}"#)
        core.identify(KernelUser(externalId: "user_123"), identityToken: "token")
        await core.waitUntilIdle()
        XCTAssertEqual(core.snapshot().subject?.id, Self.canonical)
        XCTAssertEqual(core.snapshot().subject?.externalId, "user_123")
    }

    func testAnAnswerForASubjectTheCoreNoLongerHoldsIsNotAdopted() async throws {
        let core = await started(subjectId: Self.c15tId)
        http.saveResponse = .json(#"{"subjectId":"\#(Self.canonical)","recordId":"rec_1"}"#)
        http.holdsSaves = true
        core.save(.all)
        await http.waitUntilSaveRequests(1)

        // The identity slot is cleared while the save is in flight, so the next
        // hydrate mints a new subject.
        _ = store.set(nil, for: StorageKey.subject)
        let fresh = try XCTUnwrap(core.hydrate().subject?.id)
        XCTAssertNotEqual(fresh, Self.c15tId)

        http.releaseSaves()
        await core.waitUntilIdle()
        XCTAssertEqual(core.snapshot().subject?.id, fresh, "the answer was for the subject the slot no longer holds")
    }

    // MARK: - Idempotency key

    func testAReplaySendsTheSameIdempotencyKey() async throws {
        let core = await started()
        http.setSavesFail(true)
        core.save(.all)
        await core.waitUntilIdle()
        http.setSavesFail(false)
        core.flushPending()
        await core.waitUntilIdle()

        let keys = http.recordedSaveRequests.compactMap {
            InthJSON.parse($0.body ?? Data())?["idempotencyKey"]?.stringValue
        }
        XCTAssertEqual(keys.count, 2)
        XCTAssertEqual(Set(keys).count, 1, "the replay must carry the first send's key")
        XCTAssertTrue(SubjectId.isUUIDv7(keys[0]))

        core.save(.necessary)
        await core.waitUntilIdle()
        let next = InthJSON.parse(http.lastSaveBody ?? Data())?["idempotencyKey"]?.stringValue
        XCTAssertNotEqual(next, keys[0], "a new action gets a new key")
    }
}
