package com.inth.consentui

import androidx.compose.runtime.*
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.inth.consentui.generated.ConsentCopy
import com.inth.consentui.generated.IabCopy
import com.inth.consentui.headless.ConsentWriteAction
import com.inth.consentui.headless.ConsentDraft
import com.inth.consentui.headless.IabDraftHandle
import com.inth.consentui.headless.OptOutLinkVariant
import com.inth.consentui.headless.OptOutReceipt
import com.inth.consentui.headless.PrivacyChoicesLinkAction
import com.inth.consentui.headless.PrivacyChoicesLinkState
import com.inth.consentui.headless.initialIabChoices
import com.inth.core.*
import com.inth.core.iab.*
import com.inth.core.model.*
import com.inth.core.policy.OptOutLock
import com.inth.core.policy.ResolvedOptOutState
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
    /**
     * The draft behind the session: staged choices, the save and its revision check. The stock
     * screens and an app-owned screen built on `com.inth.consentui.headless` run the same one.
     */
    internal val draft = ConsentDraft(core, viewModelScope, Dispatchers.IO, load = false)
    val snapshot get() = draft.snapshot
    var presentationID by mutableStateOf<String?>(null); private set
    var preferences by mutableStateOf(false); private set
    val pending get() = draft.isSaving
    /** The action being committed while [pending], so only its control shows progress. */
    val pendingAction get() = draft.savingAction?.let(::action)
    /** `true` once a commit has taken long enough to deserve a spinner. */
    val showProgress get() = draft.showProgress
    val errorCode get() = draft.errorCode
    /** The action behind [errorCode], so a page can show the failure beside the control that failed; null whenever there is no error. */
    val failedAction get() = draft.failedAction?.let(::action)
    val stale get() = draft.isStale
    val categories get() = draft.categoryChoices
    val choices get() = draft.choices
    val disclosure get() = draft.disclosure
    /** The disclosure as rows, for the IAB pages. */
    internal val iabRows get() = disclosure?.let { IabDraftHandle(draft, it) }
    var confirmDiscard by mutableStateOf(false)
    val announcement get() = draft.announcement
    val announcementSequence get() = draft.announcementSequence
    var onOutcome: ((ConsentPresenterOutcome) -> Unit)? = null
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

    enum class Action { ACCEPT, REJECT, SAVE, ACKNOWLEDGE }
    private fun action(action: ConsentWriteAction) = when (action) {
        ConsentWriteAction.ACCEPT_ALL -> Action.ACCEPT; ConsentWriteAction.REJECT_ALL -> Action.REJECT
        ConsentWriteAction.SAVE -> Action.SAVE; ConsentWriteAction.ACKNOWLEDGE -> Action.ACKNOWLEDGE
    }
    init {
        // A clean draft follows the record only while a session shows it: the first layer always,
        // standing settings once an unresolved policy resolves.
        draft.follows = { wasPending, next -> presentationID != null && (!preferences || wasPending && !next.policyPending) }
        // Nothing owed ends the episode: the next owed prompt presents even if it looks like an old one.
        draft.onReceived = ::presentIfOwed
        draft.receive(core.snapshot())
    }
    /**
     * Names the owed prompt. `promptOwedSince` moves whenever a prompt becomes owed again, so the
     * same requirement owed again is a new prompt even when the snapshots between were coalesced.
     */
    private val promptKey get() = "${snapshot.resolution.fingerprint}:${snapshot.promptRequirement.acknowledge}:${snapshot.promptRequirement.reason}:${snapshot.promptOwedSince}"
    val iab get() = draft.isIab
    val noticeVisible get() = snapshot.ready && !snapshot.policyPending && snapshot.promptRequirement.notice && !snapshot.promptRequirement.acknowledge && presentationID == null
        && (autoPresent || requestedNotice == promptKey)
    val listUnavailable get() = draft.listUnavailable
    val dirty get() = draft.isDirty
    /** The language every label is shown in; see [ConsentDraft.language]. */
    internal val copyLanguage: String get() = draft.language
    /** IAB copy in [copyLanguage]. Hosts cannot replace it. */
    internal val iabCopy: IabCopy get() = draft.iabCopy
    /** Category-mode copy in [copyLanguage]. Hosts replace only the headline and introduction, through the theme. */
    internal val copy: ConsentCopy get() = draft.copy
    /** "Last changed" with the date in the copy's language, not the device's. */
    internal fun lastChanged(epochMs: Long): String = draft.lastChanged(epochMs)
    /** Preferences were opened from the first layer, so closing them returns there. */
    val returnsToFirstLayer get() = fromFirst
    /** Summary of both permitted legal bases in the current draft. */
    fun partnerStatus(id: Int): String = iabRows?.vendor(id)?.statusLabel ?: iabCopy.appOff
    /** The same summary for a custom (non-IAB) partner. */
    fun customPartnerStatus(id: String): String = iabRows?.customVendors?.firstOrNull { it.id == id }?.statusLabel ?: iabCopy.appOff
    val offeredCategories get() = draft.displayedCategories
    /** Opt-out display state for the current snapshot and active policy. */
    val optOutState: ResolvedOptOutState get() = draft.optOutState
    /** Honored opt-out status line, or `null` when no opt-out is held. */
    val optOutStatus: String? get() = draft.optOutStatus
    /** Opt-out or privacy signal lock reason for [category], or `null`. */
    fun categoryOptOutLock(category: ConsentCategory): OptOutLock? = draft.categoryOptOutLock(category)

    /**
     * The opt-out title the Privacy Choices link, the confirmation and the settings block show.
     * The host's choice, as `presentation.optOutLink` on the web; [openPrivacyChoices] sets it.
     */
    var optOutLinkVariant by mutableStateOf(OptOutLinkVariant.DO_NOT_SELL)
    /** The opt-out confirmation (its receipt) is on screen. */
    var optOutConfirmation by mutableStateOf(false); private set
    /** The "Opt back in?" step is on screen. Nothing changes until [confirmOptIn]. */
    var optInConfirmation by mutableStateOf(false); private set
    /** An opt-out or an opt-back-in is being recorded. */
    val changingOptOut get() = draft.isChangingOptOut
    /** The held opt-out as a receipt, or `null` when none is held. */
    val optOutReceipt: OptOutReceipt? get() = draft.optOutReceipt(optOutLinkVariant)
    /** Opt-out and Privacy Choices copy in the served language. */
    internal val optOutCopy get() = draft.optOutCopy
    /** A save the "Opt back in?" step holds until the person confirms it. */
    private var deferredCommit: Action? = null

    /** The Privacy Choices link with the [variant] title, or `null` when it shows nothing. */
    fun privacyChoicesLink(variant: OptOutLinkVariant = optOutLinkVariant): PrivacyChoicesLinkState? =
        draft.privacyChoicesLink(variant)

    /**
     * What a tap on the Privacy Choices link does.
     *
     * Under an `opt-out` rule it records the opt-out of sale and sharing in one tap and then shows
     * the confirmation with its receipt; a person already opted out sees the receipt. Under an
     * `opt-in` rule it opens privacy settings. It never waits on the network.
     */
    fun openPrivacyChoices(variant: OptOutLinkVariant = optOutLinkVariant) {
        optOutLinkVariant = variant
        draft.sync()
        val link = privacyChoicesLink(variant) ?: return
        when (link.action) {
            PrivacyChoicesLinkAction.OPEN_PREFERENCES -> presentPreferences()
            PrivacyChoicesLinkAction.OPT_OUT -> {
                if (pending || changingOptOut || presentationID != null) return
                if (snapshot.optOut != null) { optOutConfirmation = true; return }
                draft.optOut { ok -> if (ok) optOutConfirmation = true }
            }
        }
    }

    /** Close the opt-out confirmation. */
    fun closeOptOutConfirmation() { optOutConfirmation = false }

    /** Close the opt-out confirmation and open privacy settings, where the opt-out can be reviewed. */
    fun preferencesFromOptOutConfirmation() { optOutConfirmation = false; presentPreferences() }

    /**
     * Ask to opt back in to sale and sharing: shows the "Opt back in?" step. Nothing changes until
     * [confirmOptIn]. Does nothing while no opt-out is held or Global Privacy Control holds it.
     */
    fun requestOptIn() {
        if (pending || changingOptOut || optOutReceipt?.canOptBackIn != true) return
        deferredCommit = null
        optInConfirmation = true
    }

    /** The second step: opt back in, or record the save the step held. */
    fun confirmOptIn() {
        if (!optInConfirmation) return
        optInConfirmation = false
        val held = deferredCommit
        deferredCommit = null
        if (held != null) commitNow(held) else draft.optIn()
    }

    /** Stay opted out: close the "Opt back in?" step. A save it held is not recorded. */
    fun cancelOptIn() { optInConfirmation = false; deferredCommit = null }

    /**
     * A save from the stock screens that would lift the held opt-out under an `opt-out` rule waits
     * for the "Opt back in?" step, as on the web (`saveConsentSurfaceWithOptInCheck`).
     */
    private fun commitWouldLiftOptOut(action: Action): Boolean {
        val state = optOutState
        if (iab || !state.available || !state.honored || state.lock == OptOutLock.GPC_ACTIVE) return false
        val deciding = state.decidingCategory ?: return false
        return when (action) {
            Action.ACCEPT -> deciding in offeredCategories
            Action.SAVE -> categories[deciding] == true
            else -> false
        }
    }
    /**
     * What the last refused commit means for the person; the retry is offered beside it. Stays set
     * while a retry is in flight, so the footer does not reflow under the thumb, and clears only on
     * success or a reload.
     */
    val errorMessage get() = draft.errorMessage
    /**
     * Google's Additional Consent only takes effect while TCF purposes 1, 3 and 4 are consented; the
     * core records every provider as off otherwise. The provider page says so in those purposes' own
     * names, which is how the person saw them one page back.
     */
    val providerPrerequisitesMet get() = choices.purposeConsents.containsAll(listOf(1, 3, 4))
    val providerPrerequisiteNames get() = listOf(1, 3, 4).mapNotNull { disclosure?.list?.purposes?.get(it)?.name }
    /** Open an owed prompt now if [autoPresent] says so. Idempotent; a host calls it before it reports an outcome, so the prompt that follows is on screen first. */
    internal fun presentIfOwed() {
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
    /** End a session a host asked for but could not put on screen. Nothing was decided or dismissed, so it reports no outcome. */
    internal fun withdrawSession() {
        if (!pending) { presentationID = null; requestedNotice = null }
    }
    /** Open standing privacy settings without replacing an in-flight presentation. */
    fun presentPreferences() {
        if (pending || presentationID != null) return
        presentationID = UUID.randomUUID().toString(); preferences = true; fromFirst = false; loadDraft()
    }
    /** Open an owed prompt without replacing an existing draft. An owed notice shows as the notice card. */
    fun presentPrompt() {
        if (pending || presentationID != null) return
        draft.sync()
        if (snapshot.policyPending) return
        if (snapshot.promptRequirement.notice && !snapshot.promptRequirement.acknowledge) { requestedNotice = promptKey; return }
        if (!snapshot.promptRequirement.acknowledge) return
        presentationID = UUID.randomUUID().toString(); preferences = false; fromFirst = false; loadDraft()
    }
    /** An obsolete host close must never dismiss a newer presentation. */
    fun requestClose(sessionID: String) { if (presentationID == sessionID) requestClose() }
    fun customize() { if (!pending) { preferences = true; fromFirst = true; loadDraft() } }
    fun loadDraft() = draft.reset()
    internal fun initialChoices(presentation: IabPresentation, firstTime: Boolean): IabChoices = initialIabChoices(presentation, firstTime)
    fun restricted(category: ConsentCategory): Boolean = draft.isRestricted(category)
    fun setCategory(category: ConsentCategory, enabled: Boolean) = draft.setCategory(category, enabled)
    fun edit(transform: (IabChoices) -> IabChoices) = draft.edit(transform)
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
        // Closing a notice the host asked for ends that request; it stays owed for the next one.
        if (presentationID == null) requestedNotice = null
        presentationID = null
        onOutcome?.invoke(outcome)
        presentIfOwed()
    }
    fun retry() { lastAction?.let(::commitNow) }
    fun refresh() = draft.refresh()
    /**
     * All/necessary go to the core's accepting/withdrawing authority unchanged. A save that would
     * lift a held opt-out first asks "Opt back in?" ([optInConfirmation]).
     */
    fun commit(action: Action) {
        if (pending || stale) return
        if (commitWouldLiftOptOut(action)) { deferredCommit = action; optInConfirmation = true; return }
        commitNow(action)
    }

    private fun commitNow(action: Action) {
        if (pending || stale) return
        if (action == Action.SAVE && !dirty && !snapshot.promptRequirement.acknowledge && !snapshot.promptRequirement.notice) {
            closeSession(ConsentPresenterOutcome.DISMISSED); return
        }
        val session = presentationID
        // The prompt the person acted on. A requirement that changes while the commit runs is a new one.
        val handled = promptKey
        // A notice is shown without a session; a session shows the prompt or standing settings.
        val shownPrompt = session == null || sessionIsPrompt
        lastAction = action
        val intent = when (action) {
            Action.ACCEPT -> ConsentWriteAction.ACCEPT_ALL; Action.REJECT -> ConsentWriteAction.REJECT_ALL
            Action.SAVE -> ConsentWriteAction.SAVE; Action.ACKNOWLEDGE -> ConsentWriteAction.ACKNOWLEDGE
        }
        draft.commit(intent) { ok ->
            if (presentationID != session) presentIfOwed()
            else if (ok) {
                if (shownPrompt) suppressed = handled
                presentationID = null
                onOutcome?.invoke(ConsentPresenterOutcome.SAVED)
                // Snapshots that arrived while the commit ran were not acted on; the current one is.
                presentIfOwed()
            }
        }
    }
    override fun onCleared() { draft.close() }
}

