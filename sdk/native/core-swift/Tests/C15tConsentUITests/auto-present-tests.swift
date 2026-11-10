import C15tCore
import Foundation
import XCTest
@testable import C15tConsentUI

/// Auto-present: what opens by itself, when, and never twice at once.
@MainActor
final class AutoPresentTests: XCTestCase {
    func testOwedChoicePresentsOnceReady() async throws {
        let (core, _) = try await boot("category-init.json")
        let presenter = ConsentPresenter(core: core)
        XCTAssertNotNil(presenter.presentationID)
        XCTAssertFalse(presenter.preferences)
    }

    func testOptOutLeavesAChoiceClosedUntilAsked() async throws {
        let (core, _) = try await boot("category-init.json")
        let presenter = ConsentPresenter(core: core, autoPresent: false)
        XCTAssertNil(presenter.presentationID)
        presenter.presentPrompt()
        XCTAssertNotNil(presenter.presentationID)
    }

    func testOptOutAlsoHoldsBackAnOwedNotice() async throws {
        let (core, _) = try await boot("notice-init.json")
        let automatic = ConsentPresenter(core: core)
        XCTAssertTrue(automatic.noticeVisible)
        let manual = ConsentPresenter(core: core, autoPresent: false)
        XCTAssertFalse(manual.noticeVisible)
        manual.presentPrompt()
        XCTAssertTrue(manual.noticeVisible)
        XCTAssertNil(manual.presentationID)
    }

    func testValidStoredChoiceStaysQuiet() async throws {
        let (core, _) = try await boot("category-init.json")
        XCTAssertEqual(core.save(.all).status, .committed)
        let presenter = ConsentPresenter(core: core)
        XCTAssertNil(presenter.presentationID)
        XCTAssertFalse(presenter.noticeVisible)
    }

    func testPolicyChangePromptsAgainAfterAnAnswer() async throws {
        let (core, peer) = try await boot("category-init.json")
        let presenter = ConsentPresenter(core: core)
        presenter.commit(.accept)
        await until { !presenter.pending }
        XCTAssertNil(presenter.presentationID)

        peer.replace(String(repeating: "a", count: 64), with: String(repeating: "d", count: 64))
        core.refresh()
        await core.waitUntilIdle()
        XCTAssertEqual(core.snapshot().promptRequirement.reason, .policyChanged)
        await until { presenter.presentationID != nil }
        XCTAssertNotNil(presenter.presentationID)
    }

    func testDismissedPromptIsNotPresentedAgainForTheSameRequirement() async throws {
        let (core, _) = try await boot("category-init.json")
        let presenter = ConsentPresenter(core: core)
        presenter.requestClose()
        XCTAssertNil(presenter.presentationID)
        presenter.autoPresent = false
        presenter.autoPresent = true
        XCTAssertNil(presenter.presentationID)
        XCTAssertNil(core.snapshot().explicitChoice)
    }

    func testSharedPromptWaitsForASceneThenOpensOnce() async throws {
        let (core, _) = try await boot("category-init.json")
        let prompt = ConsentPrompt.shared(for: core)
        XCTAssertTrue(prompt === ConsentPrompt.shared(for: core))
        XCTAssertNil(prompt.presenter.presentationID, "nothing opens before a scene attaches")

        let first = UUID(), second = UUID()
        prompt.attach(first, active: true, autoPresent: true)
        prompt.attach(second, active: true, autoPresent: true)
        XCTAssertEqual(prompt.host, first)
        let session = try XCTUnwrap(prompt.presenter.presentationID)

        // A manual call racing auto-present keeps the open session.
        prompt.presentPrompt()
        prompt.presentPreferences()
        XCTAssertEqual(prompt.presenter.presentationID, session)

        // The drawing scene leaves the foreground: an active scene takes over the same session.
        prompt.attach(first, active: false, autoPresent: true)
        prompt.attach(second, active: true, autoPresent: true)
        XCTAssertEqual(prompt.host, second)
        XCTAssertEqual(prompt.presenter.presentationID, session)

        // The scene disconnects and reconnects: the session and its draft are still there.
        prompt.detach(second)
        XCTAssertNil(prompt.host)
        let reconnected = UUID()
        prompt.attach(reconnected, active: true, autoPresent: true)
        XCTAssertEqual(prompt.presenter.presentationID, session)
    }

    func testSharedPromptOptOutAndOutcomeHook() async throws {
        let (core, _) = try await boot("category-init.json")
        let prompt = ConsentPrompt.shared(for: core)
        var outcomes: [ConsentPresenterOutcome] = []
        prompt.onFinished = { outcomes.append($0) }
        prompt.attach(UUID(), active: true, autoPresent: false)
        XCTAssertNil(prompt.presenter.presentationID)
        prompt.presentPrompt()
        XCTAssertNotNil(prompt.presenter.presentationID)
        prompt.presenter.requestClose()
        XCTAssertEqual(outcomes, [.dismissed])
    }

