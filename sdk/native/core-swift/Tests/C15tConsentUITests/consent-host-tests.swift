@_spi(C15tInternal) import C15tCore
import Foundation
import XCTest
@testable import C15tConsentUI

/// Auto-present for a runtime that draws the prompt through ``ConsentHostDriver``, such as React
/// Native.
///
/// The native ``ConsentPrompt`` decides when a prompt is owed; JavaScript only hands over its
/// settings and hears what is on screen. These are the cases the React Native ledger used to
/// cover, asserted against the native driver: what opens by itself, when, never twice, and never
/// for an app that opted out. Each rule here has a test that fails without it. Mirrors
/// `ConsentHostAutoPresentTest` in the Kotlin SDK.
@MainActor
final class ConsentHostTests: XCTestCase {
    /// A window that can be there or not.
    final class Canvas: ConsentHostCanvas {
        var available = true
        private(set) var shown: ConsentPresenter?
        func show(_ presenter: ConsentPresenter, privacyPolicyURL: URL) throws {
            guard available else { throw NoWindow() }
            shown = presenter
        }
        func hide() { shown = nil }
        struct NoWindow: Error {}
    }

    /// What the driver told the runtime, in order.
    final class Events {
        var log: [String] = []
        var presented: [(id: String, shows: ConsentHostDriver.Shows, automatic: Bool)] = []
        var outcomes: [(id: String, ending: ConsentHostDriver.Ending)] = []
        var unavailable = 0
        /// Sessions reported on screen whose outcome has not arrived.
        var open: [String] {
            let closed = Set(outcomes.map(\.id))
            return presented.map(\.id).filter { !closed.contains($0) }
        }
    }

    private let url = "https://app.test/privacy"

    private func driver() -> (ConsentHostDriver, Events, Canvas) {
        let canvas = Canvas()
        let driver = ConsentHostDriver(canvas: canvas)
        let events = Events()
        driver.onPresented = { id, shows, automatic in
            events.log.append("presented:\(id)")
            events.presented.append((id, shows, automatic))
        }
        driver.onUnavailable = { _ in
            events.log.append("unavailable")
            events.unavailable += 1
        }
        driver.onOutcome = { id, ending, _ in
            events.log.append("outcome:\(id)")
            events.outcomes.append((id, ending))
        }
        return (driver, events, canvas)
    }

    func testAnOwedPromptPresentsByItselfOnce() async throws {
        let (core, _) = try await boot("category-init.json")
        let (driver, events, canvas) = driver()
        // Strict mode mounts, unmounts and mounts again: on, off, on.
        try driver.configure(core: core, autoPresent: true, privacyPolicyURL: url)
        try driver.configure(core: core, autoPresent: false, privacyPolicyURL: url)
        try driver.configure(core: core, autoPresent: true, privacyPolicyURL: url)
        XCTAssertEqual(events.presented.count, 1)
        XCTAssertEqual(events.presented.first?.shows, .prompt)
        XCTAssertEqual(events.presented.first?.automatic, true)
        XCTAssertNotNil(canvas.shown)
    }

    func testAValidStoredChoiceStaysQuiet() async throws {
        let (core, _) = try await boot("category-init.json")
        XCTAssertEqual(core.save(.all).status, .committed)
        let (driver, events, canvas) = driver()
        try driver.configure(core: core, autoPresent: true, privacyPolicyURL: url)
        XCTAssertEqual(events.log, [])
        XCTAssertNil(canvas.shown)
    }

    func testADismissedPromptIsNotPresentedAgainForTheSameRequirement() async throws {
        let (core, _) = try await boot("category-init.json")
        let (driver, events, canvas) = driver()
        try driver.configure(core: core, autoPresent: true, privacyPolicyURL: url)
        driver.close(sessionID: try XCTUnwrap(events.presented.first?.id))
        XCTAssertEqual(events.outcomes.map(\.ending), [.dismissed])
        XCTAssertNil(canvas.shown)

        try driver.configure(core: core, autoPresent: false, privacyPolicyURL: url)
        try driver.configure(core: core, autoPresent: true, privacyPolicyURL: url)
        driver.retry()
        XCTAssertEqual(events.presented.count, 1, "a dismissed prompt stays closed")
        XCTAssertNil(core.snapshot().explicitChoice)
    }

