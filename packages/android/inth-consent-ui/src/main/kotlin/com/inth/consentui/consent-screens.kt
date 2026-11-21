@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class, androidx.compose.ui.ExperimentalComposeUiApi::class)
package com.inth.consentui

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.text.Editable
import android.text.InputType
import android.text.TextWatcher
import android.util.TypedValue
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.EditText
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.LinearOutSlowInEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.interaction.FocusInteraction
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.relocation.BringIntoViewRequester
import androidx.compose.foundation.relocation.bringIntoViewRequester
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.InlineTextContent
import androidx.compose.foundation.text.appendInlineContent
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.layout.LayoutCoordinates
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalFontFamilyResolver
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.Placeholder
import androidx.compose.ui.text.PlaceholderVerticalAlign
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontSynthesis
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.LineBreak
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextIndent
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.window.DialogWindowProvider
import androidx.compose.runtime.withFrameNanos
import androidx.core.view.WindowCompat
import androidx.core.widget.TextViewCompat
import com.inth.consentui.generated.IabCopy
import com.inth.consentui.headless.ConsentActions
import com.inth.consentui.headless.ConsentAnnouncements
import com.inth.consentui.headless.consentUsesLargeText
import com.inth.consentui.headless.IabDefinition
import com.inth.consentui.headless.IabFact
import com.inth.consentui.headless.IabPurposeRow
import com.inth.consentui.headless.IabVendorDetail
import com.inth.core.iab.*
import com.inth.core.model.*
import com.inth.core.tc.*
import java.text.Collator
import java.text.Normalizer
import java.util.Locale
import kotlinx.coroutines.launch
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/** Widest a consent column gets; wider screens centre it. */
private val ContentWidth = 560.dp

/** Status colours no theme overrides: a stale draft looks the same in every app. */
private val InfoText = ConsentThemeColor(0x1F3A99, 0xC4D0FF)
private val InfoBackground = ConsentThemeColor(0xE8ECFA, 0x1E2440)

/** What the first layer in scope is drawn on. Only the first layer provides it. */
private val LocalFirstLayerChrome = compositionLocalOf { FirstLayerChrome.Standard }

/**
 * Native optional presenter. Put it beside the app's content and retain [presenter] in a ViewModelStore.
 * [privacyPolicyUrl] must point to the host's privacy policy. Links open the system browser.
 * [theme] defaults to [ConsentTheme.current] with the manifest's `<meta-data>` applied.
 */
@Composable
fun InthConsent(presenter: ConsentPresenter, privacyPolicyUrl: String, noticeModifier: Modifier = Modifier.fillMaxSize(), theme: ConsentTheme? = null) {
    val context = LocalContext.current
    val resolved = remember(theme) {
        val base = theme ?: ConsentTheme.resolve(context)
        // The accent is read from the app's theme only when the system colours are used.
        (if (base.usesSystemColours) base.withSystemAppearance(ConsentTheme.appAccent(context)) else base).withReadableDecisions()
    }
    // The same announcer the headless blocks use: spoken once, when the commit settles.
    ConsentAnnouncements(presenter.draft)
    CompositionLocalProvider(LocalConsentTheme provides resolved) {
        MaterialTheme(colorScheme = resolved.colorScheme(), typography = resolved.materialTypography()) {
            if (presenter.noticeVisible) {
                Box(noticeModifier, contentAlignment = Alignment.BottomCenter) { NoticeCard(presenter, privacyPolicyUrl) }
            }
            if (presenter.presentationID != null) ConsentDialog(presenter, privacyPolicyUrl)
        }
    }
}

/**
 * The first layer and what it opens take the whole screen; standing settings do too, with Close.
 * A sheet or prompt first layer is a card over the app instead, and what it opens still takes
 * the whole screen.
 */
@Composable
private fun ConsentDialog(presenter: ConsentPresenter, privacyPolicyUrl: String) {
    val theme = LocalConsentTheme.current
    val chrome = theme.firstLayerChrome(largeText = actionsInPage(),
        iabInWideWindow = presenter.iab && androidx.compose.ui.platform.LocalConfiguration.current.screenWidthDp >= 600)
    var page by rememberSaveable(presenter.presentationID) { mutableStateOf("root") }
    var purposeFilter by rememberSaveable(presenter.presentationID) { mutableStateOf<Int?>(null) }
    fun back() {
        if (presenter.pending) return
        when {
            page.startsWith("vendor:") -> page = "vendors"
            page.startsWith("custom-vendor:") -> page = "custom-vendors"
            page != "root" -> page = "root"
            presenter.preferences -> presenter.requestClose()
            else -> presenter.backFromFirstLayer()
        }
    }
    Dialog(onDismissRequest = ::back, properties = DialogProperties(usePlatformDefaultWidth = false,
        decorFitsSystemWindows = false, dismissOnClickOutside = false, dismissOnBackPress = true)) {
        val window = (LocalView.current.parent as? DialogWindowProvider)?.window
        val dark = isSystemInDarkTheme()
        SideEffect {
            window?.let {
                // A card draws its own scrim over the app; the page and settings cover the window.
                if (chrome.card) it.setDimAmount(0f)
                WindowCompat.getInsetsController(it, it.decorView).apply {
                    isAppearanceLightStatusBars = !dark
                    isAppearanceLightNavigationBars = !dark
                }
            }
        }
        BackHandler { back() }
        // Settings draw their own canvas, so a card's window stays clear around the card.
        Box(Modifier.fillMaxSize().then(if (chrome.card) Modifier else Modifier.background(theme.colors.canvas.color())).semantics {
            testTagsAsResourceId = true
            paneTitle = if (presenter.preferences) presenter.iabCopy.preferenceCenterTitle else theme.copy.headline ?: presenter.copy.headline
        }) {
            AnimatedContent(targetState = presenter.preferences, label = "consent-layer", transitionSpec = {
                if (chrome.card) fadeIn() togetherWith fadeOut()
                else if (targetState) slideInHorizontally { it / 3 } + fadeIn() togetherWith slideOutHorizontally { -it / 3 } + fadeOut()
                else slideInHorizontally { -it / 3 } + fadeIn() togetherWith slideOutHorizontally { it / 3 } + fadeOut()
            }) { settings ->
                if (settings) SettingsScaffold(presenter, privacyPolicyUrl, page, purposeFilter, ::back,
                    openPartners = { purpose -> purposeFilter = purpose; page = "vendors" },
                    openVendor = { page = "vendor:$it" }, openProviders = { page = "providers" }, clearFilter = { purposeFilter = null },
                    openCustomVendors = { purpose -> purposeFilter = purpose; page = "custom-vendors" }, openCustomVendor = { page = "custom-vendor:$it" })
                else CompositionLocalProvider(LocalFirstLayerChrome provides chrome) {
                    val partners = { presenter.customize(); page = "vendors" }
                    if (chrome.card) FirstLayerCard(presenter, privacyPolicyUrl, prompt = chrome == FirstLayerChrome.Prompt, partners)
                    else FirstLayerScreen(presenter, privacyPolicyUrl, partners)
                }
            }
            if (presenter.confirmDiscard) AlertDialog(onDismissRequest = { presenter.confirmDiscard = false },
                modifier = Modifier.semantics { testTagsAsResourceId = true }.testTag("inth.prefs.discard"),
                containerColor = theme.colors.surface.color(), shape = RoundedCornerShape(theme.radius.resolvedLg),
                title = { Text(presenter.iabCopy.appDiscardChangesTitle) }, text = { Text(presenter.iabCopy.appDiscardChangesDetail) },
                confirmButton = { TextButton(onClick = { presenter.discard() }, modifier = Modifier.testTag("inth.prefs.discard.confirm")) { Text(presenter.iabCopy.appDiscardChanges) } },
                dismissButton = { TextButton(onClick = { presenter.confirmDiscard = false }, modifier = Modifier.testTag("inth.prefs.discard.keep")) { Text(presenter.iabCopy.appKeepEditing) } })
        }
    }
}

@Composable
private fun SettingsScaffold(p: ConsentPresenter, policyUrl: String, page: String, purposeFilter: Int?, back: () -> Unit,
    openPartners: (Int?) -> Unit, openVendor: (Int) -> Unit, openProviders: () -> Unit, clearFilter: () -> Unit,
    openCustomVendors: (Int?) -> Unit, openCustomVendor: (String) -> Unit) {
    val theme = LocalConsentTheme.current
    val title = when {
        page == "vendors" -> p.iabCopy.appIabPartners
        page == "providers" -> p.iabCopy.preferenceCenterVendorListAdTechProvidersHeading
        page == "custom-vendors" -> p.iabCopy.preferenceCenterVendorListCustomVendorsHeading
        page.startsWith("custom-vendor:") -> p.disclosure?.customVendors?.firstOrNull { it.id == page.substringAfter(':') }?.name ?: p.iabCopy.appPartner
        page.startsWith("vendor:") -> p.disclosure?.list?.vendors?.get(page.substringAfter(':').toInt())?.name ?: p.iabCopy.appPartner
        else -> p.iabCopy.preferenceCenterTitle
    }
    val backTag = when {
        page == "root" -> "inth.prefs.cancel"
        page.startsWith("vendor:") -> "inth.iab.vendor.back"
        page == "providers" -> "inth.ac.back"
        page == "custom-vendors" -> "inth.iab.custom-vendors.back"
        page.startsWith("custom-vendor:") -> "inth.iab.custom-vendor.back"
        else -> "inth.iab.vendors.back"
    }
    val close = page == "root" && !p.returnsToFirstLayer
    Scaffold(modifier = Modifier.fillMaxSize().imePadding(), containerColor = theme.colors.canvas.color(),
        topBar = {
            TopAppBar(title = { Heading(title, "inth.prefs.title", MaterialTheme.typography.titleLarge) },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = theme.colors.canvas.color(), titleContentColor = theme.colors.text.color(), navigationIconContentColor = theme.colors.text.color()),
                navigationIcon = {
                    IconButton(onClick = back, enabled = !p.pending, modifier = Modifier.testTag(backTag)) {
                        Icon(if (close) ConsentIcons.Close else ConsentIcons.ArrowBack, contentDescription = if (close) p.iabCopy.appClose else p.iabCopy.appBack)
                    }
                },
                actions = { if (page == "root" && saveInBar(p)) SaveInBar(p) })
        },
        bottomBar = { if (page == "root" && (!p.snapshot.policyPending || p.core.bundledPolicyInfo != null)) DecisionFooter(p, first = false) },
    ) { padding ->
        val depth = { name: String -> when { name == "root" -> 0; name.startsWith("vendor:") || name.startsWith("custom-vendor:") -> 2; else -> 1 } }
        AnimatedContent(targetState = page, modifier = Modifier.padding(padding), label = "consent-page", transitionSpec = {
            val forward = depth(targetState) >= depth(initialState)
            if (forward) slideInHorizontally { it / 3 } + fadeIn() togetherWith slideOutHorizontally { -it / 3 } + fadeOut()
            else slideInHorizontally { -it / 3 } + fadeIn() togetherWith slideOutHorizontally { it / 3 } + fadeOut()
        }) { current ->
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.TopCenter) {
                Box(Modifier.widthIn(max = ContentWidth).fillMaxSize()) {
                    when {
                        current == "vendors" -> Vendors(p, purposeFilter, clearFilter, openVendor, openProviders, openCustomVendors)
                        current.startsWith("vendor:") -> Vendor(p, current.substringAfter(':').toInt())
                        current == "providers" -> Providers(p)
                        current == "custom-vendors" -> CustomVendors(p, purposeFilter, openCustomVendor)
                        current.startsWith("custom-vendor:") -> CustomVendor(p, current.substringAfter(':'))
                        else -> Preferences(p, policyUrl, openPartners, openProviders) { openCustomVendors(null) }
                    }
                }
            }
        }
    }
}

