package com.c15t.core

import com.c15t.core.model.isWithdrawal
import com.c15t.core.model.ConsentState

import com.c15t.core.iab.*
import com.c15t.core.model.ActiveUI
import com.c15t.core.model.ConfirmedCoverage
import com.c15t.core.model.ConsentAction
import com.c15t.core.model.ConsentCategory
import com.c15t.core.model.ConsentDecision
import com.c15t.core.model.ConsentModel
import com.c15t.core.model.ConsentSnapshot
import com.c15t.core.model.ConsentSubject
import com.c15t.core.model.DecisionInputs
import com.c15t.core.model.ExplicitChoice
import com.c15t.core.model.GpcSignal
import com.c15t.core.model.KernelError
import com.c15t.core.model.KernelIabState
import com.c15t.core.model.KernelOverrides
import com.c15t.core.model.KernelUser
import com.c15t.core.model.PrivacySignals
import com.c15t.core.model.QueuedSave
import com.c15t.core.model.SavePayload
import com.c15t.core.policy.EvaluationPolicy
import com.c15t.core.policy.NoticeDismissal
import com.c15t.core.policy.PolicyEvaluator
import com.c15t.core.policy.PolicyPrompt
import com.c15t.core.spi.Clock
import com.c15t.core.spi.TaskExecutor
import com.c15t.core.store.C15tStore
import com.c15t.core.store.FailedAttempt
import com.c15t.core.store.PendingSaveQueue
import com.c15t.core.store.SnapshotEnvelope
import com.c15t.core.store.UnusableSubjectId
import com.c15t.core.tc.GlobalVendorList
import com.c15t.core.tc.GlobalVendorListJson
import com.c15t.core.tc.TcVendorList
import com.c15t.core.tc.narrowToVendorIds
import com.c15t.core.transport.C15tTransport
import com.c15t.core.transport.InitContext
import com.c15t.core.transport.InitMapper
import com.c15t.core.transport.MappedInit
import com.c15t.core.transport.SaveOutcome
import com.c15t.core.transport.TransportOutcome
import java.lang.ref.WeakReference
import java.util.UUID
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.ScheduledThreadPoolExecutor
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference
import kotlinx.serialization.json.*

/**
 * The answer of one send of a queued body.
 *
 * [Reached] is the only case that lets a caller stop owing the body, and it is a claim
 * about storage rather than about the network: the entry is gone from disk. A `save()` that
 * has not been answered at all is a `null` in an atomic, not a case here -- see
 * [ConsentCore.save].
 */
private sealed interface Delivery {
	/** The backend accepted the body and the queue released the entry. */
	data object Reached : Delivery

	/** No reachable sender. The entry keeps its place, and a pass should stop trying. */
	data class Unreachable(val error: KernelError) : Delivery

	/** The producer answered, and did not accept. */
	data class Refused(val attempt: FailedAttempt, val error: KernelError) : Delivery
}
/**
 * What one delivery pass did, as [ConsentCore.requestDeliveryPass] hands it back.
 *
 * Private to the core: `FlushResult` is the shape a host sees, and this carries the one fact a
 * host has no use for -- whether the pass stopped because no sender could be reached at all,
 * which is what decides whether reading the queue again is worth anything.
 */
private class PassReport(
	val delivered: Int,
	val error: KernelError?,
	/** The pass stopped at an entry no sender could be reached for, not at the queue's end. */
	val unreachable: Boolean,
) {
	companion object {
		/** What a thread reports when a pass already holds the core and answered it instead. */
		val Declined = PassReport(delivered = 0, error = null, unreachable = false)

		/** What a save's own send reports when nobody owed a pass. */
		val Quiet = PassReport(delivered = 0, error = null, unreachable = false)
	}
}

/**
 * The consent engine.
 *
 * One immutable [ConsentSnapshot] is the whole state, held in an
 * [AtomicReference] and replaced on every mutation. That shape is the contract's
 * central performance rule: [snapshot], [isAllowed], [decision], and [isReady] are a
 * single volatile read with no lock, no disk, and no allocation, which is what lets an
 * ad SDK call them from the main thread while a save is in flight.
 *
 * Mutation paths own [commitGate] through preparation, durable writes and publication.
 * [mutationLock] guards only in-memory state. Network work and snapshot observers
 * run after releasing the gate; hot reads never acquire it.
 *
 * @param store Typed persistence over the host's storage.
 * @param transport Backend commands; [C15tTransport.NONE] keeps the core local-only.
 * @param executor Where init and write delivery run. [TaskExecutor.DIRECT] runs
 * them inline, which is what the tests use to make ordering observable. It does not have to
 * be serial: a delivery pass is guarded by [requestDeliveryPass] rather than by the shape of
 * this executor, so a host that hands the core a pool of its own still gets the contract's
 * one-pass-in-flight rule.
 * @param logger Receives every [KernelError] the core emits.
 */
