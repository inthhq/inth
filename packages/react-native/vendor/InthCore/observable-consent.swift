#if canImport(Combine)
import Combine
#endif
import Foundation
#if canImport(Observation)
import Observation
#endif

/// Follows a core's event stream and hands each new snapshot to the main actor.
///
/// Both observable models own one of these. It subscribes when it is created, before
/// the model reads its first snapshot, so a change that lands in between still
/// arrives. It is a `let` on the model so the model's nonisolated `deinit` can stop it.
final class MainActorSnapshotFeed: @unchecked Sendable {
    private let lock = Lock()
    private let core: ConsentCore
    private let events: AsyncStream<CoreEvent>
    private var task: Task<Void, Never>?

    init(core: ConsentCore) {
        self.core = core
        self.events = core.eventStream
    }

    /// Start delivering. `receive` runs on the main actor with the core's current
    /// snapshot after every published revision and after bootstrap.
    func start(_ receive: @escaping @MainActor @Sendable (ConsentSnapshot) -> Void) {
        let core = self.core
        let events = self.events
        let task = Task { @MainActor in
            for await event in events {
                switch event {
                case .snapshot, .initialized:
                    // Read the current snapshot on arrival. After a burst of events
                    // that queued behind a busy main thread, the first read already
                    // has the newest revision and the models drop the rest as equal.
                    receive(core.snapshot())
                default:
                    continue
                }
            }
        }
        lock.withLock { self.task = task }
    }

    /// Stop delivering and release the stream's slot on the core.
    func cancel() {
        lock.withLock { task }?.cancel()
    }
}

extension ConsentDecision {
    /// The decision for every category, derived from one snapshot.
    static func all(in snapshot: ConsentSnapshot) -> [ConsentCategory: ConsentDecision] {
        Dictionary(uniqueKeysWithValues: ConsentCategory.allCases.map {
            ($0, ConsentDecision(snapshot: snapshot, category: $0))
        })
    }
}

#if canImport(Combine)
/// A core's consent state for SwiftUI and UIKit, updated on the main actor.
///
/// Works on every OS the package supports. Hold it with `@StateObject` or
/// `@ObservedObject` in SwiftUI, or subscribe to ``decisionPublisher(for:)`` from
/// UIKit. Every update arrives on the main thread, so UI code needs no hop. On iOS 17
/// and later, ``ObservableConsent`` offers the same state through `@Observable`.
///
/// ```swift
/// struct PrivacyStatus: View {
///     @StateObject private var consent = PublishedConsent(core: Inth.current!)
///
///     var body: some View {
///         Text(consent.decision(for: .measurement) == .granted
///             ? "Measurement allowed" : "Measurement off")
///     }
/// }
/// ```
///
/// The model reads state only. Record choices with ``ConsentCore/save(_:expectedRevision:)``
/// or the consent presenter, and the model follows.
@MainActor
public final class PublishedConsent: ObservableObject {
    /// The core this model follows.
    public let core: ConsentCore

    /// The core's current snapshot. Updates once per published revision. A burst of
    /// revisions that arrives while the main thread is busy lands as one update.
    @Published public private(set) var snapshot: ConsentSnapshot

    /// The ``ConsentDecision`` for every category. Reassigned only when a decision
    /// changes, so a subscriber to `$decisions` is not woken by unrelated revisions.
    @Published public private(set) var decisions: [ConsentCategory: ConsentDecision]

    private let feed: MainActorSnapshotFeed

    /// Follow `core` from now on. The core does not have to be bootstrapped yet.
    public init(core: ConsentCore) {
        let feed = MainActorSnapshotFeed(core: core)
        let snapshot = core.snapshot()
        self.core = core
        self.feed = feed
        self.snapshot = snapshot
        self.decisions = ConsentDecision.all(in: snapshot)
        feed.start { [weak self] next in self?.receive(next) }
    }

    deinit { feed.cancel() }

    /// Whether the core has an answer: hydrated, and a policy is in force.
    public var isReady: Bool { snapshot.ready && !snapshot.policyPending }

    /// Why `category` may or may not run, from the current snapshot.
    public func decision(for category: ConsentCategory) -> ConsentDecision {
        decisions[category] ?? .pending
    }

    /// One category's decision, starting with the current one and then on each change.
    /// Delivers on the main thread.
    public func decisionPublisher(for category: ConsentCategory) -> AnyPublisher<ConsentDecision, Never> {
        $decisions
            .map { $0[category] ?? .pending }
            .removeDuplicates()
            .eraseToAnyPublisher()
    }

    private func receive(_ next: ConsentSnapshot) {
        // Revisions only move forward within a core, and an equal snapshot is not news.
        guard next.revision >= snapshot.revision, next != snapshot else { return }
        snapshot = next
        let nextDecisions = ConsentDecision.all(in: next)
        if nextDecisions != decisions { decisions = nextDecisions }
    }
}
#endif

#if canImport(Observation)
/// A core's consent state as an `@Observable` model, updated on the main actor.
///
/// The iOS 17 counterpart of ``PublishedConsent``. Hold it in `@State` or pass it down
/// as a plain property. SwiftUI tracks each property a view reads, so a view that reads
/// only ``decision(for:)`` re-renders when a decision changes, not on every revision.
///
/// ```swift
/// struct PrivacyStatus: View {
///     @State private var consent = ObservableConsent(core: Inth.current!)
///
///     var body: some View {
///         Text(consent.isReady ? "Privacy choices ready" : "Loading privacy choices")
///     }
/// }
/// ```
@available(iOS 17.0, macOS 14.0, tvOS 17.0, watchOS 10.0, *)
@MainActor
@Observable
public final class ObservableConsent {
    /// The core this model follows.
    public let core: ConsentCore

    /// The core's current snapshot. Updates once per published revision.
    public private(set) var snapshot: ConsentSnapshot

    /// The ``ConsentDecision`` for every category. Reassigned only when a decision
    /// changes, so views that read decisions skip unrelated revisions.
    public private(set) var decisions: [ConsentCategory: ConsentDecision]

    private let feed: MainActorSnapshotFeed

    /// Follow `core` from now on. The core does not have to be bootstrapped yet.
    public init(core: ConsentCore) {
        let feed = MainActorSnapshotFeed(core: core)
        let snapshot = core.snapshot()
        self.core = core
        self.feed = feed
        self.snapshot = snapshot
        self.decisions = ConsentDecision.all(in: snapshot)
        feed.start { [weak self] next in self?.receive(next) }
    }

    deinit { feed.cancel() }

    /// Whether the core has an answer: hydrated, and a policy is in force.
    /// Reads ``decisions``, so it tracks the same changes they do.
    public var isReady: Bool { decisions.values.allSatisfy { $0 != .pending } }

    /// Why `category` may or may not run, from the current snapshot.
    public func decision(for category: ConsentCategory) -> ConsentDecision {
        decisions[category] ?? .pending
    }

    private func receive(_ next: ConsentSnapshot) {
        guard next.revision >= snapshot.revision, next != snapshot else { return }
        snapshot = next
        let nextDecisions = ConsentDecision.all(in: next)
        if nextDecisions != decisions { decisions = nextDecisions }
    }
}
#endif