// MARK: Shared pieces

@Composable private fun Heading(text: String, id: String, style: TextStyle = MaterialTheme.typography.titleLarge,
    color: ConsentThemeColor = LocalConsentTheme.current.colors.text, textAlign: TextAlign? = null) {
    Text(text, style = style, color = color.color(), textAlign = textAlign, modifier = Modifier.semantics { heading() }.testTag(id))
}
@Composable private fun Body(text: String, modifier: Modifier = Modifier, textAlign: TextAlign? = null, style: TextStyle = MaterialTheme.typography.bodyMedium) {
    Text(text, style = style, color = LocalConsentTheme.current.colors.textMuted.color(), textAlign = textAlign, modifier = modifier)
}
@Composable private fun SectionLabel(text: String, modifier: Modifier = Modifier) {
    Text(text, style = MaterialTheme.typography.labelLarge, color = LocalConsentTheme.current.colors.textMuted.color(),
        modifier = modifier.padding(start = 16.dp, top = 20.dp, bottom = 8.dp).semantics { heading() })
}
/** Between Material's 14sp supporting text and its 12sp caption, as the iOS footnote is. */
@Composable private fun footnoteStyle(): TextStyle = MaterialTheme.typography.bodyMedium.let { it.copy(fontSize = it.fontSize * (13f / 14f), lineHeight = it.lineHeight * (13f / 14f)) }
@Composable private fun PolicyLink(url: String, copy: IabCopy, style: TextStyle = MaterialTheme.typography.bodyMedium) =
    ExternalLink(copy.preferenceCenterVendorListPrivacyPolicy, url, "inth.privacy-policy", style)
@Composable private fun ExternalLink(text: String, url: String, id: String, style: TextStyle = MaterialTheme.typography.bodyMedium) {
    val context = LocalContext.current
    TextButton(onClick = { val uri = Uri.parse(url); if (uri.scheme in listOf("https", "http")) context.startActivity(Intent(Intent.ACTION_VIEW, uri)) },
        modifier = Modifier.defaultMinSize(minHeight = 48.dp).testTag(id), contentPadding = PaddingValues(horizontal = 4.dp)) {
        Text(text, style = style, fontWeight = FontWeight.Medium, color = LocalConsentTheme.current.colors.primary.color())
    }
}

private enum class ButtonVariant(val slot: ConsentTheme.Slot?) {
    DECISION(ConsentTheme.Slot.ButtonPrimary), ACCENT(null), QUIET(ConsentTheme.Slot.ButtonSecondary)
}

/**
 * The one button shape. [ButtonVariant.DECISION] is Accept all and Reject all, which always share it;
 * [ButtonVariant.ACCENT] is Save; [ButtonVariant.QUIET] is everything that is not a decision.
 *
 * [progress] marks the one action being committed: it keeps its label and full strength and shows
 * a spinner at its leading edge, while the other, disabled actions fade. The spinner is laid over
 * the label's row so the label never moves and the equal-width layout never reflows mid-save.
 *
 * The first layer's chrome restyles it. On a card every button is a capsule and the decisions are
 * tonal, in the text colour: an accent tint on the sheet, a neutral one on the prompt. Outside the
 * stock page a quiet button is a text action in the accent, not an outlined button.
 *
 * [settings] marks the Privacy Settings footer. There the quiet Reject All and Accept All are
 * tonal twins, a tint of the text colour with no outline, and take less height than Save; a host's
 * [ConsentTheme.Slot.ButtonSecondary] background replaces the tint and keeps the outline. Every
 * button is a capsule when the first layer was a card.
 */
@Composable private fun ConsentButton(text: String, id: String, enabled: Boolean, variant: ButtonVariant = ButtonVariant.DECISION,
    progress: Boolean = false, progressLabel: String = "", settings: Boolean = false, onClick: () -> Unit) {
    val theme = LocalConsentTheme.current
    val chrome = LocalFirstLayerChrome.current
    val link = variant == ButtonVariant.QUIET && chrome != FirstLayerChrome.Standard
    val tonal = settings && variant == ButtonVariant.QUIET
    val slot = variant.slot?.let(theme::slot)
    val shape = if (chrome.card || (settings && theme.firstLayer != ConsentTheme.FirstLayer.Page)) CircleShape else RoundedCornerShape(slot?.borderRadius ?: theme.radius.md)
    val modifier = Modifier.fillMaxWidth().defaultMinSize(minHeight = if (link) 44.dp else if (settings && variant != ButtonVariant.ACCENT) 46.dp else 52.dp).testTag(id).semantics {
        contentDescription = text
        if (progress) stateDescription = progressLabel
    }
    val label: @Composable () -> Unit = {
        Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
            if (progress) CircularProgressIndicator(Modifier.size(20.dp).align(Alignment.CenterStart).testTag("inth.status.progress"),
                color = LocalContentColor.current, strokeWidth = 2.dp)
            val style = MaterialTheme.typography.bodyLarge
            Text(text, style = slot?.fontSize?.let { style.copy(fontSize = it, lineHeight = (style.lineHeight.value * it.value / style.fontSize.value).sp) } ?: style,
                fontWeight = if (link) FontWeight.Medium else FontWeight.SemiBold)
        }
    }
    when (variant) {
        ButtonVariant.DECISION, ButtonVariant.ACCENT -> {
            val decision = variant == ButtonVariant.DECISION
            // The tonal fills carry the text colour, or black or white where that would fall under 5:1.
            val container = when {
                !decision -> theme.colors.primary.color()
                // Opaque, so the label's contrast never depends on what the app shows behind a prompt.
                chrome.card -> theme.cardDecisionFill(chrome == FirstLayerChrome.Prompt).color()
                else -> theme.decisionFill.color()
            }
            val content = if (!decision) theme.colors.textOnPrimary.color() else if (chrome.card) theme.cardDecisionLabel(chrome == FirstLayerChrome.Prompt).color() else theme.decisionLabel.color()
            Button(onClick, modifier, enabled = enabled, shape = shape, contentPadding = PaddingValues(horizontal = 16.dp, vertical = 14.dp),
                colors = ButtonDefaults.buttonColors(containerColor = container, contentColor = content,
                    disabledContainerColor = if (progress) container else container.copy(alpha = container.alpha * 0.55f), disabledContentColor = content)) { label() }
        }
        ButtonVariant.QUIET -> if (link) TextButton(onClick, modifier, enabled = enabled, shape = shape, contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
            colors = ButtonDefaults.textButtonColors(contentColor = theme.colors.primary.color(),
                disabledContentColor = if (progress) theme.colors.primary.color() else theme.colors.textMuted.color())) { label() }
        else {
            // The settings twins are a tint of the text colour, so they hold on any canvas a host sets.
            val fill = slot?.backgroundColor?.color() ?: if (tonal) theme.colors.text.color().copy(alpha = 0.08f) else Color.Transparent
            OutlinedButton(onClick, modifier, enabled = enabled, shape = shape, contentPadding = PaddingValues(horizontal = 16.dp, vertical = if (tonal) 11.dp else 14.dp),
                border = if (tonal && slot?.backgroundColor == null) null else BorderStroke(1.dp, theme.colors.text.color().copy(alpha = if (enabled || progress) 0.18f else 0.1f)),
                colors = ButtonDefaults.outlinedButtonColors(containerColor = fill,
                    contentColor = (slot?.color ?: theme.colors.text).color(),
                    disabledContainerColor = if (!tonal) Color.Unspecified else if (progress) fill else fill.copy(alpha = fill.alpha * 0.55f),
                    disabledContentColor = if (progress) (slot?.color ?: theme.colors.text).color() else theme.colors.textMuted.color())) { label() }
        }
    }
}

/** Equal columns when both labels fit at the current font scale; a stack otherwise. */
@Composable private fun EqualDecisions(content: @Composable () -> Unit) = ConsentActions(content = content)

/**
 * A commit that did not reach durable storage. One red glyph carries the status; the message is
 * ink and Try again follows it in the same text run, in the accent, wrapping like any other word
 * instead of taking a row of its own. The text reports where the link landed, so an invisible
 * 48dp control sits over exactly that span: the paragraph never retries, the link always does,
 * and TalkBack meets the message and the button as two nodes. The presenter announces the
 * failure, so the row is not also a live region.
 */
@Composable private fun FailureRow(message: String, id: String, enabled: Boolean, retryLabel: String, retry: () -> Unit) {
    val theme = LocalConsentTheme.current
    val density = LocalDensity.current
    val style = MaterialTheme.typography.bodyMedium
    // The glyph follows the font scale like the text beside it.
    val glyph = with(density) { style.lineHeight.toDp() }
    // A no-break space keeps the label whole; it wraps as one word or not at all.
    val link = retryLabel.replace(' ', '\u00A0')
    val accent = theme.colors.primary.color().copy(alpha = if (enabled) 1f else 0.5f)
    val text = remember(message, accent, link) {
        buildAnnotatedString { append(message); append(' '); withStyle(SpanStyle(color = accent, fontWeight = FontWeight.SemiBold)) { append(link) } }
    }
    // Inside a scrolling page the row brings itself into view when it arrives; a pinned footer ignores this.
    val requester = remember { BringIntoViewRequester() }
    LaunchedEffect(Unit) { requester.bringIntoView() }
    // The 48dp hit area reaches 14dp past the line; the extra bottom padding keeps it out of the next action.
    Row(Modifier.fillMaxWidth().bringIntoViewRequester(requester).padding(bottom = 4.dp).testTag(id), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        // The core icon set has no exclamation glyph; its filled Info turned over is one.
        Icon(ConsentIcons.Info, contentDescription = null, tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(glyph).rotate(180f))
        InlineActionText(text, message.length + 1 until text.length, retryLabel, "$id.retry", enabled, theme.colors.text.color(), style,
            Modifier.weight(1f), paragraphDescription = message, onClick = retry)
    }
}

/**
 * A paragraph with one tappable span. The text reports where the span landed, so an invisible
 * control of at least 48dp sits over each line of that span: the paragraph never acts, the span
 * always does, and TalkBack meets the paragraph and the control ([label], tagged [id]) as two
 * nodes. A span that wraps gets one hit region per line; only the first is announced.
 */
@Composable private fun InlineActionText(text: androidx.compose.ui.text.AnnotatedString, span: IntRange, label: String, id: String, enabled: Boolean,
    color: Color, style: TextStyle, modifier: Modifier = Modifier, textModifier: Modifier = Modifier, paragraphDescription: String? = null, onClick: () -> Unit) {
    val density = LocalDensity.current
    var layout by remember { mutableStateOf<TextLayoutResult?>(null) }
    Box(modifier) {
        Text(text, color = color, style = style, onTextLayout = { layout = it },
            modifier = textModifier.semantics { if (paragraphDescription != null) contentDescription = paragraphDescription })
        layout?.let { result ->
            val floor = with(density) { 48.dp.toPx() }
            val slop = with(density) { 8.dp.toPx() }
            inlineSpanLineBounds(result, span).forEachIndexed { line, bounds ->
                val width = max(floor, bounds.width + 2 * slop)
                val height = max(floor, bounds.height)
                val announced = if (line == 0) Modifier.semantics { contentDescription = label }.testTag(id)
                    else Modifier.clearAndSetSemantics { testTag = "$id.line.$line" }
                Box(Modifier.offset { IntOffset((bounds.center.x - width / 2).roundToInt(), (bounds.center.y - height / 2).roundToInt()) }
                    .size(with(density) { width.toDp() }, with(density) { height.toDp() })
                    .then(announced)
                    .clickable(enabled = enabled, role = Role.Button, onClick = onClick))
            }
        }
    }
}

