import Foundation

/// Why a project URL was refused. `reason` is the code shared with the Kotlin and
/// TypeScript SDKs in `native/protocol/project-url/cases.json`.
public struct InthProjectURLError: Error, Equatable, Sendable, LocalizedError, CustomStringConvertible {
    public enum Reason: String, Sendable, Equatable, CaseIterable {
        case empty, malformed, scheme, credentials, host, port, path, query
    }

    public let reason: Reason
    /// The value as the app gave it.
    public let input: String
    /// The option the value came from, such as `backendURL`.
    public let option: String

    public init(reason: Reason, input: String, option: String = "backendURL") {
        self.reason = reason
        self.input = input
        self.option = option
    }

    /// The full sentence to show a developer.
    public var message: String {
        "\(option) must be the project URL from your Inth dashboard, such as "
            + "https://your-project.inth.app. Got \"\(input)\": \(detail)."
    }

    public var description: String { message }
    public var errorDescription: String? { message }

    private var detail: String {
        switch reason {
        case .empty: return "the value is empty"
        case .malformed: return "it is not a URL"
        case .scheme: return "the scheme must be https"
        case .credentials: return "it must not carry a username or password"
        case .host:
            let hosts = InthProjectURL.allowedHostSuffixes.map { "*.\($0)" }.joined(separator: " or ")
            return "the host must be a project host under \(hosts)"
        case .port: return "it must not name a port"
        case .path: return "it must not have a path"
        case .query: return "it must not have a query or a fragment"
        }
    }
}

/// The one rule for the project URL the mobile SDKs accept.
///
/// Parsed by hand so Darwin and Linux Foundation, and the Kotlin and TypeScript
/// SDKs, agree on every case in `native/protocol/project-url/cases.json`.
public enum InthProjectURL {
    /// A project host is at least one label in front of one of these.
    public static let allowedHostSuffixes = ["inth.app"]

    /// The hosts relaxed mode takes over plain `http`.
    static let loopbackHosts: Set<String> = ["localhost", "127.0.0.1", "[::1]"]

    /// Check `input` and return its normal form.
    ///
    /// - Parameters:
    ///   - input: The value as the app gave it. A missing scheme means `https`.
    ///   - relaxed: Take any `https` URL, or `http` on a loopback host, and keep the
    ///     port and path. Only for `dryRun` in a debug build.
    ///   - option: The option name to put at the front of the error message.
    /// - Returns: `https://<lowercased host>` with no trailing slash. Relaxed mode keeps
    ///   the port and path.
    /// - Throws: ``InthProjectURLError`` carrying the first rule that failed.
    public static func normalize(
        _ input: String, relaxed: Bool = false, option: String = "backendURL"
    ) throws -> URL {
        func refuse(_ reason: InthProjectURLError.Reason) -> InthProjectURLError {
            InthProjectURLError(reason: reason, input: input, option: option)
        }

        let trimmed = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { throw refuse(.empty) }
        guard !trimmed.unicodeScalars.contains(where: { CharacterSet.whitespacesAndNewlines.contains($0) })
        else { throw refuse(.malformed) }

        let text = trimmed.contains("://") ? trimmed : "https://" + trimmed
        guard let separator = text.range(of: "://") else { throw refuse(.malformed) }
        let scheme = text[..<separator.lowerBound].lowercased()
        guard scheme == "https" || (relaxed && scheme == "http") else { throw refuse(.scheme) }

        let rest = text[separator.upperBound...]
        let authorityEnd = rest.firstIndex(where: { $0 == "/" || $0 == "?" || $0 == "#" }) ?? rest.endIndex
        let authority = rest[..<authorityEnd]
        let tail = rest[authorityEnd...]

        let hostPort: Substring
        let hasCredentials: Bool
        if let at = authority.lastIndex(of: "@") {
            hostPort = authority[authority.index(after: at)...]
            hasCredentials = true
        } else {
            hostPort = authority
            hasCredentials = false
        }

        guard let (host, port) = split(hostPort), !host.isEmpty else { throw refuse(.malformed) }
        if scheme == "http", !loopbackHosts.contains(host) { throw refuse(.scheme) }
        if hasCredentials { throw refuse(.credentials) }

        if relaxed {
            guard isPlausibleHost(host) else { throw refuse(.malformed) }
        } else {
            guard isProjectHost(host) else { throw refuse(.host) }
            guard port == nil else { throw refuse(.port) }
        }

        let pathEnd = tail.firstIndex(where: { $0 == "?" || $0 == "#" }) ?? tail.endIndex
        var path = String(tail[..<pathEnd])
        while path.hasSuffix("/") { path.removeLast() }
        if !relaxed, !path.isEmpty { throw refuse(.path) }
        if pathEnd != tail.endIndex { throw refuse(.query) }

        let normalized = "\(scheme)://\(host)\(port.map { ":\($0)" } ?? "")\(path)"
        guard let url = URL(string: normalized) else { throw refuse(.malformed) }
        return url
    }

