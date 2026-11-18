import Foundation

/// GPP string encoding: the header, Fibonacci ranges, compressed base64url and the
/// fixed-width US National section.
///
/// A port of `packages/sdk/iab/src/gpp/encoder.ts`, and a function-for-function mirror of
/// `core-android`'s `GppEncoder.kt`. `packages/native-protocol/gpp/cases.json` holds the strings
/// both cores and the web encoder must produce, and the `@c15t/iab` test
/// `native-gpp-fixtures.test.ts` decodes every one with the IAB reference library.
public enum GPPEncoder {
    /// Section ID of the GPP header.
    public static let headerID = 3
    /// Version of the GPP header.
    public static let headerVersion = 1

    private static let base64URL = Array("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_")
    /// Fibonacci terms past this many cannot code any section ID or offset.
    private static let maxFibonacciTerms = 40

    /// A value that does not fit its field.
    public struct FieldOverflow: Error, Equatable {
        public let message: String
    }

    /// Appends `value` as a big-endian bit string `bits` wide.
    static func fixedInteger(_ value: Int, bits: Int, into out: inout [Bool]) throws {
        guard (1...30).contains(bits), value >= 0, value < (1 << bits) else {
            throw FieldOverflow(message: "GPP: \(value) does not fit in \(bits) bits.")
        }
        for shift in stride(from: bits - 1, through: 0, by: -1) {
            out.append((value >> shift) & 1 == 1)
        }
    }

    /// Appends the Fibonacci code of a positive integer, which ends in `11`.
    static func fibonacciInteger(_ value: Int, into out: inout [Bool]) throws {
        guard value >= 1 else {
            throw FieldOverflow(message: "GPP: a Fibonacci integer must be positive, got \(value).")
        }
        var sequence = [1, 2]
        while sequence[sequence.count - 1] + sequence[sequence.count - 2] <= value,
            sequence.count < maxFibonacciTerms {
            sequence.append(sequence[sequence.count - 1] + sequence[sequence.count - 2])
        }
        var remaining = value
        var digits = Array(repeating: false, count: sequence.count)
        for index in sequence.indices.reversed() where sequence[index] <= remaining {
            digits[index] = true
            remaining -= sequence[index]
        }
        while digits.last == false { digits.removeLast() }
        out.append(contentsOf: digits)
        out.append(true)
    }

    /// Appends sorted, distinct integers as a Fibonacci-coded range: a 12-bit group
    /// count, then each run as an offset from the end of the previous one.
    static func fibonacciRange(_ values: [Int], into out: inout [Bool]) throws {
        var groups: [ClosedRange<Int>] = []
        for value in Set(values).sorted() {
            if let last = groups.last, last.upperBound == value - 1 {
                groups[groups.count - 1] = last.lowerBound...value
            } else {
                groups.append(value...value)
            }
        }
        try fixedInteger(groups.count, bits: 12, into: &out)
        var offset = 0
        for group in groups {
            if group.lowerBound == group.upperBound {
                out.append(false)
                try fibonacciInteger(group.lowerBound - offset, into: &out)
            } else {
                out.append(true)
                try fibonacciInteger(group.lowerBound - offset, into: &out)
                try fibonacciInteger(group.upperBound - group.lowerBound, into: &out)
            }
            offset = group.upperBound
        }
    }

    /// Base64url without padding characters. The bit string is padded with zeros to a
    /// whole byte, then to a whole character, as GPP's compressed encoding requires.
    static func compressedBase64URL(_ bits: [Bool]) -> String {
        let byteBits = (bits.count + 7) / 8 * 8
        let total = (byteBits + 5) / 6 * 6
        var out = ""
        out.reserveCapacity(total / 6)
        var index = 0
        while index < total {
            var sextet = 0
            for offset in 0..<6 {
                let position = index + offset
                sextet = (sextet << 1) | (position < bits.count && bits[position] ? 1 : 0)
            }
            out.append(base64URL[sextet])
            index += 6
        }
        return out
    }

