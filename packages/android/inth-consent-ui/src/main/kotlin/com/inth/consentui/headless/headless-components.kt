package com.inth.consentui.headless

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.semantics.paneTitle
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.inth.core.Inth
import com.inth.core.ConsentCore
import com.inth.core.iab.IabLegalBasis
import com.inth.core.model.ConsentCategory
import com.inth.core.model.ConsentSnapshot
import com.inth.core.policy.ResolvedOptOutState

private fun installedCore(): ConsentCore = requireNotNull(Inth.current) { "Install Inth before using the headless consent blocks" }

/** The core's snapshot as Compose state. It recomposes its readers on every consent change. */
@Composable
fun rememberConsentSnapshot(core: ConsentCore = installedCore()): State<ConsentSnapshot> {
    val state = remember(core) { mutableStateOf(core.snapshot()) }
    DisposableEffect(core) {
        // The core calls back on its own threads, and a save made inside one callback can deliver
        // a newer snapshot before an older one. Never step back.
        val newest: (ConsentSnapshot) -> Unit = { next -> synchronized(state) { if (next.revision >= state.value.revision) state.value = next } }
        val subscription = core.onChange(newest)
        newest(core.snapshot())
        onDispose { subscription.close() }
    }
    return state
}

/**
 * A [ConsentDraft] for this composition. It lives as long as the call site does, so unsaved
 * edits are lost on rotation; construct a [ConsentDraft] in a ViewModel to keep them.
 *
 * @param core The core to follow. Defaults to the one the app installed.
 * @throws IllegalArgumentException When no core is installed.
 */
@Composable
fun rememberConsentDraft(core: ConsentCore = installedCore()): ConsentDraft {
    val scope = rememberCoroutineScope()
    val draft = remember(core) { ConsentDraft(core, scope) }
    DisposableEffect(draft) { onDispose { draft.close() } }
    return draft
}

/**
 * Show [content] only while [category] is allowed, and [fallback] otherwise. An unresolved
 * policy counts as not allowed, so nothing gated starts on a cold launch.
 *
 * ```kotlin
 * ConsentGate(ConsentCategory.MARKETING, fallback = { AdPlaceholder() }) { AdBanner() }
 * ```
 */
@Composable
fun ConsentGate(
    category: ConsentCategory,
    core: ConsentCore = installedCore(),
    fallback: (@Composable () -> Unit)? = null,
    content: @Composable () -> Unit,
) = ConsentGate({ it.isAllowed(category) }, core, fallback, content)

/**
 * Show [content] only while the committed IAB decision allows [vendorId] to use [purposeId] on
 * [basis]. It reads the saved decision, never a draft.
 *
 * ```kotlin
 * ConsentGate(vendorId = 755, purposeId = 1) { GoogleAds() }
 * ```
 */
@Composable
fun ConsentGate(
    vendorId: Int,
    purposeId: Int,
    basis: IabLegalBasis = IabLegalBasis.CONSENT,
    core: ConsentCore = installedCore(),
    fallback: (@Composable () -> Unit)? = null,
    content: @Composable () -> Unit,
) = ConsentGate({ it.isIabAllowed(vendorId, purposeId, basis) }, core, fallback, content)

/**
 * Show [content] only while [allowed] holds for the committed decision. It runs again on every
 * consent change. Use it for what the other gates do not name: a purpose alone, a custom
 * partner, or an Additional Consent provider.
 *
 * ```kotlin
 * ConsentGate({ it.isCustomVendorAllowed("internal-ads") }) { HouseAds() }
 * ConsentGate({ it.isAdTechProviderAllowed(89) }) { PartnerPixel() }
 * ConsentGate({ 1 in it.iabConsent?.choices?.purposeConsents.orEmpty() }) { DeviceStorage() }
 * ```
 */
@Composable
fun ConsentGate(
    allowed: (ConsentCore) -> Boolean,
    core: ConsentCore = installedCore(),
    fallback: (@Composable () -> Unit)? = null,
    content: @Composable () -> Unit,
) {
    // Reading the snapshot is what recomposes the gate on a consent change. The check itself runs
    // on every composition, never from a cache, so state the predicate reads is followed too.
    rememberConsentSnapshot(core).value
    if (allowed(core)) content() else fallback?.invoke()
}