    func testTheSameOwedPromptPresentsAgainAfterNothingWasOwed() async throws {
        let (core, _) = try await boot("category-init.json")
        let (driver, events, _) = driver()
        try driver.configure(core: core, autoPresent: true, privacyPolicyURL: url)
        ConsentPrompt.shared(for: core).presenter.commit(.accept)
        await until { events.outcomes.count == 1 }
        XCTAssertEqual(events.outcomes.map(\.ending), [.committed])

        core.reset()
        await core.waitUntilIdle()
        await until { events.presented.count == 2 }
        XCTAssertEqual(Set(events.presented.map(\.id)).count, 2, "a new session")
    }

    func testAnAppThatOptedOutSeesNothingUntilItAsks() async throws {
        let (core, _) = try await boot("category-init.json")
        let (driver, events, _) = driver()
        try driver.configure(core: core, autoPresent: false, privacyPolicyURL: url)
        driver.retry()
        XCTAssertEqual(events.log, [])

        let answer = try driver.present(core: core, preferences: false, privacyPolicyURL: url)
        guard case .presented = answer else { return XCTFail("expected a new session, got \(answer)") }
        XCTAssertEqual(events.presented.map(\.automatic), [false], "the app asked for it")
    }

    /// Dismissing is a fact about the person, not the setting: it holds once auto-present turns on.
    func testAPromptTheAppOpenedAndThePersonDismissedStaysClosedWhenAutoPresentTurnsOn() async throws {
        let (core, _) = try await boot("category-init.json")
        let (driver, events, _) = driver()
        try driver.configure(core: core, autoPresent: false, privacyPolicyURL: url)
        guard case let .presented(id, _) = try driver.present(core: core, preferences: false, privacyPolicyURL: url) else {
            return XCTFail("expected a new session")
        }
        driver.close(sessionID: id)
        try driver.configure(core: core, autoPresent: true, privacyPolicyURL: url)
        XCTAssertEqual(events.presented.count, 1, "only the session the app opened")
    }

    func testTurningAutoPresentOnPresentsAnAlreadyOwedPrompt() async throws {
        let (core, _) = try await boot("category-init.json")
        let (driver, events, _) = driver()
        try driver.configure(core: core, autoPresent: false, privacyPolicyURL: url)
        XCTAssertTrue(events.presented.isEmpty)
        try driver.configure(core: core, autoPresent: true, privacyPolicyURL: url)
        XCTAssertEqual(events.presented.count, 1)
    }

    /// No window yet, or the app in the background: the prompt waits for one, and is not lost.
    func testAnOwedPromptWithNoWindowShowsOnceOneIsActive() async throws {
        let (core, _) = try await boot("category-init.json")
        let (driver, events, canvas) = driver()
        canvas.available = false
        try driver.configure(core: core, autoPresent: true, privacyPolicyURL: url)
        try driver.configure(core: core, autoPresent: true, privacyPolicyURL: url)
        XCTAssertEqual(events.log, ["unavailable"], "reported once")

        canvas.available = true
        driver.retry()
        XCTAssertEqual(events.presented.count, 1)
        XCTAssertEqual(events.log.count, 2)
    }

