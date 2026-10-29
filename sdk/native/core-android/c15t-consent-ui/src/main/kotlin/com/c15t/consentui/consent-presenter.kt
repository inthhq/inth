package com.c15t.consentui

import androidx.compose.runtime.*
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.c15t.core.*
import com.c15t.core.iab.*
import com.c15t.core.model.*
import kotlinx.coroutines.*
import java.util.UUID

/** Compact host outcome. DISMISSED always means no decision. */
enum class ConsentPresenterOutcome { SAVED, DISMISSED }

/** One host-owned native session. Retain through activity recreation with ViewModelStore. */
class ConsentPresenter(val core: C15tKernel) : ViewModel() {
    var snapshot by mutableStateOf(core.snapshot()); private set
    var presentationID by mutableStateOf<String?>(null); private set
    var preferences by mutableStateOf(false); private set
    var pending by mutableStateOf(false); private set
    var showProgress by mutableStateOf(false); private set
    var errorCode by mutableStateOf<String?>(null); private set
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
    private var suppressed: String? = null
    private var lastAction: Action? = null
    private var reloadAfterRefresh = false
    // The core holds snapshot observers weakly. This field owns the lambda until close.
    private val observer: (ConsentSnapshot) -> Unit = { next -> viewModelScope.launch { receive(next) } }
    private val subscription = core.onChange(observer)

    enum class Action { ACCEPT, REJECT, SAVE, ACKNOWLEDGE }
    init { receive(core.snapshot()) }
    private val promptKey get() = "${snapshot.resolution.fingerprint}:${snapshot.promptRequirement.acknowledge}:${snapshot.promptRequirement.reason}"
    val iab get() = snapshot.model == ConsentModel.IAB
    val noticeVisible get() = !snapshot.policyPending && snapshot.promptRequirement.notice && !snapshot.promptRequirement.acknowledge && presentationID == null
    val listUnavailable get() = iab && (disclosure == null || core.iabStatus().availability in setOf(IabListAvailability.STALE, IabListAvailability.MISSING, IabListAvailability.UNAVAILABLE)
        || disclosure?.adTechProviders?.isNotEmpty() == true && core.additionalConsentStatus() == IabListAvailability.STALE)
    val dirty get() = categories != seedCategories || choices != seedChoices
    val offeredCategories get() = snapshot.consentCategories?.mapNotNull(ConsentCategory::fromWireName) ?: listOf(ConsentCategory.NECESSARY)
    val errorMessage get() = errorCode?.let {
        if (it == "invalid-action-time") "Couldn't save because this device's date and time look wrong. Fix them in Settings, then try again."
        else "Couldn't save your choices. Nothing changed on this device."
    }
    private fun receive(next: ConsentSnapshot) {
        if (next.revision < snapshot.revision) return
        val wasPending = snapshot.policyPending
        snapshot = next
        if (presentationID != null && !pending && (!preferences || wasPending && !next.policyPending)) loadDraft()
        if (reloadAfterRefresh && !next.policyPending) {
            if (!dirty) loadDraft()
            reloadAfterRefresh = false
        }
        if (!next.policyPending && next.promptRequirement.acknowledge && presentationID == null && suppressed != promptKey) {
            presentationID = UUID.randomUUID().toString(); preferences = false; loadDraft()
        }
    }
    /** Open standing privacy settings without replacing an in-flight presentation. */
    fun presentPreferences() {
        if (pending) return
        presentationID = UUID.randomUUID().toString(); preferences = true; fromFirst = false; loadDraft()
    }
    fun customize() { if (!pending) { preferences = true; fromFirst = true; loadDraft() } }
    fun loadDraft() {
        if (pending) return
        snapshot = core.snapshot(); disclosure = core.iabPresentation()
        baseRevision = disclosure?.draft?.revision ?: snapshot.revision
        choices = disclosure?.draft?.choices ?: IabChoices()
        categories = offeredCategories.filter { it.optional }.associateWith { snapshot.explicitChoice?.valueOf(it) ?: false }
        seedCategories = categories; seedChoices = choices; errorCode = null; stale = false
    }
    fun restricted(category: ConsentCategory): Boolean = snapshot.restrictions[category.wireName].orEmpty().any { it == "gpc" || it == "strict-scope" }
    fun setCategory(category: ConsentCategory, enabled: Boolean) { if (!pending && !stale && !restricted(category)) categories = categories + (category to enabled) }
    fun edit(transform: (IabChoices) -> IabChoices) { if (!pending && !stale) choices = transform(choices) }
    fun requestClose() { if (!pending) { if (dirty) confirmDiscard = true else discard() } }
    fun discard() {
        if (pending) return
        confirmDiscard = false
        if (fromFirst) { preferences = false; fromFirst = false; loadDraft() }
        else { suppressed = promptKey; presentationID = null; onOutcome?.invoke(ConsentPresenterOutcome.DISMISSED) }
    }
    /** System Back from the first layer dismisses this SDK window, never the activity. */
    fun backFromFirstLayer() {
        if (pending) return
        suppressed = promptKey; presentationID = null; onOutcome?.invoke(ConsentPresenterOutcome.DISMISSED)
    }
    fun retry() { lastAction?.let(::commit) }
    fun refresh() { if (!pending) { reloadAfterRefresh = !dirty; viewModelScope.launch(Dispatchers.IO) { core.refresh() } } }
    /** All/necessary go to the core's accepting/withdrawing authority unchanged. */
    fun commit(action: Action) {
        if (pending || stale) return
        if (action == Action.SAVE && !dirty && !snapshot.promptRequirement.acknowledge && !snapshot.promptRequirement.notice) {
            suppressed = promptKey; presentationID = null; onOutcome?.invoke(ConsentPresenterOutcome.DISMISSED); return
        }
        val session = presentationID
        val revision = baseRevision
        val categoryDraft = categories.toMap()
        val choiceDraft = choices
        val isIab = iab
        pending = true; showProgress = false; errorCode = null; lastAction = action
        viewModelScope.launch { delay(400); if (pending && presentationID == session) showProgress = true }
        viewModelScope.launch {
            val result = withContext(Dispatchers.IO) {
                if (action == Action.ACKNOWLEDGE) core.dismissNotice() to "queue-write-failed"
                else {
                    val intent = when (action) {
                        Action.ACCEPT -> CommitIntent.All
                        Action.REJECT -> CommitIntent.Necessary
                        Action.SAVE -> if (isIab) CommitIntent.Iab(choiceDraft, categoryDraft) else CommitIntent.Explicit(categoryDraft)
                        Action.ACKNOWLEDGE -> error("handled above")
                    }
                    core.save(intent, expectedRevision = revision).let { it.ok to it.error?.code }
                }
            }
            pending = false; showProgress = false
            if (presentationID != session) return@launch
            snapshot = core.snapshot()
            if (result.first) {
                suppressed = promptKey; presentationID = null; announcement = "Privacy choices saved"; onOutcome?.invoke(ConsentPresenterOutcome.SAVED)
            } else {
                errorCode = result.second ?: "save-rejected"; stale = errorCode == "concurrent-change"
                announcement = if (stale) "Settings changed while you were editing" else errorMessage.orEmpty()
            }
            announcementSequence += 1
        }
    }
    override fun onCleared() { subscription.close() }
}

internal fun List<Int>.select(id: Int, enabled: Boolean) = (if (enabled) this + id else this - id).distinct().sorted()
internal fun List<Long>.select(id: Long, enabled: Boolean) = (if (enabled) this + id else this - id).distinct().sorted()
