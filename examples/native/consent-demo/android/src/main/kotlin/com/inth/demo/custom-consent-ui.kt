package com.inth.demo

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.inth.consentui.headless.*
import com.inth.core.ConsentCore

/**
 * A consent UI drawn entirely by the app on the headless blocks in
 * `com.inth.consentui.headless`. Nothing here comes from the stock screens or from Material:
 * the paper-and-ink palette, the serif and monospace type, the ruled ledger rows, the square
 * switch and the motion are this file's. The blocks supply when to show, the copy, the draft,
 * the save and the accessibility.
 */
class LedgerConsentState {
    var preferencesOpen by mutableStateOf(false)
    /** The preferences tab: this app, purposes, partners. */
    var tab by mutableIntStateOf(0)
}

private class Ledger(val paper: Color, val ink: Color, val faint: Color, val rule: Color, val accent: Color, val onAccent: Color) {
    val display = TextStyle(color = ink, fontFamily = FontFamily.Serif, fontStyle = FontStyle.Italic, fontSize = 36.sp, lineHeight = 40.sp)
    val body = TextStyle(color = ink, fontFamily = FontFamily.Serif, fontSize = 17.sp, lineHeight = 25.sp)
    val small = TextStyle(color = faint, fontFamily = FontFamily.Serif, fontSize = 14.sp, lineHeight = 20.sp)
    val label = TextStyle(color = faint, fontFamily = FontFamily.Monospace, fontSize = 11.sp, letterSpacing = 0.16.em)
    val row = TextStyle(color = ink, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Medium, fontSize = 15.sp, lineHeight = 21.sp)
}

private val LocalLedger = staticCompositionLocalOf<Ledger> { error("no ledger") }

@Composable private fun ledger() = if (isSystemInDarkTheme())
    Ledger(Color(0xFF14130F), Color(0xFFF1ECE2), Color(0xFFA39C8D), Color(0xFF3A372F), Color(0xFFFF7A59), Color(0xFF14130F))
else Ledger(Color(0xFFF4EFE6), Color(0xFF1B1A17), Color(0xFF6B655A), Color(0xFFCFC7B8), Color(0xFFC23B1E), Color(0xFFFFFFFF))

// #region docs:android-headless-prompt title="custom-consent-ui.kt"
@Composable
fun LedgerConsent(core: ConsentCore, privacyPolicyUrl: String, state: LedgerConsentState) {
    val draft = rememberConsentDraft(core)
    CompositionLocalProvider(LocalLedger provides ledger()) {
        // The block decides when a prompt is owed. The sheet below is the app's own.
        HeadlessConsentPrompt(draft, onOpenPreferences = { state.preferencesOpen = true }) {
            // The partner count in the IAB text opens the partner list itself, not the first tab.
            if (!state.preferencesOpen) PromptSheet(this, privacyPolicyUrl, openPartners = { state.tab = 2; openPreferences() })
        }
        if (state.preferencesOpen) HeadlessConsentPreferences(draft, onClose = { state.preferencesOpen = false; state.tab = 0 }) {
            PreferencesPage(this, privacyPolicyUrl, state)
        }
    }
}
// #endregion docs:android-headless-prompt

