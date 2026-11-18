import Foundation

/// The web views that share one `WKUserContentController`, and the one consent
/// scope they have to share.
///
/// A content controller's user scripts run in every web view attached to it, and
/// a document-start script cannot tell which web view it is in. So a controller is
/// one consent scope, not a set of per-web-view ones: a helper's script, with its
/// state and its allowlist, reaches every web view on the controller. Two helpers
/// with different cores or different allowlists on one controller would leak one
/// helper's consent into the other's web views and leave its pages without
/// updates. That is refused: a controller has exactly one authority, one core and
/// one allowlist, and helpers with that same core and allowlist may share it.
///
/// The members also share:
///
/// - the secrets, so whichever helper's script defines a page's object, every
///   helper's updates and preferences requests match it;
/// - one message channel, because WebKit raises `NSInvalidArgumentException` on a
///   second handler under a name in use. It is installed with the first member and
///   removed with the last.
public final class WebViewConsentGroup: @unchecked Sendable {
    /// A helper with another core or allowlist tried to join a controller that
    /// already has an authority.
    public struct ScopeConflict: Error, Equatable, CustomStringConvertible {
        public let description: String
    }

    private let lock = Lock()
    private var members = 0
    private var shared: WebViewConsentScript?
    private weak var authority: ConsentCore?
    private var authorityOrigins: Set<String> = []

    public init() {}

    /// The secrets members use, or `nil` while the group is empty.
    public var secrets: WebViewConsentScript? {
        lock.withLock { shared }
    }

    /// Check that a helper for `core` and `allowedOrigins` may join, before anything
    /// changes.
    ///
    /// - Parameter replacingMember: Whether the helper replaces a member of this
    ///   group, whose place it takes. A sole member may be replaced by any scope.
    /// - Throws: ``ScopeConflict`` when the group already serves another core or
    ///   another allowlist, or ``WebViewConsentScript/OriginError`` for a bad list.
    public func admit(core: ConsentCore, allowedOrigins: [String], replacingMember: Bool) throws {
        let origins = try Set(WebViewConsentScript(allowedOrigins: allowedOrigins, token: "", requestKey: "").origins)
        try lock.withLock {
            let others = members - (replacingMember ? 1 : 0)
            guard others > 0 else { return }
            guard authority === core, authorityOrigins == origins else {
                throw ScopeConflict(description: """
                    This WKUserContentController already serves another consent scope. Its user \
                    scripts run in every web view attached to it, so all helpers on one controller \
                    must use the same ConsentCore and the same allowedOrigins. Give each \
                    differently scoped web view its own WKUserContentController, or attach every \
                    helper on this controller with the same core and allowlist.
                    """)
            }
        }
    }

    /// Add a member that serves `core` with `script`'s origins and secrets. Call
    /// ``admit(core:allowedOrigins:replacingMember:)`` first.
    ///
    /// - Returns: `true` for the first member, which installs the shared channel.
    @discardableResult
    public func join(_ script: WebViewConsentScript, core: ConsentCore) -> Bool {
        lock.withLock {
            if members == 0 {
                shared = script
                authority = core
                authorityOrigins = Set(script.origins)
            }
            members += 1
            return members == 1
        }
    }

    /// Remove a member.
    ///
    /// - Returns: `true` for the last member, which removes the shared channel. The
    ///   secrets and the authority go with it.
    @discardableResult
    public func leave() -> Bool {
        lock.withLock {
            guard members > 0 else { return false }
            members -= 1
            guard members == 0 else { return false }
            shared = nil
            authority = nil
            authorityOrigins = []
            return true
        }
    }
}
