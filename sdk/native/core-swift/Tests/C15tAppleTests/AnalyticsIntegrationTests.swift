import C15tApple
import C15tCore
import Foundation
import XCTest

final class AnalyticsIntegrationTests: XCTestCase {
    func testFirebasePendingAndDeniedKeepCollectionOffAndAdvertisingDenied() async throws {
        let core = ConsentCore()
        let recorder = AnalyticsCalls()
        let integration = firebase(core, recorder)
        XCTAssertEqual(recorder.events, [.collection(false), .consent(false)])
        XCTAssertEqual(core.decision(for: .measurement), .pending)

        try await bootstrap(core)
        XCTAssertEqual(core.decision(for: .measurement), .denied)
        XCTAssertEqual(recorder.events, [.collection(false), .consent(false)])
        XCTAssertTrue(recorder.consents.allSatisfy { !$0.adStorage && !$0.adUserData && !$0.adPersonalization })
        integration.cancel()
    }

    func testFirebaseGrantWithdrawalAndUnrelatedChangesApplyInOrder() async throws {
        let core = try await resolvedCore()
        let recorder = AnalyticsCalls()
        let integration = firebase(core, recorder)
        recorder.clear()

        XCTAssertEqual(core.save(.custom([.measurement: true])).status, .committed)
        XCTAssertEqual(recorder.events, [.collection(false), .consent(true), .collection(true)])
        recorder.clear()
        XCTAssertEqual(core.save(.custom([.experience: true])).status, .committed)
        XCTAssertTrue(recorder.events.isEmpty)

        XCTAssertEqual(core.save(.necessary).status, .committed)
        XCTAssertEqual(recorder.events, [.collection(false), .consent(false)])
        integration.cancel()
        await core.waitUntilIdle()
    }

    func testFirebaseGrantsAdvertisingFromMarketingAsTheWebDoes() async throws {
        let core = try await resolvedCore()
        let recorder = AnalyticsCalls()
        let integration = firebase(core, recorder)
        recorder.clear()

        XCTAssertEqual(core.save(.custom([.marketing: true])).status, .committed)
        XCTAssertEqual(recorder.events, [.collection(false), .consent(false)])
        XCTAssertEqual(
            recorder.consents.last,
            FirebaseAnalyticsConsent(analyticsStorage: false, adStorage: true, adUserData: true, adPersonalization: true))

        XCTAssertEqual(core.save(.all).status, .committed)
        XCTAssertEqual(
            recorder.consents.last,
            FirebaseAnalyticsConsent(analyticsStorage: true, adStorage: true, adUserData: true, adPersonalization: true))
        XCTAssertEqual(recorder.events.last, .collection(true))

        integration.cancel()
        XCTAssertEqual(
            recorder.consents.last,
            FirebaseAnalyticsConsent(analyticsStorage: false, adStorage: false, adUserData: false, adPersonalization: false))
        await core.waitUntilIdle()
    }

    func testFirebaseRegistrationAppliesAnExistingGrantSynchronously() async throws {
        let core = try await resolvedCore()
        XCTAssertEqual(core.save(.all).status, .committed)
        let recorder = AnalyticsCalls()
        let integration = firebase(core, recorder)
        XCTAssertEqual(recorder.events, [.collection(false), .consent(true), .collection(true)])
        integration.cancel()
        await core.waitUntilIdle()
    }

    func testStoredGrantAndWithdrawalAreAppliedAfterOfflineRelaunch() async throws {
        let store = InMemoryStore()
        let first = try await resolvedCore(store: store)
        XCTAssertEqual(first.save(.all).status, .committed)
        await first.waitUntilIdle()

        let granted = ConsentCore()
        granted.bootstrap(config(store: store))
        await granted.waitUntilIdle()
        XCTAssertEqual(granted.decision(for: .measurement), .granted)
        let grantedRecorder = AnalyticsCalls()
        let grantedIntegration = firebase(granted, grantedRecorder)
        XCTAssertEqual(grantedRecorder.events.last, .collection(true))
        XCTAssertEqual(granted.save(.necessary).status, .committed)
        grantedIntegration.cancel()

        let refused = ConsentCore()
        refused.bootstrap(config(store: store))
        await refused.waitUntilIdle()
        XCTAssertEqual(refused.decision(for: .measurement), .denied)
        let refusedRecorder = AnalyticsCalls()
        let refusedIntegration = firebase(refused, refusedRecorder)
        XCTAssertEqual(refusedRecorder.events, [.collection(false), .consent(false)])
        refusedIntegration.cancel()
    }