/**
 * The glyph bounds of [span] on each line it occupies, so a wrapped span never claims the
 * paragraph text between its first and last glyph.
 */
internal fun inlineSpanLineBounds(layout: TextLayoutResult, span: IntRange): List<Rect> {
    if (span.isEmpty()) return emptyList()
    return (layout.getLineForOffset(span.first)..layout.getLineForOffset(span.last)).mapNotNull { line ->
        val start = max(span.first, layout.getLineStart(line))
        val end = min(span.last, layout.getLineEnd(line, visibleEnd = true) - 1)
        if (end < start) return@mapNotNull null
        (start..end).map(layout::getBoundingBox).reduce { a, b ->
            Rect(min(a.left, b.left), min(a.top, b.top), max(a.right, b.right), max(a.bottom, b.bottom))
        }
    }
}

/** A short status line on a tinted background: why the prompt is back, or that the draft is stale. */
@Composable private fun InfoCallout(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    val theme = LocalConsentTheme.current
    Surface(color = InfoBackground.color(), shape = RoundedCornerShape(theme.radius.resolvedSm), modifier = modifier.fillMaxWidth()) {
        CompositionLocalProvider(LocalContentColor provides InfoText.color()) {
            Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                ProvideTextStyle(MaterialTheme.typography.bodyMedium) { content() }
            }
        }
    }
}

@Composable private fun Hairline(modifier: Modifier = Modifier) {
    HorizontalDivider(modifier, color = LocalConsentTheme.current.colors.text.color().copy(alpha = 0.1f))
}

/**
 * Where the decisions live. Below font scale 1.5 they are a pinned footer. From there on, three
 * stacked buttons and a failure row would take most of a short window and need a scroll of their
 * own, so the first layer puts the whole group in the page after the text, and preferences keep
 * one compact pinned action while Reject all and Accept all sit in the page after the
 * introduction. The trigger is the font scale, not a measured height: a layout that changed
 * structure the moment a failure row appeared would move the actions under the thumb.
 */
@Composable private fun actionsInPage(): Boolean = consentUsesLargeText()

/**
 * [ALL] is the whole group: the pinned footer below accessibility sizes, the end of the first
 * layer's page at them. The other three are the accessibility-size cuts of preferences:
 * [SHORTCUTS] after the introduction, [PINNED] in the compact footer, [PINNED_STATUS] as the
 * page's last row, so a failure sits beside the control that failed rather than in a tray that
 * grows past the window.
 */
private enum class DecisionPart { ALL, SHORTCUTS, PINNED, PINNED_STATUS }

/** The one action a compact footer keeps at accessibility sizes, if any. */
private fun pinnedAction(p: ConsentPresenter): ConsentPresenter.Action? =
    if (p.stale) null else if (p.snapshot.policyPending) ConsentPresenter.Action.REJECT else if (p.listUnavailable) null else ConsentPresenter.Action.SAVE
private fun showsPinned(p: ConsentPresenter) = p.stale || pinnedAction(p) != null
private fun showsShortcuts(p: ConsentPresenter) = !p.stale && !p.snapshot.policyPending
private fun showsPinnedStatus(p: ConsentPresenter) = !p.stale && p.failedAction != null && p.failedAction == pinnedAction(p)

/**
 * Each decision's test tag, spelled out whole: E2E suites tap these, and
 * `scripts/native-consent-selectors.test.ts` looks for every one in the source.
 */
private fun decisionTag(first: Boolean, iab: Boolean, action: ConsentPresenter.Action): String = when (action) {
    ConsentPresenter.Action.ACCEPT -> if (first) "inth.first-layer.accept-all" else if (iab) "inth.iab.accept-all" else "inth.prefs.accept-all"
    ConsentPresenter.Action.REJECT -> if (first) "inth.first-layer.reject-all" else if (iab) "inth.iab.reject-all" else "inth.prefs.reject-all"
    ConsentPresenter.Action.SAVE -> if (first) "inth.first-layer.save" else if (iab) "inth.iab.save" else "inth.prefs.save"
    ConsentPresenter.Action.ACKNOWLEDGE -> if (first) "inth.first-layer.acknowledge" else if (iab) "inth.iab.acknowledge" else "inth.prefs.acknowledge"
}

/** The decision controls and the failure row beside them, in one of the [DecisionPart] cuts. */
@Composable private fun DecisionGroup(p: ConsentPresenter, first: Boolean, part: DecisionPart, modifier: Modifier = Modifier) {
    val theme = LocalConsentTheme.current
    val prefix = if (first) "inth.first-layer" else if (p.iab) "inth.iab" else "inth.prefs"
    val errorId = (if (first) "inth.first-layer" else "inth.prefs") + ".error"
    // Both modes take their labels from the generated translations, as on the web.
    val rejectAll = if (p.iab) p.iabCopy.commonRejectAll else p.copy.rejectAll
    val acceptAll = if (p.iab) p.iabCopy.commonAcceptAll else p.copy.acceptAll
    val save = if (p.iab) p.iabCopy.commonSaveSettings else p.copy.save
    // Only the pressed action shows progress; the rest are disabled with their labels intact.
    fun busy(action: ConsentPresenter.Action) = p.showProgress && p.pendingAction == action
    // Save leaves the group when the theme puts it in the top app bar.
    val saveAtTop = saveInBar(p)
    @Composable fun reload() = ConsentButton(p.iabCopy.appLoadCurrentSettings, "inth.prefs.stale.reload", !p.pending, ButtonVariant.ACCENT, settings = !first) { p.loadDraft() }
    @Composable fun failure() { p.errorMessage?.let { FailureRow(it, errorId, !p.pending, p.iabCopy.appTryAgain, p::retry) } }
    /** Labels stay put while a commit runs: the pressed action shows progress beside its own label. */
    @Composable fun decision(label: String, action: ConsentPresenter.Action) {
        val variant = if (action == ConsentPresenter.Action.SAVE) ButtonVariant.ACCENT else if (first) ButtonVariant.DECISION else ButtonVariant.QUIET
        ConsentButton(label, decisionTag(first, p.iab, action), !p.pending, variant, progress = busy(action), progressLabel = p.copy.saving, settings = !first) { p.commit(action) }
    }
    @Composable fun decisions() {
        if (p.snapshot.policyPending) {
            decision(rejectAll, ConsentPresenter.Action.REJECT)
        } else if (p.listUnavailable) {
            Body(p.iabCopy.appListOutdated, Modifier.testTag(if (first) "inth.first-layer.list-stale" else "inth.iab.list-stale"))
            EqualDecisions {
                decision(rejectAll, ConsentPresenter.Action.REJECT)
                ConsentButton(p.iabCopy.appTryAgain, "$prefix.retry", !p.pending, ButtonVariant.QUIET, settings = !first) { p.refresh() }
            }
        } else {
            EqualDecisions {
                decision(rejectAll, ConsentPresenter.Action.REJECT)
                decision(acceptAll, ConsentPresenter.Action.ACCEPT)
            }
            if (first) {
                ConsentButton(if (p.iab) p.iabCopy.commonCustomize else p.copy.customize, "inth.first-layer.customize", !p.pending, ButtonVariant.QUIET) { p.customize() }
                if (theme.showsBranding) Branding(p.copy.securedBy)
            } else if (part == DecisionPart.ALL && !saveAtTop) decision(save, ConsentPresenter.Action.SAVE)
        }
    }
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        when (part) {
            DecisionPart.ALL -> if (p.stale) reload() else { failure(); decisions() }
            DecisionPart.PINNED -> if (p.stale) reload() else pinnedAction(p)?.let { decision(if (it == ConsentPresenter.Action.SAVE) save else rejectAll, it) }
            DecisionPart.SHORTCUTS -> if (showsShortcuts(p)) { if (p.failedAction != pinnedAction(p)) failure(); decisions() }
            DecisionPart.PINNED_STATUS -> if (showsPinnedStatus(p)) failure()
        }
    }
}

/**
 * Whether Save Settings is the top app bar's action: the theme asks for it, text is below the
 * accessibility threshold, and there is a draft to save.
 */
@Composable private fun saveInBar(p: ConsentPresenter): Boolean =
    LocalConsentTheme.current.savePlacement == ConsentTheme.SavePlacement.Top && !actionsInPage() && p.preferences
        && !p.stale && !p.snapshot.policyPending && !p.listUnavailable

/**
 * Save Settings in the top app bar, for themes that place it at the top. It carries the footer
 * button's test tag, so a suite that taps Save finds it in either place.
 */
@Composable private fun SaveInBar(p: ConsentPresenter) {
    val theme = LocalConsentTheme.current
    // The bar has room for one word; the footer button keeps the full label.
    val label = p.iabCopy.appSave
    val busy = p.showProgress && p.pendingAction == ConsentPresenter.Action.SAVE
    val accent = theme.colors.primary.color()
    TextButton(onClick = { p.commit(ConsentPresenter.Action.SAVE) }, enabled = !p.pending,
        modifier = Modifier.testTag(decisionTag(first = false, p.iab, ConsentPresenter.Action.SAVE)).semantics {
            contentDescription = label
            if (busy) stateDescription = p.copy.saving
        },
        colors = ButtonDefaults.textButtonColors(contentColor = accent, disabledContentColor = if (busy) accent else theme.colors.textMuted.color())) {
        if (busy) CircularProgressIndicator(Modifier.size(20.dp).testTag("inth.status.progress"), color = LocalContentColor.current, strokeWidth = 2.dp)
        else Text(label, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
    }
}

/**
 * Pinned actions. Accept all and Reject all are twins; Save is the accent; nothing else is filled.
 * At accessibility sizes the first layer has no footer and preferences keep one compact action,
 * so the bar never needs a scroll of its own.
 */
@Composable private fun DecisionFooter(p: ConsentPresenter, first: Boolean) {
    val theme = LocalConsentTheme.current
    val chrome = LocalFirstLayerChrome.current
    val card = chrome.card
    val page = actionsInPage()
    if (page && (first || !showsPinned(p))) return
    // The prompt's card is translucent all the way down; the sheet's footer is its surface.
    Surface(color = when (chrome) { FirstLayerChrome.Prompt -> Color.Transparent; FirstLayerChrome.Sheet -> theme.colors.surface.color(); else -> theme.colors.canvas.color() }) {
        Column(Modifier.fillMaxWidth()) {
            // A card rules off its decisions only when there is text that can scroll above them; the system page never does.
            if (chrome == FirstLayerChrome.Standard || (card && p.iab)) Hairline()
            Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.TopCenter) {
                // The row's arrival eases the actions down to make room instead of jumping them under the thumb.
                // Edges follow the page: 24dp on the first layer, 16dp on preferences to meet the cards and on a card.
                Column(Modifier.widthIn(max = ContentWidth).fillMaxWidth().navigationBarsPadding().testTag("inth.footer").animateContentSize()
                    .padding(horizontal = if (first && !card) theme.spacing.lg else theme.spacing.md, vertical = theme.spacing.sm + theme.spacing.xs),
                    verticalArrangement = Arrangement.spacedBy(theme.spacing.sm)) {
                    DecisionGroup(p, first, if (page) DecisionPart.PINNED else DecisionPart.ALL)
                    // The first layer places its own tag; Privacy Settings carries it under the actions.
                    if (!first && !page && theme.showsBranding) ProviderBranding(p.copy.securedBy, "inth.prefs.branding")
                }
            }
        }
    }
}