@Composable private fun PromptSheet(prompt: ConsentPromptScope, policyUrl: String, openPartners: () -> Unit) {
    val l = LocalLedger.current
    val draft = prompt.draft
    var shown by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { shown = true }
    // An IAB first layer covers the screen; a category prompt or a notice rises from the bottom edge.
    val full = prompt.iab != null
    Box(Modifier.fillMaxSize().background(l.ink.copy(alpha = if (full) 0f else 0.32f)).blockTouches(), contentAlignment = Alignment.BottomCenter) {
        AnimatedVisibility(shown, enter = slideInVertically(spring(dampingRatio = 0.82f, stiffness = Spring.StiffnessMediumLow)) { it } + fadeIn(tween(180)), exit = slideOutVertically { it }) {
            Column(Modifier.then(if (full) Modifier.fillMaxSize() else Modifier.fillMaxWidth()).background(l.paper).consentPane(prompt.title).testTag("ledger.prompt")) {
                Box(Modifier.fillMaxWidth().height(6.dp).background(l.accent))
                Column(Modifier.weight(1f, fill = full).verticalScroll(rememberScrollState()).then(if (full) Modifier.statusBarsPadding() else Modifier).padding(horizontal = 28.dp).padding(top = 28.dp, bottom = 12.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp)) {
                    prompt.reason?.let { BasicText(it.uppercase(), style = l.label.copy(color = l.accent)) }
                    BasicText(prompt.title, Modifier.semantics { heading() }.consentInitialFocus().testTag("ledger.prompt.title"), style = l.display)
                    BasicText(prompt.description, style = l.body)
                    prompt.detail?.let { BasicText(it, style = l.small) }
                    prompt.iab?.let { IabFirstLayerText(it, openPartners) }
                    Link(prompt.privacyPolicyLabel, policyUrl)
                }
                Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 28.dp).padding(top = 8.dp, bottom = 20.dp).animateContentSize(), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    Failure(draft) { draft.retry() }
                    // Another surface decided meanwhile: the buttons do nothing until the record is read again.
                    if (prompt.isStale) Notice(draft.iabCopy.appSettingsChanged, draft.iabCopy.appSettingsChangedDetail, draft.iabCopy.appLoadCurrentSettings, prompt::reload)
                    if (prompt.isNotice) Stamp(prompt.acknowledgeLabel, draft, ConsentWriteAction.ACKNOWLEDGE, filled = true, tag = "ledger.prompt.acknowledge", onClick = prompt::acknowledge)
                    // A stale vendor list cannot back a grant: say so, keep Reject all, offer a refresh.
                    else if (prompt.listUnavailable) {
                        BasicText(prompt.listOutdated, style = l.small)
                        ConsentActions {
                            Stamp(prompt.rejectAllLabel, draft, ConsentWriteAction.REJECT_ALL, filled = true, tag = "ledger.prompt.reject", onClick = prompt::rejectAll)
                            Stamp(draft.iabCopy.appTryAgain, draft, null, filled = false, tag = "ledger.prompt.refresh", onClick = prompt::refresh)
                        }
                    }
                    // Accept and reject get the same treatment and the same width.
                    else ConsentActions {
                        Stamp(prompt.rejectAllLabel, draft, ConsentWriteAction.REJECT_ALL, filled = true, tag = "ledger.prompt.reject", onClick = prompt::rejectAll)
                        Stamp(prompt.acceptAllLabel, draft, ConsentWriteAction.ACCEPT_ALL, filled = true, tag = "ledger.prompt.accept", onClick = prompt::acceptAll)
                    }
                    TextAction(prompt.customizeLabel, enabled = !draft.isSaving, tag = "ledger.prompt.customize", onClick = prompt::openPreferences)
                }
            }
        }
    }
}

/** Everything the IAB first layer has to say, in the ledger's own setting. */
@Composable private fun IabFirstLayerText(text: IabFirstLayer, openPartners: () -> Unit) {
    val l = LocalLedger.current
    val description = remember(text, l) {
        buildAnnotatedString {
            append(text.description)
            addStyle(SpanStyle(color = l.accent, textDecoration = TextDecoration.Underline), text.partnersLink.first, text.partnersLink.last + 1)
        }
    }
    BasicText(description, Modifier.clickable(onClickLabel = text.partnersLabel, role = Role.Button, onClick = openPartners).testTag("ledger.prompt.partners"), style = l.small.copy(color = l.ink))
    Column(Modifier.fillMaxWidth().border(1.dp, l.rule)) {
        text.summary.forEachIndexed { index, item ->
            Row(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 11.dp), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                BasicText("%02d".format(index + 1), style = l.label.copy(color = l.accent))
                BasicText(item, style = l.row)
            }
            if (index < text.summary.lastIndex) Box(Modifier.fillMaxWidth().height(1.dp).background(l.rule))
        }
    }
    BasicText(text.legitimateInterest, style = l.small)
    BasicText(text.scope, style = l.small)
    BasicText(text.withdraw, style = l.small)
}