    func testFirebaseCancellationDeniesAndNeverReenables() async throws {
        let core = try await resolvedCore()
        XCTAssertEqual(core.save(.all).status, .committed)
        let recorder = AnalyticsCalls()
        let integration = firebase(core, recorder)
        recorder.clear()
        integration.cancel()
        integration.cancel()
        XCTAssertEqual(recorder.events, [.collection(false), .consent(false)])
        XCTAssertEqual(core.save(.necessary).status, .committed)
        XCTAssertEqual(core.save(.all).status, .committed)
        XCTAssertEqual(recorder.events, [.collection(false), .consent(false)])
        await core.waitUntilIdle()
    }

    func testFirebaseReentrantCancellationCannotEnableCollection() async throws {
        let core = try await resolvedCore()
        let recorder = AnalyticsCalls()
        let retained = FirebaseIntegrationReference()
        let integration = firebase(core, recorder)
        retained.value = integration
        recorder.clear()
        recorder.onEvent = { event in
            if event == .consent(true) {
                retained.value?.cancel()
                retained.value = nil
            }
        }

        XCTAssertEqual(core.save(.all).status, .committed)
        XCTAssertEqual(recorder.events, [.collection(false), .consent(true), .collection(false), .consent(false)])
        XCTAssertFalse(recorder.events.contains(.collection(true)))
        await core.waitUntilIdle()
    }

    func testConcurrentCancellationWaitsForVendorCallThenLeavesCollectionOff() async throws {
        let core = try await resolvedCore()
        let recorder = AnalyticsCalls()
        let integration = firebase(core, recorder)
        assertConcurrentCancellation(core: core, recorder: recorder, integration: integration)
        let afterCancel = recorder.events
        XCTAssertEqual(core.save(.necessary).status, .committed)
        XCTAssertEqual(core.save(.all).status, .committed)
        XCTAssertEqual(recorder.events, afterCancel)
        await core.waitUntilIdle()
    }

    private func assertConcurrentCancellation(core: ConsentCore, recorder: AnalyticsCalls, integration: FirebaseAnalyticsIntegration) {
        let entered = DispatchSemaphore(value: 0)
        let release = DispatchSemaphore(value: 0)
        let cancellationStarted = DispatchSemaphore(value: 0)
        let finished = DispatchGroup()
        recorder.onEvent = { event in
            if event == .consent(true) {
                entered.signal()
                XCTAssertEqual(release.wait(timeout: .now() + 5), .success)
            }
        }
        finished.enter()
        DispatchQueue.global().async {
            XCTAssertEqual(core.save(.all).status, .committed)
            finished.leave()
        }
        XCTAssertEqual(entered.wait(timeout: .now() + 5), .success)
        finished.enter()
        DispatchQueue.global().async {
            cancellationStarted.signal()
            integration.cancel()
            finished.leave()
        }
        XCTAssertEqual(cancellationStarted.wait(timeout: .now() + 5), .success)
        release.signal()
        XCTAssertEqual(finished.wait(timeout: .now() + 5), .success)
        XCTAssertEqual(recorder.events.suffix(2), [.collection(false), .consent(false)])
    }

