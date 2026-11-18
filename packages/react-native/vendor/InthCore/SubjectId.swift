import Foundation

#if canImport(Security)
import Security
#endif

/// Generates and reads Inth subject ids: lowercase UUIDv7 text.
///
/// `packages/native-protocol/subject-id/uuidv7.json` pins the layout, and the Kotlin
/// core mints the same ids from the same clock and random bytes:
///
/// - bytes 0 to 5: milliseconds since the Unix epoch, big-endian, clamped to
///   `0...2^48 - 1`, so a device with a wrong clock still writes an id the backend
///   accepts.
/// - byte 6: `0x70 | (random[0] & 0x0f)`; byte 7: `random[1]`.
/// - byte 8: `0x80 | (random[2] & 0x3f)`; bytes 9 to 15: `random[3...9]`.
///
/// The same generator makes each save's idempotency key.
enum SubjectId {
    /// Random bytes per id. The clock takes the other six.
    static let randomByteCount = 10

    /// The largest clock a UUIDv7 can hold: 48 bits of milliseconds.
    static let maxClock: Int64 = (1 << 48) - 1

    /// What a stored id is, by the `read` rule in `uuidv7.json`.
    enum Kind: String, Sendable, Equatable {
        /// A lowercase UUIDv7, the form this SDK writes.
        case uuidv7
        /// A `sub_` id a c15t client stored. Adopted and sent as it is, because every
        /// `/v1` route that takes a subject id maps it to the canonical UUID.
        case c15t
        /// Anything else. Never adopted.
        case unusable
    }

    /// The c15t alphabet (Bitcoin base58): no `0`, `O`, `I`, or `l`.
    private static let base58 =
        Set("123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz")

    private static let lowerHex = Set("0123456789abcdef")

    /// A fresh id, from the wall clock and the system CSPRNG.
    static func generate() -> String {
        generate(now: Self.currentMillis, entropy: Self.systemRandomBytes)
    }

    /// The same id with both sources pinned, which is the shape the shared vectors
    /// are written in.
    ///
    /// - Precondition: `entropy()` answers with exactly ``randomByteCount`` bytes. A
    ///   CSPRNG that will not answer has no acceptable substitute, because every
    ///   fallback is either guessable or a persistent device identifier, and the point
    ///   of the id is that it is neither.
    static func generate(now: () -> Int64, entropy: () -> [UInt8]?) -> String {
        guard let random = entropy(), random.count == Self.randomByteCount else {
            preconditionFailure("a subject id needs \(Self.randomByteCount) CSPRNG bytes")
        }
        let clock = UInt64(min(max(now(), 0), Self.maxClock))
        var bytes = [UInt8](repeating: 0, count: 16)
        for index in 0..<6 {
            bytes[index] = UInt8(truncatingIfNeeded: clock >> (8 * (5 - index)))
        }
        bytes[6] = 0x70 | (random[0] & 0x0f)
        bytes[7] = random[1]
        bytes[8] = 0x80 | (random[2] & 0x3f)
        for index in 3..<10 {
            bytes[6 + index] = random[index]
        }

        var text = ""
        text.reserveCapacity(36)
        for (index, byte) in bytes.enumerated() {
            if [4, 6, 8, 10].contains(index) { text.append("-") }
            text.append(String(format: "%02x", byte))
        }
        return text
    }

    /// Classify a stored id by the `read` rule.
    static func kind(of candidate: String) -> Kind {
        if isUUIDv7(candidate) { return .uuidv7 }
        if isC15t(candidate) { return .c15t }
        return .unusable
    }

    /// Whether `candidate` is an id this build can use: a UUIDv7 or a c15t `sub_` id.
    static func isValid(_ candidate: String) -> Bool {
        kind(of: candidate) != .unusable
    }

    /// A lowercase UUIDv7 with the RFC 4122 variant. The version and variant checks
    /// already rule out the nil and max UUIDs.
    static func isUUIDv7(_ candidate: String) -> Bool {
        let characters = Array(candidate)
        guard characters.count == 36 else { return false }
        for (index, character) in characters.enumerated() {
            if [8, 13, 18, 23].contains(index) {
                guard character == "-" else { return false }
            } else if !Self.lowerHex.contains(character) {
                return false
            }
        }
        return characters[14] == "7" && "89ab".contains(characters[19])
    }

    /// The c15t form: `^sub_[1-9A-HJ-NP-Za-km-z]+$`.
    static func isC15t(_ candidate: String) -> Bool {
        guard candidate.hasPrefix("sub_") else { return false }
        let encoded = candidate.dropFirst(4)
        return !encoded.isEmpty && encoded.allSatisfy(Self.base58.contains)
    }

    /// Wall clock in epoch milliseconds, the reading `CoreConfig.now` defaults to.
    private static func currentMillis() -> Int64 {
        Int64(Date().timeIntervalSince1970 * 1_000)
    }

    /// ``randomByteCount`` bytes from the platform CSPRNG, or `nil`. Not
    /// `SystemRandomNumberGenerator`, which Swift documents as making no cryptographic
    /// guarantee; a subject id is the one value here that needs one.
    private static func systemRandomBytes() -> [UInt8]? {
        #if canImport(Security)
        var bytes = [UInt8](repeating: 0, count: Self.randomByteCount)
        let status = bytes.withUnsafeMutableBytes { buffer in
            guard let base = buffer.baseAddress else { return errSecParam }
            return SecRandomCopyBytes(kSecRandomDefault, buffer.count, base)
        }
        return status == errSecSuccess ? bytes : nil
        #else
        return nil
        #endif
    }
}