    func testWaitsUntilTheCoreIsReady() async throws {
        let (config, _) = try fixtureConfig("category-init.json")
        let core = ConsentCore()
        let presenter = ConsentPresenter(core: core)
        XCTAssertNil(presenter.presentationID)
        core.bootstrap(config)
        await core.waitUntilIdle()
        await until { presenter.presentationID != nil }
    }

    func testTurningAutoPresentOnPresentsAnAlreadyOwedPrompt() async throws {
        let (core, _) = try await boot("category-init.json")
        let presenter = ConsentPresenter(core: core, autoPresent: false)
        XCTAssertNil(presenter.presentationID)
        presenter.autoPresent = true
        XCTAssertNotNil(presenter.presentationID)
    }

    func testAManualNoticeRequestEndsWithItsNotice() async throws {
        let (core, _) = try await boot("notice-init.json")
        let presenter = ConsentPresenter(core: core, autoPresent: false)
        presenter.presentPrompt()
        XCTAssertTrue(presenter.noticeVisible)
        // The notice is cleared outside this presenter, then owed again.
        XCTAssertTrue(core.dismissNotice())
        await until { !presenter.noticeVisible }
        core.reset()
        await core.waitUntilIdle()
        XCTAssertEqual(core.snapshot().promptRequirement.kind, .notice)
        await until { presenter.snapshot.revision == core.snapshot().revision }
        XCTAssertFalse(presenter.noticeVisible, "the opt-out shows nothing the app did not ask for")
        presenter.presentPrompt()
        XCTAssertTrue(presenter.noticeVisible)
    }

    func testTheSameOwedPromptPresentsAgainAfterNothingWasOwed() async throws {
        let (core, _) = try await boot("category-init.json")
        let presenter = ConsentPresenter(core: core)
        let first = try XCTUnwrap(presenter.presentationID)
        presenter.requestClose()
        XCTAssertNil(presenter.presentationID, "a dismissed prompt stays closed")
        XCTAssertEqual(core.save(.all).status, .committed)
        core.reset()
        await core.waitUntilIdle()
        XCTAssertEqual(core.snapshot().promptRequirement.kind, .choice)
        await until { presenter.presentationID != nil }
        XCTAssertNotEqual(presenter.presentationID, first)
    }

    func testAnExpiredChoicePromptsAgain() async throws {
        let clock = TestClock(1_770_000_000_000)
        let (config, _) = try fixtureConfig("category-init.json", now: clock.read)
        let core = ConsentCore()
        core.bootstrap(config)
        await core.waitUntilIdle()
        XCTAssertEqual(core.save(.all).status, .committed)
        let presenter = ConsentPresenter(core: core)
        XCTAssertNil(presenter.presentationID)
        clock.advance(31_536_000_001)
        core.refresh()
        await core.waitUntilIdle()
        XCTAssertEqual(core.snapshot().promptRequirement.reason, .expired)
        await until { presenter.presentationID != nil }
    }

    private final class TestClock: @unchecked Sendable {
        private let lock = NSLock()
        private var value: Int64
        init(_ value: Int64) { self.value = value }
        func read() -> Int64 { lock.withLock { value } }
        func advance(_ delta: Int64) { lock.withLock { value += delta } }
    }

    private func until(_ condition: @MainActor () -> Bool) async {
        for _ in 0..<500 {
            if condition() { return }
            try? await Task.sleep(for: .milliseconds(10))
        }
        XCTFail("Condition was not met")
    }

    private func fixtureConfig(_ fixture: String, now: (@Sendable () -> Int64)? = nil) throws -> (CoreConfig, Peer) {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        let body = try String(contentsOf: root.appendingPathComponent("examples/consent-demo/fixtures/\(fixture)"), encoding: .utf8)
        let peer = Peer(body)
        let transport = HostedTransport(baseURL: URL(string: "https://fixture.invalid")!, client: peer)
        if let now {
            return (CoreConfig(store: InMemoryStore(), transport: transport, now: now, initRetry: .disabled), peer)
        }
        return (CoreConfig(store: InMemoryStore(), transport: transport, initRetry: .disabled), peer)
    }

    private func boot(_ fixture: String) async throws -> (ConsentCore, Peer) {
        let (config, peer) = try fixtureConfig(fixture)
        let core = ConsentCore()
        core.bootstrap(config)
        await core.waitUntilIdle()
        return (core, peer)
    }

    /// Serves one `/init` body that a test can change between refreshes.
    final class Peer: HTTPTransport, @unchecked Sendable {
        private let lock = NSLock()
        private var body: String
        init(_ body: String) { self.body = body }
        func replace(_ old: String, with new: String) {
            lock.withLock { body = body.replacingOccurrences(of: old, with: new) }
        }
        func send(_ request: HTTPRequest) async throws -> HTTPResponse {
            guard request.method == .get else { return HTTPResponse(status: 503) }
            let current = lock.withLock { body }
            return HTTPResponse(status: 200, headers: ["x-c15t-policy-contract": "1"], body: Data(current.utf8))
        }
    }
}