@Composable private fun Branding(securedBy: String) { ProviderBranding(securedBy) }

// MARK: First layer

/**
 * The first choice. A page of the app, not a panel over it: brand, headline, one sentence (in
 * IAB mode, the full IAB disclosure), then the two decisions at equal weight and the path to the details.
 */
@Composable private fun FirstLayerScreen(p: ConsentPresenter, policyUrl: String, partners: () -> Unit) {
    val theme = LocalConsentTheme.current
    Scaffold(containerColor = theme.colors.canvas.color(), bottomBar = { DecisionFooter(p, first = true) }) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).testTag("inth.first-layer"), horizontalAlignment = Alignment.CenterHorizontally) {
            FirstLayerContent(p, policyUrl, partners)
        }
    }
}

/**
 * The first layer as a card over the app: a floating sheet at the bottom, or a centred prompt.
 * It holds the same [FirstLayerContent] and decisions the page shows and is as tall as they need,
 * up to most of the window; past that the text scrolls. The decisions are a row of their own under
 * the scroll area, never over it, so text cannot pass behind the prompt's translucent buttons.
 */
@Composable private fun FirstLayerCard(p: ConsentPresenter, policyUrl: String, prompt: Boolean, partners: () -> Unit) {
    val theme = LocalConsentTheme.current
    val dark = isSystemInDarkTheme()
    val shape = RoundedCornerShape(if (prompt) 34.dp else 36.dp)
    // The sheet is the app's own surface. The prompt lets the app show through, like a system dialog.
    // Compose has no blur behind a surface on every supported API level, and an unblurred
    // translucent card lets the app's text read through the consent text. So the prompt is all
    // but opaque here, where iOS uses glass.
    val surface = theme.colors.surface.color().let { if (prompt) it.copy(alpha = 0.97f) else it }
    // Compose scales the duration by the system animator setting, so "animations off" shows the card at once.
    var arrived by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { arrived = true }
    val arrival by animateFloatAsState(if (arrived) 1f else 0f, tween(250, easing = LinearOutSlowInEasing), label = "first-layer-card")
    BoxWithConstraints(Modifier.fillMaxSize()) {
        val limit = maxHeight * if (prompt) 0.72f else 0.84f
        val side = if (prompt) 24.dp else 8.dp
        Box(Modifier.fillMaxSize().graphicsLayer { alpha = arrival }.background(Color.Black.copy(alpha = if (prompt) 0.32f else 0.4f)))
        // The insets are taken here, so the footer inside the card adds none of its own.
        Box(Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.systemBars).padding(start = side, end = side, bottom = if (prompt) 0.dp else 4.dp),
            contentAlignment = if (prompt) Alignment.Center else Alignment.BottomCenter) {
            Column(Modifier.widthIn(max = if (prompt) 340.dp else 520.dp).fillMaxWidth().heightIn(max = limit)
                .graphicsLayer { alpha = arrival; translationY = if (prompt) 0f else (1f - arrival) * 32.dp.toPx() }
                // Depth is a shadow in light and a ring in dark, where a shadow cannot be seen.
                .shadow(if (dark) 0.dp else 16.dp, shape).clip(shape).background(surface)
                .border(1.dp, if (dark) Color.White.copy(alpha = 0.09f) else Color.Black.copy(alpha = 0.05f), shape)
                .testTag(if (prompt) "inth.first-layer.prompt" else "inth.first-layer.sheet")) {
                Column(Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState()).testTag("inth.first-layer"), horizontalAlignment = Alignment.CenterHorizontally) {
                    FirstLayerContent(p, policyUrl, partners)
                }
                DecisionFooter(p, first = true)
            }
        }
    }
}

/**
 * What the first layer says, on a page or a card. The system page centres its identity, headline
 * and introduction; the IAB disclosure stays at the start edge. The sheet names the app in one
 * row; the prompt, like a system dialog, has no identity.
 */
@Composable private fun FirstLayerContent(p: ConsentPresenter, policyUrl: String, partners: () -> Unit) {
    val theme = LocalConsentTheme.current
    val chrome = LocalFirstLayerChrome.current
    val card = chrome.card
    val standard = chrome == FirstLayerChrome.Standard
    val centered = chrome == FirstLayerChrome.System
    val alignment = if (centered) Alignment.CenterHorizontally else Alignment.Start
    val textAlign = if (centered) TextAlign.Center else null
    val gutter = if (card) theme.spacing.lg - 2.dp else theme.spacing.lg
    // The centred page starts lower, and lower still when there is no disclosure to fill it.
    val top = if (card) theme.spacing.lg - 2.dp else if (!centered) theme.spacing.xl else if (p.iab) theme.spacing.xl * 2 else theme.spacing.xl * 3 + theme.spacing.lg
    Column(Modifier.widthIn(max = ContentWidth).fillMaxWidth().padding(start = gutter, end = gutter, top = top, bottom = if (card) theme.spacing.xs else theme.spacing.md),
        verticalArrangement = Arrangement.spacedBy(if (card) theme.spacing.md - 2.dp else theme.spacing.md + theme.spacing.xs), horizontalAlignment = alignment) {
        if (!theme.brand.hidden && chrome != FirstLayerChrome.Prompt) IdentityHeader(p.copy.brandPlaceholder, chrome)
        when (p.snapshot.promptRequirement.reason?.wireName) {
            "expired" -> InfoCallout(Modifier.testTag("inth.first-layer.reason")) { Text(p.copy.choiceExpired) }
            "policy-changed" -> InfoCallout(Modifier.testTag("inth.first-layer.reason")) { Text(p.copy.policyChanged) }
        }
        val title = MaterialTheme.typography.titleLarge
        Heading(theme.copy.headline ?: p.copy.headline, "inth.first-layer.title", when (chrome) {
            FirstLayerChrome.Sheet -> title.copy(fontWeight = FontWeight.Bold)
            // Material has no 20sp role; this is titleLarge's 22sp taken down in proportion.
            FirstLayerChrome.Prompt -> title.copy(fontSize = title.fontSize * (20f / 22f), lineHeight = title.lineHeight * (20f / 22f), fontWeight = FontWeight.SemiBold)
            FirstLayerChrome.System -> headlineStyle(theme).copy(fontWeight = FontWeight.Bold)
            FirstLayerChrome.Standard -> headlineStyle(theme)
        }, color = theme.slot(ConsentTheme.Slot.ConsentBannerTitle).color ?: theme.colors.text, textAlign = textAlign)
        Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(theme.spacing.sm + theme.spacing.xs), horizontalAlignment = alignment) {
            val description = theme.slot(ConsentTheme.Slot.ConsentBannerDescription)
            // A card sets the introduction at the supporting size, as the IAB description is.
            val body = if (card) MaterialTheme.typography.bodyMedium else MaterialTheme.typography.bodyLarge
            Text(theme.copy.introduction ?: p.copy.introduction, style = description.fontSize?.let { body.copy(fontSize = it, lineHeight = (body.lineHeight.value * it.value / body.fontSize.value).sp) } ?: body,
                color = (description.color ?: if (centered) theme.colors.textMuted else theme.colors.text).color(), textAlign = textAlign, modifier = Modifier.testTag("inth.first-layer.body"))
            if (!p.iab) Body(p.copy.firstLayerDescription, textAlign = textAlign, style = if (standard) MaterialTheme.typography.bodyMedium else footnoteStyle())
        }
        if (p.iab) IabFirstLayer(p, partners)
        PolicyLink(policyUrl, p.iabCopy, if (standard) MaterialTheme.typography.bodyMedium else footnoteStyle())
        // At accessibility sizes the decisions follow the text they decide on.
        if (actionsInPage()) DecisionGroup(p, first = true, DecisionPart.ALL, Modifier.padding(top = 4.dp))
    }
}

/** Display type breaks balanced, so a two-line headline never leaves one word on its last line. */
@Composable private fun headlineStyle(theme: ConsentTheme): TextStyle =
    theme.headlineStyle(MaterialTheme.typography.headlineLarge).copy(lineBreak = LineBreak.Heading)

/**
 * The IAB disclosure, as the web prompt gives it: what partners store, access and process with
 * the partner count as the way into the list, the purposes and stacks they use, then legitimate
 * interest, scope and withdrawal. Always shown in IAB mode, under any host copy. Each chrome sets
 * the same sentences and names its own way: a quieter card on the stock page, a grouped list
 * ending in the partners row on the system page, bullets on a card.
 */
@Composable private fun IabFirstLayer(p: ConsentPresenter, partners: () -> Unit) {
    val theme = LocalConsentTheme.current
    val chrome = LocalFirstLayerChrome.current
    val standard = chrome == FirstLayerChrome.Standard
    val copy = p.iabCopy
    val text = p.iabRows?.firstLayer
    Column(Modifier.fillMaxWidth().testTag("inth.first-layer.iab"), verticalArrangement = Arrangement.spacedBy(if (chrome.card) 14.dp else 12.dp)) {
        if (text != null) {
            val accent = theme.colors.primary.color()
            val description = remember(text, accent, standard) {
                buildAnnotatedString {
                    append(text.description)
                    addStyle(SpanStyle(color = accent, fontWeight = FontWeight.SemiBold, textDecoration = if (standard) null else TextDecoration.Underline),
                        text.partnersLink.first, text.partnersLink.last + 1)
                }
            }
            // Outside the stock page a row or a link under the summary carries the partner-count tag, so the inline link takes another.
            InlineActionText(description, text.partnersLink, text.partnersLabel,
                if (standard) "inth.first-layer.partner-count" else "inth.first-layer.description.partners", !p.pending,
                theme.colors.textMuted.color(), if (chrome.card) footnoteStyle() else MaterialTheme.typography.bodyMedium, Modifier.fillMaxWidth(),
                textModifier = Modifier.testTag("inth.first-layer.description"), onClick = partners)
            val more = (p.disclosure?.bannerSummary?.remainingCount ?: 0) > 0
            // Every summary line: the names, then "and N more" when the list was cut.
            val lines = text.summary.mapIndexed { index, name ->
                val cut = more && index == text.summary.lastIndex
                SummaryLine(if (cut) "inth.first-layer.summary.more" else "inth.first-layer.summary.item.$index", name, cut)
            }
            when (chrome) {
                FirstLayerChrome.Standard -> SummaryCard(lines)
                FirstLayerChrome.System -> SummaryRows(lines, remember(p.disclosure?.list) { SummaryIcons(p.disclosure?.list) }, text.partnersLabel, !p.pending, partners)
                FirstLayerChrome.Sheet -> SummaryBullets(lines, boxed = true)
                FirstLayerChrome.Prompt -> SummaryBullets(lines, boxed = false)
            }
            // The inline link has no target of its own: this is the partner list at full size, with the tag suites tap.
            if (chrome.card) TextButton(onClick = partners, enabled = !p.pending, contentPadding = PaddingValues(0.dp),
                modifier = Modifier.defaultMinSize(minHeight = 44.dp).semantics { contentDescription = text.partnersLabel }.testTag("inth.first-layer.partner-count")) {
                Text(text.partnersLabel, style = footnoteStyle(), fontWeight = FontWeight.Medium, color = accent)
                Icon(ConsentIcons.KeyboardArrowRight, contentDescription = null, tint = accent, modifier = Modifier.size(16.dp))
            }
        }
        val notices = listOf(copy.bannerLegitimateInterestNotice to "inth.first-layer.legitimate-interest", copy.appScopeServiceSpecific to "inth.first-layer.scope",
            copy.appWithdraw to "inth.first-layer.withdraw")
        if (standard) notices.forEach { (notice, tag) -> Body(notice, Modifier.testTag(tag)) }
        else Column(verticalArrangement = Arrangement.spacedBy(if (chrome.card) 6.dp else 8.dp)) {
            val style = if (chrome.card) MaterialTheme.typography.bodySmall else footnoteStyle()
            notices.forEach { (notice, tag) -> Body(notice, Modifier.testTag(tag), style = style) }
        }
    }
}

