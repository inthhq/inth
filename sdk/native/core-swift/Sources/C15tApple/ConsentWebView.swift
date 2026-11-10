#if canImport(WebKit) && !os(tvOS) && !os(watchOS)
#if canImport(C15tCore)
// SwiftPM builds the consent kernel as its own module. CocoaPods compiles the vendored
// copy into this module instead, where the import would fail, so it is conditional
// rather than assumed.
import C15tCore
#endif
import Foundation
import WebKit

/// Keeps the pages a `WKWebView` loads in step with native consent, so a site that
/// runs web c15t with `consentSource: webViewConsentSource()` shows no second banner
/// and follows the app's choice.
///
/// Only pages whose origin is in the list receive anything, and only in the main
/// frame. The state carries permissions, the model, the IAB TC string and a GPP slot;
/// it never carries the subject id. Consent flows one way, from the app to the page.
/// The page can only ask the app to open its preferences, through
/// `onPreferencesRequested`.
///
/// ```swift
/// let sync = try ConsentWebView(webView: webView, core: core,
///                               allowedOrigins: ["https://www.example.com"]) {
///     presentPreferences()
/// }
/// webView.load(URLRequest(url: URL(string: "https://www.example.com/")!))
/// ```
///
/// Create it before the first load. The web view keeps the helper alive for as long
/// as the web view lives, so a page never keeps a state the app has since changed.
/// Call ``close()`` to stop sooner. A second helper on the same web view closes the
/// first and keeps its secrets, so a page that is already loaded keeps receiving
/// changes.
///
/// The ordering and replacement rules live in ``WebViewConsentSync`` in C15tCore;
/// this class only connects it to WebKit.
@MainActor
public final class ConsentWebView {
    private weak var webView: WKWebView?
    private let onPreferencesRequested: (@MainActor () -> Void)?
    private let target: WebKitTarget
    private var sync: WebViewConsentSync?
    private var messages: ConsentWebViewMessageHandler?
    private var closed = false

    /// The web view retains its helper through this association.
    private static var associationKey: UInt8 = 0

    /// Start syncing `core` into `webView` for `allowedOrigins`.
    ///
    /// - Parameters:
    ///   - allowedOrigins: `https://host[:port]` origins, or `http://` on `localhost`,
    ///     `127.0.0.1` or `[::1]`. No paths or wildcards.
    ///   - onPreferencesRequested: Called when a listed page asks for preferences,
    ///     such as from a "Cookie settings" link.
    /// - Throws: ``WebViewConsentScript/OriginError`` when an origin is not accepted
    ///   or the list is empty.
    public init(
        webView: WKWebView,
        core: ConsentCore,
        allowedOrigins: [String],
        onPreferencesRequested: (@MainActor () -> Void)? = nil
    ) throws {
        _ = try WebViewConsentScript(allowedOrigins: allowedOrigins)
        self.webView = webView
        self.onPreferencesRequested = onPreferencesRequested
        target = WebKitTarget(webView: webView)
        let previous = objc_getAssociatedObject(webView, &Self.associationKey) as? ConsentWebView
        let replaced = previous?.detachForReplacement()
        sync = try WebViewConsentSync(
            core: core,
            allowedOrigins: allowedOrigins,
            target: target,
            replacing: replaced,
            post: { block in DispatchQueue.main.async(execute: block) }
        )
        // Tie the helper's lifetime to the web view's.
        objc_setAssociatedObject(webView, &Self.associationKey, self, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
        if onPreferencesRequested != nil {
            let messages = ConsentWebViewMessageHandler(owner: self)
            self.messages = messages
            webView.configuration.userContentController.add(messages, name: WebViewConsentScript.channel)
        }
    }

    /// Stop syncing. Pages loaded afterwards get no state. Safe to call more than once.
    public func close() {
        guard !closed else { return }
        detachForReplacement()?.close()
        if let webView,
           (objc_getAssociatedObject(webView, &Self.associationKey) as? ConsentWebView) === self {
            objc_setAssociatedObject(webView, &Self.associationKey, nil, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
        }
    }

    /// Stop answering messages and hand back the sync, for a replacement to take
    /// over (it keeps the secrets) or for ``close()`` to close.
    @discardableResult
    private func detachForReplacement() -> WebViewConsentSync? {
        guard !closed else { return nil }
        closed = true
        if messages != nil {
            webView?.configuration.userContentController
                .removeScriptMessageHandler(forName: WebViewConsentScript.channel)
            messages = nil
        }
        defer { sync = nil }
        return sync
    }

    fileprivate func receive(_ message: WKScriptMessage) {
        guard !closed, let script = sync?.script, message.frameInfo.isMainFrame,
              script.isPreferencesRequest(message.body)
        else { return }
        let origin = message.frameInfo.securityOrigin
        var text = "\(origin.protocol)://\(origin.host)"
        if origin.port != 0 { text += ":\(origin.port)" }
        guard script.isAllowed(text) else { return }
        onPreferencesRequested?()
    }
}

/// Puts a sync's scripts into one web view. Main thread; a removal that arrives
/// from elsewhere, such as a release on another thread, hops to it.
private final class WebKitTarget: WebViewConsentTarget, @unchecked Sendable {
    private weak var webView: WKWebView?
    private weak var controller: WKUserContentController?
    private var userScript: WKUserScript?

    init(webView: WKWebView) {
        self.webView = webView
        controller = webView.configuration.userContentController
    }

    func install(_ script: String) {
        MainActor.assumeIsolated {
            replace(with: WKUserScript(source: script, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
    }

    func evaluate(_ script: String) {
        MainActor.assumeIsolated {
            webView?.evaluateJavaScript(script, completionHandler: nil)
        }
    }

    func uninstall() {
        if Thread.isMainThread {
            MainActor.assumeIsolated { replace(with: nil) }
        } else {
            DispatchQueue.main.async { MainActor.assumeIsolated { self.replace(with: nil) } }
        }
    }

    /// WebKit cannot remove one user script, so remove all and add back every
    /// script but ours. Ours goes first, ahead of the host's own.
    @MainActor
    private func replace(with next: WKUserScript?) {
        guard let controller else { return }
        let previous = userScript
        let others = controller.userScripts.filter { $0 !== previous }
        controller.removeAllUserScripts()
        if let next { controller.addUserScript(next) }
        others.forEach(controller.addUserScript)
        userScript = next
    }
}

/// `WKUserContentController` holds its handlers strongly; this one holds the
/// helper weakly so the two do not keep each other alive.
@MainActor
private final class ConsentWebViewMessageHandler: NSObject, WKScriptMessageHandler {
    weak var owner: ConsentWebView?
    init(owner: ConsentWebView) { self.owner = owner }

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        owner?.receive(message)
    }
}
#endif
