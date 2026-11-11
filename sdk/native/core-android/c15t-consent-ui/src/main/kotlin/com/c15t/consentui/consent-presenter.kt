package com.c15t.consentui

import androidx.compose.runtime.*
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.c15t.consentui.generated.ConsentCopy
import com.c15t.consentui.generated.IabCopy
import com.c15t.core.*
import com.c15t.core.iab.*
import com.c15t.core.model.*
import kotlinx.coroutines.*
import java.util.UUID

/** Compact host outcome. DISMISSED always means no decision. */
enum class ConsentPresenterOutcome { SAVED, DISMISSED }

/**
 * One host-owned native session. Retain through activity recreation with ViewModelStore.
 *
 * With [autoPresent] on, the presenter opens an owed prompt by itself once the core is ready,
 * once per owed prompt: a prompt the person answered or dismissed stays closed until the policy,
 * the reason or the requirement changes. With it off, nothing shows until [presentPrompt].
 */
class ConsentPresenter(val core: ConsentCore, autoPresent: Boolean = true) : ViewModel() {
    /** Open an owed prompt by itself. Turning it on presents a prompt that is already owed. */
    var autoPresent: Boolean
        get() = autoPresentState
        set(value) { autoPresentState = value; if (value) presentIfOwed() }
    private var autoPresentState by mutableStateOf(autoPresent)
    var snapshot by mutableStateOf(core.snapshot()); private set
    var presentationID by mutableStateOf<String?>(null); private set
    var preferences by mutableStateOf(false); private set
    var pending by mutableStateOf(false); private set
    /** The action being committed while [pending], so only its control shows progress. */
    var pendingAction by mutableStateOf<Action?>(null); private set
    /** `true` once a commit has taken long enough to deserve a spinner. */
    var showProgress by mutableStateOf(false); private set
    var errorCode by mutableStateOf<String?>(null); private set
    /** The action behind [errorCode], so a page can show the failure beside the control that failed; null whenever there is no error. */
    var failedAction by mutableStateOf<Action?>(null); private set
    var stale by mutableStateOf(false); private set
    var categories by mutableStateOf<Map<ConsentCategory, Boolean>>(emptyMap()); private set
    var choices by mutableStateOf(IabChoices()); private set
    var disclosure by mutableStateOf<IabPresentation?>(null); private set
    var confirmDiscard by mutableStateOf(false)
    var announcement by mutableStateOf(""); private set
    var announcementSequence by mutableIntStateOf(0); private set
    var onOutcome: ((ConsentPresenterOutcome) -> Unit)? = null
    private var baseRevision = 0L
    private var seedCategories: Map<ConsentCategory, Boolean> = emptyMap()
    private var seedChoices = IabChoices()
    private var fromFirst = false
    /**
     * The owed prompt the person saw and closed, by its key. The key carries the core's
     * `promptOwedSince`, so a prompt owed again never matches it: nothing has to clear it.
     */
    private var suppressed: String? = null
    /** The owed notice the host asked for while [autoPresent] is off, by its key; a later notice needs its own request. */
    private var requestedNotice by mutableStateOf<String?>(null)
    /** The open session shows the owed prompt (its first layer, or settings opened from it), not standing settings. */
    private val sessionIsPrompt get() = presentationID != null && (!preferences || fromFirst)
    /** The session [autoPresent] opened, by its id, as opposed to one the app asked for. */
    private var automaticSession: String? = null
    private var lastAction: Action? = null
    private var reloadAfterRefresh = false
    // The handle owns the lambda; onCleared closes it so the core lets go of this presenter.
    private val observer: (ConsentSnapshot) -> Unit = { next -> viewModelScope.launch { receive(next) } }
    private val subscription = core.onChange(observer)

