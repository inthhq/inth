import InthApple
import InthConsentUI
import InthCore
import Combine
import Foundation

@MainActor
final class AppConsentModel: ObservableObject {
    @Published private(set) var snapshot: ConsentSnapshot?
    @Published private(set) var presenter: ConsentPresenter?
    @Published private(set) var installationError: Error?
    @Published private(set) var queuedSaves = 0
    @Published private(set) var deliveryMessage = "No delivery attempt observed this launch."
    @Published private(set) var eventCount = 0
    private(set) var core: ConsentCore?
    let measurement = MeasurementService()
    private let makeCore: () throws -> ConsentCore
    private let stockUI: Bool
    /// Retained for its updates: `$snapshot` stops when this model is released.
    private var state: PublishedConsent?
    private var snapshotUpdates: AnyCancellable?
    private var measurementGate: ConsentSubscription?
    private var eventsTask: Task<Void, Never>?

    init(stockUI: Bool, makeCore: @escaping () throws -> ConsentCore) {
        self.stockUI = stockUI
        self.makeCore = makeCore
        install()
    }

    var ready: Bool { snapshot.map { $0.ready && !$0.policyPending } ?? false }
    var decision: ConsentDecision { core?.decision(for: .measurement) ?? .pending }

    func retryProtectedStorage() {
        guard installationError as? InthAppleInstallationError == .protectedStorageUnavailable else { return }
        install()
    }

    private func install() {
        guard core == nil else { return }
        do {
            let installed = try makeCore()
            core = installed
            installationError = nil
            // #region docs:swiftui-snapshot title="Sources/app-consent-model.swift"
            // PublishedConsent updates on the main actor, so this sink needs no hop.
            // `$snapshot` delivers the current value first, then each new revision.
            let state = PublishedConsent(core: installed)
            snapshotUpdates = state.$snapshot.sink { [weak self] in self?.receive($0) }
            self.state = state
            // #endregion docs:swiftui-snapshot
            // #region docs:swiftui-observe title="Sources/app-consent-model.swift"
            measurementGate = installed.gate(ConsentCategory.measurement) { [measurement] decision in
                // The callback can run on any queue. This service synchronizes its own state.
                measurement.apply(decision)
            }
            // #endregion docs:swiftui-observe
            if stockUI { presenter = ConsentPresenter(core: installed) }
            let events = installed.eventStream
            eventsTask = Task { [weak self] in
                for await event in events {
                    guard !Task.isCancelled else { break }
                    self?.receive(event)
                }
            }
        } catch {
            installationError = error
            measurement.stop()
        }
    }

    private func receive(_ snapshot: ConsentSnapshot) {
        self.snapshot = snapshot
        queuedSaves = core?.pendingSaveCount() ?? 0
    }

    private func receive(_ event: CoreEvent) {
        switch event {
        case .saveQueued: deliveryMessage = "Saved on this device. Delivery is queued."
        case .saveDelivered: deliveryMessage = "A consent record reached the backend."
        case .saveReplayed(_, let ok):
            deliveryMessage = ok ? "A queued consent record reached the backend." : "Delivery retry failed. Check the queue and transport error."
        case .error(let error): deliveryMessage = "Transport or storage error: \(error.code)."
        case .policyStale: deliveryMessage = "The bundled policy has expired. Connect to refresh it."
        case .initialized, .snapshot: break
        }
        if let core { receive(core.snapshot()) }
    }

    func recordTap() {
        guard let core else { return }
        eventCount = measurement.recordTap(core: core)
    }

    deinit {
        snapshotUpdates?.cancel()
        measurementGate?.cancel()
        eventsTask?.cancel()
        measurement.stop()
    }
}
