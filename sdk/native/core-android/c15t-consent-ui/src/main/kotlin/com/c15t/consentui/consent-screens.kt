@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class, androidx.compose.ui.ExperimentalComposeUiApi::class)
package com.c15t.consentui

import android.content.Intent
import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.*
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.platform.*
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.*
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.window.DialogWindowProvider
import androidx.core.view.WindowCompat
import com.c15t.core.iab.*
import com.c15t.core.model.*
import com.c15t.core.tc.*
import java.text.Collator
import java.text.Normalizer
import java.util.Locale

private val LightColors = lightColorScheme(primary = Color(0xFF335CFF), onPrimary = Color.White,
    surface = Color(0xFFF2F3F7), surfaceContainerLow = Color.White, surfaceContainerHigh = Color.White,
    onSurface = Color(0xFF14161F), onSurfaceVariant = Color(0xFF525768), outline = Color(0xFF8A8FA3),
    error = Color(0xFFB42318), errorContainer = Color(0xFFFDEDEB), onErrorContainer = Color(0xFFB42318))
private val DarkColors = darkColorScheme(primary = Color(0xFF8CA2FF), onPrimary = Color(0xFF0A1033),
    surface = Color(0xFF111216), surfaceContainerLow = Color(0xFF1C1D22), surfaceContainerHigh = Color(0xFF23252B),
    onSurface = Color(0xFFF2F3F7), onSurfaceVariant = Color(0xFFA9AEBF), outline = Color(0xFF6B7083),
    error = Color(0xFFFF9C8F), errorContainer = Color(0xFF3A1D1A), onErrorContainer = Color(0xFFFF9C8F))

/** Native optional presenter. Put it beside the app's content and retain [presenter] in a ViewModelStore.
 * [privacyPolicyUrl] must point to the host's privacy policy. Links open the system browser.
 */
