import Foundation

/// Where a ``WebViewConsentSync`` puts its scripts. Calls arrive on the web view's
/// thread, through the `post` the sync was given.
public protocol WebViewConsentTarget: AnyObject {
    /// Replace this sync's document-start script with `script`.
    func install(_ script: String)
    /// Run `script` in the loaded main frame.
    func evaluate(_ script: String)
    /// Remove this sync's document-start script.
    func uninstall()
}

/// Keeps one web view in step with a ``ConsentCore``, with no WebKit in it.
///
/// The platform glue (`ConsentWebView` in C15tApple, or a host's own) supplies a
/// ``WebViewConsentTarget`` and a `post` that runs work on the web view's thread.
/// Every ordering rule lives here, so a plain `swift test` can check it:
///
/// - the core is observed before the first state is read, so a change between
///   the two is not missed;
/// - an unchanged state is not pushed again;
/// - a replacement keeps the secrets of the sync it replaces, because a loaded
///   page only accepts the token it was given at document start;
/// - a sync released without ``close()`` still removes its script.
///
/// Every method runs on the web view's thread.
public final class WebViewConsentSync: @unchecked Sendable {
    /// The scripts this sync injects, with the secrets it uses.
    public let script: WebViewConsentScript
    private let core: ConsentCore
    private let target: WebViewConsentTarget
    private let post: (@escaping () -> Void) -> Void
    private var observer: Observer?
    private var subscription: ConsentSubscription?
    private var published: WebViewConsentState?
    private var closed = false

    /// Start syncing `core` into `target` for `allowedOrigins`.
    ///
    /// - Parameters:
    ///   - replacing: The sync this one replaces on the same web view. It is closed,
    ///     and its token and request key carry over.
    ///   - post: Runs a block on the web view's thread.
    /// - Throws: ``WebViewConsentScript/OriginError`` when an origin is not accepted
    ///   or the list is empty.
    public init(
        core: ConsentCore,
        allowedOrigins: [String],
        target: WebViewConsentTarget,
        replacing: WebViewConsentSync? = nil,
        post: @escaping (@escaping () -> Void) -> Void
    ) throws {
        script = try replacing?.script.replacingOrigins(allowedOrigins)
            ?? WebViewConsentScript(allowedOrigins: allowedOrigins)
        replacing?.close()
        self.core = core
        self.target = target
        self.post = post
        let observer = Observer { [weak self] in
            post { self?.publish() }
        }
        self.observer = observer
        // Observe first, so a change between the first read and the subscription
        // is not missed.
        subscription = core.onChange(observer)
        publish()
    }

    deinit {
        if !closed {
            subscription?.cancel()
            target.uninstall()
        }
    }

    /// Push the current state, if it changed since the last push.
    public func publish() {
        guard !closed else { return }
        let state = WebViewConsentState(core: core)
        guard state != published else { return }
        published = state
        target.install(script.documentStart(state))
        // The update script checks the page origin itself, so a page that navigated
        // off the list gets nothing.
        target.evaluate(script.update(state))
    }

    /// Stop syncing and remove the document-start script. Safe to call more than once.
    public func close() {
        guard !closed else { return }
        closed = true
        subscription?.cancel()
        subscription = nil
        observer = nil
        target.uninstall()
    }

    /// Strong home for the observer the core holds weakly. Called on any queue.
    private final class Observer: SnapshotObserver, @unchecked Sendable {
        let changed: () -> Void
        init(_ changed: @escaping () -> Void) { self.changed = changed }
        func consentDidChange(_ snapshot: ConsentSnapshot) { changed() }
    }
}
