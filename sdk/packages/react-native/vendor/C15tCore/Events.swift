import Foundation

/// Something worth telling the host about.
///
/// `snapshot` carries only the new revision. A binding layer pulls the snapshot
/// itself when a mounted subscriber actually needs it, which keeps a consent
/// change from serializing a 23-field object once per listener.
public enum CoreEvent: Sendable, Equatable {
    /// Bootstrap finished: hydration is done and `snapshot()` is answerable.
    case initialized
    /// State changed.
    case snapshot(revision: Int)
    /// A transport or configuration failure.
    case error(CoreErrorInfo)
    /// A save was written to disk and is waiting to be delivered.
    case saveQueued(subjectId: String)
    /// A save reached the backend and left the queue.
    case saveDelivered(subjectId: String)
    /// A queued save was retried. `ok` is the outcome of this attempt.
    case saveReplayed(subjectId: String, ok: Bool)
}

/// Fan-out for ``CoreEvent``.
///
/// Each subscriber gets its own `AsyncStream`, so a slow consumer backpressures
/// itself and does not stall the core or its peers.
final class EventHub: @unchecked Sendable {
    private let lock = Lock()
    private var continuations: [UUID: AsyncStream<CoreEvent>.Continuation] = [:]

    /// A stream of events from the moment this is called.
    ///
    /// - Parameter onTerminate: called when the consumer stops the stream, so a
    ///   per-category gate can drop its own state.
    func stream(onTerminate: (() -> Void)? = nil) -> AsyncStream<CoreEvent> {
        let id = UUID()
        let stream = AsyncStream<CoreEvent> { continuation in
            self.register(id: id, continuation: continuation)
            continuation.onTermination = { _ in
                self.unregister(id: id)
                onTerminate?()
            }
        }
        return stream
    }

    func emit(_ event: CoreEvent) {
        // Copy the continuations out first: yielding runs consumer code, and a
        // consumer that unsubscribes must not be able to deadlock the core.
        let targets = lock.withLock { Array(continuations.values) }
        for continuation in targets {
            continuation.yield(event)
        }
    }

    /// Number of live consumers. Exposed so a test can prove a terminated stream
    /// actually released its slot.
    var subscriberCount: Int {
        lock.withLock { continuations.count }
    }

    private func register(id: UUID, continuation: AsyncStream<CoreEvent>.Continuation) {
        lock.withLock {
            continuations[id] = continuation
        }
    }

    private func unregister(id: UUID) {
        lock.withLock {
            continuations.removeValue(forKey: id)
            ()
        }
    }
}

/// A live registration. It owns the callback it was created for.
///
/// The core holds the callback until this handle is cancelled or released, for
/// every observer method: ``ConsentCore/onChange(_:)`` and both `gate` overloads.
/// A closure written inline keeps firing with nothing else referencing it, so keep
/// the handle for as long as you want updates. Releasing it ends the registration
/// at once, which is why discarding the return value draws a warning.
///
/// Cancelling is idempotent. A callback that captures its owner should capture it
/// weakly, or the owner keeps its own registration alive.
public final class ConsentSubscription: @unchecked Sendable {
    private let lock = Lock()
    private var handlers: [() -> Void] = []
    private var cancelled = false

    init() {}

    /// Add a teardown step. Every registered step runs on cancel, in order.
    func addHandler(_ handler: @escaping () -> Void) {
        let shouldRun = lock.withLock {
            guard !cancelled else { return true }
            handlers.append(handler)
            return false
        }
        if shouldRun { handler() }
    }

    /// Stop receiving updates. Safe to call more than once.
    public func cancel() {
        let pending: [() -> Void] = lock.withLock {
            guard !cancelled else { return [] }
            cancelled = true
            let pending = handlers
            handlers = []
            return pending
        }
        for handler in pending {
            handler()
        }
    }

    deinit {
        cancel()
    }
}

/// Snapshot callbacks, each held strongly until its ``ConsentSubscription`` ends.
///
/// Nothing here is weak. A weakly held callback can be released while the host
/// still expects updates, and then they stop with no error. The handle is what
/// bounds the lifetime instead: cancelling or releasing it removes the entry.
final class ObserverSet: @unchecked Sendable {
    typealias Callback = @Sendable (ConsentSnapshot) -> Void

    private struct Registration {
        let id: UUID
        let callback: Callback
    }

    private let lock = Lock()
    private var registrations: [Registration] = []

    /// Register a callback. Each call is its own registration with its own handle.
    func add(_ callback: @escaping Callback) -> ConsentSubscription {
        let registration = Registration(id: UUID(), callback: callback)
        let subscription = ConsentSubscription()
        lock.withLock { registrations.append(registration) }
        subscription.addHandler { [weak self] in self?.remove(id: registration.id) }
        return subscription
    }

    func remove(id: UUID) {
        lock.withLock { registrations.removeAll { $0.id == id } }
    }

    /// Deliver to every open registration, outside the lock, so a callback that
    /// cancels its own handle cannot deadlock the set.
    func notify(_ snapshot: ConsentSnapshot) {
        let callbacks = lock.withLock { registrations.map(\.callback) }
        for callback in callbacks {
            callback(snapshot)
        }
    }

    var count: Int {
        lock.withLock { registrations.count }
    }
}