    enum class Action { ACCEPT, REJECT, SAVE, ACKNOWLEDGE }
    init { receive(core.snapshot()) }
    /**
     * Names the owed prompt. `promptOwedSince` moves whenever a prompt becomes owed again, so the
     * same requirement owed again is a new prompt even when the snapshots between were coalesced.
     */
    private val promptKey get() = "${snapshot.resolution.fingerprint}:${snapshot.promptRequirement.acknowledge}:${snapshot.promptRequirement.reason}:${snapshot.promptOwedSince}"
    val iab get() = snapshot.model == ConsentModel.IAB
    val noticeVisible get() = snapshot.ready && !snapshot.policyPending && snapshot.promptRequirement.notice && !snapshot.promptRequirement.acknowledge && presentationID == null
        && (autoPresent || requestedNotice == promptKey)
    val listUnavailable get() = iab && (disclosure?.canEdit != true || core.iabStatus().availability in setOf(IabListAvailability.STALE, IabListAvailability.MISSING, IabListAvailability.UNAVAILABLE)
        || disclosure?.adTechProviders?.isNotEmpty() == true && core.additionalConsentStatus() == IabListAvailability.STALE)
    val dirty get() = categories != seedCategories || choices != seedChoices
    /**
     * The language every label is shown in. IAB mode follows the served list, English until it loads;
     * category mode follows the policy's translation language.
     */
    internal val copyLanguage: String get() =
        if (iab) disclosure?.language ?: "en" else snapshot.overrides.language ?: snapshot.location?.language ?: "en"
    /** IAB copy in [copyLanguage]. Hosts cannot replace it. */
    internal val iabCopy: IabCopy get() = IabCopy.forLanguage(copyLanguage)
    /** Category-mode copy in [copyLanguage]. Hosts replace only the headline and introduction, through the theme. */
    internal val copy: ConsentCopy get() = ConsentCopy.forLanguage(copyLanguage)
    /** "Last changed" with the date in the copy's language, not the device's. */
    internal fun lastChanged(epochMs: Long): String {
        val copy = iabCopy
        val date = java.text.DateFormat.getDateInstance(java.text.DateFormat.MEDIUM, java.util.Locale.forLanguageTag(copy.language)).format(java.util.Date(epochMs))
        return copy.format(copy.appLastChanged, mapOf("date" to date))
    }
    /** Preferences were opened from the first layer, so closing them returns there. */
    val returnsToFirstLayer get() = fromFirst
    /** Summary of both permitted legal bases in the current draft. */
    fun partnerStatus(id: Int): String = when (disclosure?.vendors?.get(id)?.selectionStatus(id, choices) ?: IabVendorSelectionStatus.OFF) {
        IabVendorSelectionStatus.OFF -> iabCopy.appOff
        IabVendorSelectionStatus.PARTIAL -> iabCopy.appPartlyOn
        IabVendorSelectionStatus.ON -> iabCopy.appOn
    }
    val offeredCategories get() = snapshot.consentCategories?.mapNotNull(ConsentCategory::fromWireName) ?: listOf(ConsentCategory.NECESSARY)
    /**
     * What the last refused commit means for the person; the retry is offered beside it. Stays set
     * while a retry is in flight, so the footer does not reflow under the thumb, and clears only on
     * success or a reload.
     */
    val errorMessage get() = errorCode?.let {
        when {
            it == "invalid-action-time" -> copy.actionTimeInvalid
            lastAction == Action.ACKNOWLEDGE -> copy.dismissFailed
            else -> copy.saveFailed
        }
    }
    /**
     * Google's Additional Consent only takes effect while TCF purposes 1, 3 and 4 are consented; the
     * core records every provider as off otherwise. The provider page says so in those purposes' own
     * names, which is how the person saw them one page back.
     */
    val providerPrerequisitesMet get() = choices.purposeConsents.containsAll(listOf(1, 3, 4))
    val providerPrerequisiteNames get() = listOf(1, 3, 4).mapNotNull { disclosure?.list?.purposes?.get(it)?.name }
    private fun receive(next: ConsentSnapshot) {
        if (next.revision < snapshot.revision) return
        val wasPending = snapshot.policyPending
        snapshot = next
        if (presentationID != null && !pending && !dirty && (!preferences || wasPending && !next.policyPending)) loadDraft()
        if (reloadAfterRefresh && !next.policyPending) {
            if (dirty) {
                disclosure = core.iabPresentation()
                stale = next.revision != baseRevision
            } else loadDraft()
            reloadAfterRefresh = listUnavailable
        }
        // Nothing owed ends the episode: the next owed prompt presents even if it looks like an old one.
        presentIfOwed()
    }
    private fun presentIfOwed() {
        if (autoPresent && snapshot.ready && !snapshot.policyPending && snapshot.promptRequirement.acknowledge && presentationID == null && !pending && suppressed != promptKey) {
            presentationID = UUID.randomUUID().toString(); preferences = false; fromFirst = false; loadDraft()
            automaticSession = presentationID
        }
    }
    /**
     * End a session that opened by itself, because the host now drawing it opted out of
     * auto-present and never asked for it. Nothing was decided or dismissed, so it reports no
     * outcome and leaves the owed prompt owed: a host that auto-presents opens it again.
     */
    internal fun withdrawAutomaticSession() {
        if (!pending && presentationID != null && presentationID == automaticSession) presentationID = null
    }
    /** Open standing privacy settings without replacing an in-flight presentation. */
    fun presentPreferences() {
        if (pending || presentationID != null) return
        presentationID = UUID.randomUUID().toString(); preferences = true; fromFirst = false; loadDraft()
    }
    /** Open an owed prompt without replacing an existing draft. An owed notice shows as the notice card. */
    fun presentPrompt() {
        if (pending || presentationID != null) return
        snapshot = core.snapshot()
        if (snapshot.policyPending) return
        if (snapshot.promptRequirement.notice && !snapshot.promptRequirement.acknowledge) { requestedNotice = promptKey; return }
        if (!snapshot.promptRequirement.acknowledge) return
        presentationID = UUID.randomUUID().toString(); preferences = false; fromFirst = false; loadDraft()
    }
    /** An obsolete host close must never dismiss a newer presentation. */
    fun requestClose(sessionID: String) { if (presentationID == sessionID) requestClose() }
    fun customize() { if (!pending) { preferences = true; fromFirst = true; loadDraft() } }
    fun loadDraft() {
        if (pending) return
        snapshot = core.snapshot(); disclosure = core.iabPresentation()
        baseRevision = snapshot.revision
        // No IAB decision yet: no choice at all, or a usable list with no saved IAB decision. A
        // list that can't be edited hides the saved decision, so it never counts as first time.
        choices = disclosure?.let { initialChoices(it, firstTime = snapshot.explicitChoice == null || (it.canEdit && core.iabConsent == null)) } ?: IabChoices()
        categories = offeredCategories.filter { it.optional }.associateWith { snapshot.explicitChoice?.valueOf(it) ?: false }
        seedCategories = categories; seedChoices = choices; errorCode = null; failedAction = null; stale = false
    }
    /**
     * A first-time user starts with every consent off and legitimate interest not objected to,
     * as on the web: legitimate interest needs no opt-in, and the user objects with its switch.
     */
    internal fun initialChoices(presentation: IabPresentation, firstTime: Boolean): IabChoices {
        val draft = presentation.draft.choices
        if (!firstTime || draft != IabChoices()) return draft
        val claims = presentation.vendors.filterValues { it.legitimateInterestPurposes.isNotEmpty() }
        return draft.copy(vendorLegitimateInterests = claims.keys.sorted(), purposeLegitimateInterests = claims.values.flatMap { it.legitimateInterestPurposes }.toSortedSet().toList())
    }
    fun restricted(category: ConsentCategory): Boolean = snapshot.restrictions[category.wireName].orEmpty().any { it == "gpc" || it == "strict-scope" }
    fun setCategory(category: ConsentCategory, enabled: Boolean) { if (!pending && !stale && !restricted(category)) categories = categories + (category to enabled) }
    fun edit(transform: (IabChoices) -> IabChoices) { if (!pending && !stale) choices = transform(choices) }
    fun requestClose() { if (!pending) { if (dirty) confirmDiscard = true else discard() } }
    fun discard() {
        if (pending) return
        confirmDiscard = false
        if (fromFirst) { preferences = false; fromFirst = false; loadDraft() }
        else { closeSession(ConsentPresenterOutcome.DISMISSED) }
    }
    /**
     * System Back from the first layer. An IAB first layer waits for a decision, so Back does
     * nothing there; otherwise it dismisses this SDK window, never the activity.
     */
    fun backFromFirstLayer() {
        if (pending || iab) return
        closeSession(ConsentPresenterOutcome.DISMISSED)
    }
    /**
     * Close the open session without a commit. Closing the prompt settles it; closing standing
     * settings does not, so an owed prompt they covered is presented now.
     */
    private fun closeSession(outcome: ConsentPresenterOutcome) {
        if (sessionIsPrompt) suppressed = promptKey
        presentationID = null
        onOutcome?.invoke(outcome)
        presentIfOwed()
    }
    fun retry() { lastAction?.let(::commit) }
    fun refresh() { if (!pending) { reloadAfterRefresh = true; viewModelScope.launch(Dispatchers.IO) { core.refresh() } } }
    /** All/necessary go to the core's accepting/withdrawing authority unchanged. */
    fun commit(action: Action) {
        if (pending || stale) return
        if (action == Action.SAVE && !dirty && !snapshot.promptRequirement.acknowledge && !snapshot.promptRequirement.notice) {
            closeSession(ConsentPresenterOutcome.DISMISSED); return
        }
        val session = presentationID
        // The prompt the person acted on. A requirement that changes while the commit runs is a new one.
        val handled = promptKey
        // A notice is shown without a session; a session shows the prompt or standing settings.
        val shownPrompt = session == null || sessionIsPrompt
        val revision = baseRevision
        val categoryDraft = categories.toMap()
        val choiceDraft = choices
        val isIab = iab
        pending = true; pendingAction = action; showProgress = false; lastAction = action
        viewModelScope.launch { delay(400); if (pending && presentationID == session) showProgress = true }
        viewModelScope.launch {
            val result = withContext(Dispatchers.IO) {
                if (action == Action.ACKNOWLEDGE) core.dismissNotice() to "queue-write-failed"
                else {
                    val intent = when (action) {
                        Action.ACCEPT -> CommitIntent.All
                        Action.REJECT -> CommitIntent.Necessary
                        Action.SAVE -> if (isIab) CommitIntent.Iab(choiceDraft, categoryDraft) else CommitIntent.Custom(categoryDraft)
                        Action.ACKNOWLEDGE -> error("handled above")
                    }
                    core.save(intent, expectedRevision = revision).let { it.ok to it.error?.code }
                }
            }
            pending = false; pendingAction = null; showProgress = false
            if (presentationID != session) { presentIfOwed(); return@launch }
            snapshot = core.snapshot()
            if (result.first) {
                errorCode = null; failedAction = null; if (shownPrompt) suppressed = handled; presentationID = null; announcement = if (action == Action.ACKNOWLEDGE) copy.noticeAcknowledged else copy.choicesSaved; onOutcome?.invoke(ConsentPresenterOutcome.SAVED)
                // Snapshots that arrived while the commit ran were not acted on; the current one is.
                presentIfOwed()
            } else {
                errorCode = result.second ?: "save-rejected"; failedAction = action; stale = errorCode == "concurrent-change"
                announcement = if (stale) iabCopy.appSettingsChanged else errorMessage.orEmpty()
            }
            announcementSequence += 1
        }
    }
    override fun onCleared() { subscription.close() }
}

internal fun List<Int>.select(id: Int, enabled: Boolean) = (if (enabled) this + id else this - id).distinct().sorted()
internal fun List<Long>.select(id: Long, enabled: Boolean) = (if (enabled) this + id else this - id).distinct().sorted()
