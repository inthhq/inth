import Foundation
import XCTest

@_spi(InthInternal) @testable import InthCore

/// Subject id minting and reading, pinned to `packages/native-protocol/subject-id/uuidv7.json`,
/// which the Kotlin core reads too.
final class SubjectIdTests: XCTestCase {
    private struct Shared: Decodable {
        struct Vector: Decodable {
            let clock: Int64
            let randomHex: String
            let id: String
        }

        struct Read: Decodable {
            let id: String
            let kind: String
        }

        let vectors: [Vector]
        let read: [Read]
    }

    private static func shared() throws -> Shared {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .appendingPathComponent("../../../native-protocol/subject-id/uuidv7.json")
            .standardizedFileURL
        return try JSONDecoder().decode(Shared.self, from: Data(contentsOf: url))
    }

    // MARK: - Minting

    func testGeneratedIdsMatchTheSharedVectors() throws {
        let vectors = try Self.shared().vectors
        XCTAssertFalse(vectors.isEmpty)
        for vector in vectors {
            XCTAssertEqual(
                SubjectId.generate(now: { vector.clock }, entropy: { hexBytes(vector.randomHex) }),
                vector.id,
                "clock \(vector.clock) with random bytes \(vector.randomHex)"
            )
        }
    }

    func testEveryGeneratedIdIsALowercaseUUIDv7() {
        for _ in 0..<500 {
            let id = SubjectId.generate()
            XCTAssertTrue(SubjectId.isUUIDv7(id), "not a UUIDv7: \(id)")
            XCTAssertEqual(SubjectId.kind(of: id), .uuidv7)
        }
        XCTAssertTrue(SubjectId.isUUIDv7(SubjectIdentity.generate().id))
    }

    func testGeneratedIdsAreDistinct() {
        let ids = (0..<1_000).map { _ in SubjectId.generate() }
        XCTAssertEqual(Set(ids).count, ids.count, "two ids came out of the same entropy")
    }

    // MARK: - Reading

    func testReadCasesMatchTheSharedRule() throws {
        let cases = try Self.shared().read
        XCTAssertFalse(cases.isEmpty)
        for entry in cases {
            XCTAssertEqual(SubjectId.kind(of: entry.id).rawValue, entry.kind, "reading \"\(entry.id)\"")

            let store = InMemoryStore()
            store.encode(["id": entry.id], for: StorageKey.subject)
            let read = SubjectIdentity.loadOrCreate(from: store)
            if entry.kind == "unusable" {
                XCTAssertNotEqual(read.identity.id, entry.id, "\(entry.id) must not be adopted")
                XCTAssertEqual(read.unusable?.id, entry.id, "\(entry.id) must be reported")
                XCTAssertTrue(SubjectId.isUUIDv7(read.identity.id), "the replacement is a fresh UUIDv7")
            } else {
                XCTAssertEqual(read.identity.id, entry.id, "\(entry.id) is adopted exactly as stored")
                XCTAssertNil(read.unusable)
            }
        }
    }

    func testThePrereleaseUUIDv4ShapeIsRecognisedForDiagnosisAndNeverAdopted() {
        let legacy = "3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b"
        XCTAssertTrue(SubjectIdentity.isLegacyUUIDv4(legacy))
        XCTAssertFalse(SubjectIdentity.isLegacyUUIDv4(legacy.uppercased()))
        XCTAssertFalse(SubjectIdentity.isValid(legacy))
        XCTAssertThrowsError(try SubjectIdentity(id: legacy))

        let store = InMemoryStore()
        store.encode(["id": legacy], for: StorageKey.subject)
        XCTAssertEqual(SubjectIdentity.loadOrCreate(from: store).unusable?.legacyShape, true)
    }

    // MARK: - Canonical id

    func testOnlyACanonicalUUIDv7ReplacesTheStoredIdAndTheOldOneIsRemembered() throws {
        let store = InMemoryStore()
        store.encode(["id": "sub_2VZxR7YmNpKq3WfLs8TgHd"], for: StorageKey.subject)
        let current = SubjectIdentity.loadOrCreate(from: store).identity

        for ignored in ["sub_1119tDZHoarNxm6kSm3BN6ze9d", "0193E5A8-6F00-7C3A-8A1B-5D2E7F9A0B1C", current.id] {
            XCTAssertNil(SubjectIdentity.adoptCanonical(ignored, replacing: current, previousIds: [], in: store))
        }

        let canonical = "0193e5a8-6f00-7c3a-8a1b-5d2e7f9a0b1c"
        let adopted = try XCTUnwrap(
            SubjectIdentity.adoptCanonical(canonical, replacing: current, previousIds: [], in: store))
        XCTAssertEqual(adopted.identity.id, canonical)
        XCTAssertEqual(adopted.previousIds, [current.id])

        let reread = SubjectIdentity.loadOrCreate(from: store)
        XCTAssertEqual(reread.identity.id, canonical)
        XCTAssertEqual(reread.previousIds, [current.id])
        XCTAssertNil(reread.unusable)
    }
}

/// Two hex characters per byte, or `nil` for anything that is not whole bytes.
private func hexBytes(_ hex: String) -> [UInt8]? {
    guard hex.count.isMultiple(of: 2) else { return nil }
    var bytes: [UInt8] = []
    var index = hex.startIndex
    while index < hex.endIndex {
        let next = hex.index(index, offsetBy: 2)
        guard let byte = UInt8(hex[index..<next], radix: 16) else { return nil }
        bytes.append(byte)
        index = next
    }
    return bytes
}