private class SummaryLine(val tag: String, val text: String, val more: Boolean)

/** The stock page's summary: the purposes partners ask for, on a quieter surface so they inform without competing. */
@Composable private fun SummaryCard(lines: List<SummaryLine>) {
    val theme = LocalConsentTheme.current
    Surface(color = theme.colors.surfaceMuted.color(), shape = RoundedCornerShape(theme.radius.md + 2.dp), modifier = Modifier.fillMaxWidth().testTag("inth.first-layer.summary")) {
        Column(Modifier.padding(vertical = 6.dp)) {
            lines.forEachIndexed { index, line ->
                Text(line.text, style = MaterialTheme.typography.bodyMedium,
                    color = if (line.more) theme.colors.textMuted.color() else theme.colors.text.color(),
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp).testTag(line.tag))
                if (index < lines.lastIndex) Hairline(Modifier.padding(start = 16.dp))
            }
        }
    }
}

/** The system page's summary: a grouped list, each line under its icon, ending in the partners row. */
@Composable private fun SummaryRows(lines: List<SummaryLine>, icons: SummaryIcons, partnersLabel: String, enabled: Boolean, partners: () -> Unit) {
    val theme = LocalConsentTheme.current
    val accent = theme.colors.primary.color()
    Surface(color = theme.colors.surface.color(), shape = RoundedCornerShape(20.dp), modifier = Modifier.fillMaxWidth().testTag("inth.first-layer.summary")) {
        Column {
            lines.forEach { line ->
                Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 11.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                    Box(Modifier.width(28.dp), contentAlignment = Alignment.Center) {
                        Icon(if (line.more) SummaryIcons.MORE else icons.icon(line.text), contentDescription = null, tint = accent,
                            modifier = Modifier.size(22.dp))
                    }
                    Text(line.text, style = MaterialTheme.typography.bodyMedium, color = theme.colors.text.color(), modifier = Modifier.weight(1f).testTag(line.tag))
                }
                Hairline(Modifier.padding(start = 58.dp))
            }
            Row(Modifier.fillMaxWidth().defaultMinSize(minHeight = 46.dp).clickable(enabled = enabled, role = Role.Button, onClick = partners)
                .semantics { contentDescription = partnersLabel }.testTag("inth.first-layer.partner-count").padding(horizontal = 16.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                Box(Modifier.width(28.dp), contentAlignment = Alignment.Center) { Icon(SummaryIcons.PARTNERS, contentDescription = null, tint = accent, modifier = Modifier.size(22.dp)) }
                Text(partnersLabel, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium, color = theme.colors.text.color(),
                    modifier = Modifier.weight(1f).clearAndSetSemantics {})
                Icon(ConsentIcons.KeyboardArrowRight, contentDescription = null, tint = theme.colors.textMuted.color().copy(alpha = 0.6f), modifier = Modifier.size(18.dp))
            }
        }
    }
}

/**
 * The sheet's and the prompt's summary: one line each at supporting size, under a dot. The sheet
 * sets them on a quieter box; the prompt, like a dialog, sets them as plain text.
 */
@Composable private fun SummaryBullets(lines: List<SummaryLine>, boxed: Boolean) {
    val theme = LocalConsentTheme.current
    val style = footnoteStyle()
    // The dot sits at the middle of its text's first line, at any font scale.
    val line = with(LocalDensity.current) { style.lineHeight.toDp() }
    val box = if (boxed) Modifier.clip(RoundedCornerShape(16.dp)).background(theme.colors.textMuted.color().copy(alpha = 0.12f)).padding(14.dp) else Modifier
    Column(Modifier.fillMaxWidth().testTag("inth.first-layer.summary").then(box), verticalArrangement = Arrangement.spacedBy(if (boxed) 7.dp else 5.dp)) {
        lines.forEach { item ->
            Row(horizontalArrangement = Arrangement.spacedBy(if (boxed) 8.dp else 6.dp)) {
                Box(Modifier.height(line), contentAlignment = Alignment.Center) {
                    Box(Modifier.size(if (boxed) 5.dp else 4.dp).background(theme.colors.primary.color(), CircleShape))
                }
                Text(item.text, style = style, color = theme.colors.text.color(), modifier = Modifier.weight(1f).testTag(item.tag))
            }
        }
    }
}

// MARK: Notice

@Composable private fun NoticeCard(presenter: ConsentPresenter, privacyPolicyUrl: String) {
    val theme = LocalConsentTheme.current
    val shape = RoundedCornerShape(theme.radius.resolvedLg)
    Surface(Modifier.padding(theme.spacing.sm + theme.spacing.xs).widthIn(max = ContentWidth).semantics { testTagsAsResourceId = true }.testTag("inth.notice"),
        shape = shape, color = theme.colors.surface.color(), shadowElevation = 6.dp, border = BorderStroke(1.dp, theme.colors.text.color().copy(alpha = 0.1f))) {
        Column(Modifier.padding(theme.spacing.md + theme.spacing.xs), verticalArrangement = Arrangement.spacedBy(theme.spacing.sm + theme.spacing.xs)) {
            Heading(presenter.copy.noticeTitle, "inth.notice.title", MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold))
            Body(presenter.copy.noticeDescription)
            EqualDecisions {
                ConsentButton(presenter.copy.acknowledge, "inth.notice.acknowledge", !presenter.pending,
                    progress = presenter.showProgress && presenter.pendingAction == ConsentPresenter.Action.ACKNOWLEDGE, progressLabel = presenter.copy.saving, settings = true) { presenter.commit(ConsentPresenter.Action.ACKNOWLEDGE) }
                ConsentButton(presenter.copy.privacySettings, "inth.notice.settings", !presenter.pending, ButtonVariant.QUIET, settings = true) { presenter.presentPreferences() }
            }
            // The policy link and the provider tag share the card's last line.
            // At large text they stack, so neither is squeezed.
            if (actionsInPage()) Column {
                PolicyLink(privacyPolicyUrl, presenter.iabCopy, footnoteStyle())
                if (theme.showsBranding) ProviderBranding(presenter.copy.securedBy, "inth.notice.branding", Modifier)
            } else Row(verticalAlignment = Alignment.CenterVertically) {
                PolicyLink(privacyPolicyUrl, presenter.iabCopy, footnoteStyle())
                Spacer(Modifier.weight(1f))
                if (theme.showsBranding) ProviderBranding(presenter.copy.securedBy, "inth.notice.branding", Modifier)
            }
            presenter.errorMessage?.let { FailureRow(it, "inth.notice.error", !presenter.pending, presenter.iabCopy.appTryAgain, presenter::retry) }
        }
    }
}

// MARK: Grouped rows

/** The inset-grouped card: rows share one surface, with rounded ends and hairlines between. */
private fun groupShape(index: Int, count: Int, radius: androidx.compose.ui.unit.Dp): Shape {
    val top = if (index == 0) radius else 0.dp
    val bottom = if (index == count - 1) radius else 0.dp
    return RoundedCornerShape(topStart = top, topEnd = top, bottomStart = bottom, bottomEnd = bottom)
}

@Composable private fun GroupedRow(index: Int, count: Int, modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    val theme = LocalConsentTheme.current
    Surface(color = theme.colors.surface.color(), shape = groupShape(index, count, theme.radius.md), modifier = modifier.fillMaxWidth().padding(horizontal = 8.dp)) {
        Column {
            content()
            if (index < count - 1) Hairline(Modifier.padding(start = 16.dp))
        }
    }
}

/** Emit [count] grouped rows as lazy items. */
private fun LazyListScope.group(count: Int, key: (Int) -> Any, content: @Composable ColumnScope.(Int) -> Unit) {
    items(count, key = key) { index -> GroupedRow(index, count) { content(index) } }
}

/** The 14sp row title, at medium weight: what iOS sets as a subheadline. */
@Composable private fun subheadlineStyle(): TextStyle = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Medium)

@Composable private fun RowLabel(title: String, description: String? = null, note: String? = null, modifier: Modifier = Modifier, noteTag: String? = null) {
    val theme = LocalConsentTheme.current
    Column(modifier, verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(title, style = subheadlineStyle(), color = theme.colors.text.color())
        if (!description.isNullOrEmpty()) Body(description, style = footnoteStyle())
        if (note != null) Text(note, style = MaterialTheme.typography.bodySmall, color = theme.colors.textMuted.color(),
            modifier = if (noteTag != null) Modifier.testTag(noteTag) else Modifier)
    }
}

/**
 * The icon at the leading edge of a settings row, in the accent. It labels the row; the standard
 * name beside it stays the text. At accessibility sizes it goes, and the text takes the row's
 * whole width.
 */
@Composable private fun RowIcon(icon: ImageVector?) {
    if (icon == null || consentUsesLargeText()) return
    Box(Modifier.width(28.dp), contentAlignment = Alignment.Center) {
        Icon(icon, contentDescription = null, tint = LocalConsentTheme.current.colors.primary.color(), modifier = Modifier.size(22.dp))
    }
    Spacer(Modifier.width(14.dp))
}

@Composable private fun ChoiceRow(title: String, description: String, value: Boolean, id: String, enabled: Boolean = true, note: String? = null,
    noteTag: String? = null, icon: ImageVector? = null, inset: Dp = 16.dp, onChange: (Boolean) -> Unit) {
    val large = LocalDensity.current.fontScale >= 1.5f
    val modifier = Modifier.fillMaxWidth().defaultMinSize(minHeight = 56.dp)
        .toggleable(value, enabled = enabled, role = Role.Switch, onValueChange = onChange).testTag(id).padding(horizontal = inset, vertical = 12.dp)
    if (large) Column(modifier, verticalArrangement = Arrangement.spacedBy(8.dp)) { RowLabel(title, description, note, noteTag = noteTag); Switch(value, null, enabled = enabled) }
    else Row(modifier, verticalAlignment = Alignment.CenterVertically) {
        RowIcon(icon)
        RowLabel(title, description, note, Modifier.weight(1f), noteTag = noteTag)
        Spacer(Modifier.width(16.dp))
        Switch(value, null, enabled = enabled)
    }
}

@Composable private fun StatusRow(title: String, description: String?, status: String, statusTag: String, note: String? = null, noteTag: String? = null, icon: ImageVector? = null) {
    val theme = LocalConsentTheme.current
    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
        RowIcon(icon)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            RowLabel(title, description)
            if (note != null) Text(note, style = MaterialTheme.typography.bodySmall, color = theme.colors.textMuted.color(), modifier = if (noteTag != null) Modifier.testTag(noteTag) else Modifier)
        }
        Spacer(Modifier.width(12.dp))
        Text(status, style = footnoteStyle(), color = theme.colors.textMuted.color(), modifier = Modifier.testTag(statusTag))
    }
}

@Composable private fun Category(p: ConsentPresenter, c: ConsentCategory) {
    val row = p.draft.category(c)
    val icon = SummaryIcons.category(c.wireName)
    if (!row.locked) ChoiceRow(row.title, row.description, row.checked, "inth.prefs.category.${c.wireName}.switch", row.enabled,
        note = row.note, noteTag = if (row.note != null) "inth.prefs.category.${c.wireName}.restricted" else null, icon = icon, onChange = row.onCheckedChange)
    else StatusRow(row.title, row.description, row.lockedLabel.orEmpty(), "inth.prefs.category.${c.wireName}.locked",
        note = row.note, noteTag = if (c.optional) "inth.prefs.category.${c.wireName}.restricted" else null, icon = icon)
}

