#if canImport(Combine)
import Combine
import Foundation
import Observation
import XCTest
@testable import C15tCore

/// The observable models: they follow the core with no observer code in the app, and
/// every update reaches the main thread.
final class ObservableConsentTests: XCTestCase {
    private var clock: TestClock!
    private var store: InMemoryStore!
    private var http: StubHTTP!

    override func setUp() {
        super.setUp()
        clock = TestClock()
        store = InMemoryStore()
        http = StubHTTP()
    }

    @MainActor
    func testPublishedConsentFollowsTheCoreFromPendingToEachSave() async {
        let core = ConsentCore()
        let consent = PublishedConsent(core: core)
        XCTAssertEqual(consent.decision(for: .measurement), .pending, "before bootstrap nothing is known")
        XCTAssertEqual(consent.decision(for: .necessary), .granted)

        http.initResponse = Fixture.initResponse(policyResolution: Fixture.matchedResolution())
        await core.bootstrapAndSettle(configuration())
        await settled(consent.snapshot, core)

        XCTAssertTrue(consent.isReady)
        XCTAssertEqual(consent.snapshot, core.snapshot())
        XCTAssertEqual(consent.decision(for: .measurement), .denied, "opt-in with no choice yet")

        XCTAssertEqual(core.save(.all).status, .committed)
        await settled(consent.snapshot, core)

        XCTAssertEqual(consent.decision(for: .measurement), .granted)
        XCTAssertEqual(consent.decisions[.marketing], .granted)
    }

    @MainActor
    func testDecisionPublisherDeliversEachChangeOnceOnTheMainThread() async {
        let core = ConsentCore()
        http.initResponse = Fixture.initResponse(policyResolution: Fixture.matchedResolution())
        await core.bootstrapAndSettle(configuration())
        let consent = PublishedConsent(core: core)
        var seen: [ConsentDecision] = []
        var offMain = 0
        let subscription = consent.decisionPublisher(for: .measurement).sink { decision in
            if !Thread.isMainThread { offMain += 1 }
            seen.append(decision)
        }

        XCTAssertEqual(core.save(.all).status, .committed)
        await settled(consent.snapshot, core)
        // Same answer again: a new revision, but not a new decision.
        XCTAssertEqual(core.save(.all).status, .committed)
        await settled(consent.snapshot, core)
        XCTAssertEqual(core.save(.necessary).status, .committed)
        await settled(consent.snapshot, core)
        subscription.cancel()

        XCTAssertEqual(seen, [.denied, .granted, .denied])
        XCTAssertEqual(offMain, 0, "UI code must not have to hop")
    }

    @MainActor
    func testAReleasedModelStopsFollowingTheCore() async {
        let core = ConsentCore()
        http.initResponse = Fixture.initResponse(policyResolution: Fixture.matchedResolution())
        await core.bootstrapAndSettle(configuration())
        weak var released: PublishedConsent?
        do {
            let consent = PublishedConsent(core: core)
            released = consent
            XCTAssertNotNil(released)
        }

        XCTAssertNil(released, "the event stream must not keep the model alive")
        // A later revision has nobody to deliver to and must not crash.
        XCTAssertEqual(core.save(.all).status, .committed)
        await core.waitUntilIdle()
    }

    @MainActor
    func testObservableConsentTracksTheSameState() async throws {
        guard #available(iOS 17.0, macOS 14.0, tvOS 17.0, watchOS 10.0, *) else {
            throw XCTSkip("@Observable needs iOS 17 or macOS 14")
        }
        let core = ConsentCore()
        let consent = ObservableConsent(core: core)
        XCTAssertFalse(consent.isReady)

        http.initResponse = Fixture.initResponse(policyResolution: Fixture.matchedResolution())
        await core.bootstrapAndSettle(configuration())
        await settled(consent.snapshot, core)
        XCTAssertTrue(consent.isReady)
        XCTAssertEqual(consent.decision(for: .measurement), .denied)

        let changed = expectation(description: "a view reading decisions is invalidated")
        withObservationTracking {
            _ = consent.decision(for: .measurement)
        } onChange: {
            changed.fulfill()
        }
        XCTAssertEqual(core.save(.all).status, .committed)
        await fulfillment(of: [changed], timeout: 2)
        await settled(consent.snapshot, core)

        XCTAssertEqual(consent.decision(for: .measurement), .granted)
        XCTAssertEqual(consent.snapshot, core.snapshot())
    }

    // MARK: - Helpers

    @MainActor
    private func configuration() -> CoreConfig {
        Fixture.configured(store: store, transport: Fixture.transport(http), clock: clock)
    }

    /// Wait for the model's main-actor copy to reach the core's revision.
    @MainActor
    private func settled(
        _ snapshot: @autoclosure () -> ConsentSnapshot,
        _ core: ConsentCore,
        file: StaticString = #filePath,
        line: UInt = #line
    ) async {
        await core.waitUntilIdle()
        let deadline = Date().addingTimeInterval(2)
        while snapshot().revision != core.snapshot().revision, Date() < deadline {
            try? await Task.sleep(nanoseconds: 1_000_000)
        }
        XCTAssertEqual(snapshot().revision, core.snapshot().revision, "model never caught up", file: file, line: line)
    }
}
#endif
