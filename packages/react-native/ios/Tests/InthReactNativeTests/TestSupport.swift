@_spi(InthInternal) import InthCore
@_spi(InthInternal) import InthReactNativeBridge
import Foundation
import XCTest

/// A sink that records what the pump decided to send, in order.
final class RecordingSink: InthEventSink, @unchecked Sendable {
    private let lock = NSLock()
    private var received: [(event: String, payload: String)] = []

    func emit(event: String, payload: String) {
        lock.lock()
        received.append((event, payload))
        lock.unlock()
    }

    var events: [String] {
        lock.lock()
        defer { lock.unlock() }
        return received.map(\.event)
    }

    func payloads(for event: String) -> [String] {
        lock.lock()
        defer { lock.unlock() }
        return received.filter { $0.event == event }.map(\.payload)
    }
}

/// Parse a bridge payload back into a dictionary so assertions name fields instead
/// of comparing whole strings.
func jsonObject(_ raw: String) -> [String: Any] {
    guard let data = raw.data(using: .utf8),
          let parsed = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    else {
        XCTFail("payload is not a JSON object: \(raw)")
        return [:]
    }
    return parsed
}

/// Assert a key is present and holds a real JSON null.
///
/// `JSONSerialization` hands back `NSNull` for null, so `XCTAssertNil` would pass on
/// a key that is simply absent, which is the exact distinction the protocol cares
/// about. This checks presence and null separately.
func assertJSONNull(_ payload: [String: Any], _ key: String, file: StaticString = #filePath, line: UInt = #line) {
    XCTAssertTrue(payload.keys.contains(key), "\(key) must be present", file: file, line: line)
    XCTAssertTrue(payload[key] is NSNull, "\(key) must be explicit null, got \(String(describing: payload[key]))", file: file, line: line)
}

/// Assert a bridge call failed with the expected reason.
///
/// `Result<Void, _>` is not `Equatable`, so comparing the failure by hand is the only
/// way to check the reason rather than merely that something went wrong.
func assertBridgeFailure<ResultType>(
    _ result: Result<ResultType, InthBridgeError>,
    _ expected: InthBridgeError,
    file: StaticString = #filePath,
    line: UInt = #line
) {
    guard case let .failure(error) = result else {
        return XCTFail("expected \(expected.code), got success", file: file, line: line)
    }
    XCTAssertEqual(error, expected, file: file, line: line)
}

/// The project URL the tests configure. Nothing is sent to it.
let testProjectURL = "https://your-project.inth.app"

/// A memory-backed configuration, so no test touches the Keychain. Start it with
/// ``startMemoryCore(_:)`` so it does not touch the network either.
func memoryConfiguration() -> InthBridgeConfiguration {
    InthBridgeConfiguration(
        autoBootstrap: true,
        backendURL: testProjectURL,
        domain: nil,
        storageMode: .memory,
        keychainService: InthBridgeConfiguration.defaultKeychainService,
        overrides: ConsentOverrides(country: nil, region: nil, language: "de", gpc: nil),
        consentCategories: nil,
        gpc: nil
    )
}

/// Start the bridge's core through its own start path, with no transport behind it,
/// so the async commands are no-ops and no test opens a socket.
@discardableResult
func startMemoryCore(_ configuration: InthBridgeConfiguration = memoryConfiguration()) -> Bool {
    InthReactNativeBootstrap.start(configuration: configuration, fileStoreDirectory: nil, transport: { _ in nil })
}

/// ``startMemoryCore(_:)`` for a launch that reads `Info.plist`.
@discardableResult
func startWithoutNetwork(infoPlist: [String: Any]) -> Bool {
    InthReactNativeBootstrap.start(infoPlist: infoPlist, fileStoreDirectory: nil, transport: { _ in nil })
}

/// A transport that counts what the core asked it to send, and decides whether a save is
/// deliverable.
///
/// Each lifecycle leg this package wires has exactly one observable effect: a
/// `POST /subjects` that goes out again, and an `/init` that asks again. Neither shows up
/// in a snapshot, so counting the calls is the whole measurement.
///
/// Init serves an `unconfigured` policy resolution rather than a matched rule. That is
/// deliberate: a non-matched outcome still resolves to the safe opt-in fallback, whose
/// scope covers every optional category, so `ConsentCore/save(_:)` has a scope to be made
/// against and the queue holds real bytes. Hand-building a matched rule here would copy
/// `Fixture` from the core's own suite for no extra coverage.
final class RecordingTransport: InthTransport, @unchecked Sendable {
    let domain = "recording"

    private let lock = NSLock()
    private var _initCount = 0
    private var _saveCount = 0
    private var _savesFail = true

    /// Whether a save is refused, which is what keeps a queued entry in the queue where a
    /// test can watch it leave.
    var savesFail: Bool {
        get {
            lock.lock()
            defer { lock.unlock() }
            return _savesFail
        }
        set {
            lock.lock()
            _savesFail = newValue
            lock.unlock()
        }
    }

    var initCount: Int {
        lock.lock()
        defer { lock.unlock() }
        return _initCount
    }

    var saveCount: Int {
        lock.lock()
        defer { lock.unlock() }
        return _saveCount
    }

    func performInit(_ context: InitContext) async -> Result<InitResponse, InthError> {
        lock.lock()
        _initCount += 1
        lock.unlock()
        return .success(InitResponse(policyResolution: Self.unconfiguredResolution))
    }

    func sendSave(_ body: Data) async -> Result<Void, InthError> {
        lock.lock()
        _saveCount += 1
        let failing = _savesFail
        lock.unlock()
        // `.offline` rather than an HTTP status: a body the producer refused outright is
        // dropped by design, and a drop would empty the queue for the wrong reason.
        if failing { return .failure(.offline) }
        return .success(())
    }

    func patchIdentity(
        subjectId: String,
        externalId: String,
        identityProvider: String?
    ) async -> Result<Void, InthError> {
        .success(())
    }

    /// The smallest policy resolution the core's wire reader accepts as an answer: a
    /// non-matched outcome, which evaluates against the safe fallback rather than leaving
    /// `policyPending` set.
    static let unconfiguredResolution: JSONValue = .object([
        "version": .integer(Int64(inthPolicyContractVersion)),
        "status": .string("unconfigured"),
        "policy": .null,
    ])
}