// MARK: Preferences

/** Standing settings in the platform's own voice: grouped cards on the canvas. */
@Composable private fun Preferences(p: ConsentPresenter, policyUrl: String, partners: (Int?) -> Unit, providers: () -> Unit, customVendors: () -> Unit) {
    val theme = LocalConsentTheme.current
    val page = actionsInPage()
    val list = rememberLazyListState()
    // A failure beside the pinned action is the page's last row, which a long list may not have
    // composed yet; scroll there once the new rows have been laid out.
    LaunchedEffect(p.errorCode) {
        if (page && p.errorCode != null && showsPinnedStatus(p)) {
            repeat(2) { withFrameNanos {} }
            list.animateScrollToItem((list.layoutInfo.totalItemsCount - 1).coerceAtLeast(0))
        }
    }
    LazyColumn(Modifier.fillMaxSize().testTag(if (p.iab) "inth.iab" else "inth.prefs"), state = list, contentPadding = PaddingValues(horizontal = 8.dp, vertical = 8.dp)) {
        if (p.snapshot.policyPending) {
            item {
                GroupedRow(0, 1) {
                    Column(Modifier.padding(16.dp).testTag("inth.status.unavailable"), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(p.iabCopy.appPreferencesUnavailable, color = theme.colors.text.color())
                        TextButton(onClick = p::refresh, modifier = Modifier.testTag("inth.status.unavailable.retry")) { Text(p.iabCopy.appTryAgain) }
                    }
                }
            }
        } else {
            if (p.stale) item {
                InfoCallout(Modifier.padding(horizontal = 8.dp, vertical = 8.dp).testTag("inth.prefs.stale")) {
                    Text(p.iabCopy.appSettingsChanged, fontWeight = FontWeight.SemiBold, modifier = Modifier.semantics { heading() }.testTag("inth.prefs.stale.title"))
                    Text(p.iabCopy.appSettingsChangedDetail)
                }
            }
            item {
                Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    if (p.iab) {
                        Body(p.iabCopy.appPreferencesIntro)
                        TextButton(onClick = { partners(null) }, contentPadding = PaddingValues(horizontal = 4.dp), modifier = Modifier.testTag("inth.iab.partner-count")) {
                            Text(p.iabCopy.format(p.iabCopy.appIabPartnerCount, mapOf("count" to "${p.disclosure?.vendors?.size ?: 0}")), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium, color = theme.colors.primary.color())
                        }
                    } else Body(p.copy.preferencesDescription)
                }
            }
            p.optOutStatus?.let { status ->
                item {
                    InfoCallout(Modifier.padding(horizontal = 8.dp, vertical = 8.dp).testTag("inth.prefs.opt-out-status")) {
                        Text(status)
                    }
                }
            }
            if (page && showsShortcuts(p)) item { DecisionGroup(p, first = false, DecisionPart.SHORTCUTS, Modifier.padding(start = 8.dp, end = 8.dp, top = 8.dp)) }
            item { if (p.iab) SectionLabel(p.iabCopy.appThisApp) else Spacer(Modifier.height(12.dp)) }
            val categories = p.offeredCategories
            group(categories.size, key = { "category-${categories[it].wireName}" }) { Category(p, categories[it]) }
            p.iabRows?.let { iab ->
                val d = iab.disclosure
                val copy = p.iabCopy
                // Only what this app's partners declare, as the web panel lists it.
                val purposes = iab.purposes
                item { SectionLabel(copy.preferenceCenterVendorListPurposes) }
                group(purposes.size, key = { "purpose-${purposes[it].id}" }) { Purpose(p, purposes[it]) { partners(purposes[it].id) } }
                // Beside the switches it explains, not at the top of the page.
                if (purposes.any { it.legitimateInterest != null }) item {
                    Footnote(iab.legitimateInterestExplanation, Modifier.testTag("inth.iab.legitimate-interest-explanation"))
                }
                val specials = iab.specialFeatures
                if (specials.isNotEmpty()) {
                    item { SectionLabel(copy.preferenceCenterVendorListSpecialFeatures) }
                    group(specials.size, key = { "special-${specials[it].id}" }) { index ->
                        val row = specials[index]
                        // One opt-in per special feature, with its standard texts and illustrations behind the row.
                        DefinitionRow(row, "inth.iab.special-feature.${row.id}", SummaryIcons.specialFeature(row.id), copy, note = copy.appSpecialFeatureOptIn, trailing = {
                            Switch(row.optIn, row.onOptInChange, enabled = row.enabled,
                                modifier = Modifier.testTag("inth.iab.special-feature.${row.id}.switch").semantics { contentDescription = row.name })
                        })
                    }
                }
                val specialPurposes = iab.specialPurposes
                if (specialPurposes.isNotEmpty()) {
                    item { SectionLabel(copy.preferenceCenterVendorListSpecialPurposes) }
                    group(specialPurposes.size, key = { "sp-${specialPurposes[it].id}" }) { index -> Definition(specialPurposes[index], "inth.iab.special-purpose.${specialPurposes[index].id}", copy, SummaryIcons.specialPurpose(specialPurposes[index].id)) }
                    item { Footnote(iab.specialPurposesExplanation) }
                }
                val features = iab.features
                if (features.isNotEmpty()) {
                    item { SectionLabel(copy.preferenceCenterFeaturesTitle) }
                    group(features.size, key = { "feature-${features[it].id}" }) { index -> Definition(features[index], "inth.iab.feature.${features[index].id}", copy, SummaryIcons.feature(features[index].id)) }
                    item { Footnote(iab.featuresExplanation, Modifier.testTag("inth.iab.features-standard-text")) }
                }
                item { SectionLabel(copy.appPartners) }
                val providerCount = d.adTechProviders.orEmpty().size
                val customCount = d.customVendors.size
                val rows = listOfNotNull("iab", if (providerCount > 0) "providers" else null, if (customCount > 0) "custom" else null)
                group(rows.size, key = { "partners-${rows[it]}" }) { index ->
                    when (rows[index]) {
                        "iab" -> NavigationRow(copy.appIabPartners, "${d.vendors.size}", "inth.iab.partners", SummaryIcons.PARTNERS) { partners(null) }
                        "providers" -> NavigationRow(p.iabCopy.preferenceCenterVendorListAdTechProvidersHeading, "$providerCount", "inth.iab.other-partners", SummaryIcons.AD_TECH_PROVIDERS, providers)
                        else -> NavigationRow(p.iabCopy.preferenceCenterVendorListCustomVendorsHeading, "$customCount", "inth.iab.custom-partners", SummaryIcons.CUSTOM_PARTNERS, customVendors)
                    }
                }
                // Where the TC String lives and for how long, which IAB asks the second layer to say.
                iab.consentStorage?.let { text ->
                    item { Footnote(text, Modifier.padding(top = 12.dp).testTag("inth.iab.consent-storage")) }
                }
            }
            item {
                Spacer(Modifier.height(20.dp))
                GroupedRow(0, 1) {
                    Column(Modifier.padding(horizontal = 12.dp, vertical = 8.dp)) {
                        PolicyLink(policyUrl, p.iabCopy)
                        p.snapshot.explicitChoice?.let {
                            Text(p.lastChanged(it.actionAt), style = MaterialTheme.typography.bodySmall,
                                color = theme.colors.textMuted.color(), modifier = Modifier.padding(start = 4.dp, bottom = 8.dp).testTag("inth.prefs.last-changed"))
                        }
                    }
                }
            }
        }
        if (page && showsPinnedStatus(p)) item { DecisionGroup(p, first = false, DecisionPart.PINNED_STATUS, Modifier.padding(start = 8.dp, end = 8.dp, top = 16.dp)) }
    }
}

@Composable private fun Footnote(text: String, modifier: Modifier = Modifier) {
    if (text.isEmpty() && modifier == Modifier) return
    Text(text, style = MaterialTheme.typography.bodySmall, color = LocalConsentTheme.current.colors.textMuted.color(), modifier = modifier.padding(horizontal = 16.dp, vertical = 8.dp))
}

/** A row that leads to a partner page: icon, name, count and a chevron. */
@Composable private fun NavigationRow(title: String, value: String, id: String, icon: ImageVector? = null, onClick: () -> Unit) {
    val theme = LocalConsentTheme.current
    Row(Modifier.fillMaxWidth().defaultMinSize(minHeight = 52.dp).clickable(onClick = onClick, role = Role.Button).testTag(id).padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically) {
        RowIcon(icon)
        Text(title, style = subheadlineStyle(), color = theme.colors.text.color(), modifier = Modifier.weight(1f))
        Text(value, style = MaterialTheme.typography.bodyMedium, color = theme.colors.textMuted.color(), modifier = Modifier.padding(start = 12.dp, end = 8.dp))
        Icon(ConsentIcons.KeyboardArrowRight, contentDescription = null, tint = theme.colors.textMuted.color(), modifier = Modifier.size(20.dp))
    }
}

/**
 * One row per definition: an icon, the standard name and a note, with the control at the end.
 * Tapping the name opens the rest in place: the user-friendly text, the legal text and the vendor
 * list's standard illustrations, then whatever the row adds. This is every purpose, special
 * purpose, feature and special feature.
 */
@Composable private fun DefinitionRow(item: IabDefinition, id: String, icon: ImageVector?, copy: IabCopy, note: String? = null,
    trailing: @Composable () -> Unit, extra: @Composable ColumnScope.() -> Unit = {}) {
    val theme = LocalConsentTheme.current
    var expanded by rememberSaveable(id) { mutableStateOf(false) }
    val showsIcon = icon != null && !consentUsesLargeText()
    // The partner counts sit on the collapsed row, one per line: consent, then legitimate interest.
    val lines = note?.split(" \u00B7 ").orEmpty()
    val muted = theme.colors.textMuted.color()
    val caption = MaterialTheme.typography.bodySmall
    // The chevron ends the last line of text, so the name and the counts keep the row's width.
    val chevron = mapOf("chevron" to InlineTextContent(Placeholder(caption.fontSize * 1.25f, caption.fontSize * 1.25f, PlaceholderVerticalAlign.TextCenter)) {
        Icon(if (expanded) ConsentIcons.KeyboardArrowUp else ConsentIcons.KeyboardArrowDown, contentDescription = null, tint = muted, modifier = Modifier.fillMaxSize())
    })
    fun ended(text: String, last: Boolean): AnnotatedString = if (!last) AnnotatedString(text) else buildAnnotatedString {
        append(text); append("\u00A0"); appendInlineContent("chevron", "\u00A0")
    }
    Column(Modifier.fillMaxWidth().animateContentSize().testTag(id)) {
        Row(Modifier.fillMaxWidth().padding(end = 16.dp), verticalAlignment = Alignment.CenterVertically) {
            Row(Modifier.weight(1f).defaultMinSize(minHeight = 56.dp).clickable(role = Role.Button) { expanded = !expanded }
                .semantics {
                    contentDescription = listOfNotNull(item.name, note, if (expanded) copy.appHideDetails else copy.appDetails).joinToString(", ")
                    stateDescription = if (expanded) copy.appExpanded else copy.appCollapsed
                }.testTag("$id.details").padding(start = 16.dp, top = 10.dp, end = 12.dp, bottom = 10.dp),
                verticalAlignment = Alignment.CenterVertically) {
                RowIcon(icon)
                Column(Modifier.weight(1f).clearAndSetSemantics {}, verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text(ended(item.name, lines.isEmpty()), style = subheadlineStyle(), color = theme.colors.text.color(), inlineContent = chevron)
                    lines.forEachIndexed { index, line ->
                        Text(ended(line, index == lines.lastIndex), style = caption, color = muted, inlineContent = chevron)
                    }
                }
            }
            trailing()
        }
        if (expanded) Column(Modifier.fillMaxWidth().padding(start = if (showsIcon) 58.dp else 16.dp, top = 2.dp, end = 16.dp, bottom = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            val footnote = footnoteStyle()
            if (item.description.isNotEmpty()) Text(item.description, style = footnote, color = theme.colors.text.color())
            if (item.legalDescription.isNotEmpty() && item.legalDescription != item.description) Text(item.legalDescription, style = footnote, color = muted)
            Illustrations(item.illustrations, "$id.illustrations")
            extra()
        }
    }
}

/** A special purpose or feature: no choice to make, so its status stands where a switch would. */
@Composable private fun Definition(item: IabDefinition, id: String, copy: IabCopy, icon: ImageVector? = null) {
    DefinitionRow(item, id, icon, copy, trailing = {
        Text(copy.appNoChoice, style = MaterialTheme.typography.bodySmall, color = LocalConsentTheme.current.colors.textMuted.color(), modifier = Modifier.testTag("$id.status"))
    })
}

/** A titled group of read-only rows: a label and, when there is one, its value. */
@Composable private fun FactGroup(title: String, facts: List<IabFact>, tag: String? = null) {
    if (facts.isEmpty()) return
    val theme = LocalConsentTheme.current
    SectionLabel(title)
    Column(if (tag != null) Modifier.testTag(tag) else Modifier) {
        facts.forEachIndexed { index, fact ->
            GroupedRow(index, facts.size) {
                Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 14.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(fact.label, style = MaterialTheme.typography.bodyMedium, color = theme.colors.text.color(), modifier = Modifier.weight(1f))
                    fact.value?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = theme.colors.textMuted.color()) }
                }
            }
        }
    }
}

