package com.inth.consentui.headless

import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.inth.consentui.generated.ConsentCopy
import com.inth.consentui.generated.IabCopy
import com.inth.core.CommitIntent
import com.inth.core.ConsentCore
import com.inth.core.iab.IabChoices
import com.inth.core.iab.IabListAvailability
import com.inth.core.iab.IabPresentation
import com.inth.core.model.ConsentCategory
import com.inth.core.model.ConsentModel
import com.inth.core.model.ConsentSnapshot
import com.inth.core.policy.OptOutLock
import com.inth.core.policy.OptOutVia
import com.inth.core.policy.PolicyEvaluator
import com.inth.core.policy.ResolvedOptOutState
import com.inth.core.policy.resolveCategoryOptOutLock
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.asExecutor
import kotlinx.coroutines.launch
import kotlinx.coroutines.async
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull

/** What a consent control asks the core to record. */
enum class ConsentWriteAction {
    /** Grant everything the policy offers. */
    ACCEPT_ALL,
    /** Deny everything optional, and withdraw every IAB consent. */
    REJECT_ALL,
    /** Record the draft as it stands. */
    SAVE,
    /** Acknowledge a notice. Records no optional grant. */
    ACKNOWLEDGE,
}

/**
 * One category of the resolved policy, ready to place in a row.
 *
 * @property locked The person cannot change it: `necessary`, or a category a restriction such
 *   as Global Privacy Control holds off.
 * @property lockedLabel The state to show in place of a switch when [locked].
 * @property note Why a locked optional category is off, or why the deciding category is held by
 *   the visitor's account.
 * @property enabled Whether the switch takes input now. `false` while a save runs, while the
 *   draft is stale, and while an IAB vendor list cannot be edited.
 * @property optOutLock Opt-out or privacy signal lock reason for this row, if any.
 */
@Stable
class ConsentCategoryRow internal constructor(
    val category: ConsentCategory,
    val title: String,
    val description: String,
    val locked: Boolean,
    val lockedLabel: String?,
    val note: String?,
    val checked: Boolean,
    val enabled: Boolean,
    val onCheckedChange: (Boolean) -> Unit,
    val optOutLock: OptOutLock? = null,
)

/**
 * A consent draft for an app-owned screen: the staged category and IAB choices, the save with
 * its revision check, and the copy to show. It draws nothing.
 *
 * Edits stay in the draft until [save]. A save names the snapshot revision the draft was read
 * at, so the core refuses it when another screen recorded a decision meanwhile. The draft then
 * turns [isStale] and takes no more edits or saves until [reset]. A storage failure keeps the
 * edits and sets [errorMessage]; [retry] sends the same action again.
 *
 * While the draft has no edits and shows no error it follows the saved record.
 *
 * Use it from the main thread. `rememberConsentDraft` makes one for a composition; construct
 * it with a `viewModelScope` to keep unsaved edits across rotation, and call [close] when that
 * owner ends.
 *
 * @param core The installed core.
 * @param scope Where saves run. Its dispatcher must be the main thread's.
 * @param io Where the durable write runs.
 */