// #region docs:android-headless-preferences title="custom-consent-ui.kt"
@Composable private fun PreferencesPage(preferences: ConsentPreferencesScope, policyUrl: String, state: LedgerConsentState) {
    val l = LocalLedger.current
    val draft = preferences.draft
    val iab = preferences.iab
    val tab = state.tab
    Column(Modifier.fillMaxSize().background(l.paper).blockTouches().safeDrawingPadding().consentPane(preferences.title).testTag("ledger.preferences")) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 28.dp, vertical = 18.dp), verticalAlignment = Alignment.CenterVertically) {
            BasicText(preferences.title, Modifier.weight(1f).semantics { heading() }.consentInitialFocus(), style = l.display.copy(fontSize = 28.sp, lineHeight = 32.sp))
            TextAction(draft.iabCopy.appClose, enabled = !draft.isSaving, tag = "ledger.preferences.close", onClick = preferences::requestClose)
        }
        if (iab != null) Tabs(listOf(draft.iabCopy.appThisApp, draft.iabCopy.preferenceCenterVendorListPurposes, draft.iabCopy.appPartners), tab) { state.tab = it }
        Box(Modifier.fillMaxWidth().height(1.dp).background(l.ink))
        AnimatedContent(tab, Modifier.weight(1f), transitionSpec = { fadeIn(tween(160)) togetherWith fadeOut(tween(90)) }, label = "ledger-tab") { current ->
            Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 28.dp, vertical = 20.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                if (draft.isStale) Notice(draft.iabCopy.appSettingsChanged, draft.iabCopy.appSettingsChangedDetail, draft.iabCopy.appLoadCurrentSettings) { draft.reset() }
                if (draft.listUnavailable) Notice(draft.iabCopy.appListOutdated, null, draft.iabCopy.appTryAgain) { draft.refresh() }
                when {
                    iab == null || current == 0 -> {
                        BasicText(preferences.description, Modifier.padding(bottom = 12.dp), style = l.body)
                        // Each row carries its copy, its lock and the binding for its switch.
                        preferences.categories.forEachIndexed { index, row ->
                            LedgerRow("%02d".format(index + 1), row.title, row.description, row.note, row.lockedLabel, if (row.locked) null else row.checked, row.enabled,
                                "ledger.category.${row.category.wireName}", row.onCheckedChange)
                        }
                        preferences.lastChanged?.let { BasicText(it, Modifier.padding(top = 16.dp), style = l.small) }
                        Link(draft.iabCopy.preferenceCenterVendorListPrivacyPolicy, policyUrl)
                    }
                    current == 1 -> IabPurposes(iab)
                    else -> IabPartners(iab)
                }
            }
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(l.ink))
        Column(Modifier.fillMaxWidth().padding(horizontal = 28.dp, vertical = 16.dp).animateContentSize(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            if (preferences.confirmDiscard) {
                BasicText(draft.iabCopy.appDiscardChangesTitle, style = l.row)
                BasicText(draft.iabCopy.appDiscardChangesDetail, style = l.small)
                ConsentActions {
                    Stamp(draft.iabCopy.appKeepEditing, draft, null, filled = false, tag = "ledger.discard.keep", onClick = preferences::keepEditing)
                    Stamp(draft.iabCopy.appDiscardChanges, draft, null, filled = true, tag = "ledger.discard.confirm", onClick = preferences::discard)
                }
            } else {
                Failure(draft, preferences::retry)
                ConsentActions {
                    Stamp(preferences.rejectAllLabel, draft, ConsentWriteAction.REJECT_ALL, filled = false, tag = "ledger.preferences.reject", onClick = preferences::rejectAll)
                    Stamp(preferences.acceptAllLabel, draft, ConsentWriteAction.ACCEPT_ALL, filled = false, tag = "ledger.preferences.accept", onClick = preferences::acceptAll)
                }
                Stamp(preferences.saveLabel, draft, ConsentWriteAction.SAVE, filled = true, accent = true, tag = "ledger.preferences.save", onClick = preferences::save)
            }
        }
    }
}
// #endregion docs:android-headless-preferences

