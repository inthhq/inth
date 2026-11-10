import Foundation

/// Retry policy for a failed init. The first call is attempt 1.
public struct InitRetry: Sendable, Equatable {
    public var maxAttempts: Int
    public var baseDelayMs: UInt64
    public var maxDelayMs: UInt64

    public init(maxAttempts: Int = 5, baseDelayMs: UInt64 = 1_000, maxDelayMs: UInt64 = 30_000) {
        self.maxAttempts = maxAttempts
        self.baseDelayMs = baseDelayMs
        self.maxDelayMs = maxDelayMs
    }

    /// Exponential backoff from `baseDelayMs`, capped at `maxDelayMs`.
    func delay(afterAttempt attempt: Int) -> UInt64 {
        guard attempt > 0 else { return baseDelayMs }
        let shifted = baseDelayMs << min(UInt64(attempt), 16)
        return min(shifted == 0 ? maxDelayMs : shifted, maxDelayMs)
    }

    public static let disabled = InitRetry(maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0)
}

/// Everything `bootstrap` needs. Pure data: nothing runs at construction.
public struct CoreConfig: @unchecked Sendable {
    /// Where the two protected items live.
    public let store: any ConsentStore
    /// Optional build resource. It never replaces a usable stored policy.
    public let bundledPolicy: BundledPolicyResource?
    /// The policy in source control, the only policy source in no-backend mode. Use it
    /// with ``OfflineTransport`` or no transport: the two modes do not mix.
    public let policy: ConsentPolicy?
    /// Why the app's declared in-code policy was refused, when an adapter read one and
    /// could not use it. The core then reports `policy-invalid` in the snapshot and on
    /// the event stream instead of starting as if no policy had been declared.
    public let policyError: String?
    /// No-backend mode with an in-code policy, usable or refused. Init never uses the transport.
    var usesInCodePolicy: Bool { policy != nil || policyError != nil }
    var policyEndpoint: String? {
        transport?.policyEndpoint?.absoluteString ?? bundledPolicy?.endpoint
    }
    /// `nil` makes the async commands no-ops, which is what an embedded or
    /// preview build wants. Use ``C15tTransport/offline()`` instead when the
    /// device is merely unreachable, so saves queue up for later.
    public let transport: (any C15tTransport)?
    /// Categories to offer. `nil` or empty declares none: a strict policy offers
    /// its full scope and a permissive one offers `necessary` alone, with an
    /// acknowledgement prompt.
    public let consentCategories: [ConsentCategory]?
    /// The vendor ids this deployment may disclose, or `nil` for no declaration.
    ///
    /// This is the native twin of `iab.vendors` on web. That option does three jobs
    /// there: it filters the GVL request, it narrows the list the module holds through
    /// ``GlobalVendorList/narrowed(toVendorIds:)``, and it clears a summary that had
    /// counted the wider list. The first one reaches here as the `x-c15t-vendors`
    /// request header, and the second is what ``ConsentCore`` does with this field on
    /// every path a list arrives by. The third has no native equivalent yet, because
    /// this build holds one list and reports it whole.
    ///
    /// `nil` and `[]` are the same answer: no scope declared, so every served list is
    /// kept as it arrived. Both web narrows read an empty array that way --
    /// `narrowGVLToVendors` in `packages/iab/src/tcf/fetch-gvl.ts` hands the document
    /// back, and `gvlRequestUrl` in `packages/backend/src/http/gvl.ts` does not put the
    /// scope on the request line at all -- and a core that read `[]` as "show nobody"
    /// would leave a publisher who never scoped anything with an empty drawer under a
    /// consent the subject can still give. A host that means no vendors has to say so
    /// somewhere other than here.
    ///
    /// Ids the served list does not carry buy nothing, so an out-of-range or
    /// publisher-custom id costs nothing, and the list's framework half -- purposes,
    /// features, stacks, and both version numbers -- is never touched by a scope.
    public let vendors: [Int]?
    /// Approved CMP identity and publisher settings, required for native IAB commits.
    public let iab: IABConfiguration?
    /// Maximum age of a fetched GVL. A list-less response never renews this clock.
    public let iabListMaxAgeMs: Int64
    public let overrides: ConsentOverrides
    public let user: KernelUser?
    /// The Global Privacy Control signal as the host app reports it.
    ///
    /// There is no user-agent GPC flag to read natively, so the value has to come
    /// from wherever the signal actually lives: a `WKWebView`'s
    /// `isGlobalPrivacyControlEnabled`, an equivalent Android check, or the React
    /// Native layer. `nil` means the host has no signal, which is not the same
    /// answer as `false`. Publisher test mode is a different switch and never
    /// stands in for this one.
    public let gpc: Bool?
    /// Evaluation clock in epoch milliseconds. Injectable so a test can put the
    /// clock anywhere it needs without waiting for it.
    public let now: @Sendable () -> Int64
    public let initRetry: InitRetry?
    /// Replay the offline queue at the end of bootstrap. On by default: the
    /// contract lists launch as a retry trigger, and bootstrap is launch.
    public let flushPendingOnBootstrap: Bool
    /// Where the `IABTCF_*` storage bus lands, or `nil` to write no bus at all.
    ///
    /// The bus is an egress projection of the snapshot, not a second consent
    /// store: ``TcStorageBusWriting`` never answers a read, and nothing in the
    /// core trusts a value that reached it -- the Keychain stays authoritative.
    /// A host on iOS wires ``UserDefaultsStorageBus`` (standard `UserDefaults`,
    /// which is what S1's CMP API table tells a vendor SDK to read); a host
    /// that ships no ad SDK leaves this `nil` and the core's behavior is
    /// byte-identical to a build with no bus at all.
    public let storageBus: (any TcStorageBusWriting)?

    public init(
        store: any ConsentStore = InMemoryStore(),
        bundledPolicy: BundledPolicyResource? = nil,
        policy: ConsentPolicy? = nil,
        policyError: String? = nil,
        transport: (any C15tTransport)? = nil,
        consentCategories: [ConsentCategory]? = nil,
        vendors: [Int]? = nil,
        iab: IABConfiguration? = nil,
        iabListMaxAgeMs: Int64 = 604_800_000,
        overrides: ConsentOverrides = .default(),
        user: KernelUser? = nil,
        gpc: Bool? = nil,
        now: @escaping @Sendable () -> Int64 = { Int64(Date().timeIntervalSince1970 * 1_000) },
        initRetry: InitRetry? = InitRetry(),
        flushPendingOnBootstrap: Bool = true,
        storageBus: (any TcStorageBusWriting)? = nil
    ) {
        self.store = store
        precondition(
            policy == nil && policyError == nil || bundledPolicy == nil && transport?.policyEndpoint == nil,
            "CoreConfig.policy is no-backend mode and does not mix with a bundled manifest or a backend transport")
        self.bundledPolicy = bundledPolicy
        self.policy = policy
        self.policyError = policyError
        self.transport = transport
        self.consentCategories = consentCategories
        self.vendors = vendors
        self.iab = iab
        self.iabListMaxAgeMs = max(1, iabListMaxAgeMs)
        self.overrides = overrides
        self.user = user
        self.gpc = gpc
        self.now = now
        self.initRetry = initRetry
        self.flushPendingOnBootstrap = flushPendingOnBootstrap
        self.storageBus = storageBus
    }
}

/// The native consent kernel.
///
/// A final class rather than an actor, because ``snapshot()`` and
/// ``isAllowed(_:)`` are synchronous and called from ad SDKs on the main thread.
/// An actor would turn both into suspending calls, which is exactly what the
/// contract forbids. Thread safety is one lock over in-memory state, and the
/// state lock is held only for in-memory reads and publication. A separate
/// mutation gate serializes preparation, durable writes and publication. Neither
/// network work nor snapshot observers hold that gate.
///
/// State is a single immutable ``ConsentSnapshot``. Anything that reads it takes a
/// copy of a value nobody can change underneath, so there is no torn read and no
/// need for a read lock beyond the pointer swap.
public final class ConsentCore: @unchecked Sendable {
    // MARK: - Mutable state, guarded by `lock`

    private let lock = Lock()
    private let mutationGate = MutationGate()
    private var needsGrantCleanup = false
    private var currentSnapshot = ConsentSnapshot.coldStart
    private var bootstrapped = false
    private var config: CoreConfig?
    private var queue: PendingSaveQueue?
    private var identity: SubjectIdentity?
    private var resolvedPolicy: ResolvedPolicy?
    private var policyWire: JSONValue?
    private var bundledPolicyAuthority: BundledPolicyAuthority?
    /// The stale manifest already announced through ``CoreEvent/policyStale(_:)``.
    private var staleAnnounced: BundledPolicyAuthority?
    private var noticeDismissal: NoticeDismissal?
    private var lastIABActionAt: Int64?
    private var additionalConsentList: AdditionalConsentList?
    private var iabListFetchedAt: Int64?
    private var iabListFromCache = true
    private var iabListOffline = false
    private var committedIAB: IABCommittedConsent?
    private var iabDeadlineTask: Task<Void, Never>?
    private var iabDeadlineToken: UUID?

    /// The last native decision. The bridge does not receive the full draft.
    public func iabConsent() -> IABCommittedConsent? {
        lock.withLock {
            guard listIsUsableLocked(), let saved = committedIAB,
                saved.adTechProvidersID == nil || currentAdditionalConsentListLocked() != nil, let resolved = resolvedPolicy, resolved.policy.model == .iab,
                !currentSnapshot.policyPending,
                let now = config?.now(), saved.isCurrent(now: now, maxAge: resolved.policy.choiceMaxAgeMs)
            else { return nil }
            return saved
        }
    }
    /// Check a vendor and purpose together from current native authority, before JS starts.
    public func isIABAllowed(vendorId: Int, purposeId: Int, basis: IABLegalBasis) -> Bool {
        // Read authority and its disclosure under the same lock as the commit.
        lock.withLock {
            guard listIsUsableLocked(), let saved = committedIAB,
                saved.adTechProvidersID == nil || currentAdditionalConsentListLocked() != nil, let gvl = currentSnapshot.iab?.gvl,
                let resolved = resolvedPolicy, !currentSnapshot.policyPending,
                resolved.policy.model == .iab, saved.fingerprint == resolved.choiceFingerprint,
                let now = config?.now(), saved.isCurrent(now: now, maxAge: resolved.policy.choiceMaxAgeMs)
            else { return false }
            return saved.allows(vendorId: vendorId, purposeId: purposeId, basis: basis, gvl: gvl)
        }
    }

    private func listIsUsableLocked() -> Bool {
        guard bundledPolicyAuthority?.isUsable(endpoint: config?.policyEndpoint, now: config?.now() ?? -1) != false,
            let c = config, let fetched = iabListFetchedAt, fetched >= 0,
            currentSnapshot.iab?.gvl != nil else { return false }
        let now = c.now()
        return now >= fetched && now - fetched < c.iabListMaxAgeMs
    }

    /// List state and disclosure versions without a full-GVL bridge payload.
    public func iabStatus() -> IABLifecycleStatus {
        lock.withLock {
            let gvl = currentSnapshot.iab?.gvl
            let availability: IABListAvailability = config?.iab == nil ? .unavailable
                : gvl == nil ? .missing : !listIsUsableLocked() ? .stale
                : iabListOffline ? .offline : iabListFromCache ? .cached : .fresh
            return IABLifecycleStatus(availability: availability,
                requiresConsent: committedIAB?.isCurrent(now: config?.now() ?? 0, maxAge: resolvedPolicy?.policy.choiceMaxAgeMs ?? 0) != true || !listIsUsableLocked() || committedIAB?.adTechProvidersID != nil && currentAdditionalConsentListLocked() == nil,
                revision: currentSnapshot.revision, vendorListVersion: gvl?.vendorListVersion,
                policyVersion: gvl?.tcfPolicyVersion)
        }
    }

    private func currentAdditionalConsentListLocked() -> AdditionalConsentList? {
        guard let list = additionalConsentList, let c = config,
            list.isCurrent(now: c.now(), maxAge: c.iabListMaxAgeMs) else { return nil }
        return list
    }

    /// Build metadata in force, or nil after a hosted refresh. No identity or grants.
    public var bundledPolicyInfo: BundledPolicyAuthority? { lock.withLock { bundledPolicyAuthority } }

    /// Whether the policy in force comes from a bundled manifest past its `expiresAt`.
    ///
    /// The prompt still shows and choices still save. Optional categories stay denied
    /// until the person chooses, and a live `/init` replaces the manifest once online.
    public var isPolicyStale: Bool {
        lock.withLock {
            guard let authority = bundledPolicyAuthority, let config else { return false }
            let now = config.now()
            return authority.isUsable(endpoint: config.policyEndpoint, now: now) && authority.isStale(now: now)
        }
    }

    /// The stale manifest to announce, once per manifest. Callers hold the lock.
    private func takeStaleAnnouncementLocked() -> BundledPolicyAuthority? {
        guard let authority = bundledPolicyAuthority, let config, staleAnnounced != authority else { return nil }
        let now = config.now()
        guard authority.isUsable(endpoint: config.policyEndpoint, now: now), authority.isStale(now: now) else { return nil }
        staleAnnounced = authority
        return authority
    }

    /// Whether a bundled manifest may replace the policy in force after hydration.
    ///
    /// Precedence: a live `/init` response, then the last good cached one, then the
    /// manifest bundled at build time. A cached response from an earlier bundle gives way
    /// to this build's bundle when that one is newer, or when the cached one is stale.
    private func shouldAdoptBundle(_ candidate: BundledPolicyAuthority, config: CoreConfig) -> Bool {
        let now = config.now()
        guard candidate.isUsable(endpoint: config.policyEndpoint, now: now) else { return false }
        if snapshot().policyPending { return true }
        guard let retained = lock.withLock({ bundledPolicyAuthority }) else { return false }
        return !retained.isUsable(endpoint: config.policyEndpoint, now: now)
            || candidate.issuedAt > retained.issuedAt
            || retained.isStale(now: now) && !candidate.isStale(now: now)
    }