    /// Encodes one subsection from its field table. Absent fields encode as `0`.
    static func encodeSubsection(_ fields: [GPPField], values: [String: [Int]]) throws -> String {
        var bits: [Bool] = []
        for field in fields {
            let value = values[field.name]
            if let count = field.count {
                let entries = value ?? Array(repeating: 0, count: count)
                guard entries.count == count else {
                    throw FieldOverflow(message: "GPP: \(field.name) needs \(count) entries.")
                }
                for entry in entries { try fixedInteger(entry, bits: field.bits, into: &bits) }
            } else {
                try fixedInteger(value?.first ?? 0, bits: field.bits, into: &bits)
            }
        }
        return compressedBase64URL(bits)
    }

    /// Encodes the US National section: the core subsection, then the GPC subsection.
    ///
    /// - Parameters:
    ///   - core: Field values by specification name; a scalar is a one-entry list.
    ///   - gpc: The Global Privacy Control flag.
    /// - Throws: ``FieldOverflow`` when a value does not fit its field.
    public static func encodeUSNational(core: [String: [Int]], gpc: Bool) throws -> String {
        var gpcBits: [Bool] = []
        try fixedInteger(GPPUSNational.gpcSubsectionType, bits: 2, into: &gpcBits)
        gpcBits.append(gpc)
        return try encodeSubsection(GPPUSNational.core, values: core) + "." + compressedBase64URL(gpcBits)
    }

    /// Joins sections into a GPP string behind a header listing their IDs, in
    /// ascending ID order. `nil` when there is no section.
    public static func encodeGPPString(_ sections: [GPPSection]) throws -> String? {
        guard !sections.isEmpty else { return nil }
        let ordered = sections.sorted { $0.id < $1.id }
        var header: [Bool] = []
        try fixedInteger(headerID, bits: 6, into: &header)
        try fixedInteger(headerVersion, bits: 6, into: &header)
        try fibonacciRange(ordered.map(\.id), into: &header)
        return ([compressedBase64URL(header)] + ordered.map(\.encoded)).joined(separator: "~")
    }
}

/// One field of a GPP subsection: its specification name, width, and list length.
public struct GPPField: Sendable, Equatable {
    public let name: String
    public let bits: Int
    public let count: Int?

    public init(_ name: String, bits: Int, count: Int? = nil) {
        self.name = name
        self.bits = bits
        self.count = count
    }
}

/// One encoded section of a GPP string.
public struct GPPSection: Sendable, Equatable {
    public let id: Int
    public let encoded: String

    public init(id: Int, encoded: String) {
        self.id = id
        self.encoded = encoded
    }
}

/// The MSPA US National section, version 2: `US_NATIONAL_SECTION` in
/// `packages/sdk/iab/src/gpp/sections.ts`.
///
/// Version 3 (November 2026) replaced every field. No IAB reference decoder reads it
/// yet, and web Inth encodes version 2, so this build does too. See `packages/native-protocol/CONTRACT.md`.
public enum GPPUSNational {
    public static let id = 7
    public static let version = 2
    public static let prefix = "usnat"
    static let gpcSubsectionType = 1

    private static func int(_ name: String) -> GPPField { GPPField(name, bits: 2) }

    /// Core subsection fields, in encoding order.
    public static let core: [GPPField] = [
        GPPField("Version", bits: 6),
        int("SharingNotice"),
        int("SaleOptOutNotice"),
        int("SharingOptOutNotice"),
        int("TargetedAdvertisingOptOutNotice"),
        int("SensitiveDataProcessingOptOutNotice"),
        int("SensitiveDataLimitUseNotice"),
        int("SaleOptOut"),
        int("SharingOptOut"),
        int("TargetedAdvertisingOptOut"),
        GPPField("SensitiveDataProcessing", bits: 2, count: 16),
        GPPField("KnownChildSensitiveDataConsents", bits: 2, count: 3),
        int("PersonalDataConsents"),
        int("MspaCoveredTransaction"),
        int("MspaOptOutOptionMode"),
        int("MspaServiceProviderMode"),
    ]
}

/// Section ID of IAB TCF EU v2 inside a GPP string.
public let gppTCFEUSectionID = 2