@Composable
fun C15tConsent(presenter: ConsentPresenter, privacyPolicyUrl: String) {
    val hostView = LocalView.current
    LaunchedEffect(presenter.announcementSequence) {
        if (presenter.announcementSequence > 0) hostView.announceForAccessibility(presenter.announcement)
    }
    MaterialTheme(colorScheme = if (isSystemInDarkTheme()) DarkColors else LightColors) {
        if (presenter.noticeVisible) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.BottomCenter) {
                Surface(Modifier.padding(12.dp).semantics { testTagsAsResourceId = true }.testTag("c15t.notice"), shape = RoundedCornerShape(24.dp), tonalElevation = 3.dp) {
                    Column(Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Heading("Your privacy choices", "c15t.notice.title")
                        Text("You can change how this app uses your data in Privacy settings.")
                        EqualDecisions {
                            ActionButton("Got it", "c15t.notice.acknowledge", !presenter.pending) { presenter.commit(ConsentPresenter.Action.ACKNOWLEDGE) }
                            ActionButton("Privacy settings", "c15t.notice.settings", !presenter.pending, false) { presenter.presentPreferences() }
                        }
                        PolicyLink(privacyPolicyUrl)
                        presenter.errorMessage?.let { ErrorCallout(it, "c15t.notice.error", presenter::retry) }
                    }
                }
            }
        }
        if (presenter.presentationID != null) {
            var page by rememberSaveable(presenter.presentationID) { mutableStateOf("root") }
            var purposeFilter by rememberSaveable(presenter.presentationID) { mutableStateOf<Int?>(null) }
            fun back() {
                if (presenter.pending) return
                when { page.startsWith("vendor:") -> page = "vendors"; page != "root" -> page = "root"
                    presenter.preferences -> presenter.requestClose(); else -> presenter.backFromFirstLayer() }
            }
            Dialog(onDismissRequest = ::back, properties = DialogProperties(usePlatformDefaultWidth = false,
                decorFitsSystemWindows = false, dismissOnClickOutside = false, dismissOnBackPress = true)) {
                val window = (LocalView.current.parent as? DialogWindowProvider)?.window
                val dark = isSystemInDarkTheme()
                SideEffect {
                    window?.let {
                        WindowCompat.getInsetsController(it, it.decorView).apply {
                            isAppearanceLightStatusBars = !dark
                            isAppearanceLightNavigationBars = !dark
                        }
                    }
                }
                BackHandler { back() }
                Box(Modifier.fillMaxSize().semantics { testTagsAsResourceId = true; paneTitle = if (presenter.preferences) "Privacy settings" else "Choose how this app uses your data" }, contentAlignment = Alignment.BottomCenter) {
                    if (presenter.preferences || presenter.iab || page != "root") {
                        Scaffold(modifier = Modifier.fillMaxSize().imePadding(), containerColor = MaterialTheme.colorScheme.surface,
                            topBar = { TopAppBar(title = { Heading(when { page == "vendors" -> "IAB partners"; page == "providers" -> "Other ad partners"; page.startsWith("vendor:") -> presenter.disclosure?.list?.vendors?.get(page.substringAfter(':').toInt())?.name ?: "Partner"; else -> "Privacy settings" }, "c15t.prefs.title") }, navigationIcon = {
                                IconButton(onClick = ::back, enabled = !presenter.pending, modifier = Modifier.testTag(if (page == "root") "c15t.prefs.cancel" else if (page.startsWith("vendor:")) "c15t.iab.vendor.back" else if (page == "providers") "c15t.ac.back" else "c15t.iab.vendors.back")) {
                                    Icon(if (page == "root") Icons.Outlined.Close else Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = if (page == "root") "Close" else "Back")
                                }
                            }) },
                            bottomBar = { if (page == "root" && !presenter.snapshot.policyPending) DecisionFooter(presenter, first = !presenter.preferences) },
                        ) { padding ->
                            Box(Modifier.padding(padding)) {
                                when {
                                    page == "vendors" -> Vendors(presenter, purposeFilter, { purposeFilter = null }, { page = "vendor:$it" })
                                    page.startsWith("vendor:") -> Vendor(presenter, page.substringAfter(':').toInt())
                                    page == "providers" -> Providers(presenter)
                                    !presenter.preferences -> FirstLayer(presenter, privacyPolicyUrl) { presenter.customize(); page = "vendors" }
                                    else -> Preferences(presenter, privacyPolicyUrl, { purpose -> purposeFilter = purpose; page = "vendors" }, { page = "providers" })
                                }
                            }
                        }
                    } else {
                        BoxWithConstraints(Modifier.fillMaxWidth().widthIn(max = 640.dp).navigationBarsPadding()) {
                            Surface(shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp), color = MaterialTheme.colorScheme.surfaceContainerLow) {
                                Column(Modifier.heightIn(max = maxHeight * .95f).fillMaxWidth()) {
                                    Box(Modifier.weight(1f, fill = false)) { FirstLayer(presenter, privacyPolicyUrl) { presenter.customize(); page = "vendors" } }
                                    DecisionFooter(presenter, first = true)
                                }
                            }
                        }
                    }
                }
                if (presenter.confirmDiscard) AlertDialog(onDismissRequest = { presenter.confirmDiscard = false },
                    modifier = Modifier.testTag("c15t.prefs.discard"), title = { Text("Discard changes?") }, text = { Text("Your changes won't be saved.") },
                    confirmButton = { TextButton(onClick = { presenter.discard() }, modifier = Modifier.testTag("c15t.prefs.discard.confirm")) { Text("Discard") } },
                    dismissButton = { TextButton(onClick = { presenter.confirmDiscard = false }, modifier = Modifier.testTag("c15t.prefs.discard.keep")) { Text("Keep editing") } })
            }
        }
    }
}