/** Show [content] once the core has a resolved policy, and [fallback] until then. */
@Composable
fun ConsentReady(
    core: ConsentCore = installedCore(),
    fallback: (@Composable () -> Unit)? = null,
    content: @Composable () -> Unit,
) {
    val snapshot by rememberConsentSnapshot(core)
    if (snapshot.ready && !snapshot.policyPending) content() else fallback?.invoke()
}

/**
 * What [HeadlessConsentPrompt] hands your first layer: the copy to place and the actions to wire.
 *
 * @property isNotice The policy owes a notice to acknowledge, not a consent choice.
 * @property reason Why the prompt is back, when a choice expired or the policy changed.
 * @property iab The IAB first layer's required text under a TCF policy. Render all of it.
 */
@Stable
class ConsentPromptScope internal constructor(val draft: ConsentDraft, val isNotice: Boolean, private val onOpenPreferences: () -> Unit) {
    private val copy get() = draft.copy
    val reason: String? get() = when (draft.snapshot.promptRequirement.reason?.wireName) {
        "expired" -> copy.choiceExpired
        "policy-changed" -> copy.policyChanged
        else -> null
    }
    val title: String get() = if (isNotice) copy.noticeTitle else copy.headline
    val description: String get() = if (isNotice) copy.noticeDescription else copy.introduction
    /** A second sentence for a category choice. `null` for a notice and under IAB, where [iab] replaces it. */
    val detail: String? get() = if (!isNotice && !draft.isIab) copy.firstLayerDescription else null
    val iab: IabFirstLayer? get() = if (isNotice) null else draft.iab?.firstLayer
    val acceptAllLabel: String get() = if (draft.isIab) draft.iabCopy.commonAcceptAll else copy.acceptAll
    val rejectAllLabel: String get() = if (draft.isIab) draft.iabCopy.commonRejectAll else copy.rejectAll
    val customizeLabel: String get() = if (isNotice) copy.privacySettings else if (draft.isIab) draft.iabCopy.commonCustomize else copy.customize
    val acknowledgeLabel: String get() = copy.acknowledge
    val privacyPolicyLabel: String get() = draft.iabCopy.preferenceCenterVendorListPrivacyPolicy
    /**
     * The IAB vendor list cannot back a new grant now. Show [listOutdated] with a control wired
     * to [refresh], keep Reject all, and leave Accept all out, as the stock first layer does.
     */
    val listUnavailable: Boolean get() = !isNotice && draft.listUnavailable
    val listOutdated: String get() = draft.iabCopy.appListOutdated
    /** Fetch the policy and vendor list again. */
    fun refresh() = draft.refresh()
    /**
     * A decision landed elsewhere after this prompt read the record, so its actions do nothing
     * now. Show `iabCopy.appSettingsChanged` with a control wired to [reload].
     */
    val isStale: Boolean get() = draft.isStale
    /** Read the current record again, so the actions work. */
    fun reload() = draft.reset()
    /** Grant everything in one tap. Ignored while [listUnavailable]. */
    fun acceptAll() { if (!listUnavailable) draft.save(ConsentWriteAction.ACCEPT_ALL) }
    /** Deny everything optional in one tap. Under IAB every consent signal goes off. */
    fun rejectAll() = draft.save(ConsentWriteAction.REJECT_ALL)
    /** Acknowledge a notice. Records no optional grant. */
    fun acknowledge() = draft.save(ConsentWriteAction.ACKNOWLEDGE)
    /** Open your preferences screen. */
    fun openPreferences() { if (!draft.isSaving) onOpenPreferences() }
}

/**
 * Your first-layer prompt, shown only while the resolved policy owes one.
 *
 * The block decides when, supplies copy and actions through [ConsentPromptScope], sends save
 * results and errors to TalkBack, and holds hardware Back while a save runs and on an IAB
 * first layer, which waits for a decision. Layout, type and motion are yours.
 *
 * While a [HeadlessConsentPreferences] block is open on the same draft, Back belongs to it.
 *
 * ```kotlin
 * val draft = rememberConsentDraft()
 * HeadlessConsentPrompt(draft, onOpenPreferences = { showPreferences = true }) {
 *     MyBanner(title, description, onAccept = ::acceptAll, onReject = ::rejectAll, onCustomize = ::openPreferences)
 * }
 * ```
 *
 * @param onOpenPreferences Show your preferences screen. [ConsentPromptScope.openPreferences] calls it.
 * @param fallback Shown when nothing is owed.
 */
