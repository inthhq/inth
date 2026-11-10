import Foundation
#if canImport(Security)
import Security
#endif

/// What a page inside a WebView reads as `window.__c15tNativeConsent.getState()`.
///
/// Consent state only: no subject id, no policy token, no location. The shape is
/// "WebView consent" in `native/CONTRACT.md`, and `webViewConsentSource()` in
/// `@c15t/core` reads it.
public struct WebViewConsentState: Sendable, Equatable {
    /// `true` once stored consent hydrated and a policy resolved.
    public let ready: Bool
    public let revision: Int
    /// Wire name of the model, such as `opt-in` or `iab`.
    public let model: String
    public let permissions: ConsentState
    /// The committed TC string, when the app runs IAB TCF natively.
    public let tcString: String?
    /// Always `nil` until the native cores produce GPP strings.
    public let gppString: String?

    public init(
        ready: Bool,
        revision: Int,
        model: String,
        permissions: ConsentState,
        tcString: String?,
        gppString: String? = nil
    ) {
        self.ready = ready
        self.revision = revision
        self.model = model
        self.permissions = permissions
        self.tcString = tcString
        self.gppString = gppString
    }

    /// The state for `snapshot`, with the TC string the core committed for it.
    public init(snapshot: ConsentSnapshot, tcString: String?, gppString: String? = nil) {
        self.init(
            ready: snapshot.ready && !snapshot.policyPending,
            revision: snapshot.revision,
            model: snapshot.model.rawValue,
            permissions: snapshot.effectivePermissions,
            tcString: tcString,
            gppString: gppString
        )
    }

    /// The current state of `core`.
    public init(core: ConsentCore) {
        self.init(snapshot: core.snapshot(), tcString: core.iabConsent()?.tcString)
    }

    private struct Wire: Encodable {
        struct Permissions: Encodable {
            let necessary: Bool
            let functionality: Bool
            let experience: Bool
            let measurement: Bool
            let marketing: Bool
        }

        let version: Int
        let ready: Bool
        let revision: Int
        let model: String
        let permissions: Permissions
        let tcString: String?
        let gppString: String?

        enum CodingKeys: String, CodingKey {
            case version, ready, revision, model, permissions, tcString, gppString
        }

        func encode(to encoder: Encoder) throws {
            var container = encoder.container(keyedBy: CodingKeys.self)
            try container.encode(version, forKey: .version)
            try container.encode(ready, forKey: .ready)
            try container.encode(revision, forKey: .revision)
            try container.encode(model, forKey: .model)
            try container.encode(permissions, forKey: .permissions)
            // Explicit nulls: the page reads a missing string and a null alike,
            // and every platform emits the same keys.
            if let tcString { try container.encode(tcString, forKey: .tcString) } else { try container.encodeNil(forKey: .tcString) }
            if let gppString { try container.encode(gppString, forKey: .gppString) } else { try container.encodeNil(forKey: .gppString) }
        }
    }

    /// The state as the JSON object the scripts take. Optional categories are denied until `ready`.
    public func json() -> String {
        let wire = Wire(
            version: 1,
            ready: ready,
            revision: revision,
            model: model,
            permissions: .init(
                necessary: true,
                functionality: ready && permissions.functionality,
                experience: ready && permissions.experience,
                measurement: ready && permissions.measurement,
                marketing: ready && permissions.marketing
            ),
            tcString: tcString,
            gppString: gppString
        )
        return WebViewConsentScript.encode(wire)
    }
}

/// Builds the scripts a WebView helper injects, for one list of origins and one token.
///
/// Platform glue (`ConsentWebView` in C15tApple, or a host's own) adds
/// ``documentStart(_:)`` as a document-start user script and runs ``update(_:)``
/// in the main frame when consent changes. Both scripts check the page origin
/// themselves, so a page outside ``origins`` gets nothing.
///
/// Two secrets, both drawn for every instance and kept for the life of one WebView:
/// the token is the only thing that lets ``update(_:)`` change a page's state, and
/// the request key is what a page's preferences request must carry. Both live only
/// in the document-start closure of the top frame, so a frame cannot read either.
public struct WebViewConsentScript: Sendable {
    public enum OriginError: Error, Equatable, CustomStringConvertible {
        case empty
        case invalid(String)

        public var description: String {
            switch self {
            case .empty:
                return "List at least one origin the WebView may receive consent on."
            case let .invalid(input):
                return "\"\(input)\" is not an allowed WebView origin. Use https://host[:port], or http:// on localhost."
            }
        }
    }

    /// The message-channel name pages post to.
    public static let channel = "c15tConsent"

    /// The normalized origins, in the order given, without duplicates.
    public let origins: [String]
    private let token: String
    private let requestKey: String
    private let originsJSON: String
    private let tokenJSON: String
    private let requestKeyJSON: String
    private let preferencesRequest: String