// #region docs:android-headless-iab title="custom-consent-ui.kt"
@Composable private fun IabPurposes(iab: IabDraftHandle) {
    val l = LocalLedger.current
    iab.purposes.forEach { purpose ->
        Expandable("ledger.purpose.${purpose.id}", header = { toggle ->
            LedgerRow("%02d".format(purpose.id), purpose.name, purpose.description, purpose.partnersNote, null, purpose.consent, purpose.enabled,
                "ledger.purpose.${purpose.id}.consent", purpose.onConsentChange, more = toggle)
        }) {
            BasicText(purpose.legalDescription, style = l.small)
            purpose.illustrations.forEach { BasicText("— $it", style = l.small) }
            purpose.legitimateInterest?.let { interest ->
                BasicText(iab.legitimateInterestExplanation, style = l.small)
                LedgerRow("LI", iab.draftCopy.preferenceCenterPurposeItemLegitimateInterest, purpose.rightToObject, null, null, interest, purpose.enabled,
                    "ledger.purpose.${purpose.id}.li", purpose.onLegitimateInterestChange)
            }
        }
    }
    Section(iab.draftCopy.preferenceCenterVendorListSpecialFeatures, iab.specialFeatures.isNotEmpty())
    iab.specialFeatures.forEach { feature ->
        LedgerRow("SF", feature.name, feature.description, iab.draftCopy.appSpecialFeatureOptIn, null, feature.optIn, feature.enabled, "ledger.special-feature.${feature.id}", feature.onOptInChange)
        feature.illustrations.forEach { BasicText("— $it", style = l.small) }
    }
    // Special purposes and features take no choice: their standard text and no switch.
    Section(iab.draftCopy.preferenceCenterVendorListSpecialPurposes, iab.specialPurposes.isNotEmpty())
    iab.specialPurposes.forEach { LedgerRow("SP", it.name, it.description, null, iab.draftCopy.appNoChoice, null, false, "ledger.special-purpose.${it.id}", onChange = {}) }
    if (iab.specialPurposes.isNotEmpty() && iab.specialPurposesExplanation.isNotEmpty()) BasicText(iab.specialPurposesExplanation, style = l.small)
    Section(iab.draftCopy.preferenceCenterFeaturesTitle, iab.features.isNotEmpty())
    iab.features.forEach { feature ->
        LedgerRow("F", feature.name, feature.description, null, iab.draftCopy.appNoChoice, null, false, "ledger.feature.${feature.id}", onChange = {})
        feature.illustrations.forEach { BasicText("— $it", style = l.small) }
    }
    if (iab.features.isNotEmpty()) BasicText(iab.featuresExplanation, style = l.small)
    iab.consentStorage?.let { BasicText(it, Modifier.padding(top = 16.dp), style = l.small) }
}

