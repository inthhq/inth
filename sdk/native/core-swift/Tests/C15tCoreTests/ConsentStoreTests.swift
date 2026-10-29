import C15tCore
import Foundation
import XCTest

final class ConsentStoreTests: XCTestCase {
    func testMemoryCheckedReadReturnsMissingAndStoredBytes() throws {
        let store: any ConsentStore = InMemoryStore()
        XCTAssertNil(try store.read(for: StorageKey.subject))
        XCTAssertTrue(store.set(Data(), for: StorageKey.subject))
        XCTAssertEqual(try store.read(for: StorageKey.subject), Data())
        let value = Data("subject".utf8)
        XCTAssertTrue(store.set(value, for: StorageKey.subject))
        XCTAssertEqual(try store.read(for: StorageKey.subject), value)
    }

    func testLegacyStoreCheckedReadRefusesAmbiguousNil() throws {
        let store: any ConsentStore = LegacyStore()
        XCTAssertThrowsError(try store.read(for: StorageKey.subject)) {
            XCTAssertEqual($0 as? ConsentStoreReadError, .unavailable)
        }
        let value = Data("subject".utf8)
        XCTAssertTrue(store.set(value, for: StorageKey.subject))
        XCTAssertEqual(try store.read(for: StorageKey.subject), value)
    }
}

private final class LegacyStore: ConsentStore, Sendable {
    private let underlying = InMemoryStore()

    func data(for key: String) -> Data? { underlying.data(for: key) }
    func set(_ data: Data?, for key: String) -> Bool { underlying.set(data, for: key) }
}