    /// It opened by itself while no window could show it, then the app opted out: it never shows.
    func testOptingOutWithdrawsAPromptThatNeverShowed() async throws {
        let (core, _) = try await boot("category-init.json")
        let (driver, events, canvas) = driver()
        canvas.available = false
        try driver.configure(core: core, autoPresent: true, privacyPolicyURL: url)
        try driver.configure(core: core, autoPresent: false, privacyPolicyURL: url)
        canvas.available = true
        driver.retry()
        XCTAssertTrue(events.presented.isEmpty)
        XCTAssertNil(ConsentPrompt.shared(for: core).presenter.presentationID)
        XCTAssertNil(core.snapshot().explicitChoice, "withdrawn, not dismissed: still owed")

        try driver.configure(core: core, autoPresent: true, privacyPolicyURL: url)
        XCTAssertEqual(events.presented.count, 1, "still owed for a host that presents")
    }

    /// Settings close while a prompt is owed: the prompt opens, and it is reported before the
    /// settings' outcome, so a step waiting for c15t's screens to close never runs in between.
    func testAPromptThatOpensAsSettingsCloseIsReportedBeforeTheirOutcome() async throws {
        let (core, _) = try await boot("category-init.json")
        XCTAssertEqual(core.save(.all).status, .committed)
        let (driver, events, _) = driver()
        try driver.configure(core: core, autoPresent: true, privacyPolicyURL: url)
        guard case let .presented(settings, .preferences) = try driver.present(core: core, preferences: true, privacyPolicyURL: url) else {
            return XCTFail("expected settings")
        }
        core.reset()
        await core.waitUntilIdle()
        await settle()
        XCTAssertEqual(events.open, [settings], "settings stay up")

        driver.close(sessionID: settings)
        let prompt = try XCTUnwrap(events.presented.last)
        XCTAssertEqual(prompt.shows, .prompt)
        XCTAssertEqual(events.log, ["presented:\(settings)", "presented:\(prompt.id)", "outcome:\(settings)"])
    }

    /// The scene is inactive when settings close, so the prompt that follows cannot show yet. The
    /// settings' outcome waits for it, and goes after it once the scene is active again.
    func testOnAnInactiveSceneThePromptThatFollowsIsReportedBeforeTheOutcome() async throws {
        let (core, driver, events, canvas, settings) = try await settingsWithAPromptOwedBehind()
        canvas.available = false
        driver.close(sessionID: settings)
        XCTAssertEqual(events.log, ["presented:\(settings)"], "held until the prompt that follows is on screen")

        canvas.available = true
        driver.retry()
        let prompt = try XCTUnwrap(events.presented.last)
        XCTAssertEqual(prompt.shows, .prompt)
        XCTAssertEqual(events.log, ["presented:\(settings)", "presented:\(prompt.id)", "outcome:\(settings)"])
        XCTAssertNil(core.snapshot().explicitChoice)
    }

    /// The app goes to the background and no window comes back: the outcome is not held forever.
    func testAHeldOutcomeIsSentWhenNoWindowComesBack() async throws {
        let (_, driver, events, canvas, settings) = try await settingsWithAPromptOwedBehind()
        driver.replacementWait = .milliseconds(30)
        canvas.available = false
        driver.close(sessionID: settings)
        await until { !events.outcomes.isEmpty }
        XCTAssertEqual(events.log, ["presented:\(settings)", "outcome:\(settings)", "unavailable"])

        canvas.available = true
        driver.retry()
        XCTAssertEqual(events.presented.count, 2, "the owed prompt still shows on return")
    }

    /// No prompt will follow once the app opts out, so the outcome goes at once.
    func testAHeldOutcomeIsSentWhenTheAppOptsOut() async throws {
        let (core, driver, events, canvas, settings) = try await settingsWithAPromptOwedBehind()
        canvas.available = false
        driver.close(sessionID: settings)
        try driver.configure(core: core, autoPresent: false, privacyPolicyURL: url)
        XCTAssertEqual(events.log, ["presented:\(settings)", "outcome:\(settings)"])
        canvas.available = true
        driver.retry()
        XCTAssertEqual(events.presented.count, 1)
    }