@Composable private fun IabPartners(iab: IabDraftHandle) {
    val l = LocalLedger.current
    // The handle lists partners in the vendor list's order. People look for a name.
    iab.vendors.sortedBy { it.name.lowercase() }.forEach { vendor -> Partner("ledger.vendor.${vendor.id}", vendor.name, vendor.summary, vendor.statusLabel, vendor.consent, vendor.legitimateInterest, vendor.enabled,
        vendor.onConsentChange, vendor.onLegitimateInterestChange, iab) { vendor.details } }
    // Providers and custom partners are not IAB vendors, so each gets its own section and notice.
    Section(iab.adTechProvidersHeading, iab.adTechProviders.isNotEmpty())
    if (iab.adTechProviders.isNotEmpty()) BasicText(iab.adTechProvidersNotice, style = l.small)
    iab.adTechProviders.forEach { provider ->
        LedgerRow("AC", provider.name, "", null, null, provider.consent, provider.enabled, "ledger.provider.${provider.id}", provider.onConsentChange)
        Link(iab.draftCopy.preferenceCenterVendorListPrivacyPolicy, provider.policyUrl)
    }
    Section(iab.customVendorsHeading, iab.customVendors.isNotEmpty())
    if (iab.customVendors.isNotEmpty()) BasicText(iab.customVendorsNotice, style = l.small)
    iab.customVendors.forEach { vendor -> Partner("ledger.custom-vendor.${vendor.id}", vendor.name, vendor.summary, vendor.statusLabel, vendor.consent, vendor.legitimateInterest, vendor.enabled,
        vendor.onConsentChange, vendor.onLegitimateInterestChange, iab) { vendor.details } }
}

/** One partner: a line in the ledger that opens in place to its switches and everything it discloses. */
@Composable private fun Partner(tag: String, name: String, summary: String, status: String, consent: Boolean?, interest: Boolean?, enabled: Boolean,
    onConsent: (Boolean) -> Unit, onInterest: (Boolean) -> Unit, iab: IabDraftHandle, details: () -> IabVendorDetail) {
    val l = LocalLedger.current
    val copy = iab.draftCopy
    Expandable(tag, header = { toggle -> LedgerRow("→", name, summary, null, status, null, true, "$tag.row", {}, more = toggle) }) {
        // Built when the line opens, and again when the disclosure is read anew.
        val detail = remember(tag, iab.disclosure) { details() }
        detail.privacyPolicyUrl?.let { Link(copy.preferenceCenterVendorListPrivacyPolicy, it) }
        detail.legitimateInterestClaimUrl?.let { Link(copy.appLegitimateInterestStatement, it) }
        consent?.let { LedgerRow("C", copy.appConsent, detail.consentPurposes.joinToString(", "), null, null, it, enabled, "$tag.consent", onConsent) }
        interest?.let {
            LedgerRow("LI", copy.preferenceCenterPurposeItemLegitimateInterest, detail.legitimateInterestPurposes.joinToString(", "), copy.appTurnOffToObject, null, it, enabled, "$tag.li", onInterest)
            BasicText(iab.legitimateInterestExplanation, style = l.small)
        }
        if (detail.notAllowedPurposes.isNotEmpty()) BasicText(copy.format(copy.appNotAllowedPurposes, mapOf("purposes" to detail.notAllowedPurposes.joinToString(", "))), style = l.small)
        Facts(copy.preferenceCenterVendorListSpecialPurposes, detail.specialPurposes.map { IabFact(it, copy.appNoChoice) })
        // Wherever features appear they carry their standard text and illustrations, and no switch.
        if (detail.features.isNotEmpty()) BasicText(copy.preferenceCenterFeaturesTitle.uppercase(), Modifier.padding(top = 10.dp), style = l.label)
        detail.features.forEach { feature ->
            LedgerRow("F", feature.name, feature.description, null, copy.appNoChoice, null, false, "$tag.feature.${feature.id}", onChange = {})
            feature.illustrations.forEach { BasicText("\u2014 $it", style = l.small) }
        }
        if (detail.features.isNotEmpty()) BasicText(iab.featuresExplanation, Modifier.testTag("$tag.features-standard-text"), style = l.small)
        Facts(copy.preferenceCenterVendorListSpecialFeatures, detail.specialFeatures)
        Facts(copy.appDataCollected, detail.dataCategories.map { IabFact(it, null) })
        Facts(copy.appRetentionTitle, detail.retention)
        Facts(copy.appDeviceStorage, detail.storage)
        detail.deviceStorageDisclosureUrl?.let { Link(copy.appDeviceStorageDetails, it) }
    }
}
// #endregion docs:android-headless-iab