    func testPostHogPendingGrantWithdrawalAndCancellation() async throws {
        let core = ConsentCore()
        let recorder = AnalyticsCalls()
        let integration = posthog(core, recorder)
        XCTAssertEqual(recorder.events, [.optOut])
        try await bootstrap(core)
        XCTAssertEqual(recorder.events, [.optOut])
        XCTAssertEqual(core.save(.custom([.measurement: true])).status, .committed)
        XCTAssertEqual(recorder.events, [.optOut, .optIn])
        XCTAssertEqual(core.save(.custom([.marketing: true])).status, .committed)
        XCTAssertEqual(recorder.events, [.optOut, .optIn])
        XCTAssertEqual(core.save(.necessary).status, .committed)
        XCTAssertEqual(recorder.events, [.optOut, .optIn, .optOut])
        XCTAssertEqual(core.save(.all).status, .committed)
        integration.cancel()
        integration.cancel()
        XCTAssertEqual(recorder.events, [.optOut, .optIn, .optOut, .optIn, .optOut])
        XCTAssertEqual(core.save(.necessary).status, .committed)
        XCTAssertEqual(core.save(.all).status, .committed)
        XCTAssertEqual(recorder.events.last, .optOut)
        await core.waitUntilIdle()
    }

    func testConfiguredCategoryDoesNotFollowMeasurement() async throws {
        let core = try await resolvedCore()
        let recorder = AnalyticsCalls()
        let integration = PostHogIntegration(
            core: core,
            category: .experience,
            optIn: { recorder.append(.optIn) },
            optOut: { recorder.append(.optOut) }
        )
        XCTAssertEqual(core.save(.custom([.measurement: true])).status, .committed)
        XCTAssertEqual(recorder.events, [.optOut])
        XCTAssertEqual(core.save(.custom([.experience: true])).status, .committed)
        XCTAssertEqual(recorder.events, [.optOut, .optIn])
        integration.cancel()
        await core.waitUntilIdle()
    }

    func testSyncReappliesFirebasePermissionAfterVendorReset() async throws {
        let core = try await resolvedCore()
        let recorder = AnalyticsCalls()
        let integration = firebase(core, recorder)
        recorder.simulateVendorReset(collectionEnabled: true)
        XCTAssertTrue(recorder.collectionEnabled)
        let refusedRevision = core.snapshot().revision
        integration.sync()
        XCTAssertFalse(recorder.collectionEnabled)
        XCTAssertEqual(recorder.events.suffix(2), [.collection(false), .consent(false)])
        XCTAssertEqual(core.snapshot().revision, refusedRevision)

        XCTAssertEqual(core.save(.all).status, .committed)
        recorder.simulateVendorReset(collectionEnabled: false)
        recorder.clear()
        let grantedRevision = core.snapshot().revision
        integration.sync()
        XCTAssertTrue(recorder.collectionEnabled)
        XCTAssertEqual(recorder.events, [.collection(false), .consent(true), .collection(true)])
        XCTAssertEqual(core.snapshot().revision, grantedRevision)
        integration.cancel()
        recorder.clear()
        integration.sync()
        XCTAssertTrue(recorder.events.isEmpty)
        await core.waitUntilIdle()
    }

    func testSyncReappliesPostHogPermissionAfterVendorReset() async throws {
        let core = try await resolvedCore()
        let recorder = AnalyticsCalls()
        let integration = posthog(core, recorder)
        recorder.simulateVendorReset(collectionEnabled: true)
        recorder.clear()
        integration.sync()
        XCTAssertFalse(recorder.collectionEnabled)
        XCTAssertEqual(recorder.events, [.optOut])

        XCTAssertEqual(core.save(.all).status, .committed)
        recorder.simulateVendorReset(collectionEnabled: false)
        recorder.clear()
        integration.sync()
        XCTAssertTrue(recorder.collectionEnabled)
        XCTAssertEqual(recorder.events, [.optIn])
        integration.cancel()
        recorder.clear()
        integration.sync()
        XCTAssertTrue(recorder.events.isEmpty)
        await core.waitUntilIdle()
    }