/** The list's standard illustrations for one item, verbatim, one bullet line each. */
@Composable private fun Illustrations(illustrations: List<String>, id: String, modifier: Modifier = Modifier) {
    if (illustrations.isEmpty()) return
    val style = footnoteStyle()
    val measurer = rememberTextMeasurer()
    val density = LocalDensity.current
    // A wrapped line hangs under its text, not under the bullet.
    val indent = remember(style, density) { with(density) { measurer.measure("\u2022 ", style).size.width.toSp() } }
    Column(modifier.testTag(id), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        illustrations.forEach { Body("\u2022 $it", style = style.copy(textIndent = TextIndent(restLine = indent))) }
    }
}

/** The purposes Google needs consent to before an ad tech provider counts its consent. */
private val adTechProviderPurposeIds = setOf(1, 3, 4)

@Composable private fun Purpose(p: ConsentPresenter, row: IabPurposeRow, partners: () -> Unit) {
    val id = row.id
    val theme = LocalConsentTheme.current
    val copy = p.iabCopy
    // How many partners ask is on the row itself, not only behind the expansion. Zero is shown
    // too, so an absent count never reads as an omitted one.
    DefinitionRow(row, "inth.iab.purpose.$id", SummaryIcons.purpose(id), copy, note = row.partnersNote, trailing = {
        Switch(row.consent, row.onConsentChange, enabled = row.enabled,
            modifier = Modifier.testTag("inth.iab.purpose.$id.consent").semantics { contentDescription = row.name })
    }) {
        TextButton(onClick = partners, contentPadding = PaddingValues(0.dp), modifier = Modifier.defaultMinSize(minHeight = 44.dp).testTag("inth.iab.purpose.$id.view-partners")) {
            Text(copy.appViewPartners, style = footnoteStyle(), fontWeight = FontWeight.Medium, color = theme.colors.primary.color())
            Icon(ConsentIcons.KeyboardArrowRight, contentDescription = null, tint = theme.colors.primary.color(), modifier = Modifier.size(16.dp))
        }
        row.legitimateInterest?.let { interest ->
            // The objection is a control of its own, boxed apart from the consent switch above it.
            Box(Modifier.clip(RoundedCornerShape(theme.radius.resolvedSm)).background(theme.colors.text.color().copy(alpha = 0.06f))) {
                ChoiceRow(copy.preferenceCenterPurposeItemLegitimateInterest, "", interest, "inth.iab.purpose.$id.li", row.enabled,
                    note = row.rightToObject, inset = 12.dp, onChange = row.onLegitimateInterestChange)
            }
        }
    }
}

// MARK: Partners

private fun String.searchKey() = Normalizer.normalize(this, Normalizer.Form.NFD).replace("\\p{M}+".toRegex(), "").lowercase(Locale.ROOT)

private class SearchFieldLayout {
    var field: LayoutCoordinates? = null
    var content: LayoutCoordinates? = null
    var editor: EditText? = null

    fun updatePadding() {
        val field = field?.takeIf { it.isAttached } ?: return
        val content = content?.takeIf { it.isAttached } ?: return
        val bounds = field.localBoundingBoxOf(content, clipBounds = false)
        editor?.setPadding(bounds.left.roundToInt(), bounds.top.roundToInt(),
            (field.size.width - bounds.right).roundToInt(), (field.size.height - bounds.bottom).roundToInt())
    }
}

@Composable private fun SearchField(value: String, onChange: (String) -> Unit, label: String, id: String) {
    val theme = LocalConsentTheme.current
    val currentValue by rememberUpdatedState(value)
    val currentChange by rememberUpdatedState(onChange)
    val interactions = remember { MutableInteractionSource() }
    var focus by remember { mutableStateOf<FocusInteraction.Focus?>(null) }
    val scope = rememberCoroutineScope()
    val hostView = LocalView.current
    val layout = remember { SearchFieldLayout() }
    val style = MaterialTheme.typography.bodyLarge
    val typeface = LocalFontFamilyResolver.current.resolve(style.fontFamily, style.fontWeight ?: FontWeight.Normal,
        style.fontStyle ?: FontStyle.Normal, style.fontSynthesis ?: FontSynthesis.All).value as android.graphics.Typeface
    val ink = theme.colors.text.color().toArgb()
    val accent = theme.colors.primary.color().toArgb()
    val selection = theme.colors.primary.color().copy(alpha = 0.4f).toArgb()
    val colors = OutlinedTextFieldDefaults.colors(focusedContainerColor = theme.colors.surface.color(), unfocusedContainerColor = theme.colors.surface.color(),
        focusedBorderColor = theme.colors.primary.color(), unfocusedBorderColor = theme.colors.text.color().copy(alpha = 0.18f))
    val lineHeight = with(LocalDensity.current) { style.lineHeight.roundToPx() }
    val contentHeight = with(LocalDensity.current) { style.lineHeight.toDp() }
    val labelPadding = with(LocalDensity.current) { MaterialTheme.typography.bodySmall.lineHeight.toDp() / 2 }
    Box(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp).testTag(id)
        .padding(top = labelPadding)
        .defaultMinSize(minWidth = OutlinedTextFieldDefaults.MinWidth, minHeight = OutlinedTextFieldDefaults.MinHeight)
        .onGloballyPositioned { layout.field = it; layout.updatePadding() }) {
        OutlinedTextFieldDefaults.DecorationBox(value = value, singleLine = true, enabled = true,
            visualTransformation = VisualTransformation.None, interactionSource = interactions,
            label = { Text(label, modifier = Modifier.clearAndSetSemantics {}) },
            leadingIcon = { Icon(ConsentIcons.Search, contentDescription = null, tint = theme.colors.textMuted.color()) },
            colors = colors,
            container = { OutlinedTextFieldDefaults.Container(enabled = true, isError = false, interactionSource = interactions,
                colors = colors,
                shape = RoundedCornerShape(theme.radius.md)) },
            innerTextField = {
                Spacer(Modifier.fillMaxWidth().height(contentHeight).onGloballyPositioned {
                    layout.content = it; layout.updatePadding()
                })
            })
        // Material measures the text insets; the native editor keeps the whole field tappable and editable.
        AndroidView(modifier = Modifier.matchParentSize(), factory = { context ->
            EditText(context).apply {
                layout.editor = this
                tag = id
                background = null
                minimumWidth = 0; minimumHeight = 0
                setPadding(0, 0, 0, 0)
                includeFontPadding = false
                gravity = android.view.Gravity.START or android.view.Gravity.CENTER_VERTICAL
                setSingleLine(true)
                inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_AUTO_CORRECT
                imeOptions = EditorInfo.IME_ACTION_DONE
                isSaveEnabled = false
                setHintTextColor(android.graphics.Color.TRANSPARENT)
                addTextChangedListener(object : TextWatcher {
                    override fun beforeTextChanged(text: CharSequence?, start: Int, count: Int, after: Int) = Unit
                    override fun onTextChanged(text: CharSequence?, start: Int, before: Int, count: Int) = Unit
                    override fun afterTextChanged(text: Editable?) {
                        val next = text.toString()
                        if (next != currentValue) currentChange(next)
                    }
                })
                setOnFocusChangeListener { _, focused ->
                    scope.launch {
                        if (focused) FocusInteraction.Focus().also { focus = it; interactions.emit(it) }
                        else focus?.let { interactions.emit(FocusInteraction.Unfocus(it)); focus = null }
                    }
                }
            }
        }, onReset = null, onRelease = { edit ->
            edit.context.getSystemService(InputMethodManager::class.java)?.hideSoftInputFromWindow(hostView.windowToken, 0)
            edit.clearFocus()
            layout.editor = null
        }, update = { edit ->
            if (edit.text.toString() != value) {
                edit.setText(value)
                edit.setSelection(value.length)
            }
            edit.hint = label
            edit.typeface = typeface
            edit.setTextSize(TypedValue.COMPLEX_UNIT_SP, style.fontSize.value)
            edit.letterSpacing = style.letterSpacing.value / style.fontSize.value
            TextViewCompat.setLineHeight(edit, lineHeight)
            edit.setTextColor(ink)
            edit.highlightColor = selection
            if (Build.VERSION.SDK_INT >= 29) edit.textCursorDrawable?.mutate()?.setTint(accent)
            layout.updatePadding()
        })
    }
}

/** On, Partly on, or Off at a glance, beside the chevron into the partner. */
@Composable private fun StatusTag(status: String, off: Boolean, modifier: Modifier = Modifier) {
    val theme = LocalConsentTheme.current
    Text(status, style = MaterialTheme.typography.labelMedium, color = if (off) theme.colors.textMuted.color() else theme.colors.statusTagText.color(),
        modifier = modifier.background(if (off) theme.colors.surfaceMuted.color() else theme.colors.primary.color().copy(alpha = 0.14f), CircleShape).padding(horizontal = 8.dp, vertical = 4.dp))
}