    /// Last readable provider disclosures, including stale copy. Check additionalConsentStatus
    /// before offering a new grant. Reading does not renew list authority.
    public func adTechProviderDisclosures() -> [AdTechProvider]? { lock.withLock { additionalConsentList?.providers } }

    /// Read ATP disclosures once when opening native preferences, without a JS fetch.
    public func adTechProviders() -> [AdTechProvider]? {
        lock.withLock { currentAdditionalConsentListLocked()?.providers }
    }

    /// Check committed ATP consent without a JS runtime. ATT remains a separate gate.
    public func isAdTechProviderAllowed(_ id: Int) -> Bool {
        iabConsent()?.choices.adTechProviderConsents?.contains(id) == true
    }

    /// Distinguish an unavailable ATP list from a deliberately empty configured list.
    public func additionalConsentStatus() -> IABListAvailability {
        lock.withLock {
            guard config?.iab != nil else { return .unavailable }
            guard additionalConsentList != nil else { return .missing }
            guard currentAdditionalConsentListLocked() != nil else { return .stale }
            return iabListOffline ? .offline : iabListFromCache ? .cached : .fresh
        }
    }

    /// Open a draft on the current disclosed list. Retry after a missing or stale list.
    public func openIABDraft() -> IABDraft? {
        lock.withLock {
            guard config?.iab != nil, resolvedPolicy?.policy.model == .iab,
                !currentSnapshot.policyPending, listIsUsableLocked(),
                (bundledPolicyAuthority?.requiresAtp != true && additionalConsentList?.providers.isEmpty != false) || currentAdditionalConsentListLocked() != nil
            else { return nil }
            return IABDraft(revision: currentSnapshot.revision, choices: committedIAB?.choices ?? IABChoices())
        }
    }

    /// Capture retained disclosure and a draft atomically. Check `canEdit` before offering grants.
    public func iabPresentation() -> IABPresentation? {
        lock.withLock {
            guard let configuration = config?.iab, resolvedPolicy?.policy.model == .iab,
                  let list = currentSnapshot.iab?.gvl else { return nil }
            let canEdit = !currentSnapshot.policyPending && listIsUsableLocked()
                && ((bundledPolicyAuthority?.requiresAtp != true && additionalConsentList?.providers.isEmpty != false) || currentAdditionalConsentListLocked() != nil)
            let draft = IABDraft(revision: currentSnapshot.revision, choices: committedIAB?.choices ?? IABChoices())
            let vendors = list.vendors.values.filter { $0.deletedDate?.isEmpty != false }
            return IABPresentation(canEdit: canEdit, draft: draft, list: list,
                vendors: Dictionary(uniqueKeysWithValues: vendors.map { ($0.id, configuration.disclosure(for: $0)) }),
                adTechProviders: additionalConsentList?.providers,
                // A saved decision stops counting, and leaves the storage bus, once the
                // choice validity passes (`isCurrent`, `writeTcStorageBus`).
                consentStorageMaxDays: IABPresentation.days(ms: resolvedPolicy?.policy.choiceMaxAgeMs),
                // The language the TC String declares, so screen copy and signals agree.
                language: configuration.consentLanguage)
        }
    }

    /// Save against the exact revision shown by a native presenter.
    public func saveIAB(_ draft: IABDraft, categories: [OptionalConsentCategory: Bool]) -> CommitResult {
        save(.iab(draft.choices, categories: categories), expectedRevision: draft.revision)
    }

    private var user: KernelUser?
    private var overrides = ConsentOverrides.default()
    /// The overrides the host configured, as opposed to the ones the snapshot carries.
    ///
    /// They stop being the same value the moment an init lands: ``applyInit(_:)`` folds the
    /// country and region the backend matched on into ``overrides``, which is what a save
    /// has to be sent against. So that copy claims a geography the app never asked for,
    /// and the host's own pin only survives on its own here. ``reset()`` needs the
    /// distinction: a wipe deletes the policy resolution, and a location that came out of
    /// it goes with it, while a country pinned for QA has to stay.
    private var configuredOverrides = ConsentOverrides.default()
    private var detectedGPC = false
    /// Highest revision already written to the store, so a slow write of an older
    /// envelope cannot land on top of a newer one.
    private var persistedRevision = 0
    /// Whether the last ``hydrate()`` found an envelope on disk. Backs
    /// ``hasStoredSnapshot``, which a binding layer reports in its handshake.
    private var restoredFromStore = false
    private var inFlightWork = 0
    private var idleWaiters: [CheckedContinuation<Void, Never>] = []
    /// Whether a delivery pass currently holds this core, and whether another has
    /// been asked for in the meantime. Both are in-memory flags on the core's own
    /// lock, and only ``requestDeliveryPass(ownSend:)`` and its bookkeeping helpers
    /// read them. See "The pending save queue" in `native/CONTRACT.md`.
    private var deliveryPassInFlight = false
    private var deliveryPassRequested = false
    private var deliveryPassWaiters: [CheckedContinuation<Bool, Never>] = []
    /// Strong holds on per-category gate subscriptions, keyed by identity. The
    /// observer set itself stays weak, as the contract requires. Holds both gate
    /// flavours: the boolean one ``gate(_:_:)`` and the decision-carrying
    /// ``ConsentCore/gate(_:_:)`` overload, whose only owner would otherwise be a
    /// closure no one else retains.
    private var gateSubscriptions: [ObjectIdentifier: any SnapshotObserver] = [:]

    // MARK: - Collaborators

    private let events = EventHub()
    private let observers = ObserverSet()

    public init() {}

    deinit { iabDeadlineTask?.cancel() }

    // MARK: - Bootstrap

    /// Start the kernel. Idempotent and safe to call from any launch hook,
    /// including several of them, which is what a library that can be installed by
    /// both a Swift app and a React Native bridge has to tolerate.
    ///
    /// Hydration runs synchronously so that the first ``snapshot()`` after this
    /// returns already reflects stored consent with no network. The init request is
    /// what happens afterwards.
    public func bootstrap(_ config: CoreConfig) {
        let mutation = mutationGate.acquire()
        defer { mutation.release() }
        let adopted = lock.withLock {
            guard !bootstrapped else { return false }
            bootstrapped = true
            self.config = config
            self.overrides = config.overrides
            self.configuredOverrides = config.overrides
            self.user = config.user
            self.queue = PendingSaveQueue(store: config.store, now: config.now)
            return true
        }
        // A second call is a no-op, not an error: re-adopting a store mid-session
        // would silently orphan the subject id.
        guard adopted else { return }

        hydrate(mutation: mutation)
        if let selection = config.bundledPolicy?.resolve(overrides: config.overrides, now: config.now()),
            shouldAdoptBundle(selection.authority, config: config) {
            applyPolicyUpdate(selection.response, bundle: selection)
        }
        // In no-backend mode the in-code policy answers before the first read, once:
        // there is no init to schedule after it.
        if let response = config.policy?.resolve(overrides: config.overrides) {
            applyPolicyUpdate(response)
        } else if config.policy == nil, let reason = config.policyError {
            reportRefusedPolicy(reason)
        }
        if let stale = lock.withLock({ takeStaleAnnouncementLocked() }) { events.emit(.policyStale(stale)) }
        events.emit(.initialized)

        if config.flushPendingOnBootstrap {
            schedule { await self.requestDeliveryPass(ownSend: nil) }
        }
        if !config.usesInCodePolicy { scheduleInit(attempt: 1) }
    }

    /// Report an in-code policy the host declared and the adapter could not use, the way
    /// a refused `/init` is reported, rather than as a quiet deny-all start.
    private func reportRefusedPolicy(_ reason: String) {
        let info = CoreErrorInfo(code: "policy-invalid", message: "The in-code policy was refused: \(reason)")
        let mutation = mutationGate.acquire()
        defer { mutation.release() }
        lock.withLock {
            // Fail closed: a policy this build refused cannot keep a cached one, or its
            // grants, in force. Stored choices stay, for a later build with a usable policy.
            resolvedPolicy = nil
            policyWire = nil
            currentSnapshot = currentSnapshot.byApplying { draft in
                draft.policyPending = true
                draft.effectivePermissions = ConsentSnapshot.failClosedPermissions
                draft.restrictions = [:]
                draft.promptRequirement = .none
                draft.activeUI = .none
                draft.nextDeadline = nil
                draft.error = info
            }
        }
        publish(persist: true, mutation: mutation)
        events.emit(.error(info))
    }

    /// Whether ``bootstrap(_:)`` has taken effect.
    public var isBootstrapped: Bool {
        lock.withLock { bootstrapped }
    }

    /// Whether a flush request is waiting to be answered by the pass that holds the
    /// core.
    ///
    /// A test seam rather than a host API. ``flushPending()`` only asks, so a test
    /// that has to prove a second request arrived *while a send was still open* needs
    /// to see the request being recorded; without it the only evidence available is
    /// that a duplicate POST did not show up, which a slow scheduler fakes perfectly
    /// well.
    package var hasWaitingDeliveryPassRequest: Bool {
        lock.withLock { deliveryPassRequested }
    }

    /// The overrides in force, whether or not a policy has resolved.
    ///
    /// A binding layer merges a partial override document against this rather than
    /// against ``ConsentSnapshot/overrides``, because the snapshot only carries the
    /// context a policy was evaluated against: while ``ConsentSnapshot/policyPending``
    /// is set, nothing has been evaluated, and merging against a snapshot that has not
    /// caught up would drop the values an earlier call set.
    public var currentOverrides: ConsentOverrides {
        lock.withLock { overrides }
    }

    /// Whether consent state exists on disk: either hydration restored an envelope
    /// or this session has persisted one since.
    ///
    /// A binding layer reports this in its handshake so JavaScript can tell "cold
    /// install, nothing stored" apart from "returning user, cached consent", which
    /// is the difference between showing a banner at first frame and waiting for the
    /// network to say the same thing. Reads stay synchronous either way.
    ///
    /// Deliberately not the same as ``ConsentSnapshot/ready``: `ready` says hydration
    /// completed against a store, and stays `false` for the whole session after a
    /// cold hydrate even once the first save has been written.
    public var hasStoredSnapshot: Bool {
        lock.withLock { restoredFromStore || persistedRevision > 0 }
    }

    // MARK: - Reads

    /// The current state. Synchronous, and never touches disk or the network.
    public func snapshot() -> ConsentSnapshot {
        lock.withLock { readableSnapshotLocked() }
    }

    private func readableSnapshotLocked() -> ConsentSnapshot {
        let constrained = constrainBundledPolicyLocked(currentSnapshot)
        guard !constrained.policyPending, resolvedPolicy?.policy.model == .iab else { return constrained }
        if listIsUsableLocked(), let saved = committedIAB, let config, let resolvedPolicy,
            saved.adTechProvidersID == nil || currentAdditionalConsentListLocked() != nil,
            saved.isCurrent(now: config.now(), maxAge: resolvedPolicy.policy.choiceMaxAgeMs) {
            return constrained
        }
        var draft = ConsentSnapshot.Draft(current: constrained)
        draft.effectivePermissions = .necessaryOnly
        return draft.build(revision: currentSnapshot.revision)
    }

    private func constrainBundledPolicyLocked(_ snapshot: ConsentSnapshot) -> ConsentSnapshot {
        guard let authority = bundledPolicyAuthority else { return snapshot }
        var draft = ConsentSnapshot.Draft(current: snapshot)
        guard authority.isUsable(endpoint: config?.policyEndpoint, now: config?.now() ?? -1) else {
            draft.effectivePermissions = .necessaryOnly
            draft.policyPending = true
            draft.activeUI = .none
            draft.error = CoreErrorInfo(code: "bundled-policy-unusable", message: "Connect to refresh consent policy.")
            return draft.build(revision: snapshot.revision)
        }
        for category in OptionalConsentCategory.ordered where snapshot.explicitChoice?.categories[category]?.value != true {
            draft.effectivePermissions = draft.effectivePermissions.setting(category, to: false)
        }
        return draft.build(revision: snapshot.revision)
    }

    /// The vendor list this device last was served, for a host app's own Swift code.
    ///
    /// The same value the React Native boundary reads at `snapshot.iab.gvl`, read off
    /// the same snapshot, so a dialog rendered natively and a dialog rendered in
    /// JavaScript cannot end up describing different vendors. Synchronous, and it never
    /// fetches: `nil` means no `/init` has served a list this build could read, which is
    /// the normal answer for every policy that is not `iab`.
    public func globalVendorList() -> GlobalVendorList? {
        lock.withLock { currentSnapshot.iab?.gvl }
    }

    /// Whether processing in `category` is permitted right now.
    ///
    /// Synchronous, and never touches disk or the network. While hydration or the
    /// policy is still outstanding this answers `false` for every optional
    /// category, whichever way the eventual default lands.
    public func isAllowed(_ category: ConsentCategory) -> Bool {
        lock.withLock {
            let state = readableSnapshotLocked()
            if state.policyPending, category != .necessary {
                return false
            }
            if category != .necessary, resolvedPolicy?.policy.model == .iab,
                config?.iab != nil, (!listIsUsableLocked() || committedIAB?.adTechProvidersID != nil && currentAdditionalConsentListLocked() == nil) { return false }
            return state.effectivePermissions.value(for: category)
        }
    }

    /// Whether a real answer exists: the core has been told, either by hydration
    /// restoring an envelope or by the first init resolving a policy this build could
    /// read, and that policy is in force.
    ///
    /// The two flags a gate must consult, combined into the question a host asks first:
    /// ``ConsentCore/decision(for:)`` says what is permitted, and this says whether
    /// that answer is final yet or still `pending`. Synchronous, one read of in-memory
    /// state, no disk, no network, and no lock held across either, because ad SDKs call
    /// it from `applicationDidFinishLaunching` and a block there is a watchdog kill the
    /// host app takes.
    public func isReady() -> Bool {
        lock.withLock { let snapshot = readableSnapshotLocked(); return snapshot.ready && !snapshot.policyPending }
    }