    func testCancellationReappliesDenialAfterVendorReset() async throws {
        let core = try await resolvedCore()
        let firebaseRecorder = AnalyticsCalls()
        let posthogRecorder = AnalyticsCalls()
        let firebaseIntegration = firebase(core, firebaseRecorder)
        let posthogIntegration = posthog(core, posthogRecorder)
        firebaseRecorder.simulateVendorReset(collectionEnabled: true)
        posthogRecorder.simulateVendorReset(collectionEnabled: true)
        firebaseIntegration.cancel()
        posthogIntegration.cancel()
        XCTAssertFalse(firebaseRecorder.collectionEnabled)
        XCTAssertFalse(posthogRecorder.collectionEnabled)
        await core.waitUntilIdle()
    }

    func testReentrantCancellationDuringForcedSyncConvergesToDenial() async throws {
        let core = try await resolvedCore()
        XCTAssertEqual(core.save(.all).status, .committed)
        let recorder = AnalyticsCalls()
        let retained = FirebaseIntegrationReference()
        let integration = firebase(core, recorder)
        retained.value = integration
        recorder.clear()
        recorder.onEvent = { event in
            if event == .consent(true) {
                retained.value?.cancel()
                retained.value = nil
            }
        }
        integration.sync()
        XCTAssertFalse(recorder.collectionEnabled)
        XCTAssertFalse(recorder.events.contains(.collection(true)))
        XCTAssertEqual(recorder.events.suffix(2), [.collection(false), .consent(false)])
        await core.waitUntilIdle()
    }

    func testReleasingHelpersStopsCollection() async throws {
        let core = try await resolvedCore()
        XCTAssertEqual(core.save(.all).status, .committed)
        let recorder = AnalyticsCalls()
        var firebaseIntegration: FirebaseAnalyticsIntegration? = firebase(core, recorder)
        var posthogIntegration: PostHogIntegration? = posthog(core, recorder)
        XCTAssertNotNil(firebaseIntegration)
        XCTAssertNotNil(posthogIntegration)
        recorder.clear()
        firebaseIntegration = nil
        posthogIntegration = nil
        XCTAssertEqual(recorder.events, [.collection(false), .consent(false), .optOut])
        await core.waitUntilIdle()
    }

    func testMixpanelPendingGrantWithdrawalAndUnrelatedChangesSubmitInOrder() async throws {
        let core = ConsentCore()
        let recorder = AnalyticsCalls()
        let integration = mixpanel(core, recorder)
        XCTAssertEqual(recorder.events, [.optOut])
        try await bootstrap(core)
        XCTAssertEqual(recorder.events, [.optOut])

        XCTAssertEqual(core.save(.custom([.measurement: true])).status, .committed)
        XCTAssertTrue(recorder.collectionEnabled)
        XCTAssertEqual(core.save(.custom([.marketing: true])).status, .committed)
        XCTAssertEqual(recorder.events, [.optOut, .optIn])
        XCTAssertEqual(core.save(.necessary).status, .committed)
        XCTAssertFalse(recorder.collectionEnabled)
        XCTAssertEqual(recorder.events, [.optOut, .optIn, .optOut])
        integration.cancel()
        await core.waitUntilIdle()
    }

    func testMixpanelExistingGrantAndCancellationSubmitBeforeReturning() async throws {
        let core = try await resolvedCore()
        XCTAssertEqual(core.save(.all).status, .committed)
        let recorder = AnalyticsCalls()
        let integration = mixpanel(core, recorder)
        XCTAssertEqual(recorder.events, [.optIn])

        integration.cancel()
        integration.cancel()
        integration.sync()
        XCTAssertEqual(recorder.events, [.optIn, .optOut])
        XCTAssertEqual(core.save(.necessary).status, .committed)
        XCTAssertEqual(core.save(.all).status, .committed)
        XCTAssertEqual(recorder.events, [.optIn, .optOut])
        await core.waitUntilIdle()
    }

