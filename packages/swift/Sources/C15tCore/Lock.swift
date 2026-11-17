import Foundation

/// Mutual exclusion for one owner's state. Core hot reads share only the
/// in-memory lock; storage queues and stores own independent instances.
final class Lock: Sendable {
    private let lock = NSLock()

    func withLock<Result>(_ body: () throws -> Result) rethrows -> Result {
        lock.lock()
        defer { lock.unlock() }
        return try body()
    }
}