    /// Why `category` may or may not run, for a host app's own Swift code.
    ///
    /// This is the answer an analytics or advertising SDK needs when it starts before
    /// the React Native bundle exists, and it is a public API in its own right rather
    /// than a detail behind the bridge. ``isAllowed(_:)`` cannot carry it: `false` means
    /// both "the subject refused" and "nothing has resolved", and those need opposite
    /// handling. See ``ConsentDecision`` for what each case obliges the caller to do.
    ///
    /// Derived from ``snapshot()`` and nothing else, so the gate can never disagree with
    /// the state the UI is showing, and no platform authorization can move a category
    /// from `pending` or `denied` to `granted`. Same hot-path rule as ``isAllowed(_:)``:
    /// one read of in-memory state.
    ///
    /// - Parameter category: The category to answer for, `necessary` included.
    /// - Returns: `.granted`, `.denied`, or `.pending` for the current snapshot.
    public func decision(for category: ConsentCategory) -> ConsentDecision {
        lock.withLock { ConsentDecision(snapshot: readableSnapshotLocked(), category: category) }
    }


    /// Watch one category. Fires with the current value immediately, then on every
    /// change to that category.
    ///
    /// Firing immediately is what lets a script gate be written as "register and
    /// load if allowed" without a separate read, and without a race between the two.
    @discardableResult
    public func gate(
        _ category: OptionalConsentCategory,
        _ onChange: @escaping @Sendable (Bool) -> Void
    ) -> ConsentSubscription {
        let subscription = GateSubscription(category: category, onChange: onChange)
        let registration = observers.add(subscription)
        // The observer set holds the subscription weakly, and a closure is not an
        // object anyone else owns, so the core keeps it alive for exactly as long
        // as the registration does. Cancelling drops both ends together.
        let key = ObjectIdentifier(subscription)
        registration.addHandler { [weak self] in
            guard let self else { return }
            self.lock.withLock {
                self.gateSubscriptions.removeValue(forKey: key)
                ()
            }
        }
        lock.withLock { gateSubscriptions[key] = subscription }
        let allowed = lock.withLock {
            readableSnapshotLocked().effectivePermissions.value(for: category)
        }
        subscription.deliverInitial(allowed)
        return registration
    }

    /// Watch one category as a ``ConsentDecision``, and keep watching it.
    ///
    /// The rules the boolean ``gate(_:_:)`` already has, plus the one that matters to a
    /// late starter: a listener registered after the decision has been reached still
    /// receives that decision rather than silence, so an SDK that initializes two
    /// seconds into the launch does not have to know what it missed. The callback fires
    /// at registration with the current decision, again on every change of decision, and
    /// ``ConsentSubscription/cancel()`` on the returned handle ends it.
    ///
    /// `pending` is a real delivery, not a placeholder: a listener that hears it must
    /// stay registered, because the same handle is what tells it the answer. A host that
    /// only ever wants to start something reads ``decision(for:)`` once and registers
    /// only when that answer is `pending`.
    ///
    /// Delivery runs on whichever queue published the change, off the main thread unless
    /// the host arranges otherwise.
    ///
    /// - Parameters:
    ///   - category: The category to watch. Takes `necessary`, which always answers
    ///     `granted`, so that a gate written over every category needs no special case.
    ///   - onChange: Called with the current decision, then with each new one.
    /// - Returns: A handle that cancels the subscription.
    @discardableResult
    public func gate(
        _ category: ConsentCategory,
        _ onChange: @escaping @Sendable (ConsentDecision) -> Void
    ) -> ConsentSubscription {
        let subscription = DecisionGateSubscription(category: category, onChange: onChange)
        // Register before the first read, in that order: a change that lands between
        // the two is delivered by the observer, and the seed below then stands down
        // rather than putting an older decision on the end of the callback's sequence.
        // Missing a change would leave an SDK switched off with nothing left listening,
        // which is the failure this gate exists to prevent, so the possible cost here
        // is one redundant delivery instead.
        let registration = observers.add(subscription)
        let key = ObjectIdentifier(subscription)
        registration.addHandler { [weak self] in
            guard let self else { return }
            self.lock.withLock {
                self.gateSubscriptions.removeValue(forKey: key)
                ()
            }
        }
        lock.withLock { gateSubscriptions[key] = subscription }
        let current = lock.withLock {
            ConsentDecision(snapshot: readableSnapshotLocked(), category: category)
        }
        subscription.deliverInitial(current)
        return registration
    }

    /// Watch the whole snapshot. Held weakly.
    @discardableResult
    public func onChange(_ observer: any SnapshotObserver) -> ConsentSubscription {
        observers.add(observer)
    }

    /// Events as a stream, from the moment this is called.
    public var eventStream: AsyncStream<CoreEvent> {
        events.stream()
    }

    // MARK: - Writes

    /// Record a consent decision.
    ///
    /// Returns as soon as the decision is local and durable; delivery is
    /// asynchronous. `actionAt` is captured before any I/O and reused by every
    /// replay, so the receipt the backend stores is the receipt the subject made.
    ///
    /// ``CommitResult/Status-enum/committed`` asserts the device side only: the
    /// receipts are applied, the snapshot is stored, and the queue holds the bytes
    /// that owe delivery. What happens to those bytes is reported afterwards, as
    /// ``CoreEvent/saveDelivered`` or as an ``CoreEvent/error`` carrying one of
    /// `http-status` (retryable, entry kept), `save-rejected` (the backend refused
    /// these bytes, entry dropped), `save-undeliverable` (retries or the retention
    /// window ran out, entry dropped), or `transport-unavailable` (no sender on this
    /// launch, entry kept). A save that cannot even be queued answers ``rejected``
    /// with `queue-write-failed`, `not-bootstrapped`, `no-subject`, or
    /// `concurrent-change`, and changes nothing.
    @discardableResult
    public func save(_ intent: CommitIntent, expectedRevision: Int? = nil) -> CommitResult {
        // Captured first: a save that took 40 ms to build a body must still report
        // the instant the subject acted.
        let wallActionAt = (lock.withLock { config }?.now ?? Self.wallClock)()
        var actionAt = wallActionAt
        let mutation = mutationGate.acquire()
        defer { mutation.release() }

        struct Planned {
            let payload: SavePayload
            let body: Data
            /// Read in the same locked pass as `config`, which is the pass that
            /// installs it. A planned action that reached this point therefore always
            /// has somewhere to record its obligation, and ``save(_:)`` never has to
            /// answer the question "committed, but stored where".
            let queue: PendingSaveQueue
            /// The revision owned by the mutation gate until the durable write and
            /// publication finish.
            let baseRevision: Int
            let next: ConsentSnapshot
            let result: CommitResult
            /// The acknowledgement this action records, installed with `next`.
            let acknowledgement: NoticeDismissal?
            let iabConsent: IABCommittedConsent?
            let isIAB: Bool
        }

        let prepared: Result<Planned, CoreErrorInfo> = lock.withLock {
            if let authority = bundledPolicyAuthority,
                !authority.isUsable(endpoint: config?.policyEndpoint, now: wallActionAt) {
                return .failure(CoreErrorInfo(code: "bundled-policy-unusable", message: "Connect to refresh consent policy."))
            }
            if bundledPolicyAuthority?.requiresAtp == true && intent != .necessary && currentAdditionalConsentListLocked() == nil {
                return .failure(CoreErrorInfo(code: "additional-consent-list-stale", message: "Refresh the provider disclosures before saving."))
            }
            if let expectedRevision, expectedRevision != currentSnapshot.revision {
                return .failure(
                    CoreErrorInfo(
                        code: "concurrent-change",
                        message: "The draft was based on an older consent snapshot."))
            }
            guard let queue else {
                return .failure(CoreErrorInfo(
                    code: "not-bootstrapped",
                    message: "ConsentCore.save() called before bootstrap()."
                ))
            }
            guard let identity else {
                return .failure(CoreErrorInfo(
                    code: "no-subject",
                    message: "No subject identity is available."
                ))
            }
            guard let resolved = resolvedPolicy, !currentSnapshot.policyPending else {
                // Without a policy there is no scope, so "accept all" would have to
                // invent one. Refuse and leave the deny-all snapshot alone.
                return .failure(CoreErrorInfo(
                    code: "policy-pending",
                    message: "Cannot record a choice before the policy resolves."
                ))
            }

            if case .iab = intent, expectedRevision == nil {
                return .failure(CoreErrorInfo(code: "iab-draft-required",
                    message: "Open a native IAB draft and save its disclosure revision."))
            }
            var nextIAB: IABCommittedConsent?
            if resolved.policy.model == .iab, let previous = lastIABActionAt {
                guard previous < Int64.max else {
                    return .failure(CoreErrorInfo(
                        code: "invalid-action-time",
                        message: "The previous action time cannot be advanced."))
                }
                actionAt = max(actionAt, previous + 1)
            }
            if resolved.policy.model == .iab,
                wallActionAt < 0 || actionAt < 0 || actionAt - wallActionAt > 600_000
            {
                return .failure(CoreErrorInfo(
                    code: "invalid-action-time",
                    message: "The clock cannot represent a current, distinct IAB action time."))
            }
            if resolved.policy.model == .iab && (intent != .necessary || config?.iab != nil && currentSnapshot.iab?.gvl != nil && listIsUsableLocked()) {
                guard let configuration = config?.iab, let gvl = currentSnapshot.iab?.gvl else {
                    return .failure(
                        CoreErrorInfo(
                            code: "iab-unavailable",
                            message: "IAB saves require CMP configuration and a disclosed vendor list."))
                }
                guard listIsUsableLocked() else {
                    return .failure(CoreErrorInfo(code: "iab-list-stale", message: "Refresh the vendor list before saving."))
                }
                let choices: IABChoices
                switch intent {
                case .all:
                    choices = IABAuthority.accepting(
                        gvl, configuration: configuration,
                        adTechProviders: currentAdditionalConsentListLocked()?.providers.map(\.id))
                case .necessary: choices = IABChoices()
                case let .iab(draft, _): choices = draft
                case .custom:
                    return .failure(
                        CoreErrorInfo(
                            code: "iab-choices-required",
                            message: "Save the complete native IAB draft with category choices."))
                }
                if intent != .necessary, additionalConsentList?.providers.isEmpty == false,
                    currentAdditionalConsentListLocked() == nil {
                    return .failure(CoreErrorInfo(code: "additional-consent-unavailable", message: "Refresh the Google ATP list before saving."))
                }
                do {
                    nextIAB = try IABAuthority.build(
                        configuration: configuration, choices: choices,
                        gvl: gvl, subjectId: identity.id, externalId: user?.externalId,
                        fingerprint: resolved.choiceFingerprint, actionAt: actionAt, previous: committedIAB,
                        additionalConsentList: currentAdditionalConsentListLocked())
                } catch let info as CoreErrorInfo { return .failure(info) } catch {
                    return .failure(
                        CoreErrorInfo(code: "invalid-iab-choices", message: "Native IAB validation failed."))
                }
            } else if case .iab = intent {
                return .failure(
                    CoreErrorInfo(code: "iab-unavailable", message: "The resolved policy does not use IAB."))
            }

            // A bulk action covers the categories the prompt asks about, which is
            // what `resolveSaveSelection` in `packages/core` narrows it to.
            let choiceScope = choiceScopeLocked(resolved)
            let receipts = categories(
                for: intent,
                scope: choiceScope,
                current: currentSnapshot.explicitChoice
            )
            // With nothing to decide, a bulk action still covers everything the
            // subject was shown: strictly necessary alone.
            let coversShown = choiceScope.count == resolved.policy.scope.count || choiceScope.isEmpty
            let action: ConsentAction
            switch intent {
            case .all: action = coversShown ? .all : .custom
            case .necessary: action = coversShown ? .necessary : .custom
            case .custom, .iab: action = .custom
            }

            let choice = ExplicitChoice(
                merging: receipts,
                into: currentSnapshot.explicitChoice,
                actionAt: actionAt,
                fingerprint: resolved.choiceFingerprint
            )
            // Any action on a choice prompt with nothing to decide acknowledges it.
            // One that confirmed no category leaves the stored choice as it was, the
            // way the kernel only patches a choice it changed.
            let acknowledgement = choiceAcknowledgement(
                resolved,
                choiceScope: choiceScope,
                actionAt: actionAt
            )
            let storedChoice = acknowledgement != nil && receipts.isEmpty
                ? currentSnapshot.explicitChoice
                : choice
            let evaluation = PolicyEvaluator.evaluate(
                resolved,
                choice: storedChoice,
                noticeDismissal: acknowledgement ?? noticeDismissal,
                gpcActive: gpcSignal.active,
                now: actionAt,
                choiceScope: choiceScope
            )

            // The surface the subject acted on, read before the commit rewrites it.
            // `uiSource` records where the decision was made, so a save that clears
            // the prompt must not report "no surface": `buildSubjectPostBody` reads
            // the pre-commit `activeUI` for the same reason.
            let surfaceAtAction = currentSnapshot.activeUI
            // Computed, not installed. State moves only once the queue has the bytes
            // that owe delivery, so a save that cannot take on the obligation has
            // nothing to take back.
            let baseRevision = currentSnapshot.revision
            let next = currentSnapshot.byApplying { draft in
                draft.explicitChoice = storedChoice
                draft.effectivePermissions = resolved.policy.model == .iab && nextIAB == nil
                    ? .necessaryOnly : evaluation.permissions
                draft.restrictions = evaluation.restrictions
                draft.promptRequirement = evaluation.promptRequirement
                draft.nextDeadline = iabDeadlineLocked(
                    policyDeadline: evaluation.nextDeadline, consent: nextIAB)
                draft.evaluatedAt = actionAt
                draft.model =
                    config?.iab != nil && resolved.policy.model == .iab
                    ? .iab : resolved.policy.model.runtimeModel
                // Visibility follows the remaining obligation, not the fact that an
                // action was taken: a choice save under a notice rule still owes the
                // notice, so the first layer stays. Same rule as `deriveActiveUI`.
                draft.activeUI = evaluation.promptRequirement.kind == .none
                    ? ActiveUI.none
                    : ActiveUI.banner
                draft.error = nil
            }
            let payload = SavePayload(
                subjectId: identity.id,
                subject: ConsentSubject(
                    subjectId: identity.id,
                    externalId: user?.externalId,
                    identityProvider: user?.identityProvider
                ),
                choice: choice,
                confirmed: ConfirmedCoverage(categories: receipts, actionAt: actionAt),
                consents: next.effectivePermissions,
                overrides: wireOverrides,
                user: user,
                model: nextIAB != nil ? .iab : resolved.policy.model.runtimeModel,
                uiSource: surfaceAtAction,
                consentAction: action,
                policySnapshotToken: next.policySnapshotToken,
                decisionInputs: DecisionInputs(
                    policyId: resolved.resolution.policyId,
                    fingerprint: resolved.resolution.fingerprint,
                    country: overrides.country,
                    region: overrides.region,
                    language: overrides.language,
                    gpc: gpcSignal.active
                ),
                givenAt: actionAt,
                tcString: nextIAB?.tcString, addtlConsent: nextIAB?.addtlConsent
            )

            do {
                let body = try SubjectPostBodyBuilder.body(
                    for: payload,
                    domain: config?.transport?.domain ?? ""
                )
                return .success(Planned(
                    payload: payload,
                    body: body,
                    queue: queue,
                    baseRevision: baseRevision,
                    next: next,
                    result: CommitResult(
                        status: .committed,
                        revision: next.revision,
                        permissions: next.effectivePermissions,
                        consentAction: action,
                        confirmed: receipts
                    ),
                        acknowledgement: acknowledgement,
                        iabConsent: nextIAB,
                        isIAB: resolved.policy.model == .iab
                ))
            } catch {
                return .failure(CoreErrorInfo(
                    code: "encode-failed",
                    message: "Save body could not be encoded: \(error)"
                ))
            }
        }

        switch prepared {
        case let .failure(info):
            mutation.release()
            events.emit(.error(info))
            return CommitResult(
                status: .rejected,
                revision: snapshot().revision,
                permissions: snapshot().effectivePermissions,
                consentAction: intent.action,
                error: info
            )

        case let .success(plan):
            // The decision and owed bytes become durable together before either is
            // visible to readers or delivery. A failed write leaves both untouched.
            let envelope: StoredEnvelope? = lock.withLock {
                guard currentSnapshot.revision == plan.baseRevision else { return nil }
                return StoredEnvelope(
                    bundledPolicyAuthority: bundledPolicyAuthority,
                    snapshot: plan.next,
                    noticeDismissal: plan.acknowledgement ?? noticeDismissal,
                    policyResolution: policyWire, storedAt: actionAt,
                    iabConsent: plan.isIAB ? plan.iabConsent : committedIAB,
                    lastIABActionAt: plan.isIAB ? actionAt : lastIABActionAt,
                    iabListFetchedAt: iabListFetchedAt,
                    additionalConsentList: additionalConsentList)
            }
            let queued = envelope.flatMap {
                plan.queue.commit($0, body: plan.body,
                    subjectId: plan.payload.subjectId, actionAt: actionAt,
                    supersedeGrants: plan.isIAB)
            }
            guard let queuedID = queued else {
                let changed = lock.withLock { currentSnapshot.revision != plan.baseRevision }
                let info = CoreErrorInfo(
                    code: changed ? "concurrent-change" : "queue-write-failed",
                    message: "Pending save could not be persisted, so the decision was not recorded and nothing was sent."
                )
                mutation.release()
                events.emit(.error(info))
                return CommitResult(
                    status: .rejected,
                    revision: snapshot().revision,
                    permissions: snapshot().effectivePermissions,
                    consentAction: intent.action,
                    error: info
                )
            }

            lock.withLock {
                if plan.isIAB {
                    committedIAB = plan.iabConsent
                    lastIABActionAt = actionAt
                }
                currentSnapshot = plan.next
                noticeDismissal = plan.acknowledgement ?? noticeDismissal
                persistedRevision = plan.next.revision
            }
            writeTcStorageBus()

            publish(persist: false, mutation: mutation)
            events.emit(.saveQueued(subjectId: plan.payload.subjectId))
            let body = plan.body
            let subjectId = plan.payload.subjectId
            let queue = plan.queue
            schedule {
                guard let transport = self.transport else {
                    // No transport on this launch. The entry stays queued for
                    // whichever launch finally has one, and that has to be said out
                    // loud: an obligation with no sender is invisible from
                    // `CommitResult`, which is the state this branch exists to avoid.
                    self.events.emit(.error(CoreErrorInfo(
                        code: "transport-unavailable",
                        message: "No transport is configured on this launch, so a queued consent save is waiting undelivered."
                    )))
                    return
                }
                // The first send takes the core the same way a replay does. It is a
                // pass over one entry, and a pass over the whole queue must not be
                // reading that entry at the same time -- see
                // ``requestDeliveryPass(ownSend:)``. When it loses that race it sends
                // nothing, because the pass that won covers this body on its way out.
                await self.requestDeliveryPass(ownSend: {
                    // The queue gets asked last. Both senders hold the pass when they
                    // reach here, so an entry that is already gone was landed by the
                    // pass that held the core before this one; re-sending the same
                    // frozen bytes would buy a second POST for one decision.
                    guard queue.isPending(id: queuedID), self.canDeliverIAB(body) else { return }

                    switch await transport.sendSave(body) {
                    case .success:
                        queue.remove(id: queuedID)
                        self.events.emit(.saveDelivered(subjectId: subjectId))
                    case let .failure(error):
                        self.settleFailedSend(
                            error,
                            queue: queue,
                            entryID: queuedID,
                            subjectId: subjectId
                        )
                    }
                })
            }
            return plan.result
        }
    }

