import C15tCore
import Foundation

/// A local counter with explicit start/stop, standing in for an analytics SDK.
/// No network requests, identifiers or automatic collection.
final class MeasurementService: @unchecked Sendable {
    private let lock = NSLock()
    private var collecting = false
    private var count = 0

    func apply(_ decision: ConsentDecision) {
        lock.lock()
        defer { lock.unlock() }
        collecting = decision == .granted
    }

    func stop() { apply(.denied) }

    var isCollecting: Bool {
        lock.lock()
        defer { lock.unlock() }
        return collecting
    }

    func recordTap(core: ConsentCore) -> Int {
        lock.lock()
        defer { lock.unlock() }
        // Check again at use, before any event work. A queued UI callback is no authority.
        guard collecting, core.decision(for: .measurement) == .granted else { return count }
        count += 1
        return count
    }
}
