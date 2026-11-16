import Foundation

/// Serializes mutation preparation, durable commit and in-memory publication.
/// Hot reads never acquire this gate. Release before snapshot callbacks and network work.
final class MutationGate: @unchecked Sendable {
    private let lock = NSLock()

    func acquire() -> MutationPermit {
        lock.lock()
        return MutationPermit { self.lock.unlock() }
    }
}

final class MutationPermit {
    private var unlock: (() -> Void)?

    init(_ unlock: @escaping () -> Void) { self.unlock = unlock }

    func release() {
        let action = unlock
        unlock = nil
        action?()
    }
}