    /// Account for a first send that did not land.
    ///
    /// Two outcomes, and the difference is whether the same bytes could ever be
    /// accepted. A transport that could not reach the backend, or answered `503`,
    /// says nothing about the body, so the entry keeps its place in the queue with
    /// one attempt spent and the next launch tries again. A backend that refused the
    /// body on its own terms says something permanent, because the queue replays
    /// frozen bytes: `INPUT_VALIDATION_FAILED` on the first try is
    /// `INPUT_VALIDATION_FAILED` on the tenth.
    ///
    /// Frozen withdrawals remain queued even after a refusal. Other permanently
    /// refused bodies are dropped rather than kept. It is not a lost
    /// decision: the subject's choice lives in the stored envelope either way, and
    /// an obligation no producer will ever accept is not worth twenty slots on
    /// every future launch. Dropping one is only survivable if it is announced, so
    /// every branch here emits, and the two that release the entry name the reason
    /// it stopped being owed.
    private func settleFailedSend(
        _ error: C15tError,
        queue: PendingSaveQueue,
        entryID: String,
        subjectId: String
    ) {
        let protectedWithdrawal = queue.entries().first { $0.id == entryID }?.isProtectedWithdrawal == true
        guard error.isPermanentlyRejected && !protectedWithdrawal else {
            // Leave it queued with one attempt spent. The decision is already local
            // and durable; the backend can wait.
            let outcome = queue.recordFailedAttempt(id: entryID)
            if outcome.dropsEntry {
                events.emit(.error(Self.undeliverableSave(subjectId: subjectId, error: error, outcome: outcome)))
                return
            }
            events.emit(.error(error.info))
            return
        }

        queue.remove(id: entryID)
        events.emit(.error(CoreErrorInfo(
            code: "save-rejected",
            message: "The backend refused this consent save, so it was dropped and will not be retried: \(error.message)"
        )))
    }

    /// The announcement for an obligation the queue released with the body never
    /// accepted.
    ///
    /// Both roads reach it: a save whose very first send spent the last attempt, and
    /// a replay that ran a body out. One message builder keeps them from drifting
    /// apart, because after this point nothing on the device remembers that the
    /// decision owed anyone anything, and a host that is not told has no way to
    /// learn it.
    private static func undeliverableSave(
        subjectId: String,
        error: C15tError,
        outcome: FailedAttempt
    ) -> CoreErrorInfo {
        let reason: String
        switch outcome {
        case let .droppedAfterAttempts(attempts):
            reason = "it was refused \(attempts) times, which is the ceiling of \(PendingSaveQueue.maxAttempts) attempts"
        case .droppedAsTooOld:
            let days = PendingSaveQueue.maxAgeMs / 86_400_000
            reason = "it waited longer than the queue's \(days) day retention window"
        case .retrying, .alreadyGone:
            // Unreachable: callers only announce a drop. Here so a future ceiling
            // cannot turn the message into a lie about why.
            reason = "it left the queue unaccepted"
        }
        return CoreErrorInfo(
            code: "save-undeliverable",
            message: "A queued consent save for \(subjectId) was dropped because \(reason). Last backend error: \(error.message)"
        )
    }

    /// Record that the notice was dismissed. Grants nothing: a dismissal is not a
    /// choice, and the optional categories stay wherever the policy left them.
    /// - Returns: True only after durable local storage accepts the acknowledgement.
    @discardableResult
    public func dismissNotice() -> Bool {
        let mutation = mutationGate.acquire()
        defer { mutation.release() }
        let at = (lock.withLock { config }?.now ?? Self.wallClock)()
        let planned: (ConsentSnapshot, NoticeDismissal, StoredEnvelope, PendingSaveQueue)? = lock.withLock {
            guard let resolved = resolvedPolicy, resolved.policy.prompt == .notice, let queue else { return nil }
            let dismissal = NoticeDismissal(dismissedAt: at, fingerprint: resolved.noticeFingerprint)
            let evaluation = PolicyEvaluator.evaluate(resolved, choice: currentSnapshot.explicitChoice,
                noticeDismissal: dismissal, gpcActive: gpcSignal.active, now: at,
                choiceScope: choiceScopeLocked(resolved))
            let next = currentSnapshot.byApplying { draft in
                draft.promptRequirement = evaluation.promptRequirement
                draft.effectivePermissions = evaluation.permissions
                draft.restrictions = evaluation.restrictions
                draft.nextDeadline = iabDeadlineLocked(policyDeadline: evaluation.nextDeadline, consent: committedIAB)
                draft.evaluatedAt = at
                draft.activeUI = .none
            }
            let envelope = StoredEnvelope(bundledPolicyAuthority: bundledPolicyAuthority,
                snapshot: next, noticeDismissal: dismissal,
                policyResolution: policyWire, storedAt: at, iabConsent: committedIAB,
                lastIABActionAt: lastIABActionAt, iabListFetchedAt: iabListFetchedAt,
                additionalConsentList: additionalConsentList)
            return (next, dismissal, envelope, queue)
        }
        guard let (next, dismissal, envelope, queue) = planned else { return false }
        guard queue.persist(envelope) else {
            mutation.release()
            events.emit(.error(CoreErrorInfo(code: "queue-write-failed", message: "The notice acknowledgement could not be stored.")))
            return false
        }
        lock.withLock {
            currentSnapshot = next
            noticeDismissal = dismissal
            persistedRevision = next.revision
        }
        publish(persist: false, mutation: mutation)
        return true
    }

    /// Re-run init. The contract's refresh, called on foreground or after a reachability
    /// change, and it is also what re-resolves policy after an override change.
    public func refresh() {
        scheduleInit(attempt: 1)
    }

    /// Replay queued saves before refreshing policy after foreground or connectivity recovery.
    ///
    /// Returns after scheduling. If a delivery pass is already running, waits for that
    /// pass to finish its requested replay before starting init. An unreachable replay
    /// still permits the refresh to try fetching policy and disclosure.
    public func replayThenRefresh() {
        schedule {
            await self.requestDeliveryPass(ownSend: nil)
            await self.runInit(attempt: 1)
        }
    }

    /// Attach an identified user. The c15t subject id does not change: an external
    /// id is a second key on the same subject, not a new subject.
    public func identify(_ user: KernelUser) {
        let mutation = mutationGate.acquire()
        defer { mutation.release() }
        let transition = transitionIAB(user: user, reset: false)
        if transition == false {
            events.emit(
                .error(
                    CoreErrorInfo(
                        code: "identity-write-failed",
                        message: "Identity was not changed because its consent reset could not be persisted.")
                ))
            return
        }
        let identity = lock.withLock { () -> SubjectIdentity? in
            if transition == true { return self.identity }
            self.user = user
            currentSnapshot = currentSnapshot.byApplying { draft in
                draft.subject = self.identity.map { $0.snapshot(externalId: user.externalId) }
            }
            return self.identity
        }
        publish(persist: transition == nil, mutation: mutation)
        guard let identity else { return }
        schedule {
            guard let transport = self.transport else { return }
            if case let .failure(error) = await transport.patchIdentity(
                subjectId: identity.id,
                externalId: user.externalId,
                identityProvider: user.identityProvider
            ) {
                self.events.emit(.error(error.info))
            }
        }
    }

    /// Forget the external id. Consent records and the subject id stay: the
    /// subject's decisions belong to the device's subject, not to the account that
    /// happened to be signed in when they were made.
    public func logout() {
        let mutation = mutationGate.acquire()
        defer { mutation.release() }
        if let changed = transitionIAB(user: nil, reset: false) {
            if changed {
                publish(persist: false, mutation: mutation)
            } else {
                events.emit(
                    .error(
                        CoreErrorInfo(
                            code: "identity-write-failed",
                            message:
                                "Logout was not recorded because its consent reset could not be persisted.")))
            }
            return
        }
        lock.withLock {
            user = nil
            currentSnapshot = currentSnapshot.byApplying { draft in
                draft.subject = self.identity.map { $0.snapshot(externalId: nil) }
            }
        }
        publish(persist: true, mutation: mutation)
    }

