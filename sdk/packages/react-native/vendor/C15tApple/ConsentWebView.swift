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
/// first.
@MainActor
public final class ConsentWebView {
    private weak var webView: WKWebView?
    private let core: ConsentCore
    private let script: WebViewConsentScript
    private let onPreferencesRequested: (@MainActor () -> Void)?
    private var userScript: WKUserScript?
    private var published: WebViewConsentState?
    private var observer: ConsentWebViewObserver?
    private var subscription: ConsentSubscription?
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
        script = try WebViewConsentScript(allowedOrigins: allowedOrigins)
        self.webView = webView
        self.core = core
        self.onPreferencesRequested = onPreferencesRequested
        // Observe first, so a change between the first read and the subscription
        // is not missed. A repeated state is skipped.
        let observer = ConsentWebViewObserver { [weak self] in
            Task { @MainActor [weak self] in self?.publish() }
        }
        self.observer = observer
        subscription = core.onChange(observer)
        publish()
        // Tie the helper's lifetime to the web view's, replacing an earlier helper.
        (objc_getAssociatedObject(webView, &Self.associationKey) as? ConsentWebView)?.close()
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
        closed = true
        subscription?.cancel()
        subscription = nil
        observer = nil
        guard let webView else { return }
        if (objc_getAssociatedObject(webView, &Self.associationKey) as? ConsentWebView) === self {
            objc_setAssociatedObject(webView, &Self.associationKey, nil, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
        }
        let controller = webView.configuration.userContentController
        replaceUserScript(in: controller, with: nil)
        if messages != nil {
            controller.removeScriptMessageHandler(forName: WebViewConsentScript.channel)
            messages = nil
        }
    }

    /// Re-register the document-start script and push the state into the loaded page.
    private func publish() {
        guard !closed, let webView else { return }
        let state = WebViewConsentState(core: core)
        guard state != published else { return }
        published = state
        let next = WKUserScript(
            source: script.documentStart(state),
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        )
        replaceUserScript(in: webView.configuration.userContentController, with: next)
        // The update script checks the page origin itself, so a page that navigated
        // off the list gets nothing.
        webView.evaluateJavaScript(script.update(state), completionHandler: nil)
    }

    /// WebKit cannot remove one user script, so remove all and add back every
    /// script but ours. Ours goes first, ahead of the host's own.
    private func replaceUserScript(in controller: WKUserContentController, with next: WKUserScript?) {
        let previous = userScript
        let others = controller.userScripts.filter { $0 !== previous }
        controller.removeAllUserScripts()
        if let next { controller.addUserScript(next) }
        others.forEach(controller.addUserScript)
        userScript = next
    }

    fileprivate func receive(_ message: WKScriptMessage) {
        guard !closed, message.frameInfo.isMainFrame,
              WebViewConsentScript.isOpenPreferencesMessage(message.body)
        else { return }
        let origin = message.frameInfo.securityOrigin
        var text = "\(origin.protocol)://\(origin.host)"
        if origin.port != 0 { text += ":\(origin.port)" }
        guard script.isAllowed(text) else { return }
        onPreferencesRequested?()
    }
}

/// Strong home for the observer the core holds weakly. Called on any queue.
private final class ConsentWebViewObserver: SnapshotObserver, @unchecked Sendable {
    let changed: () -> Void
    init(_ changed: @escaping () -> Void) { self.changed = changed }
    func consentDidChange(_ snapshot: ConsentSnapshot) { changed() }
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