    /// Split `host[:port]`, keeping IPv6 brackets. `nil` when it does not parse.
    private static func split(_ hostPort: Substring) -> (host: String, port: String?)? {
        let host: Substring
        let portText: Substring?
        if hostPort.hasPrefix("[") {
            guard let close = hostPort.firstIndex(of: "]") else { return nil }
            host = hostPort[...close]
            let after = hostPort[hostPort.index(after: close)...]
            if after.isEmpty {
                portText = nil
            } else {
                guard after.hasPrefix(":") else { return nil }
                portText = after.dropFirst()
            }
        } else if let colon = hostPort.firstIndex(of: ":") {
            host = hostPort[..<colon]
            portText = hostPort[hostPort.index(after: colon)...]
        } else {
            host = hostPort
            portText = nil
        }
        // An empty port, as in `host:`, is malformed, as it is in Kotlin and TypeScript.
        guard let portText else { return (host.lowercased(), nil) }
        guard !portText.isEmpty else { return nil }
        guard portText.utf8.allSatisfy({ (48...57).contains($0) }),
              let number = Int(portText), number <= 65_535
        else { return nil }
        return (host.lowercased(), String(portText))
    }

    /// `^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+(suffix)$` for a lowercased host.
    private static func isProjectHost(_ host: String) -> Bool {
        for suffix in allowedHostSuffixes where host.hasSuffix("." + suffix) {
            let labels = host.dropLast(suffix.count + 1).split(separator: ".", omittingEmptySubsequences: false)
            if !labels.isEmpty, labels.allSatisfy(isLabel) { return true }
        }
        return false
    }

    private static func isLabel(_ label: Substring) -> Bool {
        guard let first = label.utf8.first, let last = label.utf8.last else { return false }
        return isAlphanumeric(first) && isAlphanumeric(last)
            && label.utf8.allSatisfy { isAlphanumeric($0) || $0 == 45 }
    }

    private static func isAlphanumeric(_ byte: UInt8) -> Bool {
        (97...122).contains(byte) || (48...57).contains(byte)
    }

    /// Relaxed mode: a DNS name, an IPv4 address or a bracketed IPv6 address.
    private static func isPlausibleHost(_ host: String) -> Bool {
        if host.hasPrefix("[") {
            let inner = host.dropFirst().dropLast()
            return host.hasSuffix("]") && !inner.isEmpty
                && inner.utf8.allSatisfy { (48...57).contains($0) || (97...102).contains($0) || $0 == 58 || $0 == 46 }
        }
        return host.utf8.allSatisfy { isAlphanumeric($0) || $0 == 45 || $0 == 46 }
    }
}

/// Facts about how this copy of the SDK was compiled.
///
/// The SDK ships as source, so it is compiled with the app's own configuration and
/// `DEBUG` here is the app's `DEBUG`.
public enum C15tBuild {
    private static let lock = Lock()
    private static var debugOverride: Bool?

    /// Whether the app was built for debugging. `dryRun` runs only when this is true.
    public static var isDebug: Bool {
        if let forced = lock.withLock({ debugOverride }) { return forced }
        #if DEBUG
        return true
        #else
        return false
        #endif
    }

    /// The error text for `dryRun` in a release build.
    ///
    /// - Parameter remove: Where the app set `dryRun`, to finish the sentence.
    public static func dryRunRefusal(remove: String = "pass it only inside #if DEBUG") -> String {
        "dryRun is for development and CI and cannot run in a release build. Remove dryRun (\(remove))."
    }

    /// Tests only: pretend the build is a debug or a release build. `nil` restores the real answer.
    @_spi(C15tInternal) public static func simulate(debug: Bool?) {
        lock.withLock { debugOverride = debug }
    }
}