    func testMixpanelSyncResubmitsAfterVendorResetWithoutRecordingConsent() async throws {
        let core = try await resolvedCore()
        let recorder = AnalyticsCalls()
        let integration = mixpanel(core, recorder)
        recorder.simulateVendorReset(collectionEnabled: true)
        integration.sync()
        XCTAssertFalse(recorder.collectionEnabled)
        XCTAssertEqual(recorder.events, [.optOut, .optOut])

        XCTAssertEqual(core.save(.all).status, .committed)
        recorder.simulateVendorReset(collectionEnabled: false)
        recorder.clear()
        let revision = core.snapshot().revision
        integration.sync()
        XCTAssertTrue(recorder.collectionEnabled)
        XCTAssertEqual(recorder.events, [.optIn])
        XCTAssertEqual(core.snapshot().revision, revision)
        integration.cancel()
        await core.waitUntilIdle()
    }

    func testMixpanelQueuedVendorCommandsCannotLoseGrantOrFinalWithdrawal() async throws {
        let core = ConsentCore()
        let queued = QueuedMixpanelCalls()
        let integration = MixpanelIntegration(
            core: core,
            optInTracking: { queued.submit(true) },
            optOutTracking: { queued.submit(false) }
        )
        try await bootstrap(core)
        XCTAssertEqual(core.save(.all).status, .committed)
        XCTAssertEqual(core.save(.necessary).status, .committed)
        XCTAssertEqual(queued.submitted, [false, true, false])
        // Like Mixpanel's public API, submission has not applied the vendor queue.
        XCTAssertTrue(queued.collectionEnabled)
        queued.finishSubmittedCommands()
        XCTAssertFalse(queued.collectionEnabled)
        integration.cancel()
        await core.waitUntilIdle()
    }

    func testMixpanelReentrantCancellationLeavesLastCommandOptedOut() async throws {
        let core = try await resolvedCore()
        let recorder = AnalyticsCalls()
        let retained = AnalyticsIntegrationReference<MixpanelIntegration>()
        let integration = mixpanel(core, recorder)
        retained.value = integration
        recorder.clear()
        recorder.onEvent = { event in
            if event == .optIn { retained.value?.cancel() }
        }
        XCTAssertEqual(core.save(.all).status, .committed)
        XCTAssertEqual(recorder.events, [.optIn, .optOut])
        XCTAssertFalse(recorder.collectionEnabled)
        retained.value = nil
        await core.waitUntilIdle()
    }

    func testSentryReplayPendingGrantWithdrawalAndUnrelatedChanges() async throws {
        let core = ConsentCore()
        let recorder = AnalyticsCalls()
        let integration = sentryReplay(core, recorder)
        XCTAssertEqual(recorder.events, [.replayStop])
        try await bootstrap(core)
        XCTAssertEqual(core.save(.custom([.measurement: true])).status, .committed)
        XCTAssertTrue(recorder.collectionEnabled)
        XCTAssertEqual(core.save(.custom([.marketing: true])).status, .committed)
        XCTAssertEqual(recorder.events, [.replayStop, .replayStart])
        XCTAssertEqual(core.save(.necessary).status, .committed)
        XCTAssertFalse(recorder.collectionEnabled)
        XCTAssertEqual(recorder.events, [.replayStop, .replayStart, .replayStop])
        integration.cancel()
        await core.waitUntilIdle()
    }

    func testSentryReplayConfiguredCategoryAndExistingGrant() async throws {
        let core = try await resolvedCore()
        XCTAssertEqual(core.save(.custom([.measurement: true])).status, .committed)
        let recorder = AnalyticsCalls()
        let integration = SentryReplayIntegration(
            core: core,
            category: .experience,
            start: { recorder.append(.replayStart) },
            stop: { recorder.append(.replayStop) }
        )
        XCTAssertEqual(recorder.events, [.replayStop])
        XCTAssertEqual(core.save(.custom([.experience: true])).status, .committed)
        XCTAssertTrue(recorder.collectionEnabled)
        let existingGrantRecorder = AnalyticsCalls()
        let existingGrant = sentryReplay(core, existingGrantRecorder)
        XCTAssertEqual(existingGrantRecorder.events, [.replayStart])
        integration.cancel()
        existingGrant.cancel()
        await core.waitUntilIdle()
    }