@Composable private fun Heading(text: String, id: String) { Text(text, style = MaterialTheme.typography.titleLarge, modifier = Modifier.semantics { heading() }.testTag(id)) }
@Composable private fun Body(text: String) { Text(text, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
@Composable private fun SectionTitle(text: String) { Text(text, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(vertical = 16.dp).semantics { heading() }) }
@Composable private fun PolicyLink(url: String) = ExternalLink("Privacy policy", url, "c15t.privacy-policy")
@Composable private fun ExternalLink(text: String, url: String, id: String) {
    val context = LocalContext.current
    TextButton(onClick = { val uri = Uri.parse(url); if (uri.scheme in listOf("https", "http")) context.startActivity(Intent(Intent.ACTION_VIEW, uri)) }, modifier = Modifier.defaultMinSize(minHeight = 48.dp).testTag(id)) { Text(text) }
}
@Composable private fun ActionButton(text: String, id: String, enabled: Boolean, filled: Boolean = true, onClick: () -> Unit) {
    val modifier = Modifier.fillMaxWidth().defaultMinSize(minHeight = 48.dp).testTag(id)
    if (filled) Button(onClick, modifier, enabled = enabled) { Text(text) }
    else OutlinedButton(onClick, modifier, enabled = enabled) { Text(text, color = MaterialTheme.colorScheme.onSurface) }
}
@Composable private fun EqualDecisions(content: @Composable () -> Unit) {
    val density = LocalDensity.current
    Layout(content = content, modifier = Modifier.fillMaxWidth()) { children, constraints ->
        val gap = 12.dp.roundToPx()
        val max = children.maxOfOrNull { it.maxIntrinsicWidth(Constraints.Infinity) } ?: 0
        val row = 2 * max + gap <= constraints.maxWidth && density.fontScale < 1.5f
        val width = if (row) (constraints.maxWidth - gap) / 2 else constraints.maxWidth
        val measured = children.map { it.measure(Constraints(minWidth = width, maxWidth = width, maxHeight = constraints.maxHeight)) }
        val height = if (row) measured.maxOf { it.height } else measured.sumOf { it.height } + gap
        layout(constraints.maxWidth, height) {
            var y = 0
            measured.forEachIndexed { i, child -> child.placeRelative(if (row) i * (width + gap) else 0, y); if (!row) y += child.height + gap }
        }
    }
}
@Composable private fun ErrorCallout(message: String, id: String, retry: () -> Unit) {
    Surface(color = MaterialTheme.colorScheme.errorContainer, shape = RoundedCornerShape(12.dp), modifier = Modifier.fillMaxWidth().semantics { liveRegion = LiveRegionMode.Assertive }.testTag(id)) {
        Column(Modifier.padding(12.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { Icon(Icons.Outlined.Info, contentDescription = null, tint = MaterialTheme.colorScheme.error); Text(message, color = MaterialTheme.colorScheme.error) }
            TextButton(onClick = retry, modifier = Modifier.testTag("$id.retry")) { Text("Try again", color = MaterialTheme.colorScheme.error) }
        }
    }
}
@Composable private fun DecisionFooter(p: ConsentPresenter, first: Boolean) {
    val prefix = if (first) "c15t.first-layer" else if (p.iab) "c15t.iab" else "c15t.prefs"
    Surface(color = MaterialTheme.colorScheme.surfaceContainerLow, tonalElevation = 3.dp) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(horizontal = 24.dp, vertical = 12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            if (p.stale) ActionButton("Load current settings", "c15t.prefs.stale.reload", !p.pending) { p.loadDraft() }
            else {
                p.errorMessage?.let { ErrorCallout(it, (if (first) "c15t.first-layer" else "c15t.prefs") + ".error", p::retry) }
                if (p.listUnavailable) {
                    Text("Our partner list is out of date. Try again to load it, or reject optional data use.", modifier = Modifier.testTag(if (first) "c15t.first-layer.list-stale" else "c15t.iab.list-stale"))
                    EqualDecisions {
                        ActionButton("Reject all", "$prefix.reject-all", !p.pending, first) { p.commit(ConsentPresenter.Action.REJECT) }
                        ActionButton("Try again", "$prefix.retry", !p.pending, first) { p.refresh() }
                    }
                } else {
                    EqualDecisions {
                        ActionButton("Reject all", "$prefix.reject-all", !p.pending, first) { p.commit(ConsentPresenter.Action.REJECT) }
                        ActionButton("Accept all", "$prefix.accept-all", !p.pending, first) { p.commit(ConsentPresenter.Action.ACCEPT) }
                    }
                    if (first) {
                        ActionButton("Customize", "c15t.first-layer.customize", !p.pending, false) { p.customize() }
                        Text("Secured by c15t", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.align(Alignment.CenterHorizontally).testTag("c15t.first-layer.branding"))
                    } else ActionButton("Save choices", "$prefix.save", !p.pending) { p.commit(ConsentPresenter.Action.SAVE) }
                }
                if (p.showProgress) CircularProgressIndicator(Modifier.size(20.dp).testTag("c15t.status.progress"))
            }
        }
    }
}
@Composable private fun FirstLayer(p: ConsentPresenter, policyUrl: String, partners: () -> Unit) {
    Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(24.dp).testTag("c15t.first-layer"), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        when (p.snapshot.promptRequirement.reason?.wireName) {
            "expired" -> Text("Your earlier choice has expired, so we're asking again.", modifier = Modifier.testTag("c15t.first-layer.reason"))
            "policy-changed" -> Text("How this app uses data has changed since your last choice, so we're asking again.", modifier = Modifier.testTag("c15t.first-layer.reason"))
        }
        Heading("Choose how this app uses your data", "c15t.first-layer.title")
        if (p.iab) IabIntro(p, true, partners) else Text("We use data to improve your experience, measure how the app is used and show relevant advertising. You choose which uses to allow. You can change your choice at any time in Privacy settings.", color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.testTag("c15t.first-layer.body"))
        p.disclosure?.list?.purposes?.toSortedMap()?.forEach { (id, item) -> Text(item.name.orEmpty(), style = MaterialTheme.typography.bodyMedium, modifier = Modifier.testTag("c15t.first-layer.purpose.$id")); HorizontalDivider() }
        p.disclosure?.list?.specialFeatures?.toSortedMap()?.forEach { (id, item) -> Text(item.name.orEmpty(), modifier = Modifier.testTag("c15t.first-layer.special-feature.$id")) }
        PolicyLink(policyUrl)
    }
}
@Composable private fun IabIntro(p: ConsentPresenter, first: Boolean, partners: () -> Unit) {
    Text("We and our partners store and access information on your device and process personal data for the purposes below. Some partners rely on legitimate interest instead of consent. You can object to that and change your choices at any time in Privacy settings.", color = MaterialTheme.colorScheme.onSurfaceVariant)
    TextButton(onClick = partners, modifier = Modifier.testTag(if (first) "c15t.first-layer.partner-count" else "c15t.iab.partner-count")) { Text("${p.disclosure?.vendors?.size ?: 0} IAB partners") }
}
@Composable private fun ChoiceRow(title: String, description: String, value: Boolean, id: String, enabled: Boolean = true, onChange: (Boolean) -> Unit) {
    val large = LocalDensity.current.fontScale >= 1.5f
    val modifier = Modifier.fillMaxWidth().defaultMinSize(minHeight = 64.dp).toggleable(value, enabled = enabled, role = Role.Switch, onValueChange = onChange).testTag(id).padding(vertical = 12.dp)
    val label: @Composable () -> Unit = { Column(verticalArrangement = Arrangement.spacedBy(8.dp)) { Text(title, style = MaterialTheme.typography.titleMedium); if (description.isNotEmpty()) Body(description) } }
    if (large) Column(modifier) { label(); Switch(value, null, enabled = enabled) }
    else Row(modifier, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) { Box(Modifier.weight(1f)) { label() }; Switch(value, null, enabled = enabled) }
}
@Composable private fun Category(p: ConsentPresenter, c: ConsentCategory) {
    val title = if (c == ConsentCategory.NECESSARY) "Strictly necessary" else c.wireName.replaceFirstChar { it.titlecase() }
    val description = when(c) { ConsentCategory.NECESSARY -> "Required for the app to work."; ConsentCategory.FUNCTIONALITY -> "Remember your settings and choices."; ConsentCategory.EXPERIENCE -> "Adapt the app to how you use it."; ConsentCategory.MEASUREMENT -> "Help us understand how the app is used."; ConsentCategory.MARKETING -> "Show advertising relevant to you." }
    if (c.optional && !p.restricted(c)) ChoiceRow(title, description, p.categories[c] == true, "c15t.prefs.category.${c.wireName}.switch", !p.pending && !p.stale && !p.listUnavailable) { p.setCategory(c, it) }
    else Column(Modifier.fillMaxWidth().padding(vertical = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(title, style = MaterialTheme.typography.titleMedium); Body(description)
        Text(if (c.optional) "Off" else "Always on", modifier = Modifier.testTag("c15t.prefs.category.${c.wireName}.locked"))
        if (c.optional) Text(if ("gpc" in p.snapshot.restrictions[c.wireName].orEmpty()) "Off because your device sends a Global Privacy Control signal." else "Not offered where you are.", style = MaterialTheme.typography.bodySmall, modifier = Modifier.testTag("c15t.prefs.category.${c.wireName}.restricted"))
    }
    HorizontalDivider()
}
@Composable private fun Preferences(p: ConsentPresenter, policyUrl: String, partners: (Int?) -> Unit, providers: () -> Unit) {
    LazyColumn(Modifier.fillMaxSize().testTag(if (p.iab) "c15t.iab" else "c15t.prefs"), contentPadding = PaddingValues(24.dp)) {
        if (p.snapshot.policyPending) {
            item { Column(Modifier.testTag("c15t.status.unavailable")) { Text("Privacy settings aren't available yet. Connect to the internet and try again."); TextButton(onClick = p::refresh, modifier = Modifier.testTag("c15t.status.unavailable.retry")) { Text("Try again") } } }
        } else {
            if (p.stale) item { Column(Modifier.testTag("c15t.prefs.stale")) { Heading("Settings changed while you were editing", "c15t.prefs.stale.title"); Body("Your choices weren't saved. Load the current settings, then choose again.") } }
            item { if (p.iab) IabIntro(p, false, { partners(null) }) else Body("Choose which kinds of data use you allow. Changes apply on this device as soon as you save."); SectionTitle(if (p.iab) "This app" else "Data use") }
            items(p.offeredCategories, key = { "category-${it.wireName}" }) { Category(p, it) }
            p.disclosure?.let { d ->
                item { SectionTitle("Purposes") }
                items(d.list.purposes.toSortedMap().entries.toList(), key = { "purpose-${it.key}" }) { (id, item) -> Purpose(p, id, item, { partners(id) }) }
                item { SectionTitle("Special features") }
                items(d.list.specialFeatures.orEmpty().toSortedMap().entries.toList(), key = { "special-${it.key}" }) { (id, item) -> ChoiceRow(item.name.orEmpty(), item.description.orEmpty() + " Partners only do this if you turn it on.", id in p.choices.specialFeatureOptIns, "c15t.iab.special-feature.$id.switch", !p.pending && !p.stale && !p.listUnavailable) { on -> p.edit { it.copy(specialFeatureOptIns = it.specialFeatureOptIns.select(id, on)) } } }
                item { SectionTitle("Special purposes") }
                items(d.list.specialPurposes.orEmpty().toSortedMap().entries.toList(), key = { "sp-${it.key}" }) { (id,item) -> Definition(item, "c15t.iab.special-purpose.$id") }
                item { Body(d.list.standardTexts?.specialPurposes.orEmpty()); SectionTitle("Features") }
                items(d.list.features.orEmpty().toSortedMap().entries.toList(), key = { "feature-${it.key}" }) { (id,item) -> Definition(item, "c15t.iab.feature.$id") }
                item { Text(d.list.standardTexts?.features.orEmpty(), style = MaterialTheme.typography.bodySmall, modifier = Modifier.testTag("c15t.iab.features-standard-text")) }
                item { TextButton(onClick = { partners(null) }, modifier = Modifier.fillMaxWidth().testTag("c15t.iab.partners")) { Text("IAB partners · ${d.vendors.size}") } }
                if (!d.adTechProviders.isNullOrEmpty()) item { TextButton(onClick = providers, modifier = Modifier.fillMaxWidth().testTag("c15t.iab.other-partners")) { Text("Other ad partners · ${d.adTechProviders.orEmpty().size}") } }
            }
            item { PolicyLink(policyUrl); p.snapshot.explicitChoice?.let { Text("Last changed ${java.text.DateFormat.getDateInstance().format(java.util.Date(it.actionAt))}", style = MaterialTheme.typography.bodySmall, modifier = Modifier.testTag("c15t.prefs.last-changed")) } }
        }
    }
}
@Composable private fun Definition(item: GvlLocalizedEntry, id: String) { Column(Modifier.fillMaxWidth().padding(vertical = 16.dp).testTag(id), verticalArrangement = Arrangement.spacedBy(8.dp)) { Text(item.name.orEmpty(), style = MaterialTheme.typography.titleMedium); Body("No choice"); Body(item.description.orEmpty()) } }
@Composable private fun Purpose(p: ConsentPresenter, id: Int, item: GvlLocalizedEntry, partners: () -> Unit) {
    var expanded by rememberSaveable { mutableStateOf(false) }
    val li = p.disclosure?.vendors?.values?.any { id in it.legitimateInterestPurposes } == true
    Column(Modifier.fillMaxWidth().testTag("c15t.iab.purpose.$id")) {
        ChoiceRow(item.name.orEmpty(), item.description.orEmpty(), id in p.choices.purposeConsents, "c15t.iab.purpose.$id.consent", !p.pending && !p.stale && !p.listUnavailable) { on -> p.edit { it.copy(purposeConsents = it.purposeConsents.select(id, on)) } }
        Body(if (li) "Asks for consent · Some partners use legitimate interest" else "Asks for consent")
        TextButton(onClick = { expanded = !expanded }, modifier = Modifier.testTag("c15t.iab.purpose.$id.details").semantics { stateDescription = if (expanded) "Expanded" else "Collapsed" }) { Text(if (expanded) "Hide details" else "Details") }
        if (expanded) {
            Body(item.descriptionLegal.orEmpty()); item.illustrations.orEmpty().forEach { Body("• $it") }
            Body("Asks for consent: ${p.disclosure?.vendors?.values?.count { id in it.consentPurposes }} partners. Legitimate interest: ${p.disclosure?.vendors?.values?.count { id in it.legitimateInterestPurposes }} partners.")
            TextButton(onClick = partners, modifier = Modifier.testTag("c15t.iab.purpose.$id.view-partners")) { Text("View partners") }
            if (li) ChoiceRow("Legitimate interest", "Some partners claim this legal basis. Turn off to object.", id in p.choices.purposeLegitimateInterests, "c15t.iab.purpose.$id.li", !p.pending && !p.stale && !p.listUnavailable) { on -> p.edit { it.copy(purposeLegitimateInterests = it.purposeLegitimateInterests.select(id,on), purposeObjections = it.purposeObjections.select(id,!on)) } }
        }
        HorizontalDivider()
    }
}
private fun String.searchKey() = Normalizer.normalize(this, Normalizer.Form.NFD).replace("\\p{M}+".toRegex(), "").lowercase(Locale.ROOT)
@Composable private fun Vendors(p: ConsentPresenter, purpose: Int?, clear: () -> Unit, open: (Int) -> Unit) {
    var search by rememberSaveable { mutableStateOf("") }
    val collator = remember { Collator.getInstance() }
    val vendors = p.disclosure?.list?.vendors.orEmpty().entries.filter { (id,v) -> id in p.disclosure!!.vendors && v.name.orEmpty().searchKey().contains(search.searchKey()) && (purpose == null || purpose in p.disclosure!!.vendors[id]!!.consentPurposes || purpose in p.disclosure!!.vendors[id]!!.legitimateInterestPurposes) }.sortedWith { a,b -> collator.compare(a.value.name, b.value.name) }
    Column(Modifier.fillMaxSize().padding(horizontal = 24.dp).testTag("c15t.iab.vendors")) {
        OutlinedTextField(search, { search = it }, label = { Text("Search partners") }, modifier = Modifier.fillMaxWidth().testTag("c15t.iab.vendors.search"), singleLine = true)
        if (purpose != null) TextButton(onClick = clear, modifier = Modifier.testTag("c15t.iab.vendors.filter.purpose.clear")) { Text("Purpose: ${p.disclosure?.list?.purposes?.get(purpose)?.name} ×") }
        LazyColumn {
            if (vendors.isEmpty()) item { Text("No partners match \"$search\".", modifier = Modifier.padding(vertical = 24.dp).testTag("c15t.iab.vendors.empty")) }
            items(vendors, key = { it.key }) { (id, v) ->
                val d = p.disclosure!!.vendors[id]!!
                Column(Modifier.fillMaxWidth().clickable { open(id) }.padding(vertical = 16.dp).testTag("c15t.iab.vendors.vendor.$id"), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(v.name.orEmpty(), style = MaterialTheme.typography.titleMedium); Body("${d.consentPurposes.size} purposes · ${d.legitimateInterestPurposes.size} on legitimate interest")
                    Text(p.partnerStatus(id), style = MaterialTheme.typography.bodySmall, modifier = Modifier.testTag("c15t.iab.vendors.vendor.$id.status"))
                }; HorizontalDivider()
            }
        }
    }
}
@Composable private fun Vendor(p: ConsentPresenter, id: Int) {
    val d = p.disclosure ?: return
    val v = d.list.vendors[id] ?: return
    val projection = d.vendors[id] ?: return
    fun names(ids: List<Int>) = ids.mapNotNull { d.list.purposes[it]?.name }.joinToString(", ")
    val locale = Locale.getDefault().language
    val urls = v.urls.orEmpty().firstOrNull { it.langId == locale } ?: v.urls.orEmpty().firstOrNull { it.langId == "en" } ?: v.urls?.firstOrNull()
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp).testTag("c15t.iab.vendor.$id"), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        urls?.privacy?.let { ExternalLink("Privacy policy", it, "c15t.iab.vendor.$id.privacy-link") }
        urls?.legIntClaim?.let { ExternalLink("Legitimate interest statement", it, "c15t.iab.vendor.$id.li-claim-link") }
        SectionTitle("Your choices")
        if (projection.consentPurposes.isNotEmpty()) ChoiceRow("Consent", "For: " + names(projection.consentPurposes), id in p.choices.vendorConsents, "c15t.iab.vendor.$id.consent", !p.pending && !p.stale && !p.listUnavailable) { on -> p.edit { it.copy(vendorConsents = it.vendorConsents.select(id,on)) } }
        if (projection.legitimateInterestPurposes.isNotEmpty()) ChoiceRow("Legitimate interest", "For: " + names(projection.legitimateInterestPurposes) + ". Turn off to object.", id in p.choices.vendorLegitimateInterests, "c15t.iab.vendor.$id.li", !p.pending && !p.stale && !p.listUnavailable) { on -> p.edit { it.copy(vendorLegitimateInterests = it.vendorLegitimateInterests.select(id,on), vendorObjections = it.vendorObjections.select(id,!on)) } }
        if (projection.notAllowedPurposes.isNotEmpty()) Text("This app doesn't allow this partner to: " + names(projection.notAllowedPurposes), modifier = Modifier.testTag("c15t.iab.vendor.$id.not-allowed"))
        SectionTitle("Special purposes"); v.specialPurposes.orEmpty().forEach { Body(d.list.specialPurposes?.get(it.toInt())?.name.orEmpty() + ". No choice.") }
        SectionTitle("Features"); v.features.orEmpty().forEach { Body(d.list.features?.get(it.toInt())?.name.orEmpty() + ". No choice.") }
        SectionTitle("Special features"); v.specialFeatures.orEmpty().forEach { Body(d.list.specialFeatures?.get(it.toInt())?.name.orEmpty() + if (it.toInt() in p.choices.specialFeatureOptIns) ": On. Set under Special features." else ": Off. Set under Special features.") }
        SectionTitle("Data collected"); v.dataCategories.orEmpty().forEach { Body(d.list.dataCategories?.get(it.toInt())?.name.orEmpty()) }
        SectionTitle("How long data is kept")
        Column(Modifier.testTag("c15t.iab.vendor.$id.retention")) { v.dataRetention?.let { retention -> retention.purposes.orEmpty().forEach { (purpose,days) -> Body("${names(listOf(purpose.toInt()))}: $days days") }; retention.stdRetention?.let { Body("Standard retention: $it days") } } ?: Body("Not provided by this partner.") }
        SectionTitle("Device storage")
        Column(Modifier.testTag("c15t.iab.vendor.$id.storage")) {
            if (v.usesCookies != true && v.usesNonCookieAccess != true) Body("Doesn't store information on your device.") else {
                v.cookieMaxAgeSeconds?.let { Body("Stores information on your device for up to ${it / 86400} days.") }
                Body("Refreshes stored information: ${if (v.cookieRefresh == true) "Yes" else "No"}.")
                Body("Uses other ways to access your device: ${if (v.usesNonCookieAccess == true) "Yes" else "No"}.")
            }
            v.deviceStorageDisclosureUrl?.let { ExternalLink("Device storage details", it, "c15t.iab.vendor.$id.storage-link") }
        }
    }
}
@Composable private fun Providers(p: ConsentPresenter) {
    var search by rememberSaveable { mutableStateOf("") }
    val collator = remember { Collator.getInstance() }
    val providers = p.disclosure?.adTechProviders.orEmpty().filter { it.name.searchKey().contains(search.searchKey()) }.sortedWith { a,b -> collator.compare(a.name,b.name) }
    Column(Modifier.fillMaxSize().padding(horizontal = 24.dp).testTag("c15t.ac")) {
        OutlinedTextField(search, { search = it }, label = { Text("Search other partners") }, singleLine = true, modifier = Modifier.fillMaxWidth().testTag("c15t.ac.search"))
        LazyColumn {
            item { Text("These partners work with Google but aren't in the IAB list. They only use your data if you allow it. Purposes 1, 3 and 4 must also be on.", style = MaterialTheme.typography.bodyMedium, modifier = Modifier.padding(vertical = 16.dp)) }
            if (providers.isEmpty()) item { Text("No partners match \"$search\".", modifier = Modifier.testTag("c15t.ac.empty")) }
            items(providers, key = { it.id }) { provider ->
                ChoiceRow(provider.name, "", provider.id in p.choices.adTechProviderConsents.orEmpty(), "c15t.ac.provider.${provider.id}.switch", !p.pending && !p.stale && !p.listUnavailable) { on -> p.edit { it.copy(adTechProviderConsents = it.adTechProviderConsents.orEmpty().select(provider.id,on)) } }
                ExternalLink("Privacy policy", provider.policyUrl, "c15t.ac.provider.${provider.id}.privacy-link"); HorizontalDivider()
            }
        }
    }
}