    /// Change the geographic, language, or test context.
    ///
    /// Policy was resolved for the previous context, so this re-resolves it. The
    /// local re-evaluation happens immediately so a caller sees the override on the
    /// next read; the re-resolve refines it.
    public func setOverrides(_ overrides: ConsentOverrides) {
        let mutation = mutationGate.acquire()
        defer { mutation.release() }
        let changed = lock.withLock { () -> Bool in
            guard self.overrides != overrides else { return false }
            self.overrides = overrides
            self.configuredOverrides = overrides
            reevaluateLocked(now: (config?.now ?? Self.wallClock)())
            return true
        }
        guard changed else { return }
        publish(persist: true, mutation: mutation)
        refresh()
    }

    /// Ask for everything the queue is holding to be delivered. Call on launch, on
    /// foreground, and on a reachability change.
    ///
    /// This is a request for a pass, not a pass of its own. One pass may be in flight
    /// per core, so a call that lands while another pass is sending is answered by
    /// that pass without starting a second one -- see
    /// ``requestDeliveryPass(ownSend:)``. Nothing is weakened about the obligation:
    /// an entry waiting on the running pass is still owed, still counted by
    /// ``pendingSaveCount()``, and still announced by exactly one delivered event.
    public func flushPending() {
        schedule { await self.requestDeliveryPass(ownSend: nil) }
    }

    /// Wipe consent and return the device to the state a first launch is in.
    ///
    /// The snapshot installed here is ``ConsentSnapshot/coldStart``, and the difference
    /// between it and a recorded denial is the whole point of the method. A denial is an
    /// ``ExplicitChoice`` that says the subject answered, so ``PolicyEvaluator`` finds a
    /// current receipt, owes nothing, and no prompt ever comes back. This installs no
    /// receipt at all, so the choice is owed again and the banner returns once the init
    /// below lands. `native/CONTRACT.md` states this under "Wiping consent (reset)".
    ///
    /// Three things it has to do that clearing the store does not cover:
    ///
    /// - Publish. This is a committed mutation, so it bumps the revision by one and goes
    ///   out through ``onChange(_:)`` like any other mutation. Installing the baseline
    ///   quietly would leave every ``gate(_:_:)`` in the process holding a decision the
    ///   device no longer remembers, and restarting the numbering at the cold-start
    ///   revision would hand each subscriber a snapshot older than the one it holds and
    ///   switch persistence off for the session, because ``persistEnvelope()`` refuses a
    ///   write that is not ahead of the last one.
    /// - Remove grants durably. Category-only state without an owed withdrawal is
    ///   deleted. IAB authority or owed withdrawals require an atomic empty decision
    ///   envelope retaining the action-time watermark and frozen withdrawal bodies.
    ///   ``hasStoredSnapshot`` reports that retained envelope, not a consent grant.
    /// - Re-run init. A first launch does not sit at `policyPending` once the network
    ///   answers, and stopping at the baseline would leave the app there until the next
    ///   launch, with the subject withdrawn from everything and nothing asking them to
    ///   decide again. A caller must not have to remember to refresh after this.
    ///
    /// What survives is configuration rather than consent: the subject id with its external
    /// id, the overrides the host pinned, and the configured category scope. A host that pinned a
    /// country for QA or switched GPC on would otherwise get a different policy resolved
    /// than the one its app is configured to evaluate.
    ///
    /// A save a delivery pass had already handed to the transport can still land after the
    /// queued grants are dropped. Nothing here waits for it. Frozen withdrawals remain
    /// owed under their original owner; reset creates no new consent decision.
    public func reset() {
        let mutation = mutationGate.acquire()
        defer { mutation.release() }
        if let changed = transitionIAB(user: lock.withLock { user }, reset: true) {
            if changed {
                publish(persist: false, mutation: mutation); scheduleInit(attempt: 1)
            } else {
                events.emit(
                    .error(
                        CoreErrorInfo(
                            code: "reset-write-failed", message: "Consent reset could not be persisted.")))
            }
            return
        }
        let wired = lock.withLock {
            () -> (store: any ConsentStore, queue: PendingSaveQueue, bus: (any TcStorageBusWriting)?)? in
            let now = (config?.now ?? Self.wallClock)()
            committedIAB = nil
            resolvedPolicy = nil
            bundledPolicyAuthority = nil
            policyWire = nil
            noticeDismissal = nil
            currentSnapshot = currentSnapshot.byApplying { draft in
                // Every field a cold start leaves at its default is set here rather than
                // carried over. A draft copy that forgets one keeps a withdrawn decision
                // alive in a snapshot that claims to hold none, and that is the exact
                // failure this method exists to prevent.
                draft.policyPending = true
                draft.ready = false
                draft.model = .optIn
                draft.activeUI = .none
                draft.promptRequirement = .none
                draft.effectivePermissions = .necessaryOnly
                draft.explicitChoice = nil
                draft.restrictions = [:]
                draft.resolution = .pending
                draft.policySnapshotToken = nil
                draft.location = nil
                draft.translations = nil
                // The list came with a policy claim, so it goes with one; a wipe leaves no
                // IAB state behind, and the next init serves it again if the matched
                // model is still `iab`.
                draft.iab = nil
                draft.nextDeadline = nil
                draft.error = nil
                draft.evaluatedAt = now
                if let identity {
                    draft.subject = identity.snapshot(externalId: user?.externalId)
                }
                draft.consentCategories = decidedCategories(nil)
                // The host's pins, not ``overrides``. See ``configuredOverrides``: the
                // folded country came from the resolution this wipe is deleting, and
                // keeping it would leave the answer one field off a first launch's.
                draft.overrides = configuredOverrides
                draft.privacySignals = PrivacySignals(
                    gpc: GpcSignal.derive(
                        override: configuredOverrides.gpc,
                        detected: detectedGPCSignal
                    )
                )
            }
            persistedRevision = 0
            restoredFromStore = false
            guard let config, let queue else { return nil }
            return (config.store, queue, config.storageBus)
        }
        // Storage first, outside the lock, so nothing is announced about a device whose
        // bytes are still there. A core that was never bootstrapped has no store and no
        // queue to clear, and its in-memory state is already the baseline above.
        if let wired {
            wired.queue.clear()
            wired.store.set(nil, for: StorageKey.snapshot)
            wired.store.set(nil, for: StorageKey.pendingSaves)
            // Same step, same rule as every other wipe: the keys this core put
            // on the bus go with the envelope they projected. The wipe clears
            // the whole spec table, not just the rows written this run -- the
            // clear's own doc states why.
            wired.bus?.clear()
        }
        writeTcStorageBus()
        publish(persist: false, mutation: mutation)
        if let config = lock.withLock({ self.config }), let selection = config.bundledPolicy?.resolve(overrides: config.overrides, now: config.now()),
            selection.authority.isUsable(endpoint: config.policyEndpoint, now: config.now()) { applyPolicyUpdate(selection.response, bundle: selection) }
        scheduleInit(attempt: 1)
    }

    /// Everything waiting to reach the backend.
    public func pendingSaveCount() -> Int {
        lock.withLock { queue }.map { $0.count() } ?? 0
    }

    /// The queued bodies, oldest action first. A replay must resend these bytes
    /// verbatim, so they are readable rather than inferred from a mock.
    package func pendingSaveBodies() -> [Data] {
        lock.withLock { queue }?.entries().map(\.body) ?? []
    }

    // MARK: - Hydration

    /// Restore the stored envelope and make it answerable.
    ///
    /// An envelope here is what sets ``ConsentSnapshot/ready`` during hydration. A
    /// first launch finds none and stays not-ready until the first init resolves, which
    /// ``applyInit`` does in its resolved branch.
    ///
    /// Reads the cache once, synchronously, and re-runs the evaluator against the
    /// current clock. Re-evaluating is the difference between a cached snapshot and
    /// a stale one: a choice that expired overnight must not open a tag this
    /// morning just because the network is not available yet.
    @discardableResult
    public func hydrate() -> ConsentSnapshot {
        let mutation = mutationGate.acquire()
        defer { mutation.release() }
        return hydrate(mutation: mutation)
    }

    @discardableResult
    private func hydrate(mutation: MutationPermit) -> ConsentSnapshot {
        guard let config = lock.withLock({ self.config }) else { return snapshot() }
        config.storageBus?.write(TcStorageBus.detection(config.iab))

        let hadRecords = config.store.data(for: StorageKey.snapshot) != nil
            || config.store.data(for: StorageKey.pendingSaves) != nil
        // Identity first, on disk, outside the lock.
        let identityRead = SubjectIdentity.loadOrCreate(from: config.store)
        let identity = identityRead.identity
        if let unusable = identityRead.unusable {
            // The id the records are keyed to is one the producer refuses, so those
            // records describe a subject no query returns. Keep them and the next
            // launch attributes them to the id minted a moment ago: one subject split
            // across two ids, silently. `native/CONTRACT.md` prices the refused id at
            // nothing, so everything written under it goes with it -- the envelope and
            // the queued bodies alike, since those bytes were already refused for
            // carrying this id and replaying them buys a guaranteed rejection.
            config.store.set(nil, for: StorageKey.snapshot)
            config.store.set(nil, for: StorageKey.pendingSaves)
            announceUnusableSubjectId(unusable)
        }
        let envelopeData = config.store.data(for: StorageKey.snapshot)
        var envelope = envelopeData.flatMap(StoredEnvelope.decode)
        let replacementReason = identityRead.replacementReason
        if replacementReason != nil && hadRecords
            || envelope.map({ $0.snapshot.subject?.id != identity.id }) == true {
            config.store.set(nil, for: StorageKey.snapshot)
            config.store.set(nil, for: StorageKey.pendingSaves)
            envelope = nil
            let reason = replacementReason ?? "mismatch"
            let announce = lock.withLock { identityRecoveryAnnouncements.insert(reason).inserted }
            if announce {
                events.emit(.error(CoreErrorInfo(
                    code: "subject-id-\(reason)",
                    message: "c15t: the stored subject identity is \(reason). Stored consent and queued saves were discarded; the app asks for consent again."
                )))
            }
        }

        let restored = lock.withLock { () -> ConsentSnapshot in
            self.identity = identity
            self.restoredFromStore = envelope != nil
            // A missing host override restores the last explicitly stored account.
            // Logout persists nil; installation identity never supplies an account ID.
            if config.user == nil, self.user == nil,
                let externalId = envelope?.snapshot.subject?.externalId {
                self.user = KernelUser(externalId: externalId)
            }

            var draft = ConsentSnapshot.Draft(current: envelope?.snapshot ?? .coldStart)
            draft.subject = identity.snapshot(externalId: self.user?.externalId)
            draft.overrides = overrides
            draft.ready = envelope != nil

            self.bundledPolicyAuthority = envelope?.bundledPolicyAuthority
            self.policyWire = envelope?.policyResolution
            self.noticeDismissal = envelope?.noticeDismissal
            self.additionalConsentList = envelope?.additionalConsentList
            self.iabListFetchedAt = envelope?.iabListFetchedAt
            self.committedIAB = envelope?.iabConsent
            let watermark = envelope?.lastIABActionAt ?? envelope?.iabConsent?.actionAt
            // A backward clock jump must not let a restart reuse an action time.
            self.lastIABActionAt = watermark.flatMap { $0 >= 0 ? $0 : nil }

            if let wire = envelope?.policyResolution {
                switch PolicyWireReader.read(wire) {
                case let .resolved(resolved):
                    self.resolvedPolicy = resolved
                    draft.resolution = resolved.resolution
                    draft.model =
                        config.iab != nil && resolved.policy.model == .iab
                        ? .iab : resolved.policy.model.runtimeModel
                    draft.policyPending = false
                    draft.error = nil
                case let .rejected(reason, message):
                    self.resolvedPolicy = nil
                    draft.policyPending = true
                    draft.effectivePermissions = ConsentSnapshot.failClosedPermissions
                    draft.activeUI = .none
                    draft.promptRequirement = .none
                    draft.restrictions = [:]
                    draft.error = CoreErrorInfo(code: reason.rawValue, message: message)
                }
            } else {
                self.resolvedPolicy = nil
                draft.policyPending = true
                // Provisional: nothing has resolved, so no surface is claimed.
                draft.activeUI = .none
                draft.effectivePermissions = .necessaryOnly
                draft.promptRequirement = .none
            }

            // Stored bytes get the scope too, which is the part a "we prune what the
            // backend served us" rule quietly misses. An envelope can predate this
            // setting: the host added the declaration in this release, or the bytes came
            // from a build that had no scope at all, or the declaration was widened and
            // then narrowed again on a device that never went online. Reading those
            // bytes straight into state would serve the wider list to the very first
            // drawer that opens before `/init` lands, and on a device whose network never
            // comes back that drawer is the answer for the life of the app. Pruning on
            // the read costs nothing when the scope is already in force -- keeping an
            // ``narrowed`` list narrowed is identity -- so this is the whole guarantee
            // rather than a race against the network.
            //
            if let stored = draft.iab?.gvl {
                draft.iab = KernelIABState(gvl: stored.narrowed(toVendorIds: config.vendors))
            }

            // The subject-facing list, against whatever this store says is in force.
            draft.consentCategories = decidedCategories(self.resolvedPolicy)

            // Continue the stored numbering rather than restarting at 1, so a
            // subscriber that saw revision 3 before the relaunch cannot treat the
            // restored snapshot as older than the state it already holds.
            let restoredRevision = envelope?.snapshot.revision ?? 0
            let base = draft.build(
                revision: max(currentSnapshot.revision, restoredRevision) + 1
            )
            currentSnapshot = base
            // Re-evaluate on the restored records at the current time. A rejected
            // wire has nothing to evaluate against, so it keeps deny-all.
            reevaluateLocked(now: config.now())
            return currentSnapshot
        }

        publish(persist: true, mutation: mutation)
        if let error = restored.error {
            events.emit(.error(error))
        }
        return restored
    }

    /// Repair vendor storage from current native authority and its validity clock.
    /// Never restore a raw stored grant or treat the vendor mirror as consent.
    public func rebuildTcStorageBus() {
        let mutation = mutationGate.acquire()
        defer { mutation.release() }
        writeTcStorageBus()
    }