    func testSentryReplaySyncAndCancellationReapplyPermissionAfterVendorReset() async throws {
        let core = try await resolvedCore()
        let recorder = AnalyticsCalls()
        let integration = sentryReplay(core, recorder)
        recorder.simulateVendorReset(collectionEnabled: true)
        integration.sync()
        XCTAssertFalse(recorder.collectionEnabled)
        XCTAssertEqual(core.save(.all).status, .committed)
        recorder.simulateVendorReset(collectionEnabled: false)
        let revision = core.snapshot().revision
        integration.sync()
        XCTAssertTrue(recorder.collectionEnabled)
        XCTAssertEqual(core.snapshot().revision, revision)
        integration.cancel()
        recorder.clear()
        integration.cancel()
        integration.sync()
        XCTAssertTrue(recorder.events.isEmpty)
        XCTAssertEqual(core.save(.necessary).status, .committed)
        XCTAssertEqual(core.save(.all).status, .committed)
        XCTAssertTrue(recorder.events.isEmpty)
        await core.waitUntilIdle()
    }

    func testSentryReplayReentrantCancellationAndDeinitializationStopCapture() async throws {
        let core = try await resolvedCore()
        let recorder = AnalyticsCalls()
        let retained = AnalyticsIntegrationReference<SentryReplayIntegration>()
        let integration = sentryReplay(core, recorder)
        retained.value = integration
        recorder.clear()
        recorder.onEvent = { event in
            if event == .replayStart { retained.value?.cancel() }
        }
        XCTAssertEqual(core.save(.all).status, .committed)
        XCTAssertEqual(recorder.events, [.replayStart, .replayStop])
        XCTAssertFalse(recorder.collectionEnabled)
        retained.value = nil

        let releasedRecorder = AnalyticsCalls()
        var released: SentryReplayIntegration? = sentryReplay(core, releasedRecorder)
        XCTAssertNotNil(released)
        XCTAssertTrue(releasedRecorder.collectionEnabled)
        released = nil
        XCTAssertFalse(releasedRecorder.collectionEnabled)
        await core.waitUntilIdle()
    }

    private func sentryReplay(_ core: ConsentCore, _ recorder: AnalyticsCalls) -> SentryReplayIntegration {
        SentryReplayIntegration(
            core: core,
            start: { recorder.append(.replayStart) },
            stop: { recorder.append(.replayStop) }
        )
    }

    private func mixpanel(_ core: ConsentCore, _ recorder: AnalyticsCalls) -> MixpanelIntegration {
        MixpanelIntegration(
            core: core,
            optInTracking: { recorder.append(.optIn) },
            optOutTracking: { recorder.append(.optOut) }
        )
    }

    private func firebase(_ core: ConsentCore, _ recorder: AnalyticsCalls) -> FirebaseAnalyticsIntegration {
        FirebaseAnalyticsIntegration(
            core: core,
            setConsent: { value in
                recorder.record(value)
                recorder.append(.consent(value.analyticsStorage))
            },
            setCollectionEnabled: { recorder.append(.collection($0)) }
        )
    }

    private func posthog(_ core: ConsentCore, _ recorder: AnalyticsCalls) -> PostHogIntegration {
        PostHogIntegration(core: core, optIn: { recorder.append(.optIn) }, optOut: { recorder.append(.optOut) })
    }

    private func resolvedCore(store: InMemoryStore = InMemoryStore()) async throws -> ConsentCore {
        let core = ConsentCore()
        try await bootstrap(core, store: store)
        return core
    }

    private func bootstrap(_ core: ConsentCore, store: InMemoryStore = InMemoryStore()) async throws {
        let transport = HostedTransport(baseURL: URL(string: "https://consent.example.com")!, client: try AnalyticsFixtureHTTP())
        core.bootstrap(config(store: store, transport: transport))
        await core.waitUntilIdle()
        XCTAssertTrue(core.isReady())
    }

