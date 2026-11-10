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

    /// Dismissing is a fact about the person, not about the setting: it holds once auto-present is on.
    func testAPromptDismissedWhileAutoPresentWasOffStaysClosedWhenItTurnsOn() async throws {
        let (core, _) = try await boot("category-init.json")
        let presenter = ConsentPresenter(core: core, autoPresent: false)
        presenter.presentPrompt()
        XCTAssertNotNil(presenter.presentationID)
        presenter.requestClose()
        presenter.autoPresent = true
        XCTAssertNil(presenter.presentationID)
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

    /// With no scene attached nothing presents by itself, so a scene that opted out finds nothing open.
    func testNothingPresentsWhileNoSceneIsAttached() async throws {
        let (core, _) = try await boot("category-init.json")
        XCTAssertEqual(core.save(.all).status, .committed)
        let prompt = ConsentPrompt.shared(for: core)
        let automatic = UUID()
        prompt.attach(automatic, active: true, autoPresent: true)
        prompt.detach(automatic)

        core.reset()
        await core.waitUntilIdle()
        XCTAssertEqual(core.snapshot().promptRequirement.kind, .choice)
        XCTAssertNil(prompt.presenter.presentationID, "nothing presents without a scene")

        prompt.attach(UUID(), active: true, autoPresent: false)
        XCTAssertNil(prompt.presenter.presentationID, "the opted-out scene finds nothing open")
    }

    /// The installed core keeps its prompt between scenes; a core the runtime dropped is released
    /// with it, because the registry cannot keep a core alive.
    func testAnUninstalledCoreIsReleasedWithItsPrompt() async throws {
        C15t.resetForTests()
        defer { C15t.resetForTests() }
        weak var core: ConsentCore?
        weak var prompt: ConsentPrompt?
        do {
            let (installed, _) = try await boot("category-init.json")
            XCTAssertTrue(C15t.install(installed))
            let shared = ConsentPrompt.shared(for: installed)
            let scene = UUID()
            shared.attach(scene, active: true, autoPresent: true)
            XCTAssertNotNil(shared.presenter.presentationID)
            shared.detach(scene)
            core = installed
            prompt = shared
        }
        await Task.yield()
        XCTAssertNotNil(prompt, "the installed core keeps its prompt, and the dismissal in it, between scenes")

        C15t.resetForTests()
        for _ in 0..<50 where core != nil { try? await Task.sleep(for: .milliseconds(10)) }
        XCTAssertNil(core, "a dropped core is released")
        XCTAssertNil(prompt, "and so is its prompt")
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

    /// A UIKit root hit-tests the notice card against this region. Once the notice is acknowledged,
    /// or another scene draws the prompt, the old card bounds must take no touches.
    func testTheNoticeTouchRegionEmptiesWhenTheNoticeIsGone() async throws {
        let (core, _) = try await boot("notice-init.json")
        let prompt = ConsentPrompt.shared(for: core)
        let region = NoticeTouchRegion(hostID: UUID())
        region.prompt = prompt
        region.frame = CGRect(x: 0, y: 600, width: 400, height: 200)
        let inside = CGPoint(x: 200, y: 700)
        XCTAssertFalse(region.contains(inside), "nothing is drawn before the scene attaches")

        prompt.attach(region.hostID, active: true, autoPresent: true)
        XCTAssertTrue(prompt.presenter.noticeVisible)
        XCTAssertTrue(region.contains(inside))
        XCTAssertFalse(region.contains(CGPoint(x: 200, y: 100)), "outside the card reaches the app")

        // Another scene takes over drawing the prompt.
        prompt.attach(region.hostID, active: false, autoPresent: true)
        let other = UUID()
        prompt.attach(other, active: true, autoPresent: true)
        XCTAssertFalse(region.contains(inside))
        prompt.detach(other)
        prompt.attach(region.hostID, active: true, autoPresent: true)
        XCTAssertTrue(region.contains(inside))

        prompt.presenter.commit(.acknowledge)
        await until { !prompt.presenter.pending }
        XCTAssertFalse(prompt.presenter.noticeVisible)
        XCTAssertFalse(region.contains(inside), "the acknowledged card's bounds take no touches")
    }

    /// Random sequences of what the app, the person and the core can do, through the shared
    /// prompt a scene attaches to. After every step: (a) an owed choice with auto-present on and
    /// nothing open is the one the person dismissed, and an owed notice is visible; (c) with
    /// auto-present off, a visible notice is one the app asked for in this episode; and the UIKit
    /// touch region takes touches only while the notice shows.
    /// (d) auto-present is the setting of the scene drawing the prompt, and off with none; (e) a scene
    /// with `autoPresent: false` draws only a session the app asked for, or one that opened by itself
    /// while that scene drew the prompt with auto-present on; (f) nothing opens by itself for an owed
    /// prompt the person dismissed, whatever the setting was when they dismissed it. Scenes attach and
    /// detach with either setting, several at once, and move between foreground and background.
    func testOwedPromptsAndNoticesOverRandomSequences() async throws {
        for fixture in ["category-init.json", "notice-init.json"] {
            for seed in 1...40 { try await runSequence(seed: UInt64(seed), fixture: fixture) }
        }
    }

    private func runSequence(seed: UInt64, fixture: String) async throws {
        var random = SeededRandom(seed: seed)
        let (core, peer) = try await boot(fixture)
        // App Tracking Transparency rides along: enabled or not, with or without the EU sheet,
        // and Apple's answer held back and delivered at arbitrary points.
        let apple = TrackingSequenceTests.Apple()
        apple.promptString = seed % 3 != 0
        apple.additionalInformation = seed % 4 == 0
        let prompt = ConsentPrompt(core: core, tracking: apple.controller, isActive: { apple.active },
                                   becameActive: apple.activations.eraseToAnyPublisher())
        let presenter = prompt.presenter
        var trackingFailures: [String] = []
        /// The app called `ConsentPrompt.presentPrompt()`; the session it opens, maybe later, is the app's.
        var appAsked = false
        apple.onAsk = {
            // ATT invariants, at the moment Apple is asked.
            if presenter.presentationID != nil || presenter.noticeVisible || presenter.covering {
                trackingFailures.append("asked while a c15t screen is up")
            }
            if prompt.trackingRequest == .manual { trackingFailures.append("asked in manual") }
            let s = core.snapshot()
            if s.explicitChoice?.categories[.marketing]?.value == false {
                trackingFailures.append("asked after marketing was refused")
            }
            if prompt.trackingRequest == .afterConsent, ConsentDecision(snapshot: s, category: .marketing) != .granted {
                trackingFailures.append("asked after consent without marketing granted")
            }
            if !apple.additionalInformation, apple.asks > 1 { trackingFailures.append("asked twice in one launch") }
            if !apple.promptString { trackingFailures.append("asked without the prompt string") }
        }
        /// One attached scene, with the UIKit touch region a root view controller would give it.
        @MainActor final class Scene {
            let region = NoticeTouchRegion(hostID: UUID())
            var autoPresent: Bool
            var active: Bool
            var tracking: ConsentTrackingRequest
            init(_ prompt: ConsentPrompt, autoPresent: Bool, active: Bool,
                 tracking: ConsentTrackingRequest = .afterConsent) {
                self.autoPresent = autoPresent
                self.active = active
                self.tracking = tracking
                region.prompt = prompt
                region.frame = CGRect(x: 0, y: 600, width: 400, height: 200)
            }
        }
        let modes = ConsentTrackingRequest.allCases
        var scenes = [Scene(prompt, autoPresent: true, active: true, tracking: modes[Int(seed % 3)])]
        // Every scene claims again when the drawing scene or its state changes, as the SwiftUI host does.
        func reclaim() {
            for _ in 0..<3 {
                for scene in scenes {
                    prompt.attach(scene.region.hostID, active: scene.active, autoPresent: scene.autoPresent,
                                  trackingRequest: scene.tracking)
                }
            }
        }
        reclaim()
        /// Who asked for the open session: the app, the scene it opened for, or nobody.
        enum Opener: Equatable { case app, scene(UUID), nobody }
        // The first scene auto-presents an owed prompt as it attaches, before the first step.
        var opener = presenter.presentationID == nil ? Opener.nobody : .scene(scenes[0].region.hostID)
        var dismissed: String?
        var requested: String?
        var trace: [String] = []
        var policies = 0
        var fingerprint = String(repeating: "a", count: 64)
        func key() -> String {
            let s = core.snapshot()
            return "\(s.resolution.fingerprint ?? ""):\(s.promptRequirement.kind.rawValue):\(s.promptRequirement.reason?.rawValue ?? ""):\(s.promptOwedSince.map { String($0) } ?? "")"
        }
        func synced() async {
            await core.waitUntilIdle()
            await until { presenter.snapshot.revision == core.snapshot().revision && !presenter.pending }
        }
        let actions = ["saved", "reset", "policy", "preferences", "manual", "discard", "customize", "accept", "save",
                       "toggle", "dismiss-notice", "acknowledge", "attach", "detach", "background",
                       "reject", "att-mode", "app-state", "apple-hold", "apple-answer", "app-prompt"]
        for _ in 0..<40 {
            let action = actions[Int(random.next() % UInt64(actions.count))]
            trace.append(action)
            let before = presenter.presentationID
            switch action {
            case "saved": _ = core.save(.all)
            case "reset": core.reset()
            case "policy":
                policies += 1
                let next = String(format: "%064d", policies)
                peer.replace(fingerprint, with: next)
                fingerprint = next
                core.refresh()
            case "preferences": presenter.presentPreferences()
            case "manual":
                let s = core.snapshot()
                if presenter.presentationID == nil, !presenter.pending, s.promptRequirement.kind == .notice { requested = key() }
                presenter.presentPrompt()
            case "discard":
                if presenter.presentationID != nil, !presenter.pending {
                    let closes = !(presenter.preferences && presenter.returnsToFirstLayer)
                    let promptOpen = !presenter.preferences || presenter.returnsToFirstLayer
                    if closes, promptOpen { dismissed = key() }
                    presenter.discard()
                }
            case "customize": if presenter.presentationID != nil, !presenter.preferences { presenter.customize() }
            case "accept": if presenter.presentationID != nil { presenter.commit(.accept) }
            case "save":
                if presenter.presentationID != nil {
                    presenter.setCategory(.measurement, random.next() % 2 == 0)
                    presenter.commit(.save)
                }
            case "dismiss-notice": _ = core.dismissNotice()
            case "reject": if presenter.presentationID != nil { presenter.commit(.reject) }
            case "att-mode":
                if !scenes.isEmpty {
                    let index = Int(random.next() % UInt64(scenes.count))
                    scenes[index].tracking = modes[Int(random.next() % UInt64(modes.count))]
                    trace.append("scene \(index) tracking=\(scenes[index].tracking)")
                    reclaim()
                }
            case "app-state":
                apple.active.toggle()
                if apple.active { apple.activations.send() }
            case "apple-hold": apple.hold.toggle()
            case "apple-answer": apple.reply()
            case "app-prompt":
                // The public call, which beforeConsent holds until Apple has been asked.
                appAsked = true
                let s = core.snapshot()
                if presenter.presentationID == nil, !presenter.pending, s.promptRequirement.kind == .notice { requested = key() }
                prompt.presentPrompt()
            case "acknowledge": if presenter.noticeVisible { presenter.commit(.acknowledge) }
            case "attach":
                if scenes.count < 4 {
                    let scene = Scene(prompt, autoPresent: random.next() % 2 == 0, active: random.next() % 2 == 0,
                                      tracking: modes[Int(random.next() % UInt64(modes.count))])
                    scenes.append(scene)
                    trace.append("scene \(scenes.count - 1) autoPresent=\(scene.autoPresent) active=\(scene.active)")
                    reclaim()
                }
            case "detach":
                if !scenes.isEmpty {
                    let scene = scenes.remove(at: Int(random.next() % UInt64(scenes.count)))
                    if opener == .scene(scene.region.hostID) { opener = .nobody }
                    prompt.detach(scene.region.hostID)
                    reclaim()
                }
            case "background":
                if !scenes.isEmpty {
                    let scene = scenes[Int(random.next() % UInt64(scenes.count))]
                    scene.active.toggle()
                    reclaim()
                }
            default:
                if !scenes.isEmpty {
                    let index = Int(random.next() % UInt64(scenes.count))
                    scenes[index].autoPresent.toggle()
                    trace.append("scene \(index) autoPresent=\(scenes[index].autoPresent)")
                    reclaim()
                }
            }
            await synced()
            let drawing = scenes.first { $0.region.hostID == prompt.host }
            let opened = presenter.presentationID
            let failure = "seed \(seed) (\(fixture)) after \(trace)"
            if let opened, opened != before {
                // beforeConsent: a prompt never opens while Apple would be asked and has not answered.
                if !presenter.preferences || presenter.returnsToFirstLayer, action != "manual",
                   prompt.trackingRequest == .beforeConsent, apple.answers == 0, prompt.holdsForTracking {
                    trackingFailures.append("a beforeConsent prompt opened before Apple was asked")
                }
                let byApp = action == "manual" || action == "preferences" || appAsked
                appAsked = false
                opener = byApp ? .app : prompt.host.map(Opener.scene) ?? .nobody
                if opener != .app, dismissed == key() {
                    return XCTFail("a dismissed prompt opened by itself, \(failure)")
                }
            }
            // A scene that auto-presents would have opened it itself, so it takes it over.
            if opened != nil, opener != .app, let drawing, drawing.autoPresent { opener = .scene(drawing.region.hostID) }
            if opened == nil { opener = .nobody }
            // (d), with one hold: beforeConsent keeps the prompt back until Apple was asked or skipped.
            let held = drawing != nil && prompt.holdsForTracking
            if presenter.autoPresent != ((drawing?.autoPresent ?? false) && !held) {
                return XCTFail("auto-present is not the drawing scene's, \(failure)")
            }
            if let first = trackingFailures.first { return XCTFail("\(first), \(failure)") }
            if let drawing, !drawing.autoPresent, opened != nil, opener != .app, opener != .scene(drawing.region.hostID) {
                return XCTFail("a scene that opted out draws a prompt it did not ask for, \(failure)")
            }
            let s = core.snapshot()
            let ready = s.ready && !s.policyPending
            let nothingOpen = presenter.presentationID == nil && !presenter.pending
            let context = "seed \(seed) (\(fixture)) after \(trace)"
            if ready, s.promptRequirement.kind == .choice, presenter.autoPresent, nothingOpen {
                XCTAssertEqual(dismissed, key(), "owed prompt left unshown, \(context)")
                if dismissed != key() { return }
            }
            if ready, s.promptRequirement.kind == .notice, presenter.autoPresent, nothingOpen {
                XCTAssertTrue(presenter.noticeVisible, "owed notice not shown, \(context)")
                if !presenter.noticeVisible { return }
            }
            if !presenter.autoPresent, presenter.noticeVisible {
                XCTAssertEqual(requested, key(), "a notice the app did not ask for shows, \(context)")
                if requested != key() { return }
            }
            for scene in scenes {
                let touchable = scene.region.contains(CGPoint(x: 200, y: 700))
                let drawn = presenter.noticeVisible && prompt.host == scene.region.hostID
                if touchable != drawn { return XCTFail("the notice area takes touches only where it shows, \(context)") }
            }
        }
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

    /// A small seeded generator, so a failing sequence reproduces.
    struct SeededRandom {
        var state: UInt64
        init(seed: UInt64) { state = seed &* 0x9E3779B97F4A7C15 | 1 }
        mutating func next() -> UInt64 {
            state ^= state << 13
            state ^= state >> 7
            state ^= state << 17
            return state
        }
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