@Stable
class ConsentDraft internal constructor(
    val core: ConsentCore,
    private val scope: CoroutineScope,
    private val io: CoroutineDispatcher,
    load: Boolean,
) {
    constructor(core: ConsentCore, scope: CoroutineScope, io: CoroutineDispatcher = Dispatchers.IO) : this(core, scope, io, true)

    /** The snapshot the draft last read. */
    var snapshot by mutableStateOf(core.snapshot()); internal set
    /** Opt-out display state derived from [snapshot] and the active policy. */
    var optOutState by mutableStateOf(core.optOutState()); private set
    /** A save is running. Disable your controls and do not close the screen. */
    var isSaving by mutableStateOf(false); private set
    /** The action being saved while [isSaving], so only its control shows progress. */
    var savingAction by mutableStateOf<ConsentWriteAction?>(null); private set
    /** `true` once a save has run long enough to deserve a progress indicator. */
    var showProgress by mutableStateOf(false); private set
    /** The core's code for the last refused save, such as `concurrent-change`. */
    var errorCode by mutableStateOf<String?>(null); private set
    /** The action behind [errorCode]. */
    var failedAction by mutableStateOf<ConsentWriteAction?>(null); private set
    /** Another surface recorded a decision under this draft. Call [reset] and let the person review again. */
    var isStale by mutableStateOf(false); private set
    /** The staged value of each optional category in scope. */
    var categoryChoices by mutableStateOf<Map<ConsentCategory, Boolean>>(emptyMap()); private set
    /** The staged IAB selection. Empty outside an IAB policy. */
    var choices by mutableStateOf(IabChoices()); private set
    /** The core's IAB disclosure, read with the draft. `null` outside an IAB policy or before a list loads. */
    var disclosure by mutableStateOf<IabPresentation?>(null); private set
    /** The last message a screen reader should hear. [announcementSequence] moves with each one. */
    var announcement by mutableStateOf(""); private set
    var announcementSequence by mutableIntStateOf(0); private set
    /** An opt-out or an opt-back-in from [optOut] or [optIn] is running. Disable the controls that start one. */
    var isChangingOptOut by mutableStateOf(false); private set

    private var baseRevision = 0L
    private var seedCategories: Map<ConsentCategory, Boolean> = emptyMap()
    private var seedChoices = IabChoices()
    private var lastAction: ConsentWriteAction? = null
    private var reloadAfterRefresh = false

    /** Whether a clean draft reloads for a new snapshot. The stock presenter narrows it to an open session. */
    internal var follows: (wasPolicyPending: Boolean, next: ConsentSnapshot) -> Boolean = { _, _ -> errorCode == null }
    /** Called after each snapshot is applied. */
    internal var onReceived: (() -> Unit)? = null
    /**
     * Who speaks a save result. Each mounted block registers one, and only the newest is called,
     * so a message is spoken once however many blocks share the draft and never again later.
     */
    internal val announcers = mutableListOf<(String) -> Unit>()
    /** How many preferences blocks are open on this draft. The prompt leaves hardware Back to them. */
    internal var openPreferences by mutableIntStateOf(0)

    // The handle owns the lambda; close() lets the core go of this draft.
    private val observer: (ConsentSnapshot) -> Unit = { next -> scope.launch { receive(next) } }
    private val subscription = core.onChange(observer)

    // The stock presenter reads the disclosure when a session opens, not at launch.
    init { if (load) reset() }

    /** Stop following the core. Call it when the owner of a draft you constructed ends. */
    fun close() = subscription.close()

    /** Whether the resolved policy is IAB TCF. */
    val isIab: Boolean get() = snapshot.model == ConsentModel.IAB
    /** The core has a resolved policy. Until then show a loading state, not controls. */
    val isReady: Boolean get() = snapshot.ready && !snapshot.policyPending
    /** Whether the draft differs from what it was read as. */
    val isDirty: Boolean get() = categoryChoices != seedCategories || choices != seedChoices
    /**
     * The IAB vendor list or a required Additional Consent list cannot back a new decision now:
     * stale, missing or offline. Show the saved decision, call [refresh] and offer controls again
     * once this turns `false`.
     */
    val listUnavailable: Boolean get() = isIab && (disclosure?.canEdit != true ||
        core.iabStatus().availability in setOf(IabListAvailability.STALE, IabListAvailability.MISSING, IabListAvailability.UNAVAILABLE) ||
        disclosure?.adTechProviders?.isNotEmpty() == true && core.additionalConsentStatus() == IabListAvailability.STALE)
    /** Whether a control takes input now. */
    val isEditable: Boolean get() = !isSaving && !isStale && !listUnavailable

    /**
     * The language every label is shown in. IAB mode follows the served list, English until it
     * loads; category mode follows the policy's translation language.
     */
    val language: String get() =
        if (isIab) disclosure?.language ?: "en" else snapshot.overrides.language ?: snapshot.location?.language ?: "en"
    /** Category-mode copy in [language]. */
    val copy: ConsentCopy get() = ConsentCopy.forLanguage(language)
    /** IAB copy in [language]. */
    val iabCopy: IabCopy get() = IabCopy.forLanguage(language)

    /** The categories the resolved policy puts in scope, `necessary` first. */
    val displayedCategories: List<ConsentCategory> get() =
        snapshot.consentCategories?.mapNotNull(ConsentCategory::fromWireName) ?: listOf(ConsentCategory.NECESSARY)

    /** One row per displayed category, with its copy, lock and switch binding. */
    val categories: List<ConsentCategoryRow> get() = displayedCategories.map(::category)

    /** Honored opt-out status line for preferences, or `null` when no opt-out is held. */
    val optOutStatus: String? get() {
        if (!optOutState.honored) return null
        val text = resolveOptOutCopy(snapshot)
        return if (optOutState.via == OptOutVia.SIGNAL) text.statusSignal else text.statusRequest
    }

    /** Opt-out and Privacy Choices copy in the served language, for an app-owned opt-out screen. */
    val optOutCopy: OptOutCopy get() = resolveOptOutCopy(snapshot)

    /** The held opt-out as a receipt, or `null` when none is held. [variant] names the title a heading falls back to. */
    fun optOutReceipt(variant: OptOutLinkVariant = OptOutLinkVariant.DO_NOT_SELL): OptOutReceipt? =
        resolveOptOutReceipt(snapshot, optOutState, variant)

    /** The Privacy Choices link for the current snapshot with the [variant] title, or `null` when it shows nothing. */
    fun privacyChoicesLink(variant: OptOutLinkVariant = OptOutLinkVariant.DO_NOT_SELL): PrivacyChoicesLinkState? =
        resolvePrivacyChoicesLink(snapshot, optOutState, variant)

    /** Why [category] is locked or annotated for an opt-out or privacy signal, or `null`. */
    fun categoryOptOutLock(category: ConsentCategory): OptOutLock? =
        resolveCategoryOptOutLock(snapshot, optOutState, category)

    /** The row for one category. */
    fun category(category: ConsentCategory): ConsentCategoryRow {
        val text = copy
        val (title, description) = when (category) {
            ConsentCategory.NECESSARY -> text.necessaryTitle to text.necessaryDescription
            ConsentCategory.FUNCTIONALITY -> text.functionalityTitle to text.functionalityDescription
            ConsentCategory.EXPERIENCE -> text.experienceTitle to text.experienceDescription
            ConsentCategory.MEASUREMENT -> text.measurementTitle to text.measurementDescription
            ConsentCategory.MARKETING -> text.marketingTitle to text.marketingDescription
        }
        val optOutLock = categoryOptOutLock(category)
        val gpcLocked = optOutLock == OptOutLock.GPC_ACTIVE
        val strictScope = PolicyEvaluator.RESTRICTION_STRICT_SCOPE in snapshot.restrictions[category.wireName].orEmpty()
        val locked = !category.optional || gpcLocked || strictScope
        val optOutText = resolveOptOutCopy(snapshot)
        val note = when {
            !category.optional -> null
            gpcLocked -> optOutText.lockedByGpc
            strictScope -> text.notOffered
            optOutLock == OptOutLock.HELD_BY_ACCOUNT -> optOutText.lockedByAccount
            else -> null
        }
        return ConsentCategoryRow(
            category, title, description, locked,
            lockedLabel = if (!locked) null else if (category.optional) iabCopy.appOff else iabCopy.appAlwaysOn,
            note = note,
            checked = if (category.optional) categoryChoices[category] == true else true,
            enabled = !locked && isEditable,
            onCheckedChange = { setCategory(category, it) },
            optOutLock = optOutLock,
        )
    }

    /** A restriction such as Global Privacy Control or a strict scope holds this category off. */
    fun isRestricted(category: ConsentCategory): Boolean =
        categoryOptOutLock(category) == OptOutLock.GPC_ACTIVE ||
            PolicyEvaluator.RESTRICTION_STRICT_SCOPE in snapshot.restrictions[category.wireName].orEmpty()

    /** Stage one optional category. Ignored for `necessary`, while saving, while stale, and for a restricted category. */
    fun setCategory(category: ConsentCategory, enabled: Boolean) {
        // `necessary` is not a choice: staging it would write it into the record.
        if (category.optional && !isSaving && !isStale && !isRestricted(category)) categoryChoices = categoryChoices + (category to enabled)
    }

    /** Stage a change to the IAB selection. Ignored while saving or stale. */
    fun edit(transform: (IabChoices) -> IabChoices) { if (!isSaving && !isStale) choices = transform(choices) }

    /**
     * Stage what Accept all saves: every displayed category, and under IAB the core's own
     * projection of every live partner's bases. Saves nothing; call [save].
     */
    fun acceptAll() {
        if (isSaving || isStale) return
        categoryChoices = categoryChoices.mapValues { (category, _) -> !isRestricted(category) }
        if (isIab) core.iabAcceptAllChoices()?.let { choices = it }
    }

    /**
     * Stage a denial for every category and withdrawal of every IAB consent. Legitimate interest
     * stays as it was; the person objects to it per purpose or vendor. Saves nothing; call [save].
     */
    fun rejectAll() {
        if (isSaving || isStale) return
        categoryChoices = categoryChoices.mapValues { false }
        if (isIab) choices = choices.copy(
            adTechProviderConsents = choices.adTechProviderConsents?.let { emptyList() },
            customVendorConsents = emptyList(), publisherConsents = emptyList(), publisherCustomConsents = emptyList(),
            purposeConsents = emptyList(), specialFeatureOptIns = emptyList(), vendorConsents = emptyList(),
        )
    }

    /** Drop staged edits and read the saved record again. Clears [isStale] and the error. */
    fun reset() {
        if (isSaving) return
        snapshot = core.snapshot(); optOutState = core.optOutState(); disclosure = core.iabPresentation()
        baseRevision = snapshot.revision
        // No IAB decision yet: no choice at all, or a usable list with no saved IAB decision. A
        // list that can't be edited hides the saved decision, so it never counts as first time.
        choices = disclosure?.let { initialIabChoices(it, firstTime = snapshot.explicitChoice == null || (it.canEdit && core.iabConsent == null)) } ?: IabChoices()
        // Seed each optional switch from what the visitor effectively has, keeping categories
        // restricted by an opt-out or GPC off even if an older explicit choice granted them.
        categoryChoices = displayedCategories.filter { it.optional }.associateWith(::seededCategoryValue)
        seedCategories = categoryChoices; seedChoices = choices; errorCode = null; failedAction = null; isStale = false
    }

    private fun seededCategoryValue(category: ConsentCategory): Boolean {
        val reasons = snapshot.restrictions[category.wireName].orEmpty()
        if (PolicyEvaluator.RESTRICTION_OPT_OUT in reasons || PolicyEvaluator.RESTRICTION_GPC in reasons) {
            return false
        }
        return snapshot.effectivePermissions[category]
    }

    /**
     * What the last refused save means for the person. It stays set while a retry runs, so your
     * layout does not move under the thumb, and clears on success or [reset].
     */
    val errorMessage: String? get() = errorCode?.let {
        when {
            it == "invalid-action-time" -> copy.actionTimeInvalid
            // The vendor list or the provider list went stale: retrying cannot help, refreshing can.
            it == "iab-list-stale" || it.startsWith("additional-consent-") -> iabCopy.appListOutdated
            lastAction == ConsentWriteAction.ACKNOWLEDGE -> copy.dismissFailed
            else -> copy.saveFailed
        }
    }

    /** Send the last action again after a refused save. */
    fun retry(onResult: (Boolean) -> Unit = {}) { lastAction?.let { save(it, onResult) } }

    /**
     * Record a durable opt-out of sale and sharing in one step, as the "Do Not Sell or Share" link
     * does. Available while the policy offers the opt-out ([ResolvedOptOutState.available]).
     *
     * The opt-out is stored on this device before anything is sent, and queued for the backend.
     * Show the receipt ([optOutReceipt]) once it settles.
     *
     * @param onResult Called on the main thread with whether an opt-out is held afterwards.
     */
    fun optOut(onResult: (Boolean) -> Unit = {}) {
        if (isSaving || isChangingOptOut) return
        isChangingOptOut = true
        scope.launch {
            val result = withContext(io) { core.optOut() }
            isChangingOptOut = false
            settleOptOutChange(result.ok, if (result.ok) resolveOptOutCopy(core.snapshot()).statusRequest else copy.saveFailed, onResult)
        }
    }

    /**
     * Opt back in to sale and sharing: the second step, after the person confirmed
     * ("Opt back in?"). California requires the two steps (11 CCR §7028(a)); show the question
     * first and call this only on its confirm button. Port of the web `confirmSaleRight`.
     *
     * A device-held opt-out is lifted. When the person's stored choice still refuses the
     * category that decides the opt-out, the grant is saved instead, which lifts it as it records.
     * An opt-out the person's account holds is the backend's to lift: the lift goes first and
     * waits for its answer, and the grant follows only while the same account is signed in. A lift
     * the backend did not answer stays queued and the opt-out stays until it does. Does nothing
     * while Global Privacy Control holds the opt-out.
     *
     * @param onResult Called on the main thread with whether the opt-out is gone afterwards.
     */
    fun optIn(onResult: (Boolean) -> Unit = {}) {
        if (isSaving || isChangingOptOut) return
        val state = optOutState
        if (state.lock == OptOutLock.GPC_ACTIVE) return
        val before = snapshot
        val deciding = state.decidingCategory
        isChangingOptOut = true
        scope.launch {
            withContext(io) {
                val refused = deciding != null && before.explicitChoice?.consents?.get(deciding.wireName) == false
                val liftIsEnough = state.available && !refused
                val grant = { if (deciding != null) core.save(CommitIntent.Custom(mapOf(deciding to true))) }
                when {
                    core.snapshot().optOut == null -> grant()
                    state.lock != OptOutLock.HELD_BY_ACCOUNT -> if (liftIsEnough || deciding == null) core.optIn() else grant()
                    else -> {
                        // The grant belongs to the account that asked. If the app identified
                        // someone else while the lift was out, it is not theirs.
                        val asked = before.subject?.externalId
                        val lifted = core.optIn()
                        if (lifted.ok && !liftIsEnough && core.snapshot().subject?.externalId == asked) grant()
                    }
                }
            }
            isChangingOptOut = false
            val after = core.snapshot()
            val ok = after.optOut == null
            val message = when {
                ok -> copy.choicesSaved
                state.lock == OptOutLock.HELD_BY_ACCOUNT -> resolveOptOutCopy(after).lockedByAccount
                else -> copy.saveFailed
            }
            settleOptOutChange(ok, message, onResult)
        }
    }

    private fun settleOptOutChange(ok: Boolean, message: String, onResult: (Boolean) -> Unit) {
        sync()
        // A clean draft reseeds, so the switches show what the opt-out now allows.
        if (!isDirty && !isSaving) reset()
        announcement = message
        announcers.lastOrNull()?.invoke(announcement)
        onResult(ok)
        announcementSequence += 1
    }

    /** Ask the backend for the current policy and vendor list. The draft reloads when it lands, or turns stale if it has edits. */
    fun refresh() { if (!isSaving) { reloadAfterRefresh = true; io.asExecutor().execute { core.refresh() } } }

    /**
     * Record [action] and report whether it is stored on this device.
     *
     * `true` means durable local success, not backend delivery. `false` leaves the draft as it
     * was with [errorCode] set; a `concurrent-change` also sets [isStale]. A [ConsentWriteAction.SAVE]
     * with no edits and nothing owed writes nothing and reports `true`. A call made while a save
     * runs or while the draft is stale is ignored, and [onResult] is not called.
     *
     * @param onResult Called on the main thread once the save settles. Close your screen on `true`.
     */
    fun save(action: ConsentWriteAction = ConsentWriteAction.SAVE, onResult: (Boolean) -> Unit = {}) {
        if (isSaving || isStale) return
        if (action == ConsentWriteAction.SAVE && !isDirty && !snapshot.promptRequirement.acknowledge && !snapshot.promptRequirement.notice) {
            onResult(true); return
        }
        commit(action) { ok -> if (ok) reset(); onResult(ok) }
    }

    /** Run the commit without reseeding. [settled] runs before the announcement is published. */
    internal fun commit(action: ConsentWriteAction, settled: (Boolean) -> Unit) {
        val revision = baseRevision
        val categoryDraft = categoryChoices.toMap()
        val gpcLocked = displayedCategories.filter { it.optional && categoryOptOutLock(it) == OptOutLock.GPC_ACTIVE }.toSet()
        val choiceDraft = choices
        val iab = isIab
        isSaving = true; savingAction = action; showProgress = false; lastAction = action
        scope.launch {
            val result = async(io) {
                if (action == ConsentWriteAction.ACKNOWLEDGE) core.dismissNotice() to "queue-write-failed"
                else {
                    val intent = when (action) {
                        ConsentWriteAction.ACCEPT_ALL ->
                            if (!iab && gpcLocked.isNotEmpty()) {
                                CommitIntent.Custom(
                                    displayedCategories
                                        .filter { it.optional && it !in gpcLocked }
                                        .associateWith { true },
                                )
                            } else {
                                CommitIntent.All
                            }
                        ConsentWriteAction.REJECT_ALL -> CommitIntent.Necessary
                        else -> if (iab) CommitIntent.Iab(choiceDraft, categoryDraft) else CommitIntent.Custom(categoryDraft)
                    }
                    core.save(intent, expectedRevision = revision).let { it.ok to it.error?.code }
                }
            }.let { write ->
                // A save that outlasts 400 ms earns a progress indicator.
                withTimeoutOrNull(400) { write.await() } ?: run { showProgress = true; write.await() }
            }
            isSaving = false; savingAction = null; showProgress = false
            snapshot = core.snapshot(); optOutState = core.optOutState()
            if (result.first) {
                errorCode = null; failedAction = null
                announcement = if (action == ConsentWriteAction.ACKNOWLEDGE) copy.noticeAcknowledged else copy.choicesSaved
            } else {
                errorCode = result.second ?: "save-rejected"; failedAction = action; isStale = errorCode == "concurrent-change"
                announcement = if (isStale) iabCopy.appSettingsChanged else errorMessage.orEmpty()
            }
            // Spoken before the screen is told, so a screen that closes on success still says it.
            announcers.lastOrNull()?.invoke(announcement)
            settled(result.first)
            announcementSequence += 1
        }
    }

    internal fun receive(next: ConsentSnapshot) {
        if (next.revision < snapshot.revision) return
        val wasPending = snapshot.policyPending
        snapshot = next
        optOutState = core.optOutState()
        if (!isSaving && !isDirty && follows(wasPending, next)) reset()
        else if (isDirty) {
            val locked = categoryChoices.keys.filter { categoryOptOutLock(it) == OptOutLock.GPC_ACTIVE }
            if (locked.isNotEmpty()) {
                categoryChoices = categoryChoices + locked.associateWith { false }
            }
        }
        if (reloadAfterRefresh && !next.policyPending) {
            if (isDirty) {
                disclosure = core.iabPresentation()
                isStale = next.revision != baseRevision
            } else reset()
            reloadAfterRefresh = listUnavailable
        }
        onReceived?.invoke()
    }

    /** Read the core's snapshot now, outside a change notification. */
    internal fun sync() { snapshot = core.snapshot(); optOutState = core.optOutState() }

    /** "Last changed" with the date in the copy's language, not the device's. */
    fun lastChanged(epochMs: Long): String {
        val copy = iabCopy
        val date = java.text.DateFormat.getDateInstance(java.text.DateFormat.MEDIUM, java.util.Locale.forLanguageTag(copy.language)).format(java.util.Date(epochMs))
        return copy.format(copy.appLastChanged, mapOf("date" to date))
    }
}

/**
 * A first-time user starts with every consent off and legitimate interest not objected to,
 * as on the web: legitimate interest needs no opt-in, and the user objects with its switch.
 */
internal fun initialIabChoices(presentation: IabPresentation, firstTime: Boolean): IabChoices {
    val draft = presentation.draft.choices
    if (!firstTime || draft != IabChoices()) return draft
    val claims = presentation.vendors.filterValues { it.legitimateInterestPurposes.isNotEmpty() }
    return draft.copy(vendorLegitimateInterests = claims.keys.sorted(), purposeLegitimateInterests = claims.values.flatMap { it.legitimateInterestPurposes }.toSortedSet().toList())
}

internal fun List<Int>.select(id: Int, enabled: Boolean) = (if (enabled) this + id else this - id).distinct().sorted()
internal fun List<Long>.select(id: Long, enabled: Boolean) = (if (enabled) this + id else this - id).distinct().sorted()
internal fun List<String>.select(id: String, enabled: Boolean) = (if (enabled) this + id else this - id).distinct().sorted()
