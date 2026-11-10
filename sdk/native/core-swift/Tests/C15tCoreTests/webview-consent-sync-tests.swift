import Foundation
import XCTest

@testable import C15tCore

/// The ordering, replacement and release rules the iOS helper depends on.
/// `ConsentWebView` in C15tApple only connects this logic to WebKit.
final class WebViewConsentSyncTests: XCTestCase {
    /// What a web view received.
    final class RecordingTarget: WebViewConsentTarget {
        var installed: [String] = []
        var evaluated: [String] = []
        var uninstalls = 0
        var onInstall: (Int) -> Void = { _ in }

        func install(_ script: String) {
            installed.append(script)
            onInstall(installed.count)
        }

        func evaluate(_ script: String) { evaluated.append(script) }
        func uninstall() { uninstalls += 1 }
    }

    /// A main-thread queue the test drains by hand.
    final class Queue: @unchecked Sendable {
        var blocks: [() -> Void] = []
        func post(_ block: @escaping () -> Void) { blocks.append(block) }
        func drain() {
            while !blocks.isEmpty { blocks.removeFirst()() }
        }
    }

    let queue = Queue()

    func core() async -> ConsentCore {
        let core = ConsentCore()
        await core.bootstrapAndSettle(Fixture.configured(
            store: InMemoryStore(), transport: Fixture.transport(StubHTTP()), clock: TestClock()))
        return core
    }

    func match(_ pattern: String, in script: String) -> String? {
        guard let regex = try? NSRegularExpression(pattern: pattern),
              let found = regex.firstMatch(in: script, range: NSRange(script.startIndex..., in: script)),
              let range = Range(found.range(at: 1), in: script)
        else { return nil }
        return String(script[range])
    }

    func revision(in script: String) -> Int? { match(#""revision":(\d+)"#, in: script).flatMap(Int.init) }
    func token(in script: String) -> String? { match(#"\],"([0-9a-f]{32})","#, in: script) }

    func testAChangeBetweenTheFirstReadAndTheSubscriptionStillReachesThePage() async throws {
        let core = await core()
        let target = RecordingTarget()
        // The core moves while the first state is being installed, which is the
        // window between reading the snapshot and subscribing.
        target.onInstall = { installs in
            if installs == 1 { core.identify(KernelUser(externalId: "user-1")) }
        }
        let sync = try WebViewConsentSync(
            core: core, allowedOrigins: ["https://app.example"], target: target, post: queue.post)
        await core.waitUntilIdle()
        queue.drain()
        XCTAssertEqual(revision(in: try XCTUnwrap(target.evaluated.last)), core.snapshot().revision)
        XCTAssertGreaterThanOrEqual(target.evaluated.count, 2, "the change is pushed after the first state")
        sync.close()
    }

    func testAnUnchangedStateIsNotPushedAgain() async throws {
        let core = await core()
        let target = RecordingTarget()
        let sync = try WebViewConsentSync(
            core: core, allowedOrigins: ["https://app.example"], target: target, post: queue.post)
        sync.publish()
        queue.drain()
        XCTAssertEqual(target.installed.count, 1)
        XCTAssertEqual(target.evaluated.count, 1)
        sync.close()
    }

    func testAReplacementKeepsTheTokenALoadedPageAlreadyHolds() async throws {
        let core = await core()
        let first = RecordingTarget()
        let original = try WebViewConsentSync(
            core: core, allowedOrigins: ["https://app.example"], target: first, post: queue.post)
        let loadedToken = token(in: try XCTUnwrap(first.installed.first))

        let second = RecordingTarget()
        let replacement = try WebViewConsentSync(
            core: core, allowedOrigins: ["https://app.example"], target: second,
            replacing: original, post: queue.post)
        core.identify(KernelUser(externalId: "user-1"))
        await core.waitUntilIdle()
        queue.drain()

        XCTAssertEqual(first.uninstalls, 1, "the replaced sync removes its script")
        XCTAssertEqual(token(in: try XCTUnwrap(second.evaluated.last)), loadedToken, "the loaded page accepts the update")
        XCTAssertEqual(first.evaluated.count, 1, "the replaced sync stops pushing")
        replacement.close()
    }

    func testASyncReleasedWithoutCloseRemovesItsScript() async throws {
        let core = await core()
        let target = RecordingTarget()
        var sync: WebViewConsentSync? = try WebViewConsentSync(
            core: core, allowedOrigins: ["https://app.example"], target: target, post: queue.post)
        XCTAssertNotNil(sync)
        sync = nil
        XCTAssertEqual(target.uninstalls, 1)
    }

    func testCloseRemovesTheScriptAndStopsPushing() async throws {
        let core = await core()
        let target = RecordingTarget()
        let sync = try WebViewConsentSync(
            core: core, allowedOrigins: ["https://app.example"], target: target, post: queue.post)
        sync.close()
        sync.close()
        core.identify(KernelUser(externalId: "user-1"))
        await core.waitUntilIdle()
        queue.drain()
        XCTAssertEqual(target.uninstalls, 1)
        XCTAssertEqual(target.evaluated.count, 1)
    }
}