    /// The mutation permit orders complete publications; storage runs outside the state lock.
    private func writeTcStorageBus() {
        let publication = lock.withLock { () -> (bus: any TcStorageBusWriting, values: [String: TcBusValue])? in
            guard let config, let bus = config.storageBus else { return nil }
            let saved = committedIAB.flatMap { saved -> IABCommittedConsent? in
                guard listIsUsableLocked(), resolvedPolicy?.policy.model == .iab,
                    !currentSnapshot.policyPending,
                    saved.adTechProvidersID == nil || currentAdditionalConsentListLocked() != nil,
                    saved.isCurrent(now: config.now(), maxAge: resolvedPolicy?.policy.choiceMaxAgeMs ?? 0)
                else { return nil }
                return saved
            }
            let envelope = StoredEnvelope(
                    bundledPolicyAuthority: bundledPolicyAuthority,
                snapshot: readableSnapshotLocked(), noticeDismissal: noticeDismissal,
                policyResolution: policyWire, storedAt: config.now(), iabConsent: saved,
                lastIABActionAt: lastIABActionAt, iabListFetchedAt: iabListFetchedAt,
                additionalConsentList: additionalConsentList)
            return (bus, TcStorageBus.values(for: envelope, configuration: config.iab))
        }
        guard let publication else { return }
        publication.bus.write(publication.values)
    }

    // MARK: - Idle

