#if canImport(WebKit) && !os(tvOS) && !os(watchOS)
import C15tApple
import C15tCore
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
