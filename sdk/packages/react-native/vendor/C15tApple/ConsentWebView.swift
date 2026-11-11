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
/// frame. The state carries permissions, the model, the IAB TC string and the GPP
/// string; it never carries the subject id. Consent flows one way, from the app to the page.
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
/// A `WKUserContentController` is one consent scope: its user scripts run in every
/// web view attached to it, so a helper's state and allowlist reach all of them.
/// Several web views may share one controller only when their helpers use the same
/// ``ConsentCore`` and the same `allowedOrigins`; they then share one message
/// handler and one set of secrets. Attaching a helper with another core or
/// allowlist to a controller that already has one throws
/// ``WebViewConsentGroup/ScopeConflict``: give that web view its own controller.
/// See ``WebViewConsentGroup``.
///
/// The ordering, replacement and revocation rules live in ``WebViewConsentSync`` in
/// C15tCore; this class only connects it to WebKit.
@MainActor
public final class ConsentWebView {
    private weak var webView: WKWebView?
    private let onPreferencesRequested: (@MainActor () -> Void)?
    private let target: WebKitTarget
    private var sync: WebViewConsentSync?
    private var closed = false

    /// The web view retains its helper through this association.
    fileprivate static var associationKey: UInt8 = 0

    /// Start syncing `core` into `webView` for `allowedOrigins`.
    ///
    /// - Parameters:
    ///   - allowedOrigins: `https://host[:port]` origins, or `http://` on `localhost`,
    ///     `127.0.0.1` or `[::1]`. No paths or wildcards.
    ///   - onPreferencesRequested: Called when a listed page asks for preferences,
    ///     such as from a "Cookie settings" link.
    /// - Throws: ``WebViewConsentScript/OriginError`` when an origin is not accepted
    ///   or the list is empty, and ``WebViewConsentGroup/ScopeConflict`` when the web
    ///   view's content controller already serves another core or allowlist. Both are
    ///   programming errors, and nothing has changed when either is thrown.
    public init(
        webView: WKWebView,
        core: ConsentCore,
        allowedOrigins: [String],
        onPreferencesRequested: (@MainActor () -> Void)? = nil
    ) throws {
        let channel = ControllerChannel.of(webView.configuration.userContentController)
        let previous = objc_getAssociatedObject(webView, &Self.associationKey) as? ConsentWebView
        // Checked before anything changes, so a refused helper leaves the controller,
        // and any helper already on this web view, as they were.
        try channel.group.admit(
            core: core,
            allowedOrigins: allowedOrigins,
            replacingMember: previous.map { !$0.closed } ?? false
        )
        self.webView = webView
        self.onPreferencesRequested = onPreferencesRequested
        target = WebKitTarget(webView: webView, channel: channel)
        let replaced = previous?.detachForReplacement()
        let sync = try WebViewConsentSync(
            core: core,
            allowedOrigins: allowedOrigins,
            target: target,
            replacing: replaced,
            secretsFrom: channel.group.secrets,
            post: { block in DispatchQueue.main.async(execute: block) }
        )
        self.sync = sync
        target.join(sync.script, core: core)
        // Tie the helper's lifetime to the web view's.
        objc_setAssociatedObject(webView, &Self.associationKey, self, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
    }

    /// Stop syncing. The loaded page stops following the app (every optional category
    /// denied), and pages loaded afterwards get nothing. Safe to call more than once.
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
        defer { sync = nil }
        return sync
    }

    fileprivate func receive(_ message: WKScriptMessage) {
        guard !closed, onPreferencesRequested != nil, let script = sync?.script,
              message.frameInfo.isMainFrame, script.isPreferencesRequest(message.body)
        else { return }
        let origin = message.frameInfo.securityOrigin
        var text = "\(origin.protocol)://\(origin.host)"
        if origin.port != 0 { text += ":\(origin.port)" }
        guard script.isAllowed(text) else { return }
        onPreferencesRequested?()
    }
}

/// What the helpers on one `WKUserContentController` share: the group that counts
/// them and keeps their secrets, and the one message handler WebKit allows under
/// the channel's name. The controller retains it through an association.
private final class ControllerChannel: @unchecked Sendable {
    let group = WebViewConsentGroup()
    let handler: ConsentWebViewMessageHandler
    private static var associationKey: UInt8 = 0

    private init(handler: ConsentWebViewMessageHandler) {
        self.handler = handler
    }

    @MainActor
    static func of(_ controller: WKUserContentController) -> ControllerChannel {
        if let channel = objc_getAssociatedObject(controller, &associationKey) as? ControllerChannel {
            return channel
        }
        let channel = ControllerChannel(handler: ConsentWebViewMessageHandler())
        objc_setAssociatedObject(controller, &associationKey, channel, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
        return channel
    }
}

/// Puts a sync's scripts into one web view, and holds that web view's place in its
/// controller's channel. Main thread; a removal that arrives from elsewhere, such as
/// a release on another thread, hops to it.
private final class WebKitTarget: WebViewConsentTarget, @unchecked Sendable {
    private weak var webView: WKWebView?
    private weak var controller: WKUserContentController?
    private let channel: ControllerChannel
    private var userScript: WKUserScript?
    private var joined = false

    init(webView: WKWebView, channel: ControllerChannel) {
        self.webView = webView
        controller = webView.configuration.userContentController
        self.channel = channel
    }

    /// Take a place in the controller's channel, installing its handler first.
    @MainActor
    func join(_ script: WebViewConsentScript, core: ConsentCore) {
        guard !joined else { return }
        joined = true
        if channel.group.join(script, core: core) {
            controller?.add(channel.handler, name: WebViewConsentScript.channel)
        }
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
            MainActor.assumeIsolated { remove() }
        } else {
            DispatchQueue.main.async { MainActor.assumeIsolated { self.remove() } }
        }
    }

    /// Remove the script and give up the place in the channel; the last one out
    /// removes the handler.
    @MainActor
    private func remove() {
        replace(with: nil)
        guard joined else { return }
        joined = false
        if channel.group.leave() {
            controller?.removeScriptMessageHandler(forName: WebViewConsentScript.channel)
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

/// One per controller. `WKUserContentController` holds its handlers strongly, so
/// this one holds nothing: it finds the helper through the message's web view.
@MainActor
private final class ConsentWebViewMessageHandler: NSObject, WKScriptMessageHandler {
    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        guard let webView = message.webView,
              let helper = objc_getAssociatedObject(webView, &ConsentWebView.associationKey) as? ConsentWebView
        else { return }
        helper.receive(message)
    }
}
#endif