    /// Await everything the core has scheduled.
    ///
    /// A binding layer rarely wants this; a test wants it constantly, because
    /// "the payload was persisted before the call" and "the replay sent the same
    /// bytes" are only observable once the scheduled work has landed.
    public func waitUntilIdle() async {
        while true {
            await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
                let busy = lock.withLock {
                    if inFlightWork == 0 {
                        return false
                    }
                    idleWaiters.append(continuation)
                    return true
                }
                if !busy {
                    continuation.resume()
                    return
                }
            }
            let busy = lock.withLock { inFlightWork > 0 }
            if !busy { return }
        }
    }

    // MARK: - Internals

    /// Whether ``subject-id-unusable`` has been announced this launch.
    ///
    /// ``hydrate()`` is public and a binding layer can call it again after a store
    /// swap, so the flag lives here rather than relying on bootstrap's once-only guard.
    private var unusableSubjectIdAnnounced = false
    private var identityRecoveryAnnouncements: Set<String> = []

    /// Say once per launch why a returning user is being asked for consent again.
    ///
    /// The host gets the refused id, which shape it was, and what the core gave up,
    /// because "the app forgot my choices" is only explainable if the message says whose
    /// format refused the id and that the server never held the decision it is missing.
    private func announceUnusableSubjectId(_ unusable: UnusableSubjectId) {
        let alreadyAnnounced = lock.withLock {
            if unusableSubjectIdAnnounced { return true }
            unusableSubjectIdAnnounced = true
            return false
        }
        guard !alreadyAnnounced else { return }

        let origin = unusable.legacyShape
            ? "it has the UUID shape this SDK wrote before the sub_ format existed"
            : "it is a format this SDK never wrote"
        events.emit(.error(CoreErrorInfo(
            code: "subject-id-unusable",
            message: "c15t: the stored subject id \(unusable.id) \(origin), and the c15t "
                + "backend only accepts ids matching ^sub_[1-9A-HJ-NP-Za-km-z]+$, so this "
                + "build cannot use that identity. The consent saved under it was discarded "
                + "with it, because the backend refused every save that carried it and holds "
                + "no decision for it. A new subject id was minted, so the app asks for "
                + "consent again; nothing the subject chose was overwritten on the server."
        )))
    }

    private static let wallClock: @Sendable () -> Int64 = {
        Int64(Date().timeIntervalSince1970 * 1_000)
    }

    private var transport: (any C15tTransport)? {
        lock.withLock { config?.transport }
    }

    /// What the device reports, with no override applied: the host's report when
    /// it made one, otherwise what the backend resolved. Callers must already
    /// hold the lock.
    private var detectedGPCSignal: Bool {
        config?.gpc ?? detectedGPC
    }

    /// The GPC signal to honor, in the detected / override / active shape the
    /// kernel uses. The snapshot's copy is an output of this, never an input, so
    /// a stored value can never keep denying after the signal is gone. An app
    /// override wins over a detection, which is what makes it an override.
    /// Callers must already hold the lock.
    private var gpcSignal: GpcSignal {
        GpcSignal.derive(override: overrides.gpc, detected: detectedGPCSignal)
    }

    /// Overrides in wire form. Callers must already hold the lock.
    private var wireOverrides: KernelOverridesWire {
        KernelOverridesWire(
            country: overrides.country,
            region: overrides.region,
            language: overrides.language,
            gpc: gpcSignal.active
        )
    }

    /// The categories the consent surfaces list right now.
    ///
    /// The same derivation the web dialog uses (`getDisplayedConsents` in
    /// `use-manager.ts`): `necessary` first, then the choice scope, which is the
    /// policy scope narrowed by the host's own declaration. A host that declares
    /// nothing is asked about the whole scope of a strict rule and about none of a
    /// permissive one, where it is offered `necessary` alone; a name the host
    /// declares that the resolved policy does not govern is dropped, because a row
    /// the evaluator will not honour is a row that cannot be honoured. Before any
    /// policy resolves the evaluator runs the safe fallback rule, which is strict,
    /// over every optional category, so the scope behind the list is the full
    /// optional set -- the same rows the web shows while it waits for init.
    ///
    /// The list is `necessary` plus the optional names in canonical (sorted) order;
    /// the JavaScript layer restyles that into display order, and both native cores
    /// emit this exact shape so the protocol fixtures can pin them together.
    ///
    /// Callers must already hold the lock, because the answer reads ``config``.
    private func decidedCategories(_ resolved: ResolvedPolicy?) -> [ConsentCategory] {
        let scope: [OptionalConsentCategory]
        if let resolved {
            scope = choiceScopeLocked(resolved)
        } else if let list = config?.consentCategories, !list.isEmpty {
            scope = OptionalConsentCategory.allCases.filter { list.contains($0.category) }
        } else {
            scope = Array(OptionalConsentCategory.allCases)
        }
        let optional = scope
            .map(\.category)
            .sorted { $0.rawValue < $1.rawValue }
        return [ConsentCategory.necessary] + optional
    }

    /// The categories the choice prompt asks about under `resolved`, narrowed by the
    /// host's declaration. Callers must already hold the lock, because the answer
    /// reads ``config``.
    private func choiceScopeLocked(_ resolved: ResolvedPolicy) -> [OptionalConsentCategory] {
        PolicyEvaluator.choiceScope(of: resolved.policy, declared: config?.consentCategories)
    }

    /// The acknowledgement a save records when the choice prompt has no category to
    /// decide, or `nil` when it has one.
    ///
    /// `choiceAcknowledgement` in `packages/core/src/kernel/commands.ts`. It is a notice
    /// dismissal bound to the choice fingerprint, so the envelope carries it the way it
    /// carries a notice dismissal, and the evaluator never mistakes it for one. A
    /// stored acknowledgement at least as new is kept. Callers must already hold the
    /// lock, because the answer reads ``noticeDismissal``.
    private func choiceAcknowledgement(
        _ resolved: ResolvedPolicy,
        choiceScope: [OptionalConsentCategory],
        actionAt: Int64
    ) -> NoticeDismissal? {
        guard resolved.policy.prompt == .choice, choiceScope.isEmpty else { return nil }
        if let current = noticeDismissal,
           current.fingerprint == resolved.choiceFingerprint,
           current.dismissedAt >= actionAt
        {
            return current
        }
        return NoticeDismissal(dismissedAt: actionAt, fingerprint: resolved.choiceFingerprint)
    }

    /// Map an intent onto the receipts it confirms. Callers must already hold the
    /// lock, because the answer depends on the active scope.
    private func categories(
        for intent: CommitIntent,
        scope: [OptionalConsentCategory],
        current: ExplicitChoice?
    ) -> [OptionalConsentCategory: Bool] {
        switch intent {
        case .all:
            var receipts: [OptionalConsentCategory: Bool] = [:]
            for category in scope { receipts[category] = true }
            return receipts
        case .necessary:
            var receipts: [OptionalConsentCategory: Bool] = [:]
            for category in scope { receipts[category] = false }
            return receipts
        case let .custom(map), let .iab(_, map):
            // Exactly what the form sent. Categories outside scope are still
            // recorded: the evaluator masks them, and a later policy that brings
            // them into scope should find the answer the subject already gave.
            return map
        }
    }

    private func validateIABLocked() {
        guard resolvedPolicy?.policy.model == .iab || committedIAB != nil else { return }
        let valid: Bool
        if let saved = committedIAB, let c = config?.iab, saved.configuration == c,
            let now = config?.now(),
            saved.isCurrent(now: now, maxAge: resolvedPolicy?.policy.choiceMaxAgeMs ?? 0),
            let gvl = currentSnapshot.iab?.gvl,
            saved.vendorListVersion == gvl.vendorListVersion, saved.policyVersion == gvl.tcfPolicyVersion,
            saved.disclosureID == (try? IABAuthority.disclosureID(gvl)),
            saved.subjectId == identity?.id, saved.externalId == user?.externalId,
            resolvedPolicy?.policy.model == .iab, saved.fingerprint == resolvedPolicy?.choiceFingerprint,
            let rebuilt = try? IABAuthority.build(
                configuration: c, choices: saved.choices,
                gvl: gvl, subjectId: saved.subjectId, externalId: saved.externalId,
                fingerprint: saved.fingerprint, actionAt: saved.actionAt, previous: saved,
                additionalConsentList: currentAdditionalConsentListLocked())
        {
            valid = rebuilt.tcString == saved.tcString && rebuilt.choices == saved.choices
                && rebuilt.addtlConsent == saved.addtlConsent && rebuilt.adTechProvidersID == saved.adTechProvidersID
        } else {
            valid = false
        }
        if !valid {
            committedIAB = nil
            var draft = ConsentSnapshot.Draft(current: currentSnapshot)
            draft.explicitChoice = nil
            currentSnapshot = draft.build(revision: currentSnapshot.revision)
            needsGrantCleanup = true
        }
    }

    /// Identity changes and reset use a durable empty decision, so a failed deletion
    /// cannot restore an earlier grant on the next launch.
    private func transitionIAB(user nextUser: KernelUser?, reset: Bool) -> Bool? {
        guard let wired = lock.withLock({ self.config.map { ($0, self.queue) } }), let queue = wired.1 else { return nil }
        let config = wired.0
        let owed = reset && queue.entries().contains(where: { $0.isProtectedWithdrawal })
        let envelope: StoredEnvelope? = lock.withLock {
            guard committedIAB != nil || resolvedPolicy?.policy.model == .iab || owed else { return nil }
            if !reset && user?.externalId == nextUser?.externalId { return nil }
            var next = currentSnapshot.byApplying { draft in
                draft.explicitChoice = nil
                draft.effectivePermissions = .necessaryOnly
                draft.subject = identity?.snapshot(externalId: nextUser?.externalId)
                if reset {
                    draft.iab = nil; draft.policyPending = true; draft.ready = false
                    draft.resolution = .pending; draft.policySnapshotToken = nil
                    draft.activeUI = .none; draft.promptRequirement = .none
                    draft.restrictions = [:]; draft.nextDeadline = nil
                    draft.model = .optIn; draft.location = nil; draft.translations = nil
                    draft.error = nil; draft.evaluatedAt = config.now()
                    draft.consentCategories = decidedCategories(nil)
                    draft.overrides = configuredOverrides
                    draft.privacySignals = PrivacySignals(gpc: GpcSignal.derive(
                        override: configuredOverrides.gpc, detected: detectedGPCSignal))
                }
            }
            if !reset, let resolved = resolvedPolicy {
                let e = PolicyEvaluator.evaluate(
                    resolved, choice: nil, noticeDismissal: nil,
                    gpcActive: gpcSignal.active, now: config.now(), choiceScope: choiceScopeLocked(resolved))
                var draft = ConsentSnapshot.Draft(current: next)
                draft.effectivePermissions = resolved.policy.model == .iab ? .necessaryOnly : e.permissions
                draft.promptRequirement = e.promptRequirement
                draft.restrictions = e.restrictions
                draft.nextDeadline = iabDeadlineLocked(policyDeadline: e.nextDeadline, consent: nil)
                draft.activeUI = e.promptRequirement.kind == .none ? ActiveUI.none : .banner
                next = draft.build(revision: next.revision)
            }
            return StoredEnvelope(
                    bundledPolicyAuthority: bundledPolicyAuthority,
                snapshot: next, noticeDismissal: nil,
                policyResolution: reset ? nil : policyWire, storedAt: config.now(),
                lastIABActionAt: lastIABActionAt, iabListFetchedAt: reset ? nil : iabListFetchedAt,
                additionalConsentList: reset ? nil : additionalConsentList)
        }
        guard let envelope else { return nil }
        guard queue.replace(envelope) else { return false }
        lock.withLock {
            currentSnapshot = envelope.snapshot; committedIAB = nil; noticeDismissal = nil; user = nextUser
            persistedRevision = envelope.snapshot.revision
            if reset {
                resolvedPolicy = nil; policyWire = nil; restoredFromStore = false
                additionalConsentList = nil
                iabListFetchedAt = nil; iabListFromCache = true; iabListOffline = false
            }
        }
        writeTcStorageBus()
        return true
    }

    /// Re-run the evaluator against the current policy and records. Callers must
    /// already hold the lock.
    private func reevaluateLocked(now: Int64, bumpRevision: Bool = true) {
        guard let resolved = resolvedPolicy, !currentSnapshot.policyPending else { return }
        if let authority = bundledPolicyAuthority, !authority.isUsable(endpoint: config?.policyEndpoint, now: now) {
            var draft = ConsentSnapshot.Draft(current: constrainBundledPolicyLocked(currentSnapshot))
            draft.nextDeadline = nil
            draft.evaluatedAt = now
            currentSnapshot = draft.build(revision: currentSnapshot.revision + (bumpRevision ? 1 : 0))
            return
        }
        validateIABLocked()
        let evaluation = PolicyEvaluator.evaluate(
            resolved,
            choice: currentSnapshot.explicitChoice,
            noticeDismissal: noticeDismissal,
            gpcActive: gpcSignal.active,
            now: now,
            choiceScope: choiceScopeLocked(resolved)
        )
        var draft = ConsentSnapshot.Draft(current: currentSnapshot)
            draft.effectivePermissions = resolved.policy.model == .iab && (committedIAB == nil || !listIsUsableLocked())
                ? .necessaryOnly : evaluation.permissions
            draft.restrictions = evaluation.restrictions
            draft.promptRequirement = evaluation.promptRequirement
            draft.nextDeadline = iabDeadlineLocked(
                policyDeadline: evaluation.nextDeadline, consent: committedIAB)
            draft.evaluatedAt = now
        draft.model =
            config?.iab != nil && resolved.policy.model == .iab ? .iab : resolved.policy.model.runtimeModel
            draft.activeUI = evaluation.promptRequirement.kind == .none
                ? ActiveUI.none
                : ActiveUI.banner
        currentSnapshot = draft.build(revision: currentSnapshot.revision + (bumpRevision ? 1 : 0))
    }

    /// Complete storage work under the mutation gate, then release it before
    /// notifying snapshot observers. No storage call holds the state lock.
    private func publish(persist: Bool, mutation: MutationPermit) {
        let cleanup = lock.withLock { () -> PendingSaveQueue? in
            guard needsGrantCleanup else { return nil }
            needsGrantCleanup = false
            return queue
        }
        cleanup?.discardGrants()
        if persist { persistEnvelope() }
        let (state, stale) = lock.withLock {
            scheduleIABDeadlineLocked()
            return (readableSnapshotLocked(), takeStaleAnnouncementLocked())
        }
        mutation.release()
        events.emit(.snapshot(revision: state.revision))
        if let stale { events.emit(.policyStale(stale)) }
        observers.notify(state)
    }

    /// The next IAB authority boundary, including lists whose age is shorter than
    /// the policy's choice age. A list-less init must not move the fetch boundary.
    private func iabDeadlineLocked(
        policyDeadline: Int64?, consent: IABCommittedConsent?
    ) -> Int64? {
        guard let config, config.iab != nil, resolvedPolicy?.policy.model == .iab else {
            return [policyDeadline, bundledPolicyAuthority?.expiresAt].compactMap { $0 }.min()
        }
        let now = config.now()
        var deadlines = [Int64]()
        if let policyDeadline, policyDeadline > now { deadlines.append(policyDeadline) }
        if listIsUsableLocked(), let fetched = iabListFetchedAt {
            let (deadline, overflow) = fetched.addingReportingOverflow(config.iabListMaxAgeMs)
            if !overflow, deadline > now { deadlines.append(deadline) }
        }
        if let list = currentAdditionalConsentListLocked(), !list.providers.isEmpty {
            let (deadline, overflow) = list.fetchedAt.addingReportingOverflow(config.iabListMaxAgeMs)
            if !overflow, deadline > now { deadlines.append(deadline) }
        }
        if let consent, let resolvedPolicy,
            consent.isCurrent(now: now, maxAge: resolvedPolicy.policy.choiceMaxAgeMs) {
            let (deadline, overflow) = consent.actionAt.addingReportingOverflow(resolvedPolicy.policy.choiceMaxAgeMs)
            if !overflow, deadline > now { deadlines.append(deadline) }
        }
        if let expiry = bundledPolicyAuthority?.expiresAt, expiry > now { deadlines.append(expiry) }
        return deadlines.min()
    }

    /// A sleeping deadline is not network work and must not keep the core alive or
    /// keep waitUntilIdle waiting for a future consent expiry.
    private func scheduleIABDeadlineLocked() {
        iabDeadlineTask?.cancel()
        iabDeadlineTask = nil
        iabDeadlineToken = nil
        guard let config, bundledPolicyAuthority != nil || config.iab != nil && resolvedPolicy?.policy.model == .iab,
            let deadline = iabDeadlineLocked(
                policyDeadline: currentSnapshot.nextDeadline, consent: committedIAB)
        else { return }
        let now = config.now()
        guard now >= 0, deadline > now else { return }
        let token = UUID()
        iabDeadlineToken = token
        let delay = min(UInt64(deadline - now), UInt64.max / 1_000_000) * 1_000_000
        iabDeadlineTask = Task.detached { [weak self] in
            do { try await Task.sleep(nanoseconds: delay) } catch { return }
            guard !Task.isCancelled else { return }
            self?.expireIABDeadline(token: token, deadline: deadline)
        }
    }

    private func expireIABDeadline(token: UUID, deadline: Int64) {
        let mutation = mutationGate.acquire()
        defer { mutation.release() }
        let changed = lock.withLock {
            guard iabDeadlineToken == token else { return false }
            iabDeadlineTask = nil
            iabDeadlineToken = nil
            let now = config?.now() ?? 0
            guard now >= deadline else {
                scheduleIABDeadlineLocked()
                return false
            }
            reevaluateLocked(now: now)
            return true
        }
        if changed { publish(persist: true, mutation: mutation) }
    }

    /// Write the envelope. Encoding happens under the lock; the write does not.
    private func persistEnvelope() {
        struct Write {
            let envelope: StoredEnvelope
            let queue: PendingSaveQueue
        }
        let pending: Write? = lock.withLock {
            guard let config, let queue, currentSnapshot.revision > persistedRevision else { return nil }
            let envelope = StoredEnvelope(
                    bundledPolicyAuthority: bundledPolicyAuthority,
                snapshot: currentSnapshot,
                noticeDismissal: noticeDismissal,
                policyResolution: policyWire,
                storedAt: config.now(),
                iabConsent: committedIAB,
                lastIABActionAt: lastIABActionAt,
                iabListFetchedAt: iabListFetchedAt,
                additionalConsentList: additionalConsentList
            )
            // Claim the revision before releasing the lock, so two overlapping
            // publishes cannot both decide they are the newest writer.
            persistedRevision = currentSnapshot.revision
            return Write(envelope: envelope, queue: queue)
        }
        guard let pending else { return }
        // The write is outside the lock. A failed write leaves the claimed revision
        // alone on purpose: the next mutation writes again, and rolling the claim
        // back would let an older envelope overtake a newer one.
        let committed = pending.queue.persist(pending.envelope)
        // Failed invalidation must still remove grants from the vendor mirror.
        // Recheck the clock after disk IO before publishing any current authority.
        if committed || pending.envelope.iabConsent == nil {
            writeTcStorageBus()
        }
    }

    // MARK: - Async work

    private func schedule(_ work: @escaping @Sendable () async -> Void) {
        beginWork()
        Task.detached(priority: .userInitiated) {
            await work()
            self.endWork()
        }
    }

    private func scheduleInit(attempt: Int) {
        beginWork()
        Task.detached(priority: .userInitiated) {
            await self.runInit(attempt: attempt)
            self.endWork()
        }
    }

    private func beginWork() {
        lock.withLock { inFlightWork += 1 }
    }

    private func endWork() {
        let waiters = lock.withLock { () -> [CheckedContinuation<Void, Never>] in
            inFlightWork -= 1
            guard inFlightWork == 0 else { return [] }
            let pending = idleWaiters
            idleWaiters = []
            return pending
        }
        for waiter in waiters {
            waiter.resume()
        }
    }

    private func runInit(attempt: Int) async {
        guard let config = lock.withLock({ self.config }) else { return }
        if config.usesInCodePolicy {
            if let response = config.policy?.resolve(overrides: lock.withLock { overrides }) {
                applyPolicyUpdate(response)
            } else if config.policy == nil, let reason = config.policyError {
                // A reset clears the snapshot error, so a refused policy is reported again.
                reportRefusedPolicy(reason)
            }
            return
        }
        guard let transport = config.transport else { return }
        let context = lock.withLock {
            InitContext(
                overrides: wireOverrides,
                user: user,
                subjectId: identity?.id ?? "",
                vendors: config.vendors
            )
        }

        let result = await transport.performInit(context)
        switch result {
        case let .success(response):
            applyInit(response)
        case let .failure(error):
            reportInitFailure(error, attempt: attempt, retry: config.initRetry)
        }
    }

    /// Fold an init response into state.
    ///
    /// The policy wire is read strictly before any of it is used, and a wire this
    /// build cannot read leaves every optional category denied rather than falling
    /// back to a best guess. Every other field is applied only when present, which is
    /// how the web transport behaves with an omitted field too.
    private func applyInit(_ response: InitResponse) { applyPolicyUpdate(response) }

    /// Apply metadata only. Bundle callers cannot supply identity, grants or tokens.
    private func applyPolicyUpdate(_ response: InitResponse, bundle: BundledPolicyResource.Selection? = nil) {
        let mutation = mutationGate.acquire()
        defer { mutation.release() }
        lock.withLock {
            let nowMs = (config?.now ?? Self.wallClock)()
            bundledPolicyAuthority = bundle?.authority
            iabListOffline = bundle != nil
            let incomingPolicy = PolicyWireReader.read(response.policyResolution)
            var acceptsCategoryReceipts = config?.iab == nil
            if case let .resolved(resolved) = incomingPolicy {
                self.resolvedPolicy = resolved
                // Retire the previous IAB category projection before merging
                // receipts for a non-IAB policy.
                if resolved.policy.model != .iab {
                    validateIABLocked()
                    acceptsCategoryReceipts = true
                }
            }

            if let detected = response.resolvedPrivacySignals?.gpc {
                detectedGPC = detected
            }

            var draft = ConsentSnapshot.Draft(current: currentSnapshot)
            // The overrides a decision was actually made against, which is what the
            // backend recomputes before it accepts a save. `mapResolvedOverrides`
            // and the merge in `@c15t/core` fold the served location and translation
            // language over the app's own overrides, so a device that pinned nothing
            // still reports the country and region it was matched on. `gpc` survives
            // from the app because `/init` never derives it.
            draft.overrides = ConsentOverrides(
                country: response.resolvedOverrides?.country
                    ?? response.location?.countryCode
                    ?? overrides.country,
                region: response.resolvedOverrides?.region
                    ?? response.location?.regionCode
                    ?? overrides.region,
                language: response.resolvedOverrides?.language
                    ?? response.translations?.language
                    ?? overrides.language,
                gpc: response.resolvedOverrides?.gpc ?? overrides.gpc
            )
            overrides = draft.overrides
            draft.privacySignals = PrivacySignals(gpc: gpcSignal)
            if let location = response.location { draft.location = location }
            if let translations = response.translations { draft.translations = translations }
            if let token = response.policySnapshotToken { draft.policySnapshotToken = token }
            // The vendor list is folded here, beside the other served-metadata fields,
            // and before the policy branch, on purpose.
            //
            // Only when present: a later `/init` that serves no `gvl` leaves the list the
            // core already has. That is the retention the dialog needs. Once a purpose
            // name or vendor name has been on screen, replacing it with nothing does not
            // take a permission away -- it renders an empty dialog against a consent the
            // subject just gave -- and the backend omits the field routinely, because
            // `buildInitResponse` only embeds it while the matched model is `iab`. The
            // web keeps its module-level GVL cache for the same reason. A newer list
            // replaces an older one whole, so the device can never hold two vendors'
            // worth of `vendorListVersion`.
            //
            // Same retention rules as the matched policy, which means stored on the
            // snapshot and written with it in the same envelope: one write, one read,
            // wiped by ``reset()`` alongside `policyWire`. It rides the snapshot rather
            // than taking an envelope key of its own, because the bridge reads the
            // snapshot and a second copy of one fact is two answers.
            //
            // The declared scope is applied here rather than downstream, which is where
            // ``GlobalVendorList/narrowed(toVendorIds:)`` puts the promise: the snapshot
            // is what the bridge reads and what the envelope is built from, so one prune
            // on the value reaches the surface a subject reads instead of leaving a wide
            // list behind a narrow rendering rule. The header the same scope goes out on
            // is an optimisation in front of this, never the guarantee -- a producer that
            // ignores it and embeds the whole list is answered by the same line.
            if response.adTechProvidersInvalid {
                additionalConsentList = nil
            } else if let providers = response.adTechProviders {
                additionalConsentList = AdditionalConsentList(providers: providers, fetchedAt: bundle == nil ? nowMs : bundle?.atpFetchedAt ?? -1)
            }
            if let gvl = response.gvl {
                iabListFetchedAt = bundle == nil ? nowMs : bundle?.gvlFetchedAt
                iabListFromCache = bundle != nil
                draft.iab = KernelIABState(gvl: gvl.narrowed(toVendorIds: config?.vendors))
            }

            // Server-mapped receipts merge in per category, newest wins. A local
            // receipt that has not reached the backend yet is newer than anything
            // the server can say about it, and must survive the round trip.
            if acceptsCategoryReceipts, let records = response.records {
                draft.explicitChoice = merge(records: records)
            }

            switch incomingPolicy {
            case let .resolved(resolved):
                policyWire = response.policyResolution
                draft.policyPending = false
                // `ready` means the core has been told, not that a file was there to
                // read. Hydration is one way to be told; a first init that resolved is
                // the other, and without it a fresh install would answer `pending` for
                // the whole of the launch that most needs an answer. Only the `.resolved`
                // branch raises it: a failed init leaves the flag where it was, so a
                // device that has never been told stays fail-closed and a device that
                // lost signal keeps the snapshot the contract says it may serve.
                draft.ready = true
                draft.resolution = resolved.resolution
                draft.model =
                    config?.iab != nil && resolved.policy.model == .iab
                    ? .iab : resolved.policy.model.runtimeModel
                draft.error = nil

                let evaluation = PolicyEvaluator.evaluate(
                    resolved,
                    choice: draft.explicitChoice,
                    noticeDismissal: noticeDismissal,
                    gpcActive: gpcSignal.active,
                    now: nowMs,
                    choiceScope: choiceScopeLocked(resolved)
                )
                draft.effectivePermissions = evaluation.permissions
                draft.restrictions = evaluation.restrictions
                draft.promptRequirement = evaluation.promptRequirement
                draft.nextDeadline = evaluation.nextDeadline
                draft.evaluatedAt = nowMs
                // `ready` is a hydration flag, not a network flag: an init that
                // answered does not make an unstored first launch "restored".
                // A pending prompt is the banner's cue; nothing owed means nothing
                // to show.
                draft.activeUI = evaluation.promptRequirement.kind == .none
                    ? ActiveUI.none
                    : ActiveUI.banner

            case let .rejected(reason, message):
                // Fail closed, and say so. An unparseable policy is not "no
                // policy": it is a policy this build must not act on.
                self.resolvedPolicy = nil
                policyWire = response.policyResolution
                draft.policyPending = true
                draft.effectivePermissions = ConsentSnapshot.failClosedPermissions
                draft.restrictions = [:]
                draft.promptRequirement = .none
                draft.activeUI = .none
                draft.nextDeadline = nil
                draft.error = CoreErrorInfo(code: reason.rawValue, message: message)
            }

            // The same list rule the web dialog applies to the resolution it just
            // read: the rejected branch has no scope of its own, so the list falls
            // back to the full optional set the pending evaluator uses.
            draft.consentCategories = decidedCategories(self.resolvedPolicy)
            currentSnapshot = draft.build(revision: currentSnapshot.revision + 1)
            if resolvedPolicy?.policy.model == .iab || config?.iab != nil || committedIAB != nil { reevaluateLocked(now: nowMs, bumpRevision: false) }
        }

        publish(persist: true, mutation: mutation)
        if let error = snapshot().error {
            events.emit(.error(error))
        }
        // A save queued while the policy was still pending, or while the transport
        // was unreachable, gets another pass now that init has answered.
        schedule { await self.requestDeliveryPass(ownSend: nil) }
    }

    /// Merge server receipts with local ones, keeping the newer confirmation per
    /// category.
    private func merge(records: HydrationRecords) -> ExplicitChoice? {
        guard let incoming = records.choice else {
            noticeDismissal = noticeDismissal ?? records.noticeDismissal
            return currentSnapshot.explicitChoice
        }
        var categories = currentSnapshot.explicitChoice?.categories ?? [:]
        for (category, incomingDecision) in incoming.categories {
            guard let existing = categories[category] else {
                categories[category] = incomingDecision
                continue
            }
            if incomingDecision.confirmedAt > existing.confirmedAt {
                categories[category] = incomingDecision
            }
        }
        if noticeDismissal == nil {
            noticeDismissal = records.noticeDismissal
        }
        return ExplicitChoice(categories: categories)
    }

    private func reportInitFailure(
        _ error: C15tError,
        attempt: Int,
        retry: InitRetry?
    ) {
        let mutation = mutationGate.acquire()
        defer { mutation.release() }
        let changed = lock.withLock {
            guard config?.iab != nil else { return false }
            iabListOffline = true
            if let consent = committedIAB, let config, let resolvedPolicy,
                !listIsUsableLocked()
                    || !consent.isCurrent(now: config.now(), maxAge: resolvedPolicy.policy.choiceMaxAgeMs) {
                let before = currentSnapshot
                reevaluateLocked(now: config.now(), bumpRevision: false)
                var comparison = ConsentSnapshot.Draft(current: currentSnapshot)
                comparison.evaluatedAt = before.evaluatedAt
                if comparison.build(revision: before.revision) == before {
                    currentSnapshot = before
                    return false
                }
                currentSnapshot = ConsentSnapshot.Draft(current: currentSnapshot)
                    .build(revision: before.revision + 1)
                return true
            }
            return false
        }
        if changed { publish(persist: true, mutation: mutation) }
        mutation.release()
        events.emit(.error(error.info))
        // An unsupported contract will not fix itself on a retry: the producer is
        // speaking a wire this build cannot read, and no amount of asking changes
        // that. Say it once, stop asking, and stay exactly where the core is.
        if error.code == PolicyFailureReason.unsupportedContract.rawValue {
            let mutation = mutationGate.acquire()
            defer { mutation.release() }
            lock.withLock {
                currentSnapshot = currentSnapshot.byApplying { draft in
                    draft.error = error.info
                }
            }
            // `error` is a snapshot field, so this is a committed change like every
            // other one, and ``publish(persist:)`` is the one path that announces it:
            // the revision event, the snapshot observers, and the envelope write
            // together. Emitting a `.snapshot` event alone announces a revision to a
            // listener list the bridge is not on -- `C15tCoreSubscriber` feeds the
            // React Native pump from `onChange`, not from the event hub -- so the new
            // revision would never reach JavaScript, and a relaunch would forget a
            // misconfiguration that has not changed. The pair is the rule: see
            // "Revisions and error writes" in `native/CONTRACT.md`.
            publish(persist: true, mutation: mutation)
            return
        }

        guard let retry, attempt < retry.maxAttempts else { return }
        let delayMs = retry.delay(afterAttempt: attempt)
        schedule {
            if delayMs > 0 {
                try? await Task.sleep(nanoseconds: delayMs * 1_000_000)
            }
            if Task.isCancelled { return }
            await self.runInit(attempt: attempt + 1)
        }
    }

    // MARK: - Delivery passes

    /// Ask for a delivery pass, and run one when no other pass holds this core.
    ///
    /// Contract: `native/CONTRACT.md`, "The pending save queue" -- only one pass may
    /// be in flight per core, and this is the only place in the Swift core that
    /// answers that question. Two passes reading the queue at once is the defect the
    /// contract describes: a pass reads the queue once and then sends entry by entry,
    /// so every entry it read stays readable until its own send lands, and the second
    /// pass resends whatever the first is still sending. The bytes are frozen and
    /// carry the same consent id, so the backend dedupes and no stored state moves --
    /// the only trace is a second `POST /subjects` for a decision the subject already
    /// saw delivered, once per entry per wake-up.
    ///
    /// The guard is the guarantee, not the shape of the concurrency. This core hands
    /// its work to detached tasks on Swift's shared cooperative pool, and a foreground
    /// transition is exactly the moment several callers arrive together: the platform
    /// observer asks for a flush and the `refresh()` it then triggers reaches here
    /// again from the resolved init. Anything that waits on one queue would still
    /// let a host that calls ``flushPending()`` from its own thread start a second
    /// read while a send is open, so the rule is held here rather than left to
    /// whoever happens to call first.
    ///
    /// A request that finds the core held joins its completion and records another
    /// queue read. Only this scheduled async work waits; public lifecycle calls return
    /// immediately. Joining lets recovery refresh policy after the replay completes.
    ///
    /// - Parameter ownSend: the first send of the entry a save just queued, taken
    ///   before the queue is read, or `nil` for a pass over the whole queue. It goes
    ///   through the same guard a replay does, so a save's own send and a replay can
    ///   never hold the same entry at the same time; when the guard is already held,
    ///   the pass that holds it covers this entry on its re-read.
    private func requestDeliveryPass(ownSend: (@Sendable () async -> Void)?) async {
        // A save asks for one send, not for a pass over the queue. Reading the whole
        // queue on every save would spend an attempt on each older entry every time a
        // subject tapped a banner, and attempts end in released entries, so this
        // thread takes that cost on only when somebody actually asked for a pass.
        var owesPass = ownSend == nil
        guard await acquireDeliveryPass() else { return }
        owesPass = owesPass || takeDeliveryPassRequest()

        if let send = ownSend { await send() }

        while true {
            var stoppedForUnreachableTransport = false
            if owesPass {
                let report = await runDeliveryPass()
                stoppedForUnreachableTransport = report.transportUnreachable
            }

            // Claim another read or release ownership atomically, so no request can
            // land between the final check and completion. A dead endpoint leaves the
            // request recorded for the next wake without spending another attempt.
            if finishDeliveryPass(stoppedForUnreachableTransport: stoppedForUnreachableTransport) { return }
            owesPass = true
        }
    }

    /// Take a delivery pass, or await the pass that will cover this request.
    private func acquireDeliveryPass() async -> Bool {
        await withCheckedContinuation { continuation in
            let acquired = lock.withLock {
                if deliveryPassInFlight {
                    deliveryPassRequested = true
                    deliveryPassWaiters.append(continuation)
                    return false
                }
                deliveryPassInFlight = true
                return true
            }
            if acquired { continuation.resume(returning: true) }
        }
    }

    /// `false` retains ownership for another requested read; `true` completes all joiners.
    private func finishDeliveryPass(stoppedForUnreachableTransport: Bool) -> Bool {
        let completed = lock.withLock { () -> [CheckedContinuation<Bool, Never>]? in
            if !stoppedForUnreachableTransport, deliveryPassRequested {
                deliveryPassRequested = false
                return nil
            }
            deliveryPassInFlight = false
            let waiters = deliveryPassWaiters
            deliveryPassWaiters = []
            return waiters
        }
        guard let completed else { return false }
        for waiter in completed { waiter.resume(returning: false) }
        return true
    }

    /// Claim a recorded request, `false` when there is nothing to claim.
    private func takeDeliveryPassRequest() -> Bool {
        lock.withLock {
            guard deliveryPassRequested else { return false }
            deliveryPassRequested = false
            return true
        }
    }

    /// One read of the queue and the sends it owed, oldest first.
    ///
    /// Only ``requestDeliveryPass(ownSend:)`` may call this, which is what keeps a
    /// second copy of the loop from reading the queue while a send from the first is
    /// still open.
    private func canDeliverIAB(_ body: Data) -> Bool {
        let wire = C15tJSON.parse(body)
        if ConsentDelivery.isWithdrawal(body) { return true }
        guard wire?["subjectId"]?.stringValue == lock.withLock({ identity?.id }) else { return false }
        let tcString = wire?["tcString"]?.stringValue
        let requiresIAB = wire?["model"]?.stringValue == "iab" || lock.withLock { config?.iab != nil && resolvedPolicy?.policy.model == .iab }
        if tcString == nil && !requiresIAB { return true }
        guard let saved = iabConsent() else { return false }
        return tcString == saved.tcString && wire?["addtlConsent"]?.stringValue == saved.addtlConsent
            && wire?["subjectId"]?.stringValue == saved.subjectId
            && wire?["givenAt"]?.intValue == saved.actionAt
            && wire?["externalSubjectId"]?.stringValue == saved.externalId
            && wire?["model"]?.stringValue == "iab"
    }

    private func runDeliveryPass() async -> ReplayReport {
        guard let transport = self.transport else { return .empty }
        let queue = lock.withLock { self.queue }
        guard let queue else { return .empty }
        // Nothing can be delivered to a producer whose contract this build cannot
        // read, and the queue already holds the bodies for a later attempt.
        let report = await queue.replay(using: transport, shouldDeliver: { self.canDeliverIAB($0.body) }) {
            entry, result in
            self.events.emit(.saveReplayed(subjectId: entry.subjectId, ok: result.isSuccess))
        } onDrop: { entry, error, outcome in
            // A pass that reported only deliveries would leave this entry missing
            // from both the queue and the record of what happened to it.
            self.events.emit(.error(Self.undeliverableSave(
                subjectId: entry.subjectId,
                error: error,
                outcome: outcome
            )))
        }
        if let error = report.lastError {
            events.emit(.error(error))
        }
        return report
    }

    // MARK: - Gate plumbing

    /// Keeps a per-category gate closure alive for as long as its registration.
    private final class GateSubscription: SnapshotObserver, @unchecked Sendable {
        private let category: OptionalConsentCategory
        private let onChange: @Sendable (Bool) -> Void
        private let stateLock = Lock()
        private var lastValue: Bool?
        init(category: OptionalConsentCategory, onChange: @escaping @Sendable (Bool) -> Void) {
            self.category = category
            self.onChange = onChange
        }

        func deliverInitial(_ value: Bool) {
            let shouldDeliver = stateLock.withLock {
                guard lastValue == nil else { return false }
                lastValue = value
                return true
            }
            if shouldDeliver { onChange(value) }
        }

        func consentDidChange(_ snapshot: ConsentSnapshot) {
            let value = snapshot.effectivePermissions.value(for: category)
            let changed = stateLock.withLock {
                let previous = lastValue
                lastValue = value
                return previous != value
            }
            if changed {
                onChange(value)
            }
        }
    }

    /// Keeps a per-category decision gate alive for as long as its registration, and
    /// keeps its callback in order.
    ///
    /// The decision is what changed, not the snapshot: a revision that rewrites the
    /// prompt or the location without moving this category's permission must not wake a
    /// gate. One lock over the last delivered decision, held for the comparison alone,
    /// which is what makes the registration seed and a concurrent publication unable to
    /// arrive out of order.
    private final class DecisionGateSubscription: SnapshotObserver, @unchecked Sendable {
        private let category: ConsentCategory
        private let onChange: @Sendable (ConsentDecision) -> Void
        private let stateLock = Lock()
        private var lastDecision: ConsentDecision?

        init(
            category: ConsentCategory,
            onChange: @escaping @Sendable (ConsentDecision) -> Void
        ) {
            self.category = category
            self.onChange = onChange
        }

        /// Deliver the decision in force at registration, unless a publication already
        /// delivered a newer one while the registration was being wired up.
        func deliverInitial(_ decision: ConsentDecision) {
            let shouldDeliver = stateLock.withLock {
                guard lastDecision == nil else { return false }
                lastDecision = decision
                return true
            }
            if shouldDeliver {
                onChange(decision)
            }
        }

        func consentDidChange(_ snapshot: ConsentSnapshot) {
            let decision = ConsentDecision(snapshot: snapshot, category: category)
            let changed = stateLock.withLock {
                let previous = lastDecision
                lastDecision = decision
                return previous != decision
            }
            if changed {
                onChange(decision)
            }
        }
    }
}

extension Result {
    var isSuccess: Bool {
        if case .success = self { return true }
        return false
    }
}

extension CommitIntent {
    var action: ConsentAction {
        switch self {
        case .all: return .all
        case .necessary: return .necessary
        case .custom, .iab: return .custom
        }
    }
}