private val IabDraftHandle.draftCopy get() = draft.iabCopy

@Composable private fun Facts(title: String, facts: List<IabFact>) {
    if (facts.isEmpty()) return
    val l = LocalLedger.current
    BasicText(title.uppercase(), Modifier.padding(top = 10.dp), style = l.label)
    facts.forEach { fact ->
        Row(Modifier.fillMaxWidth().padding(vertical = 3.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            BasicText(fact.label, Modifier.weight(1f), style = l.small.copy(color = l.ink))
            fact.value?.let { BasicText(it, style = l.small) }
        }
    }
}

@Composable private fun Section(title: String, shown: Boolean) {
    if (!shown) return
    val l = LocalLedger.current
    BasicText(title.uppercase(), Modifier.padding(top = 28.dp, bottom = 6.dp).semantics { heading() }, style = l.label.copy(color = l.accent))
}

@Composable private fun Tabs(titles: List<String>, selected: Int, select: (Int) -> Unit) {
    val l = LocalLedger.current
    Row(Modifier.fillMaxWidth().padding(horizontal = 28.dp), horizontalArrangement = Arrangement.spacedBy(20.dp)) {
        titles.forEachIndexed { index, title ->
            Column(Modifier.clickable(role = Role.Tab) { select(index) }.semantics { stateDescription = if (index == selected) "●" else "" }.testTag("ledger.tab.$index").padding(vertical = 10.dp)) {
                BasicText(title.uppercase(), style = l.label.copy(color = if (index == selected) l.ink else l.faint))
                Box(Modifier.padding(top = 6.dp).width(24.dp).height(3.dp).background(if (index == selected) l.accent else Color.Transparent))
            }
        }
    }
}

/** Keep touches from reaching the app behind a consent surface. Not `clickable`: that would merge the pane's semantics into one node. */
private fun Modifier.blockTouches() = pointerInput(Unit) { detectTapGestures { } }

/** A ruled line of the ledger: an index, a title and text, and at the trailing edge a square switch or a state. */
@Composable private fun LedgerRow(index: String, title: String, description: String, note: String?, state: String?, checked: Boolean?, enabled: Boolean, tag: String,
    onChange: (Boolean) -> Unit, more: (() -> Unit)? = null) {
    val l = LocalLedger.current
    val base = Modifier.fillMaxWidth().testTag(tag)
    val interactive = when {
        checked != null -> base.toggleable(checked, enabled = enabled, role = Role.Switch, onValueChange = onChange)
        more != null -> base.clickable(role = Role.Button, onClick = more)
        else -> base
    }
    Column {
        Row(interactive.padding(vertical = 14.dp).alpha(if (enabled || checked == null) 1f else 0.5f), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            BasicText(index, Modifier.width(26.dp).padding(top = 3.dp), style = l.label.copy(color = l.accent))
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                BasicText(title, style = l.row)
                if (description.isNotEmpty()) BasicText(description, style = l.small)
                note?.let { BasicText(it, style = l.small.copy(fontStyle = FontStyle.Italic)) }
                if (checked != null && more != null) TextAction("+", enabled = true, tag = "$tag.more", onClick = more)
            }
            if (checked != null) SquareSwitch(checked)
            else state?.let { BasicText(it.uppercase(), Modifier.padding(top = 3.dp), style = l.label) }
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(l.rule))
    }
}

/** The ledger's own switch: a square block that springs across a ruled slot. */
@Composable private fun SquareSwitch(checked: Boolean) {
    val l = LocalLedger.current
    val offset by animateDpAsState(if (checked) 24.dp else 0.dp, spring(dampingRatio = 0.6f, stiffness = Spring.StiffnessMedium), label = "ledger-switch")
    Box(Modifier.padding(top = 2.dp).size(width = 48.dp, height = 24.dp).border(1.5.dp, if (checked) l.accent else l.ink)) {
        Box(Modifier.offset(x = offset).size(24.dp).padding(4.dp).background(if (checked) l.accent else l.ink))
    }
}