class ConsentCore(
	private val config: NativeConfig,
	private val store: C15tStore,
	private val clock: Clock = Clock.SYSTEM,
	private val transport: C15tTransport = C15tTransport.NONE,
	executor: TaskExecutor? = null,
	subjectIdGenerator: (() -> String)? = null,
	private val queueIdGenerator: () -> String = { UUID.randomUUID().toString() },
	private val logger: (KernelError) -> Unit = {},
) {
	private val background: TaskExecutor = executor
		?: TaskExecutor { task -> backgroundPool.execute(task) }

	/**
	 * Mints the c15t-owned subject id, in the `sub_` format the backend validates.
	 *
	 * Separate from [queueIdGenerator] on purpose: a subject id travels and has to
	 * satisfy `subjectIdSchema` in `@c15t/schema`, while a queue entry id is a local
	 * row id that never reaches the wire. The default follows the injected [clock],
	 * so a test that pins time gets ids it can predict.
	 */
	private val subjectIdGenerator: () -> String = subjectIdGenerator
		?: SubjectIdGenerator(clock = clock)::generate

	private val state = AtomicReference(ConsentSnapshot.denyAll())
	private data class ReadView(
		val snapshot: ConsentSnapshot,
		val authority: BundledPolicyAuthority? = null,
		val denied: ConsentSnapshot = snapshot,
		val requiresIab: Boolean = false,
		val saved: IabCommittedConsent? = null,
		val fetchedAt: Long? = null,
		val additionalConsentFetchedAt: Long? = null,
		val choiceMs: Long = 0,
		val expired: ConsentSnapshot = snapshot,
	)
	private val readView = AtomicReference(ReadView(state.get()))
	private var deadlineTask: ScheduledFuture<*>? = null
	private var deadlineGeneration = 0L
	private var lastIabActionAt: Long? = null
	private var bundledPolicyAuthority: BundledPolicyAuthority? = null
	private var additionalConsentList: AdditionalConsentList? = null
	private var iabListFetchedAt: Long? = null
	private var iabListFromCache = true
	private var iabListOffline = false
	private var committedIab: IabCommittedConsent? = null
	private val iabConfiguration = config.iab?.detached()
	/** Compact authority is read natively; full drafts do not cross the RN stock UI boundary. */
	val iabConsent: IabCommittedConsent?
		get() =
			synchronized(mutationLock) {
				committedIab
					?.takeIf { saved ->
						listIsUsable() && (saved.adTechProvidersID == null || currentAdditionalConsentList() != null) && saved.isCurrent(clock.nowMillis(), evaluationPolicy?.choiceMs ?: 0) &&
							evaluationPolicy?.model == ConsentModel.IAB &&
							!state.get().policyPending
					}
					?.detached()
			}

	/** Check a vendor and purpose together from native authority, before JS starts. */
	fun isIabAllowed(vendorId: Int, purposeId: Int, basis: IabLegalBasis): Boolean =
		synchronized(mutationLock) {
			val saved = committedIab ?: return@synchronized false
			val snapshot = state.get()
			val gvl = snapshot.iab?.gvl ?: return@synchronized false
			val policy = evaluationPolicy ?: return@synchronized false
			listIsUsable() && (saved.adTechProvidersID == null || currentAdditionalConsentList() != null) && !snapshot.policyPending &&
				policy.model == ConsentModel.IAB &&
				saved.fingerprint == policy.choiceFingerprint &&
				saved.isCurrent(clock.nowMillis(), policy.choiceMs) &&
				saved.allows(vendorId, purposeId, basis, gvl)
		}

	private fun listIsUsable(): Boolean {
		if (bundledPolicyAuthority?.isCurrent(config.backendUrl, clock.nowMillis()) == false) return false
		val fetched = iabListFetchedAt ?: return false
		val now = clock.nowMillis()
		return fetched >= 0 && now >= fetched && now - fetched < config.iabListMaxAgeMs
	}

	fun iabStatus(): IabLifecycleStatus = synchronized(mutationLock) {
		val gvl = state.get().iab?.gvl
		val availability = when {
			iabConfiguration == null -> IabListAvailability.UNAVAILABLE
			gvl == null -> IabListAvailability.MISSING
			!listIsUsable() -> IabListAvailability.STALE
			iabListOffline -> IabListAvailability.OFFLINE
			iabListFromCache -> IabListAvailability.CACHED
			else -> IabListAvailability.FRESH
		}
		IabLifecycleStatus(availability, committedIab?.isCurrent(clock.nowMillis(), evaluationPolicy?.choiceMs ?: 0) != true || !listIsUsable() || committedIab?.adTechProvidersID != null && currentAdditionalConsentList() == null,
			state.get().revision, gvl?.vendorListVersion, gvl?.tcfPolicyVersion)
	}

	private fun currentAdditionalConsentList() = additionalConsentList?.takeIf {
		it.isCurrent(clock.nowMillis(), config.iabListMaxAgeMs)
	}
	/** Last readable copy, even when expired. It cannot authorize a new grant. */
	fun adTechProviderDisclosures(): List<AdTechProvider>? = synchronized(mutationLock) { additionalConsentList?.providers?.toList() }
	val bundledPolicyInfo: BundledPolicyAuthority? get() = readView.get().authority
	fun adTechProviders(): List<AdTechProvider>? = synchronized(mutationLock) { currentAdditionalConsentList()?.providers?.toList() }
	fun isAdTechProviderAllowed(id: Long): Boolean = iabConsent?.choices?.adTechProviderConsents?.contains(id) == true
	fun additionalConsentStatus(): IabListAvailability = synchronized(mutationLock) {
		when {
			iabConfiguration == null -> IabListAvailability.UNAVAILABLE
			additionalConsentList == null -> IabListAvailability.MISSING
			currentAdditionalConsentList() == null -> IabListAvailability.STALE
			iabListOffline -> IabListAvailability.OFFLINE
			iabListFromCache -> IabListAvailability.CACHED
			else -> IabListAvailability.FRESH
		}
	}

	fun openIabDraft(): IabDraft? = synchronized(mutationLock) {
		if (iabConfiguration == null || evaluationPolicy?.model != ConsentModel.IAB ||
			state.get().policyPending || state.get().iab?.gvl == null || !listIsUsable() ||
			(bundledPolicyAuthority?.requiresAtp == true || additionalConsentList?.providers?.isNotEmpty() == true) && currentAdditionalConsentList() == null) null
		else IabDraft(state.get().revision, committedIab?.choices?.detached() ?: IabChoices())
	}

	/**
	 * What Accept all saves on the current disclosed list: every live partner's bases under the
	 * publisher's disclosure and restrictions, exactly as [save] builds them for [CommitIntent.All].
	 * `null` whenever [openIabDraft] is.
	 */
	/**
	 * The publisher restrictions this core was configured with, empty without IAB. A screen that
	 * shows the served list as it is discloses the wrong legal bases while any are set; the core's
	 * own projection is in [iabPresentation].
	 */
	val iabPublisherRestrictions: List<IabPublisherRestriction> get() = iabConfiguration?.publisherRestrictions.orEmpty()

	fun iabAcceptAllChoices(): IabChoices? = synchronized(mutationLock) {
		if (openIabDraft() == null) return@synchronized null
		val gvl = state.get().iab?.gvl ?: return@synchronized null
		val configuration = iabConfiguration ?: return@synchronized null
		IabAuthority.accepting(gvl, configuration, currentAdditionalConsentList()?.providers?.map { it.id })
	}

    /** Capture retained disclosure and a draft atomically. Check canEdit before offering grants. */
    fun iabPresentation(): IabPresentation? = synchronized(mutationLock) {
        if (evaluationPolicy?.model != ConsentModel.IAB) return@synchronized null
        val editable = openIabDraft()
        val draft = editable ?: IabDraft(state.get().revision, committedIab?.choices?.detached() ?: IabChoices())
        val list = state.get().iab?.gvl?.let { GlobalVendorListJson.read(GlobalVendorListJson.toJsonElement(it)) } ?: return@synchronized null
        val configuration = iabConfiguration ?: return@synchronized null
        IabPresentation(draft, list,
            list.vendors.filterValues { it.deletedDate.isNullOrEmpty() }.mapValues { (id, vendor) -> configuration.disclosure(id, vendor) },
            additionalConsentList?.providers?.toList(), editable != null,
            // A saved decision stops counting, and leaves the storage bus, once the choice
            // validity passes (`isCurrent`, the TC storage bus projection).
            consentStorageMaxDays = IabPresentation.days(evaluationPolicy?.choiceMs),
            // The language the TC String declares, so screen copy and signals agree.
            language = configuration.consentLanguage)
    }

	fun saveIab(draft: IabDraft, categories: Map<ConsentCategory, Boolean>): CommitResult =
		save(CommitIntent.Iab(draft.choices, categories), expectedRevision = draft.revision)

	private val mutationLock = Any()
	private val commitGate = java.util.concurrent.Semaphore(1)
	private val mutationErrors = ThreadLocal<MutableList<KernelError>>()
	private var needsGrantCleanup = false
	/** Serialize every mutation through durable write and publication, never hot reads. */
	private fun <Result> mutate(body: (MutationPermit) -> Result): Result {
		commitGate.acquireUninterruptibly()
		val permit = MutationPermit { commitGate.release() }
		val previousErrors = mutationErrors.get()
		val errors = mutableListOf<KernelError>()
		mutationErrors.set(errors)
		try {
			return body(permit)
		} finally {
			if (previousErrors == null) mutationErrors.remove() else mutationErrors.set(previousErrors)
			permit.release()
			// Host loggers and error listeners may reenter a mutation. All state-lock
			// scopes have unwound and the commit permit is free before they run.
			for (error in errors) emitError(error)
		}
	}

	private class MutationPermit(private var unlock: (() -> Unit)?) {
		fun release() {
			val action = unlock
			unlock = null
			action?.invoke()
		}
	}

	private val bootstrapped = AtomicBoolean(false)

	/** Validated policy from the last init, guarded by [mutationLock]. */
	private var evaluationPolicy: EvaluationPolicy? = null

	/**
	 * The overrides the host configured, as opposed to the ones the snapshot carries.
	 *
	 * They are not the same value once an init has landed: [runInit] folds the country
	 * and region the backend matched on over whatever the app pinned, and the snapshot
	 * has to carry both because that is what the backend recomputes a save against. So
	 * the snapshot's copy claims a geography the app never asked for, and the only place
	 * the host's own pin still exists on its own is here. [reset] needs that distinction:
	 * a wipe deletes the policy resolution, and a location that came from it has to go
	 * with it, while a country pinned for QA has to survive.
	 */
	@Volatile
	private var configuredOverrides: KernelOverrides = config.overrides

	/** Local notice dismissal, guarded by [mutationLock]. */
	private var noticeDismissal: NoticeDismissal? = null

	@Volatile
	private var storedSnapshotFound = false

	/** Whether `subject-id-unusable` has been reported. One launch, one announcement. */
	private val unusableSubjectAnnounced = AtomicBoolean(false)
	private val identityRecoveryAnnouncements = mutableSetOf<String>()

	/**
	 * GPC as the device and the backend report it, with no override applied.
	 *
	 * Kept apart from the override on purpose: the evaluator honors the merged
	 * value, while the write-time staleness check compares only what the app
	 * pinned. `null` means no signal has been reported yet, which is not the same
	 * answer as `false`.
	 */
	@Volatile
	private var detectedGpc: Boolean? = null

	private val snapshotObservers = CopyOnWriteArrayList<WeakReference<(ConsentSnapshot) -> Unit>>()
	private val strongObservers = CopyOnWriteArrayList<(ConsentSnapshot) -> Unit>()
	private val errorObservers = CopyOnWriteArrayList<WeakReference<(KernelError) -> Unit>>()

	private val queue = PendingSaveQueue(store, config.maxPendingSaves, queueIdGenerator)

	/**
	 * Which delivery work, if any, holds this core. See [requestDeliveryPass] for the rule it
	 * holds and for why it lives here rather than in the shape of [background].
	 */
	private val passInFlight = AtomicBoolean(false)

	/** A pass was asked for while [passInFlight] was held, so the holder reads again on release. */
	private val passRequested = AtomicBoolean(false)

	/**
	 * Load stored state, adopt the subject id, then kick a flush and an init.
	 *
	 * Idempotent and safe from any launch hook, including one that runs before the
	 * first Activity exists. Everything after the synchronous hydration runs on
	 * [background], so the caller's thread never waits on the network.
	 */
	fun bootstrap() = mutate { mutation ->
		if (!bootstrapped.compareAndSet(false, true)) {
			return@mutate
		}
		store.initializeTcStorageBus(iabConfiguration)
		val now = clock.nowMillis()
		val subject = resolveSubject()
		val envelope = store.readEnvelope()?.takeIf { it.snapshot.subject?.id == subject.id }

		storedSnapshotFound = envelope != null

		detectedGpc = config.detectedGpc

		if (envelope == null) {
			// First launch, or a payload this build cannot read: deny-all until an
			// init resolves, with ready false so a host can tell the two apart.
			publishPure(
				ConsentSnapshot.denyAll(subject, now)
					.copy(
						consentCategories = decidedCategories(null),
					overrides = config.overrides,
					privacySignals = signalsFor(config.overrides),
				)
			)
			synchronized(mutationLock) {
				evaluationPolicy = null
				noticeDismissal = null
			}
			persist()
		} else {
			val restored = envelope.snapshot
			synchronized(mutationLock) {
				evaluationPolicy = envelope.evaluationPolicy
				bundledPolicyAuthority = envelope.bundledPolicyAuthority
				additionalConsentList = envelope.additionalConsentList
				iabListFetchedAt = envelope.iabListFetchedAt
				committedIab = envelope.iabConsent
				// A backward clock jump must not let a restart reuse an action time.
				lastIabActionAt =
					(envelope.lastIabActionAt ?: envelope.iabConsent?.actionAt)?.takeIf {
						it >= 0
					}
				noticeDismissal = envelope.noticeDismissal
			}
			val hydratedOverrides = merge(restored.overrides, config.overrides)
			val hydrated = restored.copy(
				ready = true,
				// The envelope key is where the list is durable -- one copy of the document in the
				// blob, and the key a build before this one wrote too -- and `iab` is where the
				// published snapshot carries it, because that is the key the bridge reads. The
				// fallback reads the other shape, so a device whose bytes hold the list the way a
				// later build stores it is not stranded without its disclosure either.
				//
				// The declared scope is applied to whichever shape the list arrived in, which is
				// what makes this a read-path rule rather than a first-store rule. Stored bytes
				// can predate the declaration: the host scoped the app in this release, or the
				// envelope came from a build that never scoped anything, or a scope was widened and
				// narrowed again on a device that has been offline since. Reading those bytes whole
				// would serve the wider list to the first drawer that opens before `/init` lands,
				// and on a device whose network never comes back that drawer is the answer for the
				// life of the app. Applying it costs nothing when the list is already inside the
				// scope -- [com.c15t.core.tc.narrowToVendorIds] over an already-narrow list returns
				// an equal one -- so this is the whole rule and not a race against the network.
				// [persist] then writes the pruned document back, so the device stops storing the
				// scope it no longer discloses.
				//
				// A `null` scope is a no-op on both branches, so a host that declared nothing keeps
				// a served list byte for byte the same, which is what the retention tests around
				// this line have always graded.
				iab = (envelope.gvl ?: restored.iab?.gvl)
					?.narrowToVendorIds(config.vendors)
					?.let(::KernelIabState),
				subject = restored.subject?.copy(id = subject.id) ?: subject,
				consentCategories = decidedCategories(envelope.evaluationPolicy),
				overrides = hydratedOverrides,
				// A stored `active` is never trusted: it would keep a category denied
				// after the signal that caused it is gone.
				privacySignals = signalsFor(hydratedOverrides),
			)
			synchronized(mutationLock) {
				publishPure(
					validateIab(
						PolicyEvaluator.evaluate(
						hydrated,
						envelope.evaluationPolicy,
						envelope.noticeDismissal,
						now,
						choiceScopeOf(envelope.evaluationPolicy),
						)
					)
				)
			}
			persist()
		}

		// Contract: retry on the next launch and on foreground, so a write that
		// never left the device is on its way before the first prompt is drawn.
		// Both go through the executor: with TaskExecutor.DIRECT they stay
		// synchronous, which is what the tests rely on.
		mutation.release()
		if (snapshot().policyPending) config.bundledPolicy?.let { resource ->
			BundledPolicy.resolve(resource, config.backendUrl, config.overrides, clock.nowMillis())?.let { selection ->
				applyInit(selection.mapped, config.detectedGpc, false, selection)
			}
		}
		background.execute { flushPending() }
		background.execute { runInit() }
	}

	/** Restore the vendor mirror from current native authority without reading it as consent. */
	fun rebuildTcStorageBus() = mutate { _ -> publishCurrentTcStorageBus() }

	/** Capture current authority after durable I/O, then write the mirror off the state lock. */
	private fun publishCurrentTcStorageBus(allowConsent: Boolean = true) {
		val envelope = synchronized(mutationLock) {
			val snapshot = state.get()
			SnapshotEnvelope(bundledPolicyAuthority = bundledPolicyAuthority, snapshot = snapshot.copy(iab = null),
				evaluationPolicy = evaluationPolicy, gvl = snapshot.iab?.gvl, iabConsent = iabConsent)
		}
		if (allowConsent || envelope.iabConsent == null) store.publishTcStorageBus(envelope)
	}

	/** `true` once [bootstrap] has run. */
	val isBootstrapped: Boolean
		get() = bootstrapped.get()

	/**
	 * Whether [bootstrap] found a stored envelope to hydrate from.
	 *
	 * Binding layers report this in their handshake so JavaScript can tell "the user
	 * has never decided" apart from "we have a cached answer and no connectivity". It
	 * is recorded during [bootstrap] rather than read on demand: the read has to be
	 * synchronous and disk-free, and a getter that reopened storage would break that.
	 */
	val hasStoredSnapshot: Boolean
		get() = storedSnapshotFound

	/**
	 * The current snapshot.
	 *
	 * Synchronous, allocation-free, and never touches disk or the network. Returns
	 * the same instance until state changes or IAB authority crosses a time boundary,
	 * so a caller can compare by identity to decide whether to do work.
	 */
	fun snapshot(): ConsentSnapshot {
		val view = readView.get()
		view.authority?.let { authority ->
			if (!authority.isCurrent(config.backendUrl, clock.nowMillis())) return view.expired
		}
		if (!view.requiresIab) return view.snapshot
		val now = clock.nowMillis()
		val fetched = view.fetchedAt
		val additionalFetched = view.additionalConsentFetchedAt
		return if (view.snapshot.iab?.gvl != null && fetched != null && fetched >= 0 &&
			now >= fetched && now - fetched < config.iabListMaxAgeMs &&
			(view.saved?.adTechProvidersID == null || additionalFetched != null && additionalFetched >= 0 &&
				now >= additionalFetched && now - additionalFetched < config.iabListMaxAgeMs) &&
			view.saved?.isCurrent(now, view.choiceMs) == true
		) view.snapshot else view.denied
	}

	/**
	 * The vendor list this device is reading its disclosure out of, or `null` while none has been
	 * served and accepted.
	 *
	 * This is the seam a host app's own Kotlin code asks the question with. It is one read of
	 * [snapshot] rather than a second copy of the answer, so a disclosure drawn natively and one
	 * drawn through the bridge off `snapshot.iab.gvl` cannot end up naming different vendors --
	 * which is also how `core-swift`'s `globalVendorList()` works. [vendorListBody] turns it back
	 * into the document the web reads.
	 *
	 * Why the list latches. It is what a purpose id and a vendor id mean. A subject shown "cookie
	 * analytics, advertising personalisation" above a named list of vendors was shown those words
	 * out of this document, and the disclosure the dialog draws and the TC String written next to it
	 * both repeat that claim on every later launch. If a refresh that happened to carry no `gvl` --
	 * which is normal, because the backend embeds one only when the matched model is `iab` --
	 * cleared it, a device would wake up one morning with a saved consent record pointing at ids it
	 * can no longer name, and a surface that either goes blank or re-derives an empty disclosure.
	 * The subject did nothing; the claim already made would have changed underneath them.
	 *
	 * Holding a stale list costs nothing that discarding one costs worse. Nothing here decides a
	 * category from it -- the list is disclosure and encoding data, and permissions come from the
	 * policy -- so the worst it can do is name a vendor the IAB has since withdrawn, a list-version
	 * problem the next `/init` solves. Discarding is the sharper failure: a dialog that goes blank
	 * on a device whose subject did nothing. `TcSemanticPreEncoder` handles the dangerous half of
	 * that staleness directly, clearing a signal for a vendor the served list withdrew or never
	 * carried before a bit is written, so the string stays valid at any age.
	 *
	 * [reset] is where it goes, with [evaluationPolicy] and [noticeDismissal], which is the matched
	 * policy's own retention and the rule this latch stores under: a wiped device shows nobody a
	 * disclosure, so there is no claim left to hold. An unreadable resolution is the opposite case
	 * and takes nothing. There rule 5 takes back the rule, because the core can no longer represent
	 * the permissions it served; a vendor list is not a permission, and dropping it mid-flight is
	 * precisely what would change an answer the subject has already been given.
	 *
	 * One read of in-memory state, on the same terms as [snapshot] and [isAllowed]: no disk, no
	 * network, no lock held across either, because an ad SDK calls the whole surface from
	 * `Application.onCreate`.
	 */
	val vendorList: GlobalVendorList?
		get() = state.get().iab?.gvl

	/**
	 * [vendorList] as the JSON body the web reads, or `null` when there is no list.
	 *
	 * The bytes are the served document: `globalVendorListSchema`'s key names, the numbered records as
	 * objects keyed by id rather than as arrays, and no invented mobile-only field. A JavaScript reader
	 * that already handles `iab.gvl` from `/init` handles this unchanged, which is the requirement this
	 * accessor exists to satisfy -- see [GlobalVendorListJson.toJsonElement].
	 *
	 * Encoded per call rather than cached, because [vendorList] is the snapshot's own field and a
	 * stored body could only fall behind it. It costs a serialisation on each call, and the callers
	 * are a consent surface being opened and a bridge message being sent, not a per-frame read.
	 */
	fun vendorListBody(): String? = vendorList?.let { GlobalVendorListJson.toJson(it) }

	/** [vendorListBody] as a document, for a caller that is composing a larger payload. */
	fun vendorListJson(): JsonObject? =
		vendorList?.let { GlobalVendorListJson.toJsonElement(it) }

	/**
	 * Whether [category] may run right now.
	 *
	 * `necessary` is always true. Every optional category is false while the state
	 * is not ready or the policy is still pending.
	 */
	fun isAllowed(category: ConsentCategory): Boolean = snapshot().isAllowed(category)

	/**
	 * Call [onChange] now with the current permission for [category], then again on
	 * every published snapshot.
	 *
	 * This one fires per publication rather than per change, which is what
	 * `native/CONTRACT.md` leaves it: "the boolean `gate` predates this one and keeps
	 * its per-snapshot fan-out; narrowing that is a separate decision from adding
	 * this API." A host that acts on the transition keeps its own last value and
	 * compares. A host that wants the dedupe uses [gateDecision].
	 *
	 * The observer is held strongly for as long as the returned handle is open, so
	 * a caller that keeps only the handle still gets callbacks.
	 *
	 * This is the boolean surface the React Native bridge forwards. A host that has to
	 * tell a refusal apart from an unresolved policy wants [gateDecision] instead.
	 */
	fun gate(
		category: ConsentCategory,
		onChange: (Boolean) -> Unit,
	): Subscription {
		val observer: (ConsentSnapshot) -> Unit = { onChange(it.isAllowed(category)) }
		strongObservers += observer
		onChange(isAllowed(category))
		return Subscription { strongObservers.remove(observer) }
	}

	/**
	 * Call [onDecision] now with the current [ConsentDecision] for [category], then
	 * again whenever the decision for that category changes, with the returned handle
	 * cancelling. This is the contract's decision-carrying `gate`.
	 *
	 * "Whenever the decision changes" is a dedupe, and it is the whole reason this gate
	 * carries a decision instead of a boolean. A device that publishes five snapshots
	 * while the answer stays `PENDING` delivers one `PENDING`, not five: a host acts on
	 * the transition, so each repeat makes it wonder whether its `init` is idempotent,
	 * and the core cannot know that it is. A decision that moves away and back fires
	 * again, which is correct, and a host that must act exactly once still guards its
	 * own action.
	 *
	 * The rest of the rules are the boolean [gate]'s, plus the one that matters to a
	 * late starter: registering never produces silence. An analytics SDK that
	 * initializes two seconds into the launch, long after the policy resolved, is told
	 * at registration the decision it would otherwise have had to go and read. A
	 * listener that saw [ConsentDecision.PENDING] keeps the handle open and hears the
	 * answer land, in either direction.
	 *
	 * It carries a different name rather than being a second `gate` overload because
	 * Kotlin erases both `(Boolean) -> Unit` and `(ConsentDecision) -> Unit` to
	 * `Function1`, so two overloads are not two JVM methods: the declaration fails to
	 * compile, and a Kotlin/Java host could not call either one. The name keeps the
	 * contract's verb so the two surfaces still read as the same call with a richer
	 * answer, and Swift keeps a single `gate`, where the closure types are part of the
	 * signature and the overload does exist.
	 */
	fun gateDecision(
		category: ConsentCategory,
		onDecision: (ConsentDecision) -> Unit,
	): Subscription {
		// The last decision handed to [onDecision], which is the whole dedupe. One
		// atomic slot per subscription, held across the comparison alone, so the seed
		// below and a publication racing it cannot deliver out of order or twice over
		// the same answer.
		val lastDelivered = AtomicReference<ConsentDecision?>(null)
		val observer: (ConsentSnapshot) -> Unit = { snapshot ->
			val decision = snapshot.decision(category)
			if (lastDelivered.getAndSet(decision) != decision) {
				onDecision(decision)
			}
		}
		// Register before the first read, in that order: a change that lands between
		// the two is delivered by the observer, and the seed then stands down rather
		// than putting an older decision on the end of the callback's sequence. Missing
		// a change would leave an SDK switched off with nothing left listening, so the
		// most this ordering can cost is one redundant delivery.
		strongObservers += observer
		val current = decision(category)
		if (lastDelivered.compareAndSet(null, current)) {
			onDecision(current)
		}
		return Subscription { strongObservers.remove(observer) }
	}

	/**
	 * Why [category] is or is not allowed, in the three states a host SDK can act on.
	 *
	 * The same single-read rule as [snapshot] and [isAllowed]: one read of the
	 * [AtomicReference], no disk, no network, and no lock that can be held across
	 * either. Ad SDKs call this from the main thread inside `Application.onCreate`,
	 * and blocking there is an ANR the store files against the host app.
	 */
	fun decision(category: ConsentCategory): ConsentDecision = snapshot().decision(category)

	/**
	 * Whether a decision can be read as an answer: [bootstrap] hydrated a state and
	 * the first init has resolved a policy the core can represent.
	 *
	 * `false` means [decision] answers `PENDING` for every optional category. Like
	 * [decision] this is one read of memory, and the core adds no timeout to it: a
	 * device that never reaches the network stays `false` for the life of the
	 * process, and a number invented here would become an answer the policy never
	 * gave.
	 */
	fun isReady(): Boolean = snapshot().isReady

	/** Observe every snapshot change. The lambda is held weakly, per the contract. */
	fun onChange(observer: (ConsentSnapshot) -> Unit): Subscription {
		val reference = WeakReference(observer)
		snapshotObservers += reference
		return Subscription { snapshotObservers.remove(reference) }
	}

	/** Observe errors the core emits, including an unsupported policy contract. */
	fun onError(observer: (KernelError) -> Unit): Subscription {
		val reference = WeakReference(observer)
		errorObservers += reference
		return Subscription { errorObservers.remove(reference) }
	}

	/**
	 * Record a consent decision.
	 *
	 * The snapshot and queued body land in one durable write before state moves, because
	 * [CommitResult.ok] claims three device-side facts: the receipts are applied, the
	 * snapshot is stored, and the queue holds the exact bytes that owe delivery. It never
	 * claims the backend has them, which no synchronous call on this thread could know.
	 *
	 * A save that cannot take on the delivery obligation answers not-ok with the reason
	 * and leaves the previous decision and queue intact, without a request or snapshot
	 * callback. [commitGate] serializes preparation, storage and publication while
	 * [mutationLock] guards only the in-memory swap. Synchronous reads continue serving
	 * the previous authority until the durable write acknowledges the complete decision.
	 *
	 * Delivery is a later fact than any of this. It arrives as a drained queue, or as an
	 * error event carrying `save-rejected`, `save-undeliverable`, or
	 * `transport-unavailable`. See [CommitResult.delivered] for the one case where this
	 * call can report it.
	 *
	 * @returns [CommitResult.ok] is true only for a committed decision; on a refusal
	 * [CommitResult.failure] names which of `queue-write-failed` or `concurrent-change`
	 * stopped it, and `not-bootstrapped` comes from the [C15t] facade in front of this
	 * kernel.
	 */
	fun save(intent: CommitIntent, expectedRevision: Long? = null): CommitResult =
		saveAt(intent, expectedRevision, clock.nowMillis())

	private fun saveAt(intent: CommitIntent, expectedRevision: Long?, at: Long): CommitResult = mutate { mutation ->
		// Capture the action before waiting for another durable mutation.
		var actionAt = at
		var published: ConsentSnapshot
		var policy: EvaluationPolicy?
		// The surface the subject acted on, read before the commit rewrites it.
		// `uiSource` records where the decision was made, so a save that clears the
		// prompt must not report "no surface": `buildSubjectPostBody` in `@c15t/core`
		// reads the pre-commit `activeUI` for the same reason.
		var surfaceAtAction: ActiveUI? = null
		var action: ConsentAction
		var confirmed: Map<String, Boolean>
		var acknowledgement: NoticeDismissal?
		var nextIab: IabCommittedConsent? = null

		synchronized(mutationLock) {
			val current = state.get()
			val withdrawingExpiredBundle = intent is CommitIntent.Necessary && evaluationPolicy != null &&
				bundledPolicyAuthority?.hasExpired(config.backendUrl, at) == true
			if (bundledPolicyAuthority?.isCurrent(config.backendUrl, at) == false && !withdrawingExpiredBundle)
				return@mutate refusedCommit("bundled-policy-expired", "Connect to refresh consent policy.")
			if (bundledPolicyAuthority?.requiresAtp == true && intent !is CommitIntent.Necessary && currentAdditionalConsentList() == null)
				return@mutate refusedCommit("additional-consent-list-stale", "Refresh the provider disclosures before saving.")
			if (expectedRevision != null && expectedRevision != current.revision)
				return@mutate refusedCommit(
					"concurrent-change",
					"The draft was based on an older consent snapshot",
				)
			if (intent is CommitIntent.Iab && expectedRevision == null)
				return@mutate refusedCommit("iab-draft-required", "Open a native IAB draft and save its disclosure revision")
			surfaceAtAction = current.activeUI
			policy = evaluationPolicy
			if (policy?.model == ConsentModel.IAB) {
				lastIabActionAt?.let { previous ->
					if (previous == Long.MAX_VALUE)
						return@mutate refusedCommit(
							"invalid-action-time",
							"The previous action time cannot be advanced",
						)
					actionAt = maxOf(actionAt, previous + 1)
				}
				if (at < 0 || actionAt < 0 || actionAt - at > 600_000)
					return@mutate refusedCommit(
						"invalid-action-time",
						"The clock cannot represent a current, distinct IAB action time",
					)
			}
			if (policy?.model == ConsentModel.IAB &&
				(intent !is CommitIntent.Necessary || iabConfiguration != null && current.iab?.gvl != null && listIsUsable())) {
				val configuration = iabConfiguration
				val gvl = current.iab?.gvl
				if (configuration == null || gvl == null)
					return@mutate refusedCommit(
						"iab-unavailable",
						"IAB saves require CMP configuration and a disclosed vendor list",
					)
				if (!listIsUsable()) return@mutate refusedCommit("iab-list-stale", "Refresh the vendor list before saving")
				val choices =
					when (intent) {
						is CommitIntent.All -> IabAuthority.accepting(
							gvl, configuration, currentAdditionalConsentList()?.providers?.map { it.id })
						is CommitIntent.Necessary -> IabChoices()
						is CommitIntent.Iab -> intent.choices
						is CommitIntent.Custom ->
							return@mutate refusedCommit(
								"iab-choices-required",
								"Save the complete native IAB draft with category choices",
							)
					}
				if (intent !is CommitIntent.Necessary && additionalConsentList?.providers?.isNotEmpty() == true && currentAdditionalConsentList() == null)
					return@mutate refusedCommit("additional-consent-unavailable", "Refresh the Google ATP list before saving")
				try {
					nextIab =
						IabAuthority.build(
							configuration,
							choices,
							gvl,
							current.subject!!.id,
							current.subject.externalId,
							policy!!.choiceFingerprint,
							actionAt,
							committedIab,
							currentAdditionalConsentList(),
						)
				} catch (_: IllegalArgumentException) {
					return@mutate refusedCommit(
						"invalid-iab-choices",
						"IAB configuration or choices do not match the disclosed list",
					)
				}
			} else if (intent is CommitIntent.Iab) {
				return@mutate refusedCommit("iab-unavailable", "The resolved policy does not use IAB")
			}
			// A bulk action covers the categories the prompt asks about, which is what
			// `resolveSaveSelection` in `@c15t/core` narrows it to. Before a policy
			// resolves that is the safe fallback rule's: every optional category,
			// narrowed by the declaration.
			val policyScope = policy?.scope ?: ConsentCategory.OPTIONAL
			val choiceScope = choiceScopeOf(policy) ?: fallbackChoiceScope()
			val intentConsents = when (intent) {
				is CommitIntent.All -> choiceScope.associateWith { true }
				// Expired-policy rejection also withdraws older grants outside today's scope.
				is CommitIntent.Necessary ->
					(if (withdrawingExpiredBundle) ConsentCategory.OPTIONAL else choiceScope).associateWith { false }
				is CommitIntent.Custom -> intent.consents
					is CommitIntent.Iab -> intent.consents
				}
			// With nothing to decide, a bulk action still covers everything the subject
			// was shown: strictly necessary alone.
			action = if (
				withdrawingExpiredBundle || intent is CommitIntent.Custom || intent is CommitIntent.Iab ||
				choiceScope.size == policyScope.size ||
				choiceScope.isEmpty()
			) {
				intent.action
			} else {
				ConsentAction.CUSTOM
			}
			val prior = stillValid(current.explicitChoice, policy, actionAt)
			val consents = LinkedHashMap(prior)
			for ((category, value) in intentConsents) {
				consents[category.wireName] = value
			}
			confirmed = LinkedHashMap<String, Boolean>(intentConsents.size).apply {
				for ((category, value) in intentConsents) {
					put(category.wireName, value)
				}
			}

			// Any action on a choice prompt with nothing to decide acknowledges it. One
			// that confirmed no category leaves the stored choice as it was, the way the
			// kernel only patches a choice it changed.
			acknowledgement = choiceAcknowledgement(policy, choiceScope, actionAt)
			val choice = if (acknowledgement != null && confirmed.isEmpty()) {
				current.explicitChoice
			} else {
				ExplicitChoice(
					consents = consents,
					action = action,
					actionAt = actionAt,
					fingerprint = policy?.choiceFingerprint,
				)
			}
			published = PolicyEvaluator.evaluate(
				snapshot = current.copy(
					explicitChoice = choice,
					revision = current.revision + 1,
					error = null,
				),
				policy = policy,
				noticeDismissal = acknowledgement ?: noticeDismissal,
				now = actionAt,
				choiceScope = choiceScope,
			)
			if (withdrawingExpiredBundle) published = published.copy(
				effectivePermissions = ConsentState.DENY_ALL, policyPending = true, activeUI = ActiveUI.NONE)
		}

		if (nextIab != null) published = published.copy(model = ConsentModel.IAB)
		else if (policy?.model == ConsentModel.IAB) published = published.copy(effectivePermissions = ConsentState.DENY_ALL)

		// Built from the snapshot computed above, which is a value: the frozen body is the
		// one that revision describes, and building it here keeps the subject resolution and
		// its storage write off the lock, as the class requires.
		val payload =
			buildSavePayload(published, policy, action, confirmed, actionAt, surfaceAtAction)
				.copy(tcString = nextIab?.tcString, addtlConsent = nextIab?.addtlConsent)

		val isIab = policy?.model == ConsentModel.IAB
		val frozen = com.c15t.core.transport.SaveBodyBuilder.build(payload,
			config.domain?.takeIf { it.isNotBlank() } ?: java.net.URI(config.backendUrl).host.orEmpty()).toString()
		val entry = QueuedSave(
			if (isIab) UUID.randomUUID().toString() else queueIdGenerator(),
			actionAt, payload, body = frozen,
		)
		val envelope = synchronized(mutationLock) {
			SnapshotEnvelope(bundledPolicyAuthority = bundledPolicyAuthority,
				snapshot = published.copy(iab = null),
				evaluationPolicy = policy,
				noticeDismissal = acknowledgement ?: noticeDismissal,
				gvl = published.iab?.gvl,
				iabConsent = if (isIab) nextIab else committedIab,
				lastIabActionAt = if (isIab) actionAt else lastIabActionAt,
				iabListFetchedAt = iabListFetchedAt,
				additionalConsentList = additionalConsentList,
			)
		}
		if (!store.commit(envelope, entry, config.maxPendingSaves, supersedeGrants = isIab, publishBus = false)) {
			publishCurrentTcStorageBus(allowConsent = false)
			return@mutate refusedCommit(
				"queue-write-failed",
				"The atomic consent decision write failed; nothing was sent",
			)
		}

		// The mutation gate owns this revision through the durable write and swap.
		synchronized(mutationLock) {
			if (isIab) {
				committedIab = nextIab
				lastIabActionAt = actionAt
			}
			installSnapshot(published)
			acknowledgement?.let { noticeDismissal = it }
		}
		publishCurrentTcStorageBus()

		mutation.release()

		// The first send is not joined. What this thread may claim about it is whatever the
		// atomic holds at this instant and nothing more: `null` behind a pool, and the
		// settled answer only where the host's executor ran the send before returning.
		val firstSend = AtomicReference<Delivery>()
		background.execute { requestDeliveryPass { deliverIfOwed(entry)?.let(firstSend::set) } }
		val delivered = firstSend.get() === Delivery.Reached

		val result = CommitResult(
			ok = true,
			revision = published.revision,
			confirmed = payload.confirmed.categories,
			queued = true,
			delivered = delivered,
		)
		notifySnapshot()
		result
	}

	/**
	 * A save that changed nothing, announced and then refused.
	 *
	 * Refusals are emitted rather than only returned: a host that renders a banner and
	 * never reads the return value has no other way to learn that the subject's tap was
	 * dropped. The snapshot observers deliberately get nothing, because the snapshot did
	 * not move.
	 */
	private fun refusedCommit(
		code: String,
		message: String,
	): CommitResult {
		val error = KernelError(code = code, message = message)
		emitError(error)
		val current = state.get()
		return CommitResult(
			ok = false,
			revision = current.revision,
			confirmed = emptyMap(),
			queued = false,
			delivered = false,
			error = error,
		)
	}

	/** Persist notice acknowledgement without recording a choice. Returns false on storage refusal. */
    fun dismissNotice(): Boolean = mutate { mutation ->
        val now = clock.nowMillis()
        val plan = synchronized(mutationLock) {
            val policy = evaluationPolicy ?: return@mutate false
            if (policy.prompt != PolicyPrompt.NOTICE) return@mutate false
            val dismissal = NoticeDismissal(dismissedAt = now, fingerprint = policy.noticeFingerprint)
            val next = PolicyEvaluator.evaluate(snapshot = state.get().copy(revision = state.get().revision + 1),
                policy = policy, noticeDismissal = dismissal, now = now, choiceScope = choiceScopeOf(policy))
            val envelope = SnapshotEnvelope(bundledPolicyAuthority = bundledPolicyAuthority,
                snapshot = next.copy(iab = null), evaluationPolicy = policy,
                noticeDismissal = dismissal, gvl = state.get().iab?.gvl, iabConsent = committedIab,
                additionalConsentList = additionalConsentList, iabListFetchedAt = iabListFetchedAt, lastIabActionAt = lastIabActionAt)
            Triple(next, dismissal, envelope)
        }
        if (!store.writeEnvelope(plan.third, publishBus = false)) {
            emitError(KernelError("queue-write-failed", "The notice acknowledgement could not be stored."))
            return@mutate false
        }
        synchronized(mutationLock) { noticeDismissal = plan.second; installSnapshot(plan.first) }
        mutation.release()
        notifySnapshot()
        true
    }

	/** Re-run init: policy, geo, translations, and any server-side subject id. */
	fun refresh() {
		background.execute { runInit() }
	}

	/** Attach an external identity to the subject, then refresh. */
	fun identify(user: KernelUser) = mutate { mutation ->
		val transition = transitionIab(user.externalId, false)
		if (transition != null) {
			mutation.release()
			if (!transition)
				emitError(
					KernelError(
						"identity-write-failed",
						"Identity consent reset could not be persisted",
					)
				)
			else {
				val snapshot = state.get()
				notifySnapshot()
				background.execute {
					transport.identify(snapshot.subject!!, user)
					runInit()
				}
			}
			return@mutate
		}
		var published: ConsentSnapshot
		var subject: ConsentSubject
		synchronized(mutationLock) {
			val current = state.get()
			subject = (current.subject ?: ConsentSubject(subjectIdGenerator())).let {
				it.copy(externalId = user.externalId)
			}
			published = current.copy(subject = subject,
				revision = current.revision + 1)
			if (
				iabConfiguration != null &&
					evaluationPolicy?.model == ConsentModel.IAB &&
					!published.policyPending
			)
				published = published.copy(model = ConsentModel.IAB)
			installSnapshot(published)
		}
		persist()
		mutation.release()
		notifySnapshot()
		background.execute {
			transport.identify(subject, user)
			runInit()
		}
	}

	/**
	 * Detach the external identity.
	 *
	 * The c15t subject id stays: it is the installation's identity, not the user's,
	 * and the records already attached to it stay attributable.
	 */
	fun logout() = mutate { mutation ->
		val transition = transitionIab(null, false)
		if (transition != null) {
			mutation.release()
			if (transition) {
				val snapshot = state.get()
				notifySnapshot()
				background.execute { transport.logout(snapshot.subject!!) }
			}
			else
				emitError(
					KernelError(
						"identity-write-failed",
						"Logout consent reset could not be persisted",
					)
				)
			return@mutate
		}
		var published: ConsentSnapshot
		var subject: ConsentSubject
		synchronized(mutationLock) {
			val current = state.get()
			subject = (current.subject ?: ConsentSubject(subjectIdGenerator())).copy(externalId = null)
			published = current.copy(subject = subject, revision = current.revision + 1)
			if (
				iabConfiguration != null &&
					evaluationPolicy?.model == ConsentModel.IAB &&
					!published.policyPending
			)
				published = published.copy(model = ConsentModel.IAB)
			installSnapshot(published)
		}
		persist()
		mutation.release()
		notifySnapshot()
		background.execute { transport.logout(subject) }
	}

	/**
	 * Apply developer overrides and re-evaluate immediately.
	 *
	 * With [merge] only the members present in [overrides] change, so a caller can pin
	 * a country without clearing its language. With [merge] false [overrides] is the
	 * whole record, which is the only way to clear one: a null member means "unset" in
	 * [KernelOverrides], so it cannot express "unset this" while also leaving the
	 * others alone. A binding that receives explicit nulls from JavaScript uses the
	 * replace form after computing the full desired record.
	 */
	fun setOverrides(overrides: KernelOverrides, merge: Boolean = true) = mutate { mutation ->
		var published: ConsentSnapshot
		synchronized(mutationLock) {
			val current = state.get()
			// Merged against the host's own pins rather than the snapshot's, which an
			// earlier init may have widened with a matched country.
			configuredOverrides = if (merge) merge(configuredOverrides, overrides) else overrides
			published = PolicyEvaluator.evaluate(
				snapshot = current.copy(
					overrides = if (merge) merge(current.overrides, overrides) else overrides,
					revision = current.revision + 1,
				),
				policy = evaluationPolicy,
				noticeDismissal = noticeDismissal,
				now = clock.nowMillis(),
				choiceScope = choiceScopeOf(evaluationPolicy),
			)
			if (
				iabConfiguration != null &&
					evaluationPolicy?.model == ConsentModel.IAB &&
					!published.policyPending
			)
				published = published.copy(model = ConsentModel.IAB)
			published = validateIab(published)
			installSnapshot(published)
		}
		persist()
		mutation.release()
		notifySnapshot()
		refresh()
	}

	/**
	 * Replay the offline queue, oldest first, each payload unchanged.
	 *
	 * Stops at the first entry the backend could not be reached for, since trying the rest on
	 * a dead connection wastes battery. Entries this pass never sent keep the attempt count
	 * they had: an attempt is spent by a send, not by a pass that skipped them.
	 *
	 * Each entry settles by the same rules as the first send of a save, including which
	 * refusals are permanent and which releases get announced.
	 *
	 * Only one pass may be in flight per core. That is the rule `native/CONTRACT.md` sets in
	 * "The pending save queue", and [requestDeliveryPass] is where this core holds it, because a
	 * flush is not a pass of its own and this method is a public synchronous entry point that
	 * reaches it from several threads at once: bootstrap and a resolved init on [background], a
	 * foreground transition on the lifecycle observer's worker, a reachability change on the
	 * main thread, a React Native `refresh` on the module's thread, and any host that calls it
	 * directly. A pass reads the queue once and then delivers entry by entry, so an entry stays
	 * readable until its own send lands, and a flush that ran its own pass on any two of those
	 * threads resends whatever was in flight. The single thread behind [backgroundPool] does not
	 * cover this: it only ever orders the work handed to it.
	 *
	 * A flush that arrives while a pass is running is answered by that pass. It reports the depth
	 * the queue owes with [FlushResult.delivered] at zero and no error -- nothing failed, another
	 * thread is sending it -- and it asks the running pass to read the queue again on the way
	 * out, which is what covers an entry queued after that pass had already read. Nothing about
	 * `committed` softens as a result: an entry waiting on the running pass is still owed, still
	 * counted in [FlushResult.remaining], and still announced by exactly one delivered event.
	 *
	 * The exclusivity is load-bearing rather than tidy, and it is tested: a scripted transport
	 * holds a send open, a second flush is asked for from another thread mid-send, and the test
	 * fails if any queued decision reaches the transport twice. Losing it does not need a bug,
	 * only a host that hands this core an executor with two threads in it, which is why the rule
	 * is guarded here instead of left to the shape of a queue.
	 */
	fun flushPending(): FlushResult {
		if (queue.pending().isEmpty()) {
			return FlushResult(delivered = 0, remaining = 0)
		}
		val pass = requestDeliveryPass(ownSend = null)
		return FlushResult(
			delivered = pass.delivered,
			remaining = queue.pending().size,
			error = pass.error,
		)
	}

	/**
	 * Ask for a delivery pass, and run it when no other pass holds the core.
	 *
	 * Contract: `native/CONTRACT.md`, "The pending save queue" -- only one pass may be in flight
	 * per core, and this is the only place that answers that question. Two threads running
	 * [runDeliveryPass] at once is the defect the contract describes: each reads the whole queue,
	 * so each sends what the other is still sending, and because the bytes are frozen and carry
	 * the same consent id the backend dedupes, nothing in stored state moves, and the only trace
	 * is a second POST for a decision the subject already saw delivered.
	 *
	 * A request that finds the core held neither waits nor starts a pass. It records itself and
	 * returns at once: a flush arrives on the main thread from a reachability callback on
	 * Android, so this must never sit behind someone else's network timeout, and the running pass
	 * is what answers it. That pass reads the queue again before releasing, which is how an entry
	 * queued after its first read still gets delivered without waiting for the next launch,
	 * foreground, or network.
	 *
	 * @param ownSend the first send of the entry a save just queued, run before the queue is
	 * read, or `null` for a pass over the whole queue. It takes the same guard a replay does, so a
	 * save's own send and a replay can never hold the same entry at the same time; when the guard
	 * is already held, the pass that holds it covers this entry on its re-read.
	 */
	private fun requestDeliveryPass(ownSend: (() -> Unit)?): PassReport {
		val askedForAPass = ownSend == null
		var pendingSend = ownSend
		var report = PassReport.Declined
		while (true) {
			if (!passInFlight.compareAndSet(false, true)) {
				passRequested.set(true)
				return report
			}
			try {
				val requestedBefore = passRequested.getAndSet(false)
				pendingSend?.invoke()
				// This thread has sent whatever its save queued, whatever the answer was.
				pendingSend = null
				// A save asked for one send, not for a pass over the queue. Reading the rest of the
				// queue on every save would spend an attempt on each older entry every time a
				// subject tapped a banner, and attempts end in released entries, so this thread
				// takes that cost on only when somebody actually asked for a pass.
				report = if (askedForAPass || requestedBefore) runDeliveryPass() else PassReport.Quiet
				while (!report.unreachable && passRequested.get()) {
					passRequested.set(false)
					val again = runDeliveryPass()
					report = PassReport(
						delivered = report.delivered + again.delivered,
						error = again.error,
						unreachable = again.unreachable,
					)
				}
			} finally {
				passInFlight.set(false)
			}
			// A pass that gave up on a dead connection has no reason to read the queue again, and
			// a request that arrived while this thread was handing the core back still has to be
			// answered by someone who knows the pass is over. That someone is this thread.
			if (report.unreachable || !passRequested.get()) {
				return report
			}
		}
	}

	/**
	 * One read of the queue and the sends it owed, oldest first.
	 *
	 * Only [requestDeliveryPass] may call this, which is what keeps a second copy of the loop
	 * from reading the queue while a send from the first is still open.
	 */
	private fun runDeliveryPass(): PassReport {
		val pending = queue.pending()
		if (pending.isEmpty()) {
			return PassReport(delivered = 0, error = null, unreachable = false)
		}
		var delivered = 0
		var lastError: KernelError? = null
		for (entry in pending) {
			// Every entry goes through the same settle rules as a save's first send, so a replay
			// cannot decide permanence, attempts, or announcements differently.
			val delivery = deliverIfOwed(entry) ?: continue
			when (delivery) {
				Delivery.Reached -> delivered += 1

				is Delivery.Unreachable -> return PassReport(
					delivered = delivered,
					// The entry that could not be reached spent its attempt; the ones this pass
					// never sent did not, because nothing was sent for them.
					error = lastError ?: delivery.error,
					unreachable = true,
				)

				is Delivery.Refused -> lastError = delivery.error

			}
		}
		return PassReport(delivered = delivered, error = lastError, unreachable = false)
	}

	/**
	 * Return the device to the state a first launch is in, keeping the subject id.
	 *
	 * The baseline installed here is the cold-start snapshot, and the difference between
	 * that and a recorded denial is the entire point of the method. A denial is an
	 * [ExplicitChoice] that says the subject answered, so the evaluator finds a current
	 * receipt, owes nothing, and no prompt ever returns. This installs no receipt at all,
	 * so [PolicyEvaluator] sees `choice == null`, owes the choice again, and the banner
	 * comes back once the init below lands. `native/CONTRACT.md` states this under
	 * "Wiping consent (reset)".
	 *
	 * Three things this has to do that "clear the store" does not cover:
	 *
	 * - Publish. It is a committed mutation, so it moves the revision by one and goes out
	 *   through the observers like any other. Installing the baseline silently would leave
	 *   every [gate] in the process holding a decision the device no longer remembers, and
	 *   restarting the numbering at the cold-start revision would hand each subscriber a
	 *   snapshot older than the one it holds.
	 * - Remove grants durably. Category-only state without an owed withdrawal is
	 *   deleted. IAB authority or owed withdrawals require an atomic empty decision
	 *   envelope retaining the action-time watermark and frozen withdrawal bodies.
	 *   [hasStoredSnapshot] reports that retained envelope, not a consent grant.
	 * - Re-run init. A first launch does not sit at `policyPending` once the network
	 *   answers, and a wipe that stopped at the baseline would leave the app there until
	 *   the next launch, with the subject withdrawn from everything and nothing asking them
	 *   to decide again. A caller must not have to remember to refresh after this.
	 *
	 * What survives is configuration rather than consent: the subject id, the overrides the
	 * host pinned, and the configured category scope. A host that pinned a country for QA or switched GPC on
	 * would otherwise get a different policy resolved than the one its app is configured to
	 * evaluate.
	 *
	 * A save a delivery pass had already handed to the transport can still land after the
	 * queued grants are dropped. Nothing here waits for it. Frozen withdrawals remain
	 * owed under their original owner; reset creates no new consent decision.
	 */
	fun reset() = mutate { mutation ->
		val transition = transitionIab(state.get().subject?.externalId, true)
		if (transition != null) {
			mutation.release()
			if (transition) {
				notifySnapshot()
				background.execute { runInit() }
			} else
				emitError(KernelError("reset-write-failed", "Consent reset could not be persisted"))
			return@mutate
		}
		val now = clock.nowMillis()
		// Identity first, off the lock, because a missing subject is the one case that
		// reaches storage. A subject this launch already answers with is reused untouched.
		val resolved = state.get().subject ?: resolveSubject()
		val published: ConsentSnapshot
		synchronized(mutationLock) {
			val current = state.get()
			evaluationPolicy = null
			bundledPolicyAuthority = null
			additionalConsentList = null
			iabListFetchedAt = null
			iabListFromCache = true
			iabListOffline = false
			committedIab = null
			noticeDismissal = null
			published = ConsentSnapshot.denyAll(current.subject ?: resolved, now)
					.copy(
				// The list goes with the policy. Not because a wipe has anything to hide -- the list
				// is a public document -- but because a wipe is a device no longer showing anybody a
				// disclosure, so the claim the latch exists to protect has been withdrawn with it.
				// Written out here rather than trusted to `denyAll`'s default, the way `core-swift`
				// wipes it, because a list kept on the snapshot past a wipe is written straight back
				// into the next envelope this core persists.
				iab = null,
				revision = current.revision + 1,
				consentCategories = decidedCategories(null),
				// The host's pins, not the snapshot's. See [configuredOverrides]: the
				// folded country came from the resolution this wipe is deleting, and
				// keeping it would leave a first launch's answer one field off.
				overrides = configuredOverrides,
				privacySignals = signalsFor(configuredOverrides),
			)
			installSnapshot(published)
		}
		queue.clear()
		store.clearConsentState()
		storedSnapshotFound = false
		mutation.release()
		config.bundledPolicy?.let { resource -> BundledPolicy.resolve(resource, config.backendUrl, configuredOverrides, clock.nowMillis())?.let { applyInit(it.mapped, config.detectedGpc, false, it) } }
		notifySnapshot()
		background.execute { runInit() }
	}

	// -- internals ------------------------------------------------------------

	/**
	 * The subject this launch answers with: the stored one, or a fresh one.
	 *
	 * A stored id that the producer will not accept is not an identity, so it is not
	 * adopted -- see [C15tStore.readSubject]. Replacing it is only honest together with the
	 * records written under it, so this path clears them: keep the envelope and the fresh
	 * id inherits a decision nobody made under it, which splits one subject across two ids
	 * and re-prompts nobody, so nobody ever notices that it happened.
	 *
	 * The queue goes with the envelope. Its bodies are frozen and they carry the refused id,
	 * so they are bytes the producer has already turned away on their own terms; replaying
	 * them buys one more rejection of a decision this device has stopped remembering.
	 */
	private fun resolveSubject(): ConsentSubject {
		store.readSubject()?.let { subject ->
			val envelope = store.readEnvelope()
			if (envelope != null && envelope.snapshot.subject?.id != subject.id) {
				discardOrphanedIdentityRecords("mismatch")
			}
			return subject
		}
		store.takeUnusableSubject()?.let(::discardRecordsOfUnusableSubject)
		store.subjectReplacementReason?.let { reason ->
			if (store.hasConsentRecords()) discardOrphanedIdentityRecords(reason)
		}
		// Owned by c15t and minted by SubjectIdGenerator. Never derived from a hardware
		// identifier. An id this build wrote is adopted untouched, because minting a
		// fresh one over an accepted stored id would orphan every record the backend holds
		// against the id in storage.
		val created = ConsentSubject(id = subjectIdGenerator())
		store.writeSubject(created)
		return created
	}

	private fun discardOrphanedIdentityRecords(reason: String) {
		store.clearConsentState()
		if (identityRecoveryAnnouncements.add(reason)) {
			emitError(KernelError(
				code = "subject-id-$reason",
				message = "c15t: the stored subject identity is $reason. Stored consent and queued saves were discarded; the app asks for consent again.",
			))
		}
	}

	/**
	 * Drop the consent state an unusable identity keyed, and say so once per launch.
	 *
	 * The message is written for a host that has to explain a re-prompt to a person: which
	 * id was refused, which build could have written it, what the core gave up, and the
	 * fact that the backend holds nothing to lose. `subject-id-unusable` is the code both
	 * cores use, per `native/CONTRACT.md`.
	 */
	private fun discardRecordsOfUnusableSubject(unusable: UnusableSubjectId) {
		store.clearConsentState()
		if (!unusableSubjectAnnounced.compareAndSet(false, true)) {
			return
		}
		val origin = if (unusable.legacyUuidShape) {
			"it has the UUID shape this SDK wrote before the sub_ format existed"
		} else {
			"it is a format this SDK never wrote"
		}
		emitError(
			KernelError(
				code = "subject-id-unusable",
				message = "c15t: the stored subject id ${unusable.id} $origin, and the c15t " +
					"backend only accepts ids matching ^sub_[1-9A-HJ-NP-Za-km-z]+$, so this build " +
					"cannot use that identity. The consent saved under it was discarded with it, " +
					"because the backend refused every save that carried it and holds no decision " +
					"for it. A new subject id was minted, so the app asks for consent again; " +
					"nothing the subject chose was overwritten on the server.",
			),
		)
	}

	private fun runInit() {
		var detected = detectedGpc
		val current = state.get()
		val outcome = try {
			transport.init(
				InitContext(
					overrides = current.overrides,
					subject = current.subject,
					gpc =
							GpcSignal.derive(
									override = current.overrides.gpc, detected = detected == true,
								)
								.active,
						vendors = config.vendors,
				)
			)
		} catch (error: Exception) {
				TransportOutcome.NetworkFailure(
					"c15t transport: ${error.message ?: error.javaClass.simpleName}"
				)
			}
		val mapped = InitMapper.map(outcome)
		val (changed, emitted) = applyInit(mapped, detected, outcome is TransportOutcome.Success)
		emitted?.let(::emitError)
		if (changed) notifySnapshot()
	}

	private fun applyInit(mapped: com.c15t.core.transport.MappedInit, detection: Boolean?, online: Boolean, bundle: BundledPolicy.Selection? = null): Pair<Boolean, KernelError?> = mutate { mutation ->
		var detected = detection
		var published: ConsentSnapshot
		var emitted: KernelError?
		synchronized(mutationLock) {
			val base = state.get()
			if (online || bundle != null) bundledPolicyAuthority = bundle?.authority
			val subject = mapped.subjectId?.let { serverId ->
				base.subject?.copy(id = serverId) ?: ConsentSubject(id = serverId)
			} ?: base.subject
			// Rule 5 is the one exception to the latching below, and a different event
			// from a failed init: the response carried a resolution this build cannot
			// parse, so there is no answer left to serve. The rule the current
			// permissions were computed from goes with it, the way `applyInit` in
			// `core-swift` drops its resolved policy in the same branch -- permissions
			// derived from a wire this build cannot re-read are permissions it can no
			// longer justify.
			evaluationPolicy = if (mapped.policyUnreadable) {
				null
			} else {
				mapped.evaluationPolicy ?: evaluationPolicy
			}
			// Latched, exactly like the policy two lines above, and for the reason on
			// [vendorList]: once a purpose or vendor name has been drawn from a list, a `/init` that
			// served none must not take the name back, because the disclosure it belonged to has
			// already been shown. Only a better list displaces it -- `fromInitBody` answers null for
			// absent and for refused alike, so the fold below cannot empty anything. Note the `gvl`
			// stays outside the `policyUnreadable` branch above on purpose: an unreadable resolution
			// costs the core its claim about permissions, which is rule 5, and costs it nothing about
			// who vendor 755 is.
			//
			// The declared scope narrows what arrives, before the latch. Web does the same on both
			// of its routes: `createIAB` in `packages/iab` asks the GVL endpoint for its scope and
			// then prunes whatever comes back, in case the endpoint ignored the parameter. The prune
			// is the part that carries the disclosure promise and the `x-c15t-vendors` header is the
			// bytes-saving optimisation in front of it, so a producer that embeds the whole list
			// here is answered by this line and not by the request.
			//
			// Inside the latch rather than outside it, because the retained half already went
			// through this line on the launch that served it, and on the read that hydrated it.
			if (mapped.adTechProvidersInvalid) additionalConsentList = null
			else mapped.adTechProviders?.let { additionalConsentList = AdditionalConsentList(it, if (bundle == null) clock.nowMillis() else bundle.atpFetchedAt ?: -1) }
			iabListOffline = !online
			if (mapped.gvl != null) {
				iabListFetchedAt = if (bundle == null) clock.nowMillis() else bundle.gvlFetchedAt
				iabListFromCache = bundle != null
			}
			val latchedVendorList = mapped.gvl?.narrowToVendorIds(config.vendors) ?: base.iab?.gvl
			mapped.resolvedGpcDetection?.let { detected = it }
			emitted = mapped.error
			detectedGpc = detected

			// A failed init while a definitive policy is already in force is a
			// connectivity event, not a policy change. Re-latching the pending flag
			// there would drop a device that merely lost signal back to deny-all,
			// which is the opposite of the contract's cached-snapshot rule. The flag
			// therefore only ever clears, and the resolution the current permissions
			// were computed from stays in place while error records the attempt.
			//
			// Rule 5 is the exception, and only there. When the resolution itself is
			// unreadable the core cannot represent the answer any more, so the flag
			// goes back up even though it had come down, and the evaluator's pending
			// branch denies every optional category including one it had granted. That
			// lands on PENDING rather than DENIED deliberately: DENIED reads as the
			// subject's own refusal and invites a host to stop listening, which would
			// make the category unrecoverable when the next resolution parses.
			val superseded = mapped.policyPending && !base.policyPending
			published = PolicyEvaluator.evaluate(
				snapshot = base.copy(
					// The latch lands on the snapshot's own field, which is the copy the bridge
					// reads, so the list behind a JavaScript disclosure is the list a host's own
					// Kotlin reads off [vendorList].
					iab = latchedVendorList?.let(::KernelIabState),
					resolution = if (superseded) base.resolution else mapped.resolution,
					policyPending = mapped.policyPending &&
						(base.policyPending || mapped.policyUnreadable),
					// A failed init leaves the local state unready: nothing resolved, so
					// gates keep denying. Only a definitive answer makes it ready.
					ready = if (mapped.policyPending) base.ready else true,
					subject = subject,
					location = mapped.location ?: base.location,
					// The overrides the decision was actually made against, which is
					// what the backend recomputes before it accepts a save.
					// `mapResolvedOverrides` and the merge in `@c15t/core` fold the served
					// location and translation language over the app's own overrides, so a
					// device that pinned nothing still reports the country and region it
					// was matched on. `gpc` survives from the app because `/init` serves a
					// detection, not an override.
					overrides = resolvedOverrides(base.overrides, mapped),
					privacySignals = signalsFor(resolvedOverrides(base.overrides, mapped), detected),
					policySnapshotToken = mapped.policySnapshotToken ?: base.policySnapshotToken,
					translations = mapped.translations ?: base.translations,
					error = mapped.error,
					revision = base.revision + 1,
					consentCategories = decidedCategories(evaluationPolicy),
				),
				policy = evaluationPolicy,
				noticeDismissal = noticeDismissal,
				now = clock.nowMillis(),
				choiceScope = choiceScopeOf(evaluationPolicy),
			)
			published = validateIab(published)
			if (!online && !mapped.policyUnreadable && evaluationPolicy?.model == ConsentModel.IAB &&
				base.iab?.gvl != null && listIsUsable() &&
				published.copy(revision = base.revision, evaluatedAt = base.evaluatedAt,
					error = base.error, nextDeadline = base.nextDeadline) == base
			) return@mutate false to emitted
			installSnapshot(published)
		}

		// A resolved subject belongs in protected storage as soon as it is known.
		published.subject?.let { store.writeSubject(it) }
		persist()
		mutation.release()
		true to emitted
	}

	/**
	 * Send one queued body once, unless the queue no longer holds it.
	 *
	 * `null` says the body was not this sender's to send. Both senders hold [passInFlight] when
	 * they reach here, so the only way an entry is already gone is that the pass or send which
	 * held the guard before this one landed it -- after the read that brought this sender here.
	 * Sending anyway is the second POST the contract names, so the queue gets asked last, and an
	 * entry that is not owed spends no attempt and announces nothing.
	 */
	private fun deliverIfOwed(entry: QueuedSave): Delivery? {
		if (entry.isWithdrawal()) {
			if (!queue.isPending(entry.id)) return null
			return deliver(entry)
		}
		if (entry.payload.subjectId != state.get().subject?.id) return null
		val requiresIab =
			synchronized(mutationLock) {
				iabConfiguration != null && evaluationPolicy?.model == ConsentModel.IAB
			}
		if (
			entry.payload.tcString != null || entry.payload.model == ConsentModel.IAB || requiresIab
		) {
			val saved = iabConsent ?: return null
			val body =
				entry.body?.let {
					runCatching { Json.parseToJsonElement(it).jsonObject }.getOrNull()
				} ?: return null
			fun value(key: String) = body[key] as? JsonPrimitive
			if (
				entry.payload.tcString != saved.tcString ||
					value("tcString")?.contentOrNull != saved.tcString ||
					value("subjectId")?.contentOrNull != saved.subjectId ||
					value("externalSubjectId")?.contentOrNull != saved.externalId ||
					value("givenAt")?.longOrNull != saved.actionAt ||
					value("model")?.contentOrNull != "iab" ||
					value("addtlConsent")?.contentOrNull != saved.addtlConsent
			)
				return null
		}
		if (!queue.isPending(entry.id)) {
			return null
		}
		return deliver(entry)
	}

	/**
	 * Send one queued body once, and settle what the answer means for the queue.
	 *
	 * A delivered answer is a claim about storage rather than about the network: the entry is
	 * gone from disk, which is the only thing that lets a caller stop owing this body.
	 */
	private fun deliver(entry: QueuedSave): Delivery {
		return when (val outcome = transport.save(entry)) {
			is SaveOutcome.Delivered -> {
				if (queue.complete(entry.id)) {
					Delivery.Reached
				} else {
					// Accepted, and still on disk. Keep the obligation: the next replay sends
					// the same frozen bytes and the backend dedupes on the receipts inside
					// them, which beats forgetting a decision recorded nowhere else.
					val error = KernelError(
						code = "queue-write-failed",
						message = "c15t: the backend accepted a queued consent save but the queue " +
							"could not release it, so the same bytes will be sent again",
					)
					emitError(error)
					Delivery.Refused(FailedAttempt.Retrying, error)
				}
			}

			is SaveOutcome.Unavailable -> {
				// Nothing about the body was refused, so nothing here is permanent. The entry
				// keeps its place with one attempt spent, and the fact that an obligation
				// currently has no reachable sender gets said out loud rather than left
				// invisible -- `CommitResult` cannot see it from here.
				val error = announceFailedAttempt(entry, outcome, "transport-unavailable")
				Delivery.Unreachable(error)
			}

			else -> {
				val permanent = outcome.isPermanentlyRejected && !entry.isWithdrawal()
				val error = if (permanent) {
					// The producer refused these bytes on their own terms, and frozen bytes
					// earn the same answer every time, so the entry leaves and the reason is
					// named rather than occupying a slot until it expires.
					queue.complete(entry.id)
					refusedSave(entry, outcome).also(::emitError)
				} else {
					// A status the producer answered with, and not a permanent one: the entry
					// is still owed, so the announcement is about this attempt.
					announceFailedAttempt(entry, outcome, "http-status")
				}
				Delivery.Refused(
					attempt = if (permanent) FailedAttempt.AlreadyGone else FailedAttempt.Retrying,
					error = error,
				)
			}
		}
	}

	/**
	 * Spend one attempt on a send that did not land, and announce the result.
	 *
	 * Every failed send spends an attempt, including the very first send of the save that
	 * queued the body. Without that, the attempt ceiling is reachable only by replays, so a
	 * body the transport refuses on the first try sits in the queue across every launch,
	 * replaying bytes nobody will accept.
	 *
	 * @param notice the code to announce while the entry is still owed. A release is always
	 * announced as `save-undeliverable` instead, because at that point the caller's question
	 * is no longer "why did this try fail" but "why is this no longer being tried".
	 * @returns the error that was announced, so a caller that also reports per pass does not
	 * have to invent a second, different sentence for the same failure.
	 */
	private fun announceFailedAttempt(
		entry: QueuedSave,
		outcome: SaveOutcome,
		notice: String,
	): KernelError {
		val attempt = queue.recordFailedAttempt(entry.id, clock.nowMillis())
		val error = if (attempt.dropsEntry) {
			undeliverableSave(entry, outcome, attempt)
		} else {
			KernelError(
				code = notice,
				message = "c15t: a queued consent save did not reach the backend ($outcome), so " +
					"it stays queued for a later attempt",
			)
		}
		emitError(error)
		return error
	}

	/** The announcement for a body the producer refused on terms the body itself causes. */
	private fun refusedSave(
		entry: QueuedSave,
		outcome: SaveOutcome,
	): KernelError {
		val why = when (outcome) {
			is SaveOutcome.Rejected -> "HTTP ${outcome.status}"
			is SaveOutcome.UnsupportedContract ->
				"policy contract ${outcome.declared ?: "unreadable"} against this build's " +
					"${outcome.expected}"

			else -> outcome.toString()
		}
		return KernelError(
			code = "save-rejected",
			message = "c15t: the backend refused a queued consent save for " +
				"${entry.payload.subjectId} ($why), so it was dropped and will not be retried",
		)
	}

	/**
	 * The announcement for an obligation the queue released with its body never accepted.
	 *
	 * Both roads reach it: a save whose very first send spent the last attempt, and a replay
	 * that ran a body out. One message builder keeps the two from drifting apart, because
	 * after this point nothing on the device remembers that the decision owed anyone
	 * anything, and a host that is not told has no way to learn it.
	 */
	private fun undeliverableSave(
		entry: QueuedSave,
		outcome: SaveOutcome,
		attempt: FailedAttempt,
	): KernelError {
		val reason = when (attempt) {
			is FailedAttempt.DroppedAfterAttempts ->
				"it was refused ${attempt.attempts} times, which is the ceiling of " +
					"${PendingSaveQueue.MAX_ATTEMPTS} attempts"

			is FailedAttempt.DroppedAsTooOld ->
				"it waited longer than the queue's ${PendingSaveQueue.MAX_AGE_MS / 86_400_000L} " +
					"day retention window"

			FailedAttempt.Retrying,
				FailedAttempt.AlreadyGone -> "it left the queue unaccepted"
		}
		return KernelError(
			code = "save-undeliverable",
			message = "c15t: a queued consent save for ${entry.payload.subjectId} was dropped " +
				"because $reason. Last backend answer: $outcome",
		)
	}

	private fun validateIab(snapshot: ConsentSnapshot): ConsentSnapshot {
		if (evaluationPolicy?.model != com.c15t.core.model.ConsentModel.IAB && committedIab == null)
			return snapshot
		val saved = committedIab
		val c = iabConfiguration
		val gvl = snapshot.iab?.gvl
		val valid =
			if (
				saved != null &&
					saved.isCurrent(clock.nowMillis(), evaluationPolicy?.choiceMs ?: 0) &&
					evaluationPolicy?.model == ConsentModel.IAB &&
					c != null &&
					gvl != null &&
					saved.configuration == c &&
					saved.subjectId == snapshot.subject?.id &&
					saved.externalId == snapshot.subject?.externalId &&
					saved.fingerprint == evaluationPolicy?.choiceFingerprint &&
					saved.vendorListVersion.toLong() == gvl.vendorListVersion &&
					saved.policyVersion.toLong() == gvl.tcfPolicyVersion &&
					saved.disclosureID == IabAuthority.disclosureID(gvl)
			) {
				try {
					val rebuilt =
						IabAuthority.build(
							c,
							saved.choices,
							gvl,
							saved.subjectId,
							saved.externalId,
							saved.fingerprint,
							saved.actionAt,
							saved,
							currentAdditionalConsentList(),
						)
					rebuilt.tcString == saved.tcString && rebuilt.choices == saved.choices &&
						rebuilt.addtlConsent == saved.addtlConsent && rebuilt.adTechProvidersID == saved.adTechProvidersID
				} catch (_: IllegalArgumentException) {
					false
				}
			} else false
		// List age suspends a compatible choice; a matching refresh can resume it.
		if (valid) return snapshot.copy(
			model = ConsentModel.IAB,
			effectivePermissions = if (listIsUsable()) snapshot.effectivePermissions else ConsentState.DENY_ALL,
		)
		committedIab = null
		needsGrantCleanup = true
		return PolicyEvaluator.evaluate(
				snapshot.copy(explicitChoice = null),
				evaluationPolicy,
				noticeDismissal,
				clock.nowMillis(),
				choiceScopeOf(evaluationPolicy),
			)
			.let { evaluated ->
				val it = if (evaluationPolicy?.model == ConsentModel.IAB) evaluated.copy(effectivePermissions = ConsentState.DENY_ALL) else evaluated
				if (
					iabConfiguration != null &&
						evaluationPolicy?.model == ConsentModel.IAB &&
						!it.policyPending
				)
					it.copy(model = ConsentModel.IAB)
				else it
			}
	}

	private fun transitionIab(externalId: String?, reset: Boolean): Boolean? {
		val owed = reset && queue.pending().any { it.isWithdrawal() }
		val prepared = synchronized(mutationLock) {
			if (committedIab == null && evaluationPolicy?.model != ConsentModel.IAB && !owed)
				return@synchronized null
			val current = state.get()
			if (!reset && current.subject?.externalId == externalId) return@synchronized null
			val subject = current.subject?.copy(externalId = externalId)
			val evaluated =
				if (reset)
					ConsentSnapshot.denyAll(subject!!, clock.nowMillis())
						.copy(
							revision = current.revision + 1,
							overrides = configuredOverrides,
							consentCategories = decidedCategories(null),
						)
				else
					PolicyEvaluator.evaluate(
						current.copy(
							subject = subject,
							explicitChoice = null,
							revision = current.revision + 1,
						),
						evaluationPolicy,
						null,
						clock.nowMillis(),
						choiceScopeOf(evaluationPolicy),
					)
			val next = if (evaluationPolicy?.model == ConsentModel.IAB)
				evaluated.copy(effectivePermissions = ConsentState.DENY_ALL) else evaluated
			val envelope =
				SnapshotEnvelope(bundledPolicyAuthority = bundledPolicyAuthority,
					snapshot = next.copy(iab = null),
					evaluationPolicy = if (reset) null else evaluationPolicy,
					gvl = if (reset) null else next.iab?.gvl,
					lastIabActionAt = lastIabActionAt,
					iabListFetchedAt = if (reset) null else iabListFetchedAt,
					additionalConsentList = if (reset) null else additionalConsentList,
				)
			envelope to next
		} ?: return null
		if (!store.replace(prepared.first)) return false
		synchronized(mutationLock) {
			committedIab = null
			noticeDismissal = null
			if (reset) {
				additionalConsentList = null
				evaluationPolicy = null
				iabListFetchedAt = null
				iabListFromCache = true
				iabListOffline = false
			}
			storedSnapshotFound = true
			installSnapshot(prepared.second)
		}
		return true
	}


	private fun buildSavePayload(
		published: ConsentSnapshot,
		policy: EvaluationPolicy?,
		action: ConsentAction,
		confirmed: Map<String, Boolean>,
		actionAt: Long,
		surfaceAtAction: ActiveUI?,
	): SavePayload {
	val subject = published.subject ?: resolveSubject()
	// Derived rather than read off the snapshot, so the claim a write makes about
	// its own decision inputs is the same value the evaluator honored.
	val gpc = GpcSignal.derive(
		override = published.overrides.gpc,
		detected = detectedGpc == true,
	).active
		return SavePayload(
			subjectId = subject.id,
			subject = subject,
			choice = published.explicitChoice,
			confirmed = ConfirmedCoverage(categories = confirmed, actionAt = actionAt),
			consents = published.effectivePermissions,
			overrides = published.overrides,
			// The mobile snapshot carries identity on the subject, so the user
			// object is reconstructed from it rather than held separately.
			user = published.subject?.externalId?.let { KernelUser(externalId = it) },
			model = published.model,
			uiSource = surfaceAtAction,
			consentAction = action,
			policySnapshotToken = published.policySnapshotToken,
			decisionInputs = DecisionInputs(
				policyId = published.resolution.policyId,
				fingerprint = published.resolution.fingerprint ?: policy?.policyFingerprint,
				country = published.overrides.country ?: published.location?.country,
				region = published.overrides.region ?: published.location?.region,
				language = published.overrides.language ?: published.location?.language ?: "",
				gpc = gpc,
			),
			givenAt = actionAt,
		)
	}

	/**
	 * The categories the consent surfaces list right now.
	 *
	 * The same derivation the web dialog uses (`getDisplayedConsents` in
	 * `use-manager.ts`): `necessary` first, then the choice scope, which is the
	 * policy scope narrowed by the host's own declaration. A host that declares
	 * nothing is asked about the whole scope of a strict rule and about none of a
	 * permissive one, where it is offered `necessary` alone; a name the host declares
	 * that the resolved policy does not govern is dropped, because a row the
	 * evaluator will not honour is a row that cannot be honoured. Before any policy
	 * resolves the evaluator runs the safe fallback rule, which is strict, over every
	 * optional category, so the scope behind the list is the full optional set --
	 * the same rows the web shows while it waits for init.
	 *
	 * The list is `necessary` plus the optional names in canonical (sorted) order;
	 * the JavaScript layer restyles that into display order, and both native cores
	 * emit this exact shape so the protocol fixtures can pin them together.
	 */
	private fun decidedCategories(policy: EvaluationPolicy?): List<String> {
		val scope = (choiceScopeOf(policy) ?: fallbackChoiceScope()).toSet()
		return buildList {
			add(ConsentCategory.NECESSARY.wireName)
			addAll(ConsentCategory.OPTIONAL.filter { it in scope }.map { it.wireName })
		}
	}

	/** The categories the choice prompt asks about under [policy], or `null` with none. */
	private fun choiceScopeOf(policy: EvaluationPolicy?): List<ConsentCategory>? =
		policy?.choiceScope(config.consentCategories)

	/**
	 * The choice scope before any policy resolves: the safe fallback rule is strict
	 * and governs every optional category, so the declaration narrows that.
	 */
	private fun fallbackChoiceScope(): List<ConsentCategory> {
		val declared = config.consentCategories?.takeIf { it.isNotEmpty() }
		return ConsentCategory.OPTIONAL.filter { declared == null || it in declared }
	}

	/**
	 * The acknowledgement a save records when the choice prompt has no category to
	 * decide, or `null` when it has one.
	 *
	 * `choiceAcknowledgement` in `packages/core/src/kernel/commands.ts`. It is a notice
	 * dismissal bound to the choice fingerprint, so the envelope carries it the way it
	 * carries a notice dismissal, and the evaluator never mistakes it for one. A stored
	 * acknowledgement at least as new is kept. Called with [mutationLock] held, because
	 * it reads [noticeDismissal].
	 */
	private fun choiceAcknowledgement(
		policy: EvaluationPolicy?,
		choiceScope: List<ConsentCategory>,
		actionAt: Long,
	): NoticeDismissal? {
		if (policy == null || policy.prompt != PolicyPrompt.CHOICE || choiceScope.isNotEmpty()) {
			return null
		}
		val current = noticeDismissal
		if (current != null && current.fingerprint == policy.choiceFingerprint && current.dismissedAt >= actionAt) {
			return current
		}
		return NoticeDismissal(dismissedAt = actionAt, fingerprint = policy.choiceFingerprint)
	}

	/** The receipts from before this action that the current policy still honours. */
	private fun stillValid(
		choice: ExplicitChoice?,
		policy: EvaluationPolicy?,
		now: Long,
	): Map<String, Boolean> {
		if (choice == null || policy == null) {
			return emptyMap()
		}
		if (!choice.matchesFingerprint(policy.choiceFingerprint)) {
			return emptyMap()
		}
		return if (now - choice.actionAt <= policy.choiceMs) choice.consents else emptyMap()
	}

	private fun publishPure(snapshot: ConsentSnapshot) {
		installSnapshot(snapshot)
	}

	/** Cache time-dependent read answers when state changes, never on a hot read. */
	private fun installSnapshot(candidate: ConsentSnapshot): Unit = synchronized(mutationLock) {
		deadlineTask?.cancel(false)
		deadlineTask = null
		val generation = ++deadlineGeneration
		val now = clock.nowMillis()
		val requiresIab = evaluationPolicy?.model == ConsentModel.IAB
		val iabDeadline = if (requiresIab) listOfNotNull(
			iabListFetchedAt?.let { saturatingAdd(it, config.iabListMaxAgeMs) },
			additionalConsentList?.takeIf { it.providers.isNotEmpty() }?.let { saturatingAdd(it.fetchedAt, config.iabListMaxAgeMs) },
			committedIab?.let { saturatingAdd(it.actionAt, evaluationPolicy?.choiceMs ?: 0) },
		).filter { it > now }.minOrNull() else null
		val deadline = listOfNotNull(candidate.nextDeadline?.takeIf { it > now }, iabDeadline, bundledPolicyAuthority?.expiresAt?.takeIf { it > now }).minOrNull()
		var snapshot = if (deadline == candidate.nextDeadline) candidate else candidate.copy(nextDeadline = deadline)
		if (bundledPolicyAuthority?.isCurrent(config.backendUrl, now) == false) snapshot = snapshot.copy(effectivePermissions = ConsentState.DENY_ALL, policyPending = true, activeUI = ActiveUI.NONE)
		if (bundledPolicyAuthority != null) {
			var permissions = snapshot.effectivePermissions
			for (category in ConsentCategory.OPTIONAL) if (snapshot.explicitChoice?.consents?.get(category.wireName) != true) permissions = permissions.with(category, false)
			snapshot = snapshot.copy(effectivePermissions = permissions)
		}
		val denied = if (bundledPolicyAuthority == null && !requiresIab || snapshot.effectivePermissions == ConsentState.DENY_ALL)
			snapshot else snapshot.copy(effectivePermissions = ConsentState.DENY_ALL)
		val expired = if (bundledPolicyAuthority == null) snapshot else snapshot.copy(
			effectivePermissions = ConsentState.DENY_ALL, policyPending = true, activeUI = ActiveUI.NONE,
			error = KernelError("bundled-policy-expired", "Connect to refresh consent policy."))
		state.set(snapshot)
		readView.set(ReadView(snapshot, bundledPolicyAuthority, denied, requiresIab, committedIab, iabListFetchedAt,
			additionalConsentList?.fetchedAt, evaluationPolicy?.choiceMs ?: 0, expired))
		if ((requiresIab || bundledPolicyAuthority != null) && now >= 0 && deadline != null) {
			val reference = WeakReference(this)
			deadlineTask = deadlineScheduler.schedule(
				{ reference.get()?.expireIabDeadline(generation, deadline) },
				deadline - now,
				TimeUnit.MILLISECONDS,
			)
		}
	}

	private fun expireIabDeadline(generation: Long, deadline: Long): Unit = mutate { mutation ->
		synchronized(mutationLock) {
			if (generation != deadlineGeneration) return@synchronized null
			val expected = state.get()
			val now = clock.nowMillis()
			if (now < deadline) {
				installSnapshot(expected)
				return@synchronized null
			}
			val evaluated = PolicyEvaluator.evaluate(
				expected.copy(revision = expected.revision + 1), evaluationPolicy, noticeDismissal,
				now, choiceScopeOf(evaluationPolicy),
			)
			validateIab(evaluated).also(::installSnapshot)
		} ?: return@mutate
		persist()
		mutation.release()
		notifySnapshot()
	}

	private fun saturatingAdd(left: Long, right: Long): Long =
		if (left > Long.MAX_VALUE - right) Long.MAX_VALUE else left + right

	/** Persist the published state. Always called with [mutationLock] released. */
	private fun persist(): Boolean {
		val cleanup = synchronized(mutationLock) {
			needsGrantCleanup.also { needsGrantCleanup = false }
		}
		if (cleanup) queue.discardGrants()
		val envelope = synchronized(mutationLock) {
				val snapshot = state.get()
				SnapshotEnvelope(bundledPolicyAuthority = bundledPolicyAuthority,
				// One copy of the document per write. The envelope's `gvl` key is where the list is
				// durable -- it is that key a build from before this field existed read, and
				// [bootstrap] reads it back onto the snapshot -- so the stored snapshot goes with
				// `iab` nulled instead of carrying the largest thing either object holds a second
				// time, on a write that happens for every committed mutation.
				snapshot = snapshot.copy(iab = null),
				evaluationPolicy = evaluationPolicy,
				noticeDismissal = noticeDismissal,
				gvl = snapshot.iab?.gvl,
					iabConsent = committedIab,
					additionalConsentList = additionalConsentList,
					iabListFetchedAt = iabListFetchedAt,
					lastIabActionAt = lastIabActionAt,
				)
		}
		val written = store.writeEnvelope(envelope, publishBus = false)
		store.flush()
		publishCurrentTcStorageBus(allowConsent = written)
		return written
	}

	private fun merge(
		base: KernelOverrides,
		patch: KernelOverrides?,
	): KernelOverrides {
		if (patch == null) {
			return base
		}
		return KernelOverrides(
			country = patch.country ?: base.country,
			region = patch.region ?: base.region,
			language = patch.language ?: base.language,
			gpc = patch.gpc ?: base.gpc,
		)
	}

	/**
	 * The overrides in force after an init, following `mapResolvedOverrides` and the
	 * merge in `@c15t/core`: the served location and translation language win over
	 * what the app pinned, and `gpc` is the app's own because `/init` serves a
	 * detection rather than an override.
	 */
	private fun resolvedOverrides(base: KernelOverrides,
		mapped: MappedInit): KernelOverrides = KernelOverrides(
		country = mapped.resolvedOverrides?.country
			?: mapped.location?.country
			?: base.country,
		region = mapped.resolvedOverrides?.region
			?: mapped.location?.region
			?: base.region,
		language = mapped.resolvedOverrides?.language
			?: mapped.translationsLanguage
			?: base.language,
		gpc = mapped.resolvedOverrides?.gpc ?: base.gpc,
	)

	/**
	 * The signal view the snapshot carries, derived rather than stored. The app's
	 * override outranks the device, which is what makes it an override.
	 */
	private fun signalsFor(
		overrides: KernelOverrides,
		detected: Boolean? = detectedGpc,
	): PrivacySignals = PrivacySignals(
		gpc = GpcSignal.derive(override = overrides.gpc, detected = detected == true)
		)

	private fun notifySnapshot() {
		val snapshot = snapshot()
		for (reference in snapshotObservers) {
			reference.get()?.invoke(snapshot) ?: snapshotObservers.remove(reference)
		}
		for (observer in strongObservers) {
			observer.invoke(snapshot)
		}
	}

	private fun emitError(error: KernelError) {
		mutationErrors.get()?.let {
			it.add(error)
			return
		}
		logger(error)
		for (reference in errorObservers) {
			reference.get()?.invoke(error) ?: errorObservers.remove(reference)
		}
	}

	private companion object {
		val deadlineScheduler = ScheduledThreadPoolExecutor(1) { runnable ->
			Thread(runnable, "c15t-deadline").apply { isDaemon = true }
		}.apply { removeOnCancelPolicy = true }

		/**
		 * Where init and delivery run for a host that brings no executor of its own.
		 *
		 * One thread, so the work handed to it cannot overlap. Useful, and not what keeps a
		 * delivery pass exclusive. [flushPending] is a public synchronous method that the shipped
		 * wiring calls from the main thread on a reachability change, from the lifecycle
		 * observer's worker, and from the React Native module's thread, while [save] hands its
		 * first send to this pool with any of those already running, so a second pass can always
		 * arrive on a thread this pool never sees. `native/CONTRACT.md` allows one pass per core
		 * in flight, and [requestDeliveryPass] is what holds it: the guard is the guarantee, not
		 * the thread count. Deliberately, because a host may hand this core a [TaskExecutor] with
		 * two threads in it, and consent delivery must not begin resending bodies the moment
		 * someone swaps this pool for a busier one.
		 */
		val backgroundPool = Executors.newSingleThreadExecutor { runnable ->
			Thread(runnable, "c15t-core").apply { isDaemon = true }
		}
	}
}
