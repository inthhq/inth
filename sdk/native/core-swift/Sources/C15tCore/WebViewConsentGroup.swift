import Foundation

/// The web views that share one `WKUserContentController`.
///
/// An app may give several web views one content controller. They then share its
/// document-start scripts and its message handlers: every page runs every helper's
/// script, the first one to run defines the page's consent object, and WebKit
/// raises `NSInvalidArgumentException` when a second handler is added under a name
/// already in use. So the helpers on one controller must share two things, which
/// this type keeps:
///
/// - the secrets, so whichever script defines the page's object, every helper's
///   updates and every preferences request match it;
/// - one message channel, installed with the first member and removed with the
///   last.
public final class WebViewConsentGroup: @unchecked Sendable {
    private let lock = Lock()
    private var members = 0
    private var shared: WebViewConsentScript?

    public init() {}

    /// The secrets members use, or `nil` while the group is empty.
    public var secrets: WebViewConsentScript? {
        lock.withLock { shared }
    }

    /// Add a member that uses `script`'s secrets.
    ///
    /// - Returns: `true` for the first member, which installs the shared channel.
    @discardableResult
    public func join(_ script: WebViewConsentScript) -> Bool {
        lock.withLock {
            if shared == nil { shared = script }
            members += 1
            return members == 1
        }
    }

    /// Remove a member.
    ///
    /// - Returns: `true` for the last member, which removes the shared channel. The
    ///   secrets go with it.
    @discardableResult
    public func leave() -> Bool {
        lock.withLock {
            guard members > 0 else { return false }
            members -= 1
            guard members == 0 else { return false }
            shared = nil
            return true
        }
    }
}