    /// Settings the app opened, with a prompt owed behind them.
    private func settingsWithAPromptOwedBehind() async throws
        -> (ConsentCore, ConsentHostDriver, Events, Canvas, String) {
        let (core, _) = try await boot("category-init.json")
        XCTAssertEqual(core.save(.all).status, .committed)
        let (driver, events, canvas) = driver()
        try driver.configure(core: core, autoPresent: true, privacyPolicyURL: url)
        guard case let .presented(settings, .preferences) = try driver.present(core: core, preferences: true, privacyPolicyURL: url) else {
            throw XCTSkip("expected settings")
        }
        core.reset()
        await core.waitUntilIdle()
        await settle()
        XCTAssertEqual(events.log, ["presented:\(settings)"])
        return (core, driver, events, canvas, settings)
    }

    /// iOS shows no system alert over a cover that is still leaving, so the outcome waits for it.
    func testTheOutcomeWaitsForTheCoverToLeave() async throws {
        let (core, _) = try await boot("category-init.json")
        let (driver, events, canvas) = driver()
        try driver.configure(core: core, autoPresent: true, privacyPolicyURL: url)
        let presenter = ConsentPrompt.shared(for: core).presenter
        presenter.coverAppeared()
        driver.close(sessionID: try XCTUnwrap(events.presented.first?.id))
        XCTAssertTrue(events.outcomes.isEmpty)
        XCTAssertNotNil(canvas.shown, "still on screen while it animates away")

        presenter.coverDismissed()
        XCTAssertEqual(events.outcomes.map(\.ending), [.dismissed])
        XCTAssertNil(canvas.shown)
    }

    /// React Native reloads while the prompt is up: the old overlay goes, and the new runtime's
    /// driver shows the same session and reports it.
    func testANewRuntimeTakesOverTheSessionOnScreen() async throws {
        let (core, _) = try await boot("category-init.json")
        // An installed core keeps its prompt between runtimes; this one is not installed.
        let prompt = ConsentPrompt.shared(for: core)
        defer { withExtendedLifetime(prompt) {} }
        let (old, events, oldCanvas) = driver()
        try old.configure(core: core, autoPresent: true, privacyPolicyURL: url)
        let open = try XCTUnwrap(events.presented.first?.id)
        old.detach()
        XCTAssertNil(oldCanvas.shown, "the old runtime's overlay is gone")

        let (reloaded, heard, canvas) = driver()
        try reloaded.configure(core: core, autoPresent: true, privacyPolicyURL: url)
        XCTAssertEqual(heard.open, [open])
        XCTAssertNotNil(canvas.shown)
        reloaded.close(sessionID: open)
        XCTAssertEqual(heard.outcomes.map(\.ending), [.dismissed])
        XCTAssertTrue(events.outcomes.isEmpty, "the old runtime hears nothing more")
    }

    func testAnOwedPromptIsNotLostAcrossUninstall() async throws {
        C15t.resetForTests()
        defer { C15t.resetForTests() }
        let (config, _) = try fixtureConfig("category-init.json")
        let first = C15t.bootstrap(config)
        await first.waitUntilIdle()
        let (driver, events, _) = driver()
        try driver.configure(core: first, autoPresent: true, privacyPolicyURL: url)
        XCTAssertEqual(events.presented.count, 1)

        C15t.resetForTests()
        await until { events.outcomes.count == 1 }
        XCTAssertEqual(events.outcomes.map(\.ending), [.unavailable], "the session of the dropped core ends")
        let second = C15t.bootstrap(config)
        await second.waitUntilIdle()
        // The binding follows the installed core on its next call.
        driver.follow(second)
        XCTAssertEqual(events.presented.count, 2)
        XCTAssertEqual(events.open, events.presented.dropFirst().map(\.id))
    }

    /// Over random sequences, with auto-present on and a window to show on: native shows something
    /// exactly when the driver reports one session open, and nothing opens by itself after the app
    /// opted out. With the presenter's own property (``AutoPresentTests``) that is the invariant:
    /// an owed prompt is never left unshown.
    func testWhatIsReportedOpenIsWhatNativeShowsOverRandomSequences() async throws {
        for fixture in ["category-init.json", "notice-init.json"] {
            for seed in 1...20 { try await sequence(seed: UInt64(seed), fixture: fixture) }
        }
    }