@Composable private fun Vendors(p: ConsentPresenter, purpose: Int?, clear: () -> Unit, open: (Int) -> Unit, openProviders: () -> Unit, openCustomVendors: (Int?) -> Unit) {
    var search by rememberSaveable { mutableStateOf("") }
    val collator = remember { Collator.getInstance() }
    val theme = LocalConsentTheme.current
    val vendors = p.iabRows?.vendors(purpose).orEmpty().filter { it.name.searchKey().contains(search.searchKey()) }
        .sortedWith { a, b -> collator.compare(a.name, b.name) }
    Column(Modifier.fillMaxSize().testTag("inth.iab.vendors")) {
        SearchField(search, { search = it }, p.iabCopy.appSearchPartners, "inth.iab.vendors.search")
        if (purpose != null) TextButton(onClick = clear, modifier = Modifier.padding(horizontal = 12.dp).testTag("inth.iab.vendors.filter.purpose.clear")) {
            Text(p.iabCopy.format(p.iabCopy.appPurposeFilter, mapOf("purpose" to p.disclosure?.list?.purposes?.get(purpose)?.name.orEmpty())), style = MaterialTheme.typography.bodyMedium, color = theme.colors.primary.color())
            Icon(ConsentIcons.Clear, contentDescription = p.iabCopy.commonClearSelection, tint = theme.colors.primary.color(), modifier = Modifier.padding(start = 4.dp).size(16.dp))
        }
        LazyColumn(contentPadding = PaddingValues(horizontal = 8.dp, vertical = 8.dp)) {
            if (vendors.isEmpty()) item { Body(p.iabCopy.format(p.iabCopy.appNoPartnersMatch, mapOf("search" to search)), Modifier.padding(16.dp).testTag("inth.iab.vendors.empty")) }
            group(vendors.size, key = { vendors[it].id }) { index ->
                val v = vendors[index]
                PartnerRow(v.name, v.summary, v.statusLabel, v.status, "inth.iab.vendors.vendor.${v.id}") { open(v.id) }
            }
            // The first layer's partner count includes these, so the list it opens leads to them,
            // on their own page apart from IAB partners.
            val providerCount = p.disclosure?.adTechProviders.orEmpty().size
            if ((purpose == null || purpose in adTechProviderPurposeIds) && search.isEmpty() && providerCount > 0) {
                item { Spacer(Modifier.height(16.dp)) }
                group(1, key = { "other-partners" }) {
                    NavigationRow(p.iabCopy.preferenceCenterVendorListAdTechProvidersHeading, "$providerCount", "inth.iab.vendors.other-partners", SummaryIcons.AD_TECH_PROVIDERS, openProviders)
                }
                item { Footnote(p.iabCopy.preferenceCenterVendorListAdTechProvidersNotice) }
            }
            // Custom partners are listed with IAB partners, as on the web, on a page of their own.
            val customCount = p.disclosure?.customVendors.orEmpty().count { purpose == null || purpose in it.purposes || purpose in it.legIntPurposes }
            if (search.isEmpty() && customCount > 0) {
                item { Spacer(Modifier.height(16.dp)) }
                group(1, key = { "custom-partners" }) {
                    NavigationRow(p.iabCopy.preferenceCenterVendorListCustomVendorsHeading, "$customCount", "inth.iab.vendors.custom-partners", SummaryIcons.CUSTOM_PARTNERS) { openCustomVendors(purpose) }
                }
                item { Footnote(p.iabCopy.preferenceCenterVendorListCustomVendorsNotice) }
            }
        }
    }
}

@Composable private fun CustomVendors(p: ConsentPresenter, purpose: Int?, open: (String) -> Unit) {
    var search by rememberSaveable { mutableStateOf("") }
    val collator = remember { Collator.getInstance() }
    val theme = LocalConsentTheme.current
    val vendors = p.iabRows?.customVendors.orEmpty().filter { v ->
        v.name.searchKey().contains(search.searchKey()) && (purpose == null || purpose in v.vendor.purposes || purpose in v.vendor.legIntPurposes)
    }.sortedWith { a, b -> collator.compare(a.name, b.name) }
    Column(Modifier.fillMaxSize().testTag("inth.iab.custom-vendors")) {
        SearchField(search, { search = it }, p.iabCopy.appSearchPartners, "inth.iab.custom-vendors.search")
        LazyColumn(contentPadding = PaddingValues(horizontal = 8.dp, vertical = 8.dp)) {
            item { Body(p.iabCopy.preferenceCenterVendorListCustomVendorsNotice, Modifier.padding(horizontal = 16.dp, vertical = 8.dp).testTag("inth.iab.custom-vendors.intro")) }
            if (vendors.isEmpty()) item { Body(p.iabCopy.format(p.iabCopy.appNoPartnersMatch, mapOf("search" to search)), Modifier.padding(16.dp).testTag("inth.iab.custom-vendors.empty")) }
            group(vendors.size, key = { "custom-${vendors[it].id}" }) { index ->
                val v = vendors[index]
                PartnerRow(v.name, v.summary, v.statusLabel, v.status, "inth.iab.custom-vendors.vendor.${v.id}") { open(v.id) }
            }
        }
    }
}

/** A partner in a list: its name, how many purposes it has on each basis, and whether it is on. */
@Composable private fun PartnerRow(name: String, summary: String, statusLabel: String, status: IabVendorSelectionStatus, tag: String, open: () -> Unit) {
    val theme = LocalConsentTheme.current
    Row(Modifier.fillMaxWidth().clickable(role = Role.Button, onClick = open).testTag(tag).padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(name, style = subheadlineStyle(), color = theme.colors.text.color())
            Text(summary, style = MaterialTheme.typography.bodySmall, color = theme.colors.textMuted.color())
        }
        StatusTag(statusLabel, status == IabVendorSelectionStatus.OFF, Modifier.testTag("$tag.status"))
    }
}

/** One partner's page: its links, its switches, then everything it discloses. Registered and custom partners share it. */
@Composable private fun PartnerPage(p: ConsentPresenter, tag: String, detail: IabVendorDetail, consent: Boolean?, interest: Boolean?, enabled: Boolean,
    onConsent: (Boolean) -> Unit, onInterest: (Boolean) -> Unit, registered: Boolean, header: @Composable () -> Unit) {
    val copy = p.iabCopy
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 8.dp, vertical = 8.dp).testTag(tag)) {
        header()
        SectionLabel(copy.appYourChoices)
        val choiceRows = listOfNotNull(if (consent != null) "consent" else null, if (interest != null) "li" else null,
            if (detail.notAllowedPurposes.isNotEmpty()) "not-allowed" else null)
        choiceRows.forEachIndexed { index, kind ->
            GroupedRow(index, choiceRows.size) {
                when (kind) {
                    "consent" -> ChoiceRow(copy.appConsent, detail.consentPurposes.joinToString(", "), consent == true, "$tag.consent", enabled, onChange = onConsent)
                    "li" -> ChoiceRow(copy.preferenceCenterPurposeItemLegitimateInterest, detail.legitimateInterestPurposes.joinToString(", "), interest == true, "$tag.li", enabled,
                        note = copy.appTurnOffToObject, onChange = onInterest)
                    else -> Body(copy.format(copy.appNotAllowedPurposes, mapOf("purposes" to detail.notAllowedPurposes.joinToString(", "))), Modifier.padding(16.dp).testTag("$tag.not-allowed"))
                }
            }
        }
        if (registered && interest != null) Footnote(copy.appLegitimateInterestExplanation, Modifier.testTag("$tag.li-explanation"))
        FactGroup(copy.preferenceCenterVendorListSpecialPurposes, detail.specialPurposes.map { IabFact(it, copy.appNoChoice) })
        // Features are read-only, with their standard texts and illustrations and the standard explanation.
        if (detail.features.isNotEmpty()) {
            SectionLabel(copy.preferenceCenterFeaturesTitle)
            detail.features.forEachIndexed { index, item ->
                GroupedRow(index, detail.features.size) { Definition(item, "$tag.feature.${item.id}", copy) }
            }
            Footnote(p.iabRows?.featuresExplanation.orEmpty(), if (registered) Modifier.testTag("$tag.features-standard-text") else Modifier)
        }
        FactGroup(copy.preferenceCenterVendorListSpecialFeatures, detail.specialFeatures)
        if (detail.specialFeatures.isNotEmpty()) Footnote(copy.appSpecialFeaturesElsewhere)
        FactGroup(copy.appDataCollected, detail.dataCategories.map { IabFact(it, null) })
        FactGroup(copy.appRetentionTitle, detail.retention, "$tag.retention")
        FactGroup(copy.appDeviceStorage, detail.storage, "$tag.storage")
        detail.deviceStorageDisclosureUrl?.let { Box(Modifier.padding(horizontal = 12.dp)) { ExternalLink(copy.appDeviceStorageDetails, it, "$tag.storage-link") } }
        Spacer(Modifier.height(16.dp))
    }
}

@Composable private fun CustomVendor(p: ConsentPresenter, id: String) {
    val row = p.iabRows?.customVendors?.firstOrNull { it.id == id } ?: return
    val copy = p.iabCopy
    val tag = "inth.iab.custom-vendor.$id"
    PartnerPage(p, tag, row.details, row.consent, row.legitimateInterest, row.enabled, row.onConsentChange, row.onLegitimateInterestChange, registered = false) {
        GroupedRow(0, 1) {
            Column(Modifier.padding(horizontal = 12.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Body(copy.commonCustomPartner, Modifier.testTag("$tag.note"))
                row.vendor.description?.takeIf { it.isNotEmpty() }?.let { Body(it) }
                ExternalLink(copy.preferenceCenterVendorListPrivacyPolicy, row.vendor.privacyPolicyUrl, "$tag.privacy-link")
            }
        }
    }
}

@Composable private fun Vendor(p: ConsentPresenter, id: Int) {
    val row = p.iabRows?.vendor(id) ?: return
    val copy = p.iabCopy
    val tag = "inth.iab.vendor.$id"
    PartnerPage(p, tag, row.details, row.consent, row.legitimateInterest, row.enabled, row.onConsentChange, row.onLegitimateInterestChange, registered = true) {
        val links = listOfNotNull(row.details.privacyPolicyUrl?.let { copy.preferenceCenterVendorListPrivacyPolicy to it }, row.details.legitimateInterestClaimUrl?.let { copy.appLegitimateInterestStatement to it })
        links.forEachIndexed { index, (label, url) -> GroupedRow(index, links.size) { Box(Modifier.padding(horizontal = 12.dp)) { ExternalLink(label, url, if (index == 0 && label == copy.preferenceCenterVendorListPrivacyPolicy) "$tag.privacy-link" else "$tag.li-claim-link") } } }
    }
}

@Composable private fun Providers(p: ConsentPresenter) {
    var search by rememberSaveable { mutableStateOf("") }
    val collator = remember { Collator.getInstance() }
    val providers = p.iabRows?.adTechProviders.orEmpty().filter { it.name.searchKey().contains(search.searchKey()) }.sortedWith { a, b -> collator.compare(a.name, b.name) }
    Column(Modifier.fillMaxSize().testTag("inth.ac")) {
        SearchField(search, { search = it }, p.iabCopy.appSearchOtherPartners, "inth.ac.search")
        LazyColumn(contentPadding = PaddingValues(horizontal = 8.dp, vertical = 8.dp)) {
            item { Body(providerIntro(p), Modifier.padding(horizontal = 16.dp, vertical = 8.dp).testTag("inth.ac.intro")) }
            if (providers.isEmpty()) item { Body(p.iabCopy.format(p.iabCopy.appNoPartnersMatch, mapOf("search" to search)), Modifier.padding(16.dp).testTag("inth.ac.empty")) }
            group(providers.size, key = { providers[it].id }) { index ->
                val provider = providers[index]
                ChoiceRow(provider.name, "", provider.consent, "inth.ac.provider.${provider.id}.switch", provider.enabled, onChange = provider.onConsentChange)
                Box(Modifier.padding(start = 12.dp, bottom = 4.dp)) { ExternalLink(p.iabCopy.preferenceCenterVendorListPrivacyPolicy, provider.policyUrl, "inth.ac.provider.${provider.id}.privacy-link") }
            }
        }
    }
}

/** The web's notice, plus why the providers stay off while their purposes are. */
private fun providerIntro(p: ConsentPresenter): String =
    p.iabRows?.adTechProvidersNotice ?: p.iabCopy.preferenceCenterVendorListAdTechProvidersNotice