@Composable
fun HeadlessConsentPrompt(
    draft: ConsentDraft,
    onOpenPreferences: () -> Unit,
    fallback: (@Composable () -> Unit)? = null,
    content: @Composable ConsentPromptScope.() -> Unit,
) {
    val requirement = draft.snapshot.promptRequirement
    ConsentAnnouncements(draft)
    if (!draft.isReady || !requirement.acknowledge && !requirement.notice) { fallback?.invoke(); return }
    val notice = !requirement.acknowledge
    val open by rememberUpdatedState(onOpenPreferences)
    val scope = remember(draft, notice) { ConsentPromptScope(draft, notice) { open() } }
    // The handler added last wins, and a prompt can become owed under open preferences.
    BackHandler(enabled = draft.openPreferences == 0 && (draft.isSaving || draft.isIab && !notice)) {}
    scope.content()
}

/**
 * What [HeadlessConsentPreferences] hands your preferences screen.
 *
 * The labels here are the ones that differ between a category policy and IAB. Every other
 * string is a value on [ConsentDraft.copy] or [ConsentDraft.iabCopy], such as `iabCopy.appClose`,
 * `iabCopy.appTryAgain` and `copy.saving`.
 *
 * @property confirmDiscard The person tried to leave with unsaved edits. Show your own
 *   confirmation with `iabCopy.appDiscardChangesTitle`, `appDiscardChangesDetail`,
 *   `appDiscardChanges` and `appKeepEditing`.
 */
@Stable
class ConsentPreferencesScope internal constructor(val draft: ConsentDraft, private val onClose: () -> Unit) {
    var confirmDiscard by mutableStateOf(false); private set
    /** One row per category in scope. */
    val categories: List<ConsentCategoryRow> get() = draft.categories
    /** Opt-out display state for the current snapshot and active policy. */
    val optOutState: ResolvedOptOutState get() = draft.optOutState
    /** Honored opt-out status line, or `null` when no opt-out is held. */
    val optOutStatus: String? get() = draft.optOutStatus
    /** The IAB selection and disclosure. `null` outside a TCF policy. */
    val iab: IabDraftHandle? get() = draft.iab
    val title: String get() = if (draft.isIab) draft.iabCopy.preferenceCenterTitle else draft.copy.privacySettings
    val description: String get() = if (draft.isIab) draft.iabCopy.appPreferencesIntro else draft.copy.preferencesDescription
    val saveLabel: String get() = if (draft.isIab) draft.iabCopy.commonSaveSettings else draft.copy.save
    val acceptAllLabel: String get() = if (draft.isIab) draft.iabCopy.commonAcceptAll else draft.copy.acceptAll
    val rejectAllLabel: String get() = if (draft.isIab) draft.iabCopy.commonRejectAll else draft.copy.rejectAll
    /** When the saved choice was last changed, or `null` before one exists. */
    val lastChanged: String? get() = draft.snapshot.explicitChoice?.let { draft.lastChanged(it.actionAt) }

    /** Save the draft and close on success. A refused save keeps the screen open with the error set. */
    fun save() = draft.save(ConsentWriteAction.SAVE) { if (it) onClose() }
    /** Grant everything and close on success. */
    fun acceptAll() = draft.save(ConsentWriteAction.ACCEPT_ALL) { if (it) onClose() }
    /** Deny everything optional and close on success. */
    fun rejectAll() = draft.save(ConsentWriteAction.REJECT_ALL) { if (it) onClose() }
    /** Send the refused action again, and close on success. */
    fun retry() = draft.retry { if (it) onClose() }
    /** Leave. With unsaved edits this sets [confirmDiscard] and stays. Ignored while a save runs. */
    fun requestClose() {
        if (draft.isSaving) return
        if (draft.isDirty) confirmDiscard = true else onClose()
    }
    /** Drop the edits and leave. */
    fun discard() { confirmDiscard = false; draft.reset(); onClose() }
    fun keepEditing() { confirmDiscard = false }
}