    private func sequence(seed: UInt64, fixture: String) async throws {
        var random = SeededRandom(seed: seed)
        let (core, _) = try await boot(fixture)
        let (driver, events, canvas) = driver()
        var offAt: Int?
        try driver.configure(core: core, autoPresent: true, privacyPolicyURL: url)
        let presenter = ConsentPrompt.shared(for: core).presenter
        var trace: [String] = []
        let actions = ["reset", "accept", "acknowledge", "close", "preferences", "prompt", "off", "on", "window", "dismiss-notice"]
        for _ in 0..<30 {
            let action = actions[Int(random.next() % UInt64(actions.count))]
            trace.append(action)
            switch action {
            case "reset": core.reset()
            case "accept" where presenter.presentationID != nil && !presenter.pending:
                presenter.commit(.accept)
                await until { !presenter.pending }
            case "acknowledge" where presenter.noticeVisible && !presenter.pending:
                presenter.commit(.acknowledge)
                await until { !presenter.pending }
            case "close": if let id = events.open.first { driver.close(sessionID: id) }
            case "preferences": _ = try driver.present(core: core, preferences: true, privacyPolicyURL: url)
            case "prompt": _ = try driver.present(core: core, preferences: false, privacyPolicyURL: url)
            case "off", "on":
                if action == "off" { offAt = offAt ?? events.presented.count } else { offAt = nil }
                try driver.configure(core: core, autoPresent: action == "on", privacyPolicyURL: url)
            case "window":
                canvas.available = false
                driver.retry()
                canvas.available = true
                driver.retry()
            case "dismiss-notice": _ = core.dismissNotice()
            default: break
            }
            await core.waitUntilIdle()
            await settle()
            let shows = presenter.presentationID != nil || presenter.noticeVisible
            let context = "seed \(seed) (\(fixture)) after \(trace): \(events.log)"
            XCTAssertLessThanOrEqual(events.open.count, 1, "\(context): more than one session open")
            XCTAssertEqual(events.open.count == 1, shows, "\(context): native shows \(shows ? "something" : "nothing")")
            if let offAt {
                XCTAssertFalse(events.presented.dropFirst(offAt).contains { $0.automatic }, "\(context): opened by itself after opting out")
            }
        }
        if presenter.presentationID != nil, !presenter.pending { presenter.discard() }
        driver.detach()
    }

    /// Let main-actor work the core's change callbacks queued run.
    private func settle() async {
        for _ in 0..<5 { await Task.yield() }
        try? await Task.sleep(for: .milliseconds(5))
    }

    private func until(_ condition: @MainActor () -> Bool) async {
        for _ in 0..<500 {
            if condition() { return }
            try? await Task.sleep(for: .milliseconds(10))
        }
        XCTFail("Condition was not met")
    }

    private func fixtureConfig(_ fixture: String) throws -> (CoreConfig, AutoPresentTests.Peer) {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        let body = try String(contentsOf: root.appendingPathComponent("examples/consent-demo/fixtures/\(fixture)"), encoding: .utf8)
        let peer = AutoPresentTests.Peer(body)
        let transport = HostedTransport(baseURL: URL(string: "https://fixture.invalid")!, client: peer)
        return (CoreConfig(store: InMemoryStore(), transport: transport, initRetry: .disabled), peer)
    }

    private func boot(_ fixture: String) async throws -> (ConsentCore, AutoPresentTests.Peer) {
        let (config, peer) = try fixtureConfig(fixture)
        let core = ConsentCore()
        core.bootstrap(config)
        await core.waitUntilIdle()
        return (core, peer)
    }

    private typealias SeededRandom = AutoPresentTests.SeededRandom
}
