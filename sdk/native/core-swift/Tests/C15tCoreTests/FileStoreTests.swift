@_spi(C15tInternal) import C15tCore
import Foundation
import XCTest

final class FileStoreTests: XCTestCase {
    func testCheckedReadDistinguishesMissingEmptyAndFailedReads() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let store: any ConsentStore = FileStore(directory: directory)
        XCTAssertNil(try store.read(for: StorageKey.subject))
        XCTAssertTrue(store.set(Data(), for: StorageKey.subject))
        XCTAssertEqual(try store.read(for: StorageKey.subject), Data())
        XCTAssertNil(store.data(for: StorageKey.subject))

        let file = try XCTUnwrap(FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil).first)
        try FileManager.default.removeItem(at: file)
        try FileManager.default.createDirectory(at: file, withIntermediateDirectories: false)
        XCTAssertThrowsError(try store.read(for: StorageKey.subject))
        XCTAssertNil(store.data(for: StorageKey.subject))
    }

    func testReplacementSurvivesReopeningAndDeletionRemovesTheFile() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = FileStore(directory: directory)
        XCTAssertTrue(store.set(Data(repeating: 1, count: 4096), for: StorageKey.snapshot))
        let replacement = Data("replacement".utf8)
        XCTAssertTrue(store.set(replacement, for: StorageKey.snapshot))
        XCTAssertEqual(FileStore(directory: directory).data(for: StorageKey.snapshot), replacement)

        XCTAssertTrue(store.set(nil, for: StorageKey.snapshot))
        XCTAssertNil(FileStore(directory: directory).data(for: StorageKey.snapshot))
        XCTAssertEqual(try FileManager.default.contentsOfDirectory(atPath: directory.path), [])
    }

    #if (os(iOS) || os(tvOS) || os(watchOS) || os(visionOS)) && !targetEnvironment(macCatalyst)
    func testPhysicalDeviceFileUsesCompleteProtection() throws {
        #if targetEnvironment(simulator)
        throw XCTSkip("The simulator filesystem does not expose Data Protection attributes. Verify protection and unlock behavior on a physical device.")
        #else
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        XCTAssertTrue(FileStore(directory: directory).set(Data("protected".utf8), for: StorageKey.snapshot))
        let files = try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)
        let attributes = try FileManager.default.attributesOfItem(atPath: XCTUnwrap(files.first).path)
        XCTAssertEqual(attributes[.protectionKey] as? FileProtectionType, .complete)
        #endif
    }
    #endif

    func testUnwritableDirectoryReportsFailure() throws {
        let path = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: path) }
        try Data("not a directory".utf8).write(to: path)
        let store = FileStore(directory: path)
        XCTAssertFalse(store.set(Data("refused".utf8), for: StorageKey.snapshot))
        XCTAssertThrowsError(try store.read(for: StorageKey.snapshot))
        XCTAssertNil(store.data(for: StorageKey.snapshot))
        XCTAssertEqual(try Data(contentsOf: path), Data("not a directory".utf8))
    }
}
