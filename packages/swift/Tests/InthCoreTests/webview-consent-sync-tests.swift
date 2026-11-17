import Foundation
import XCTest

@_spi(InthInternal) @testable import InthCore

/// The ordering, replacement and release rules the iOS helper depends on.
/// `ConsentWebView` in InthApple only connects this logic to WebKit.
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

    /// A ready core whose visitor accepted everything, so a page holds real grants.
    func grantedCore() async -> ConsentCore {
        let http = StubHTTP()
        http.initResponse = Fixture.initResponse(policyResolution: Fixture.matchedResolution())
        let core = ConsentCore()
        await core.bootstrapAndSettle(Fixture.configured(
            store: InMemoryStore(), transport: Fixture.transport(http), clock: TestClock()))
        XCTAssertEqual(core.save(.all).status, .committed)
        await core.waitUntilIdle()
        XCTAssertTrue(core.isAllowed(.marketing), "the fixture grants marketing")
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
        XCTAssertEqual(target.evaluated.count, 2, "the first state, then the revocation, and nothing after")
    }

    func testCloseTellsTheLoadedPageToStopFollowingTheApp() async throws {
        let core = await grantedCore()
        let target = RecordingTarget()
        let sync = try WebViewConsentSync(
            core: core, allowedOrigins: ["https://app.example"], target: target, post: queue.post)
        let loadedToken = try XCTUnwrap(token(in: try XCTUnwrap(target.installed.first)))
        XCTAssertTrue(try XCTUnwrap(target.evaluated.first).contains(#""marketing":true"#), "the page was given the grant")
        sync.close()
        let revocation = try XCTUnwrap(target.evaluated.last)
        XCTAssertTrue(revocation.contains(#"(["https://app.example"],"\#(loadedToken)","#), revocation)
        XCTAssertTrue(revocation.contains(#""ready":false"#))
        XCTAssertTrue(revocation.contains(#""marketing":false"#))
    }

    func testDroppingAnOriginRevokesThePageLoadedFromItAndOnlyThatOne() async throws {
        let core = await grantedCore()
        let first = RecordingTarget()
        let original = try WebViewConsentSync(
            core: core, allowedOrigins: ["https://old.example", "https://kept.example"], target: first, post: queue.post)
        let loadedToken = try XCTUnwrap(token(in: try XCTUnwrap(first.installed.first)))
        let second = RecordingTarget()
        let replacement = try WebViewConsentSync(
            core: core, allowedOrigins: ["https://kept.example"], target: second, replacing: original, post: queue.post)

        let revocation = try XCTUnwrap(first.evaluated.last)
        XCTAssertTrue(revocation.contains(#"(["https://old.example"],"\#(loadedToken)","#), revocation)
        XCTAssertTrue(revocation.contains(#""ready":false"#))
        XCTAssertEqual(first.evaluated.count, 2, "one revocation, for the dropped origin only")
        XCTAssertTrue(try XCTUnwrap(second.evaluated.first).contains(#"(["https://kept.example"],"\#(loadedToken)","#))
        replacement.close()
    }

    /// One `WKUserContentController` runs every helper's script in every web view on
    /// it, so it may serve one core and one allowlist. Web view 1 allows
    /// `https://a.example`, web view 2 only `https://b.example`: web view 2 must not
    /// join, or loading `https://a.example` there would run A's script with A's state.
    func testAControllerServesOneCoreAndOneAllowlist() async throws {
        let core = await core()
        let otherCore = await self.core()
        let group = WebViewConsentGroup()
        let a = try WebViewConsentScript(allowedOrigins: ["https://a.example"])
        XCTAssertNoThrow(try group.admit(core: core, allowedOrigins: ["https://a.example"], replacingMember: false))
        XCTAssertTrue(group.join(a, core: core))

        XCTAssertThrowsError(
            try group.admit(core: core, allowedOrigins: ["https://b.example"], replacingMember: false)
        ) { error in XCTAssertTrue(error is WebViewConsentGroup.ScopeConflict, "\(error)") }
        XCTAssertThrowsError(
            try group.admit(core: otherCore, allowedOrigins: ["https://a.example"], replacingMember: false)
        ) { error in XCTAssertTrue(error is WebViewConsentGroup.ScopeConflict, "\(error)") }
        XCTAssertThrowsError(
            try group.admit(core: core, allowedOrigins: ["https://a.example", "https://b.example"], replacingMember: false)
        )
        // The same scope, however it is written, may share the controller.
        XCTAssertNoThrow(try group.admit(core: core, allowedOrigins: ["https://A.example/"], replacingMember: false))
        // The sole member may be replaced by any scope; the controller then has one again.
        XCTAssertNoThrow(try group.admit(core: otherCore, allowedOrigins: ["https://b.example"], replacingMember: true))
        XCTAssertTrue(group.leave())
        XCTAssertNoThrow(try group.admit(core: otherCore, allowedOrigins: ["https://b.example"], replacingMember: false))
        // A bad list is still an origin error, not a scope one.
        XCTAssertThrowsError(try group.admit(core: core, allowedOrigins: ["http://a.example"], replacingMember: false)) { error in
            XCTAssertTrue(error is WebViewConsentScript.OriginError, "\(error)")
        }
    }

    func testWebViewsSharingAControllerShareSecretsAndOneChannel() async throws {
        let core = await core()
        let group = WebViewConsentGroup()
        let first = RecordingTarget()
        let a = try WebViewConsentSync(
            core: core, allowedOrigins: ["https://app.example"], target: first,
            secretsFrom: group.secrets, post: queue.post)
        XCTAssertTrue(group.join(a.script, core: core), "the first member installs the channel")
        let second = RecordingTarget()
        let b = try WebViewConsentSync(
            core: core, allowedOrigins: ["https://app.example"], target: second,
            secretsFrom: group.secrets, post: queue.post)
        XCTAssertFalse(group.join(b.script, core: core), "a second member must not add the handler again")
        XCTAssertEqual(token(in: try XCTUnwrap(first.installed.first)), token(in: try XCTUnwrap(second.installed.first)))
        let key = try XCTUnwrap(match(#"\],"[0-9a-f]{32}","([0-9a-f]{32})","#, in: try XCTUnwrap(first.installed.first)))
        XCTAssertTrue(b.script.isPreferencesRequest(#"{"type":"c15t:open-preferences","key":"\#(key)"}"#))
        XCTAssertFalse(group.leave())
        XCTAssertTrue(group.leave(), "the last member removes the channel")
        XCTAssertNil(group.secrets)
        a.close()
        b.close()
    }
}
