#if canImport(InthCore)
// SwiftPM builds the consent kernel as its own module. CocoaPods compiles the vendored
// copy into this module instead, where the import would fail, so it is conditional
// rather than assumed.
import InthCore
#endif
import Foundation

/// Where the pump pushes an event. The module wires it to the React emitter.
///
/// Kept as a protocol so the pump can be tested against a recording double, and so
/// nothing in this file has to know what React Native is.
public protocol InthEventSink: AnyObject {
    /// Deliver `payload` for `event` to JavaScript.
    func emit(event: String, payload: String)
}

/// Turns core state changes into the three events the contract defines.
///
/// A `snapshot` event carries the new revision and a dirty flag and nothing else, so
/// the whole snapshot is never copied across the bridge for a subscriber that already
/// holds it: JavaScript compares the revision and pulls `getSnapshot()` when it cares.
/// That is also why a dropped event costs nothing.
///
/// Emission is deduplicated by revision. The core publishes a new snapshot per
/// mutation and JavaScript must see exactly one event per committed change, so the
/// comparison lives here rather than in JavaScript, where two callers would each have
/// to get it right.
///
/// The dedup is safe only because of the rule this pump depends on: one committed
/// mutation is one revision bump and one publication, together, and `error` is
/// ordinary snapshot state, so an error always arrives on a new revision. See
/// "Revisions and error writes" in `packages/native-protocol/CONTRACT.md`. A core that bumps without
/// publishing hands this pump nothing to announce.
public final class InthChangePump: @unchecked Sendable {
    private let lock = NSLock()
    private let sink: any InthEventSink

    private var lastRevision = InthChangePump.unsetRevision
    private var initializedAnnounced = false

    /// - Parameter sink: Receiver for the events this pump decides to send.
    public init(sink: any InthEventSink) {
        self.sink = sink
    }

    /// Report a published snapshot, emitting at most one `snapshot` event for it.
    public func onSnapshot(_ snapshot: ConsentSnapshot) {
        lock.lock()
        guard snapshot.revision != lastRevision else {
            lock.unlock()
            return
        }
        lastRevision = snapshot.revision
        // `initialized` is derived from state rather than from the core's
        // `.initialized` event, because the core emits that during bootstrap, which
        // runs before anything here is attached to hear it.
        let announceInitialized = !initializedAnnounced && !snapshot.policyPending
        if announceInitialized {
            initializedAnnounced = true
        }
        lock.unlock()

        sink.emit(event: InthPayload.eventSnapshot, payload: InthPayload.snapshotEvent(revision: snapshot.revision))
        if announceInitialized {
            sink.emit(event: InthPayload.eventInitialized, payload: InthPayload.initializedEvent(revision: snapshot.revision))
        }
    }

    /// Report an error the core emitted, in the `NativeSnapshotError` shape.
    public func onError(code: String, message: String) {
        sink.emit(event: InthPayload.eventError, payload: InthPayload.errorEvent(code: code, message: message))
    }

    /// A revision no snapshot can have, so the first one always emits.
    private static let unsetRevision = Int.min
}

/// Holds the core subscriptions a React module needs, and feeds them to a pump.
///
/// Exists as its own type so the subscriptions are installed once, against whichever
/// core is running, without the module growing the bookkeeping itself. The snapshot
/// handle it keeps owns the callback, so the module hears changes until it detaches.
///
/// Nothing here is React-specific, which is what makes the event behaviour testable
/// without Pods installed.
public final class InthCoreSubscriber: @unchecked Sendable {
    private let lock = NSLock()
    private let pump: InthChangePump

    private var snapshotSubscription: ConsentSubscription?
    private var errorStreamTask: Task<Void, Never>?
    private var attachedCore: ConsentCore?

    /// - Parameter sink: Receiver for the events produced by the pump.
    public init(sink: any InthEventSink) {
        self.pump = InthChangePump(sink: sink)
    }

    /// Start following `core`. Idempotent per core; attaching to a different core
    /// than the one already followed drops the old subscriptions first.
    public func attach(to core: ConsentCore) {
        lock.lock()
        if attachedCore === core, snapshotSubscription != nil {
            lock.unlock()
            return
        }
        let previous = (snapshotSubscription, errorStreamTask)
        attachedCore = core
        // Captures the pump, not `self`: the core holds this closure until the handle
        // ends, and a closure holding `self` would keep `deinit` from ever detaching.
        snapshotSubscription = core.onChange { [pump] snapshot in pump.onSnapshot(snapshot) }
        lock.unlock()

        previous.0?.cancel()
        previous.1?.cancel()

        // Errors arrive on the core's stream. Snapshot changes arrive through the
        // observer, so the stream only has to carry the failure half.
        errorStreamTask = Task { [pump, weak core] in
            guard let core else { return }
            for await event in core.eventStream {
                if Task.isCancelled { return }
                if case let .error(info) = event {
                    pump.onError(code: info.code, message: info.message)
                }
            }
        }

        // Anything the core published between launch and this subscription is not
        // lost: JavaScript pulls the snapshot on mount, and reporting the current one
        // here is what announces `initialized` for a policy that resolved early.
        pump.onSnapshot(core.snapshot())
    }

    /// Stop following the core. Called when React tears the module down.
    public func detach() {
        lock.lock()
        let subscription = snapshotSubscription
        let task = errorStreamTask
        snapshotSubscription = nil
        errorStreamTask = nil
        attachedCore = nil
        lock.unlock()

        subscription?.cancel()
        task?.cancel()
    }

    /// Report a published snapshot.
    public func report(_ snapshot: ConsentSnapshot) {
        pump.onSnapshot(snapshot)
    }

    deinit {
        detach()
    }
}