@Composable private fun Expandable(tag: String, header: @Composable (toggle: () -> Unit) -> Unit, content: @Composable ColumnScope.() -> Unit) {
    var open by rememberSaveable(tag) { mutableStateOf(false) }
    Column(Modifier.fillMaxWidth().animateContentSize(spring(dampingRatio = 0.9f, stiffness = Spring.StiffnessMediumLow)).testTag(tag)) {
        header { open = !open }
        if (open) Column(Modifier.padding(start = 40.dp, top = 8.dp, bottom = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp), content = content)
    }
}

/** A decision. Filled ones are ink on paper inverted, so Accept and Reject read the same; the accent is Save alone. */
@Composable private fun Stamp(text: String, draft: ConsentDraft, action: ConsentWriteAction?, filled: Boolean, tag: String, accent: Boolean = false, onClick: () -> Unit) {
    val l = LocalLedger.current
    val busy = action != null && draft.showProgress && draft.savingAction == action
    val fill = if (accent) l.accent else if (filled) l.ink else Color.Transparent
    val content = if (accent) l.onAccent else if (filled) l.paper else l.ink
    Box(Modifier.fillMaxWidth().defaultMinSize(minHeight = 52.dp).background(fill).border(1.5.dp, if (accent) l.accent else l.ink)
        .clickable(enabled = !draft.isSaving, role = Role.Button, onClick = onClick).semantics { if (busy) stateDescription = draft.copy.saving }
        .alpha(if (draft.isSaving && !busy) 0.5f else 1f).testTag(tag).padding(horizontal = 12.dp, vertical = 14.dp), contentAlignment = Alignment.Center) {
        BasicText(if (busy) "… $text" else text, style = l.row.copy(color = content))
    }
}

@Composable private fun TextAction(text: String, enabled: Boolean, tag: String, onClick: () -> Unit) {
    val l = LocalLedger.current
    BasicText(text, Modifier.defaultMinSize(minHeight = 48.dp).clickable(enabled = enabled, role = Role.Button, onClick = onClick).testTag(tag).padding(vertical = 14.dp),
        style = l.row.copy(textDecoration = TextDecoration.Underline, color = if (enabled) l.ink else l.faint))
}

@Composable private fun Link(text: String, url: String) {
    val context = LocalContext.current
    val l = LocalLedger.current
    BasicText(text, Modifier.defaultMinSize(minHeight = 48.dp).clickable(role = Role.Button) { open(context, url) }.padding(vertical = 14.dp),
        style = l.small.copy(color = l.accent, textDecoration = TextDecoration.Underline))
}

private fun open(context: Context, url: String) {
    val uri = Uri.parse(url)
    if (uri.scheme == "https" || uri.scheme == "http") runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, uri)) }
}

/** A refused save: the message, and the same action again. The block already told TalkBack. */
@Composable private fun Failure(draft: ConsentDraft, retry: () -> Unit) {
    val message = draft.errorMessage ?: return
    // A stale draft and an outdated vendor list have their own notices: sending the same save again cannot help.
    if (draft.isStale || draft.listUnavailable) return
    val l = LocalLedger.current
    Row(Modifier.fillMaxWidth().testTag("ledger.error"), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        BasicText(message, Modifier.weight(1f), style = l.small.copy(color = l.accent))
        TextAction(draft.iabCopy.appTryAgain, enabled = !draft.isSaving, tag = "ledger.error.retry", onClick = retry)
    }
}

@Composable private fun Notice(title: String, detail: String?, action: String, onClick: () -> Unit) {
    val l = LocalLedger.current
    Column(Modifier.fillMaxWidth().padding(bottom = 12.dp).border(1.5.dp, l.accent).padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        BasicText(title, Modifier.semantics { heading() }, style = l.row)
        detail?.let { BasicText(it, style = l.small) }
        TextAction(action, enabled = true, tag = "ledger.notice.action", onClick = onClick)
    }
}