    public init(
        allowedOrigins: [String],
        token: String = WebViewConsentScript.newToken(),
        requestKey: String = WebViewConsentScript.newToken()
    ) throws {
        guard !allowedOrigins.isEmpty else { throw OriginError.empty }
        var normalized: [String] = []
        for input in allowedOrigins {
            guard let origin = Self.normalize(input) else { throw OriginError.invalid(input) }
            if !normalized.contains(origin) { normalized.append(origin) }
        }
        origins = normalized
        self.token = token
        self.requestKey = requestKey
        originsJSON = Self.encode(normalized)
        tokenJSON = Self.encode(token)
        requestKeyJSON = Self.encode(requestKey)
        preferencesRequest = #"{"type":"c15t:open-preferences","key":"#
            + Self.encode(requestKey) + "}"
    }

    /// The same secrets for a new origin list. A page loaded under the old instance
    /// keeps the token it was given, so a replacement must keep it too, or its
    /// updates would be refused until the next navigation.
    public func replacingOrigins(_ allowedOrigins: [String]) throws -> WebViewConsentScript {
        try WebViewConsentScript(allowedOrigins: allowedOrigins, token: token, requestKey: requestKey)
    }

    /// The script to run at document start, carrying `state`.
    public func documentStart(_ state: WebViewConsentState) -> String {
        "\(WebViewConsentScripts.documentStart)(\(originsJSON),\(tokenJSON),\(requestKeyJSON),\(state.json()));"
    }

    /// The script that pushes `state` into an already loaded page.
    public func update(_ state: WebViewConsentState) -> String {
        "\(WebViewConsentScripts.update)(\(originsJSON),\(tokenJSON),\(state.json()));"
    }

    /// Whether `origin`, as a WebView reports it, is one of ``origins``.
    public func isAllowed(_ origin: String?) -> Bool {
        guard var origin else { return false }
        if origin.hasSuffix("/") { origin.removeLast() }
        guard let normalized = Self.normalize(origin) else { return false }
        return origins.contains(normalized)
    }

    /// Whether `message` is a preferences request from a page this instance prepared.
    public func isPreferencesRequest(_ message: Any?) -> Bool {
        (message as? String) == preferencesRequest
    }

    private static let pattern = try! NSRegularExpression(
        pattern: #"^(https?)://([a-z0-9-]+(?:\.[a-z0-9-]+)*|\[[0-9a-f:]+\])(?::([0-9]{1,5}))?/?$"#,
        options: [.caseInsensitive]
    )
    private static let loopback: Set<String> = ["localhost", "127.0.0.1", "[::1]"]

    /// The canonical form of `input`, or `nil` when it is not an origin a helper accepts:
    /// `https`, or `http` on a loopback host, with no path, query, fragment, credentials or wildcard.
    public static func normalize(_ input: String) -> String? {
        let range = NSRange(input.startIndex..., in: input)
        guard let match = pattern.firstMatch(in: input, options: [], range: range),
              match.range == range,
              let schemeRange = Range(match.range(at: 1), in: input),
              let hostRange = Range(match.range(at: 2), in: input)
        else { return nil }
        let scheme = input[schemeRange].lowercased()
        let host = input[hostRange].lowercased()
        if scheme == "http" && !loopback.contains(host) { return nil }
        var port = ""
        if let portRange = Range(match.range(at: 3), in: input) {
            guard let number = Int(input[portRange]), (1...65535).contains(number) else { return nil }
            let isDefault = (scheme == "https" && number == 443) || (scheme == "http" && number == 80)
            if !isDefault { port = ":\(number)" }
        }
        return "\(scheme)://\(host)\(port)"
    }

    /// 128 random bits as hex, from the platform CSPRNG, as the subject id draws its
    /// bytes. `SystemRandomNumberGenerator` makes no cryptographic guarantee, so it
    /// is only the fallback on platforms without Security, which no shipping app is.
    public static func newToken() -> String {
        var bytes = [UInt8](repeating: 0, count: 16)
        #if canImport(Security)
        let status = bytes.withUnsafeMutableBytes { buffer -> OSStatus in
            guard let base = buffer.baseAddress else { return errSecParam }
            return SecRandomCopyBytes(kSecRandomDefault, buffer.count, base)
        }
        precondition(status == errSecSuccess, "the platform CSPRNG failed")
        #else
        var generator = SystemRandomNumberGenerator()
        for index in bytes.indices { bytes[index] = UInt8.random(in: 0...255, using: &generator) }
        #endif
        return bytes.map { String(format: "%02x", $0) }.joined()
    }

    static func encode<Value: Encodable>(_ value: Value) -> String {
        let encoder = JSONEncoder()
        // Sorted, so the same state always encodes to the same bytes.
        encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        // Encoding strings, booleans and integers cannot fail.
        let data = (try? encoder.encode(value)) ?? Data("null".utf8)
        return String(decoding: data, as: UTF8.self)
    }
}
