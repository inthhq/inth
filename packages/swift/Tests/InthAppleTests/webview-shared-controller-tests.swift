#if canImport(WebKit) && !os(tvOS) && !os(watchOS)
@_spi(InthInternal) import InthApple
@_spi(InthInternal) import InthCore
import Foundation
import WebKit
import XCTest

/// Several web views may share one `WKUserContentController`. WebKit raises
/// `NSInvalidArgumentException` when a second script message handler is added under
/// a name already in use, so the helpers on one controller must share one handler.
@MainActor
final class WebViewSharedControllerTests: XCTestCase {
    private final class Probe: NSObject, WKScriptMessageHandler {
        func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {}
    }

    private func webView(sharing controller: WKUserContentController) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.userContentController = controller
        return WKWebView(frame: .zero, configuration: configuration)
    }

    private func token(in source: String) -> String? {
        guard let regex = try? NSRegularExpression(pattern: #"\],"([0-9a-f]{32})","#),
              let found = regex.firstMatch(in: source, range: NSRange(source.startIndex..., in: source)),
              let range = Range(found.range(at: 1), in: source)
        else { return nil }
        return String(source[range])
    }

    /// The council's sequence: web views 1 and 2 share a controller, helper A allows
    /// `https://a.example` on web view 1, helper B only `https://b.example` on web
    /// view 2. Every script on the controller runs in both web views, so B must be
    /// refused, and the controller must be left exactly as A configured it.
    func testASecondScopeOnOneControllerIsRefusedAndChangesNothing() throws {
        let controller = WKUserContentController()
        let first = webView(sharing: controller)
        let second = webView(sharing: controller)
        let core = ConsentCore()
        let a = try ConsentWebView(webView: first, core: core, allowedOrigins: ["https://a.example"]) {}
        let scripts = controller.userScripts.map(\.source)

        for (refusedCore, origins) in [(core, ["https://b.example"]), (ConsentCore(), ["https://a.example"])] {
            do {
                _ = try ConsentWebView(webView: second, core: refusedCore, allowedOrigins: origins) {}
                XCTFail("a second scope on one controller must be refused: \(origins)")
            } catch {
                XCTAssertTrue(error is WebViewConsentGroup.ScopeConflict, "\(error)")
            }
        }
        XCTAssertEqual(controller.userScripts.map(\.source), scripts, "a refused helper adds or removes nothing")

        // The web view that already has a helper may still change its own scope,
        // because it is the controller's only member.
        let replaced = try ConsentWebView(webView: first, core: core, allowedOrigins: ["https://b.example"]) {}
        XCTAssertEqual(controller.userScripts.count, 1)
        replaced.close()
        a.close()
        _ = (first, second)
    }

    func testTwoWebViewsOnOneControllerShareOneHandlerAndOneToken() throws {
        let controller = WKUserContentController()
        let first = webView(sharing: controller)
        let second = webView(sharing: controller)
        let core = ConsentCore()

        // Before the fix, the second helper's handler raised and took the process down.
        let a = try ConsentWebView(webView: first, core: core, allowedOrigins: ["https://app.example"]) {}
        let b = try ConsentWebView(webView: second, core: core, allowedOrigins: ["https://app.example"]) {}

        // Every page runs both scripts and the first one defines its consent object,
        // so both must carry one token for either helper's updates to land.
        XCTAssertEqual(controller.userScripts.count, 2)
        XCTAssertEqual(Set(controller.userScripts.compactMap { token(in: $0.source) }).count, 1)

        a.close()
        XCTAssertEqual(controller.userScripts.count, 1)
        b.close()
        XCTAssertEqual(controller.userScripts.count, 0)

        // The last helper removed the shared handler, so the name is free again.
        controller.add(Probe(), name: WebViewConsentScript.channel)
        controller.removeScriptMessageHandler(forName: WebViewConsentScript.channel)
        _ = (first, second)
    }
}
#endif