/**
 * Your preferences screen. Compose it while the screen is open.
 *
 * The block reads the saved record when it opens, routes hardware Back through
 * [ConsentPreferencesScope.requestClose] so unsaved edits ask first and a running save is never
 * interrupted, closes after a successful save, and sends save results and errors to TalkBack.
 * Put [consentPane] on your root and [consentInitialFocus] on the heading.
 *
 * ```kotlin
 * if (showPreferences) HeadlessConsentPreferences(draft, onClose = { showPreferences = false }) {
 *     categories.forEach { row -> MySwitchRow(row.title, row.description, row.checked, row.enabled, row.onCheckedChange) }
 *     MyButton(saveLabel, enabled = !draft.isSaving, onClick = ::save)
 * }
 * ```
 *
 * @param onClose Hide your screen.
 */
@Composable
fun HeadlessConsentPreferences(
    draft: ConsentDraft,
    onClose: () -> Unit,
    content: @Composable ConsentPreferencesScope.() -> Unit,
) {
    val close by rememberUpdatedState(onClose)
    val scope = remember(draft) { ConsentPreferencesScope(draft) { close() } }
    // A draft left clean by an earlier visit shows the record as it is now.
    DisposableEffect(draft) {
        if (!draft.isDirty) draft.reset()
        draft.openPreferences++
        onDispose { draft.openPreferences-- }
    }
    ConsentAnnouncements(draft)
    BackHandler { scope.requestClose() }
    scope.content()
}

/** Run [block] once when this enters the composition, and again when [key] changes. */
@Composable
private fun OnEnter(key: Any, block: () -> Unit) {
    DisposableEffect(key) { block(); onDispose {} }
}

/** Speak the draft's save results and errors through TalkBack. The prompt and preferences blocks include it. */
@Composable
fun ConsentAnnouncements(draft: ConsentDraft) {
    val view = LocalView.current
    DisposableEffect(draft, view) {
        val speak: (String) -> Unit = { if (it.isNotEmpty()) view.announceForAccessibility(it) }
        draft.announcers += speak
        onDispose { draft.announcers -= speak }
    }
}

/**
 * Name a consent surface for TalkBack. A pane title is announced when the surface appears and
 * moves accessibility focus into it, which a custom overlay otherwise does not get.
 *
 * Put it on a node with no `clickable` or `toggleable` ancestor: those merge their descendants,
 * and a pane title cannot be merged. To keep touches from the app behind, use `pointerInput`.
 */
fun Modifier.consentPane(title: String): Modifier = semantics { paneTitle = title }

/**
 * Take keyboard and switch-access focus when the surface opens. Put it on the heading or another
 * element that is not a control: it makes that element focusable. A button or switch already has
 * a focus target, so give it your own `FocusRequester` if focus should start there.
 */
fun Modifier.consentInitialFocus(): Modifier = composed {
    val requester = remember { FocusRequester() }
    OnEnter(requester) { runCatching { requester.requestFocus() } }
    focusRequester(requester).focusable()
}

/**
 * Whether text is large enough that paired actions should stack and move into the scrolling
 * page. The stock screens switch at font scale 1.5.
 */
@Composable
fun consentUsesLargeText(): Boolean = LocalDensity.current.fontScale >= 1.5f

/**
 * Lay paired decisions out at equal width: side by side when every label fits, stacked when one
 * does not or text is large. IAB asks that Accept all and Reject all get the same treatment;
 * this keeps their size equal. It draws nothing.
 */
@Composable
fun ConsentActions(modifier: Modifier = Modifier, spacing: Dp = 12.dp, content: @Composable () -> Unit) {
    val large = consentUsesLargeText()
    Layout(content = content, modifier = modifier.fillMaxWidth()) { children, constraints ->
        val gap = spacing.roundToPx()
        val count = children.size.coerceAtLeast(1)
        val widest = children.maxOfOrNull { it.maxIntrinsicWidth(Constraints.Infinity) } ?: 0
        val row = !large && count * widest + gap * (count - 1) <= constraints.maxWidth
        val width = if (row) (constraints.maxWidth - gap * (count - 1)) / count else constraints.maxWidth
        val measured = children.map { it.measure(Constraints(minWidth = width, maxWidth = width, maxHeight = constraints.maxHeight)) }
        val height = if (row) (measured.maxOfOrNull { it.height } ?: 0) else measured.sumOf { it.height } + gap * (measured.size - 1).coerceAtLeast(0)
        layout(constraints.maxWidth, height) {
            var y = 0
            measured.forEachIndexed { i, child -> child.placeRelative(if (row) i * (width + gap) else 0, y); if (!row) y += child.height + gap }
        }
    }
}