    private func config(store: InMemoryStore, transport: (any C15tTransport)? = nil) -> CoreConfig {
        CoreConfig(
            store: store,
            transport: transport,
            consentCategories: [.necessary, .measurement, .marketing, .experience],
            now: { 1_770_000_000_000 },
            initRetry: .disabled,
            flushPendingOnBootstrap: false
        )
    }
}

private enum AnalyticsCall: Equatable, Sendable {
    case collection(Bool)
    case consent(Bool)
    case optIn
    case optOut
    case replayStart
    case replayStop
}

private final class AnalyticsCalls: @unchecked Sendable {
    private let lock = NSLock()
    private var recorded: [AnalyticsCall] = []
    private var recordedConsent: [FirebaseAnalyticsConsent] = []
    private var collecting = true
    private var handler: (@Sendable (AnalyticsCall) -> Void)?
    var events: [AnalyticsCall] { lock.lock(); defer { lock.unlock() }; return recorded }
    var consents: [FirebaseAnalyticsConsent] { lock.lock(); defer { lock.unlock() }; return recordedConsent }
    var collectionEnabled: Bool { lock.lock(); defer { lock.unlock() }; return collecting }
    var onEvent: (@Sendable (AnalyticsCall) -> Void)? {
        get { lock.lock(); defer { lock.unlock() }; return handler }
        set { lock.lock(); defer { lock.unlock() }; handler = newValue }
    }
    func append(_ event: AnalyticsCall) {
        lock.lock()
        recorded.append(event)
        switch event {
        case let .collection(enabled): collecting = enabled
        case .optIn: collecting = true
        case .optOut: collecting = false
        case .replayStart: collecting = true
        case .replayStop: collecting = false
        case .consent: break
        }
        let notify = handler
        lock.unlock()
        notify?(event)
    }
    func record(_ consent: FirebaseAnalyticsConsent) {
        lock.lock(); defer { lock.unlock() }; recordedConsent.append(consent)
    }
    func clear() { lock.lock(); defer { lock.unlock() }; recorded = [] }
    func simulateVendorReset(collectionEnabled: Bool) {
        lock.lock(); defer { lock.unlock() }; collecting = collectionEnabled
    }
}

private final class QueuedMixpanelCalls: @unchecked Sendable {
    private let lock = NSLock()
    private var queued: [Bool] = []
    private var collecting = true
    var submitted: [Bool] { lock.lock(); defer { lock.unlock() }; return queued }
    var collectionEnabled: Bool { lock.lock(); defer { lock.unlock() }; return collecting }
    func submit(_ allowed: Bool) { lock.lock(); defer { lock.unlock() }; queued.append(allowed) }
    func finishSubmittedCommands() {
        lock.lock()
        defer { lock.unlock() }
        for allowed in queued { collecting = allowed }
        queued = []
    }
}

private final class AnalyticsIntegrationReference<Integration>: @unchecked Sendable {
    private let lock = NSLock()
    private var integration: Integration?
    var value: Integration? {
        get { lock.lock(); defer { lock.unlock() }; return integration }
        set { lock.lock(); defer { lock.unlock() }; integration = newValue }
    }
}

private final class FirebaseIntegrationReference: @unchecked Sendable {
    private let lock = NSLock()
    private var integration: FirebaseAnalyticsIntegration?
    var value: FirebaseAnalyticsIntegration? {
        get { lock.lock(); defer { lock.unlock() }; return integration }
        set { lock.lock(); defer { lock.unlock() }; integration = newValue }
    }
}

private final class AnalyticsFixtureHTTP: HTTPTransport, @unchecked Sendable {
    private let body: Data
    init() throws {
        let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("../../../protocol/native-envelope-opt-in-grants.json")
        let fixture = try JSONDecoder().decode(JSONValue.self, from: Data(contentsOf: url))
        body = try JSONEncoder().encode(XCTUnwrap(fixture["input"]?["transport"]?["body"]))
    }
    func send(_ request: HTTPRequest) async throws -> HTTPResponse {
        HTTPResponse(status: 200, body: request.method == .get ? body : Data("{}".utf8))
    }
}
