@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class, androidx.compose.ui.ExperimentalComposeUiApi::class)
package com.c15t.consentui

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
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material.icons.outlined.Clear
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.KeyboardArrowDown
import androidx.compose.material.icons.outlined.KeyboardArrowUp
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.toArgb
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
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontSynthesis
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.LineBreak
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Constraints
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
import com.c15t.consentui.generated.IabCopy
import com.c15t.core.iab.*
import com.c15t.core.model.*
import com.c15t.core.tc.*
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

/**
 * Native optional presenter. Put it beside the app's content and retain [presenter] in a ViewModelStore.
 * [privacyPolicyUrl] must point to the host's privacy policy. Links open the system browser.
 * [theme] defaults to [ConsentTheme.current] with the manifest's `<meta-data>` applied.
 */
@Composable
fun C15tConsent(presenter: ConsentPresenter, privacyPolicyUrl: String, noticeModifier: Modifier = Modifier.fillMaxSize(), theme: ConsentTheme? = null) {
    val context = LocalContext.current
    val resolved = remember(theme) { (theme ?: ConsentTheme.resolve(context)).withReadableDecisions() }
    val hostView = LocalView.current
    LaunchedEffect(presenter.announcementSequence) {
        if (presenter.announcementSequence > 0) hostView.announceForAccessibility(presenter.announcement)
    }
    CompositionLocalProvider(LocalConsentTheme provides resolved) {
        MaterialTheme(colorScheme = resolved.colorScheme(), typography = resolved.materialTypography()) {
            if (presenter.noticeVisible) {
                Box(noticeModifier, contentAlignment = Alignment.BottomCenter) { NoticeCard(presenter, privacyPolicyUrl) }
            }
            if (presenter.presentationID != null) ConsentDialog(presenter, privacyPolicyUrl)
        }
    }
}

/** The first layer and what it opens take the whole screen; standing settings do too, with Close. */
@Composable
private fun ConsentDialog(presenter: ConsentPresenter, privacyPolicyUrl: String) {
    val theme = LocalConsentTheme.current
    var page by rememberSaveable(presenter.presentationID) { mutableStateOf("root") }
    var purposeFilter by rememberSaveable(presenter.presentationID) { mutableStateOf<Int?>(null) }
    fun back() {
        if (presenter.pending) return
        when {
            page.startsWith("vendor:") -> page = "vendors"
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
                WindowCompat.getInsetsController(it, it.decorView).apply {
                    isAppearanceLightStatusBars = !dark
                    isAppearanceLightNavigationBars = !dark
                }
            }
        }
        BackHandler { back() }
        Box(Modifier.fillMaxSize().background(theme.colors.canvas.color()).semantics {
            testTagsAsResourceId = true
            paneTitle = if (presenter.preferences) presenter.iabCopy.preferenceCenterTitle else theme.copy.headline
        }) {
            AnimatedContent(targetState = presenter.preferences, label = "consent-layer", transitionSpec = {
                if (targetState) slideInHorizontally { it / 3 } + fadeIn() togetherWith slideOutHorizontally { -it / 3 } + fadeOut()
                else slideInHorizontally { -it / 3 } + fadeIn() togetherWith slideOutHorizontally { it / 3 } + fadeOut()
            }) { settings ->
                if (settings) SettingsScaffold(presenter, privacyPolicyUrl, page, purposeFilter, ::back,
                    openPartners = { purpose -> purposeFilter = purpose; page = "vendors" },
                    openVendor = { page = "vendor:$it" }, openProviders = { page = "providers" }, clearFilter = { purposeFilter = null })
                else FirstLayerScreen(presenter, privacyPolicyUrl) { presenter.customize(); page = "vendors" }
            }
            if (presenter.confirmDiscard) AlertDialog(onDismissRequest = { presenter.confirmDiscard = false },
                modifier = Modifier.semantics { testTagsAsResourceId = true }.testTag("c15t.prefs.discard"),
                containerColor = theme.colors.surface.color(), shape = RoundedCornerShape(theme.radius.resolvedLg),
                title = { Text(presenter.iabCopy.appDiscardChangesTitle) }, text = { Text(presenter.iabCopy.appDiscardChangesDetail) },
                confirmButton = { TextButton(onClick = { presenter.discard() }, modifier = Modifier.testTag("c15t.prefs.discard.confirm")) { Text(presenter.iabCopy.appDiscardChanges) } },
                dismissButton = { TextButton(onClick = { presenter.confirmDiscard = false }, modifier = Modifier.testTag("c15t.prefs.discard.keep")) { Text(presenter.iabCopy.appKeepEditing) } })
        }
    }
}

@Composable
private fun SettingsScaffold(p: ConsentPresenter, policyUrl: String, page: String, purposeFilter: Int?, back: () -> Unit,
    openPartners: (Int?) -> Unit, openVendor: (Int) -> Unit, openProviders: () -> Unit, clearFilter: () -> Unit) {
    val theme = LocalConsentTheme.current
    val title = when {
        page == "vendors" -> p.iabCopy.appIabPartners
        page == "providers" -> p.iabCopy.preferenceCenterVendorListAdTechProvidersHeading
        page.startsWith("vendor:") -> p.disclosure?.list?.vendors?.get(page.substringAfter(':').toInt())?.name ?: p.iabCopy.appPartner
        else -> p.iabCopy.preferenceCenterTitle
    }
    val backTag = when {
        page == "root" -> "c15t.prefs.cancel"
        page.startsWith("vendor:") -> "c15t.iab.vendor.back"
        page == "providers" -> "c15t.ac.back"
        else -> "c15t.iab.vendors.back"
    }
    val close = page == "root" && !p.returnsToFirstLayer
    Scaffold(modifier = Modifier.fillMaxSize().imePadding(), containerColor = theme.colors.canvas.color(),
        topBar = {
            TopAppBar(title = { Heading(title, "c15t.prefs.title", MaterialTheme.typography.titleLarge) },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = theme.colors.canvas.color(), titleContentColor = theme.colors.text.color(), navigationIconContentColor = theme.colors.text.color()),
                navigationIcon = {
                    IconButton(onClick = back, enabled = !p.pending, modifier = Modifier.testTag(backTag)) {
                        Icon(if (close) Icons.Outlined.Close else Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = if (close) p.iabCopy.appClose else p.iabCopy.appBack)
                    }
                })
        },
        bottomBar = { if (page == "root" && (!p.snapshot.policyPending || p.core.bundledPolicyInfo != null)) DecisionFooter(p, first = false) },
    ) { padding ->
        val depth = { name: String -> when { name == "root" -> 0; name.startsWith("vendor:") -> 2; else -> 1 } }
        AnimatedContent(targetState = page, modifier = Modifier.padding(padding), label = "consent-page", transitionSpec = {
            val forward = depth(targetState) >= depth(initialState)
            if (forward) slideInHorizontally { it / 3 } + fadeIn() togetherWith slideOutHorizontally { -it / 3 } + fadeOut()
            else slideInHorizontally { -it / 3 } + fadeIn() togetherWith slideOutHorizontally { it / 3 } + fadeOut()
        }) { current ->
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.TopCenter) {
                Box(Modifier.widthIn(max = ContentWidth).fillMaxSize()) {
                    when {
                        current == "vendors" -> Vendors(p, purposeFilter, clearFilter, openVendor, openProviders)
                        current.startsWith("vendor:") -> Vendor(p, current.substringAfter(':').toInt())
                        current == "providers" -> Providers(p)
                        else -> Preferences(p, policyUrl, openPartners, openProviders)
                    }
                }
            }
        }
    }
}

// MARK: Shared pieces

@Composable private fun Heading(text: String, id: String, style: TextStyle = MaterialTheme.typography.titleLarge,
    color: ConsentThemeColor = LocalConsentTheme.current.colors.text) {
    Text(text, style = style, color = color.color(), modifier = Modifier.semantics { heading() }.testTag(id))
}
@Composable private fun Body(text: String, modifier: Modifier = Modifier) {
    Text(text, style = MaterialTheme.typography.bodyMedium, color = LocalConsentTheme.current.colors.textMuted.color(), modifier = modifier)
}
@Composable private fun SectionLabel(text: String, modifier: Modifier = Modifier) {
    Text(text, style = MaterialTheme.typography.labelLarge, color = LocalConsentTheme.current.colors.textMuted.color(),
        modifier = modifier.padding(start = 16.dp, top = 20.dp, bottom = 8.dp).semantics { heading() })
}
@Composable private fun PolicyLink(url: String, copy: IabCopy) = ExternalLink(copy.preferenceCenterVendorListPrivacyPolicy, url, "c15t.privacy-policy")
@Composable private fun ExternalLink(text: String, url: String, id: String) {
    val context = LocalContext.current
    TextButton(onClick = { val uri = Uri.parse(url); if (uri.scheme in listOf("https", "http")) context.startActivity(Intent(Intent.ACTION_VIEW, uri)) },
        modifier = Modifier.defaultMinSize(minHeight = 48.dp).testTag(id), contentPadding = PaddingValues(horizontal = 4.dp)) {
        Text(text, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium, color = LocalConsentTheme.current.colors.primary.color())
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
 */
@Composable private fun ConsentButton(text: String, id: String, enabled: Boolean, variant: ButtonVariant = ButtonVariant.DECISION,
    progress: Boolean = false, onClick: () -> Unit) {
    val theme = LocalConsentTheme.current
    val slot = variant.slot?.let(theme::slot)
    val shape = RoundedCornerShape(slot?.borderRadius ?: theme.radius.md)
    val modifier = Modifier.fillMaxWidth().defaultMinSize(minHeight = 52.dp).testTag(id).semantics {
        contentDescription = text
        if (progress) stateDescription = "Saving choices"
    }
    val label: @Composable () -> Unit = {
        Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
            if (progress) CircularProgressIndicator(Modifier.size(20.dp).align(Alignment.CenterStart).testTag("c15t.status.progress"),
                color = LocalContentColor.current, strokeWidth = 2.dp)
            val style = MaterialTheme.typography.bodyLarge
            Text(text, style = slot?.fontSize?.let { style.copy(fontSize = it, lineHeight = (style.lineHeight.value * it.value / style.fontSize.value).sp) } ?: style,
                fontWeight = FontWeight.SemiBold)
        }
    }
    when (variant) {
        ButtonVariant.DECISION, ButtonVariant.ACCENT -> {
            val container = if (variant == ButtonVariant.DECISION) theme.decisionFill.color() else theme.colors.primary.color()
            val content = if (variant == ButtonVariant.DECISION) theme.decisionLabel.color() else theme.colors.textOnPrimary.color()
            Button(onClick, modifier, enabled = enabled, shape = shape, contentPadding = PaddingValues(horizontal = 16.dp, vertical = 14.dp),
                colors = ButtonDefaults.buttonColors(containerColor = container, contentColor = content,
                    disabledContainerColor = if (progress) container else container.copy(alpha = 0.55f), disabledContentColor = content)) { label() }
        }
        ButtonVariant.QUIET -> OutlinedButton(onClick, modifier, enabled = enabled, shape = shape, contentPadding = PaddingValues(horizontal = 16.dp, vertical = 14.dp),
            border = BorderStroke(1.dp, theme.colors.text.color().copy(alpha = if (enabled || progress) 0.18f else 0.1f)),
            colors = ButtonDefaults.outlinedButtonColors(containerColor = slot?.backgroundColor?.color() ?: Color.Transparent,
                contentColor = (slot?.color ?: theme.colors.text).color(),
                disabledContentColor = if (progress) (slot?.color ?: theme.colors.text).color() else theme.colors.textMuted.color())) { label() }
    }
}

/** Equal columns when both labels fit at the current font scale; a stack otherwise. */
@Composable private fun EqualDecisions(content: @Composable () -> Unit) {
    val density = LocalDensity.current
    Layout(content = content, modifier = Modifier.fillMaxWidth()) { children, constraints ->
        val gap = 12.dp.roundToPx()
        val max = children.maxOfOrNull { it.maxIntrinsicWidth(Constraints.Infinity) } ?: 0
        val row = 2 * max + gap <= constraints.maxWidth && density.fontScale < 1.5f
        val width = if (row) (constraints.maxWidth - gap) / 2 else constraints.maxWidth
        val measured = children.map { it.measure(Constraints(minWidth = width, maxWidth = width, maxHeight = constraints.maxHeight)) }
        val height = if (row) (measured.maxOfOrNull { it.height } ?: 0) else measured.sumOf { it.height } + gap * (measured.size - 1).coerceAtLeast(0)
        layout(constraints.maxWidth, height) {
            var y = 0
            measured.forEachIndexed { i, child -> child.placeRelative(if (row) i * (width + gap) else 0, y); if (!row) y += child.height + gap }
        }
    }
}

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
        Icon(Icons.Filled.Info, contentDescription = null, tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(glyph).rotate(180f))
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
@Composable private fun actionsInPage(): Boolean = LocalDensity.current.fontScale >= 1.5f

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

/** The decision controls and the failure row beside them, in one of the [DecisionPart] cuts. */
@Composable private fun DecisionGroup(p: ConsentPresenter, first: Boolean, part: DecisionPart, modifier: Modifier = Modifier) {
    val theme = LocalConsentTheme.current
    val prefix = if (first) "c15t.first-layer" else if (p.iab) "c15t.iab" else "c15t.prefs"
    val errorId = (if (first) "c15t.first-layer" else "c15t.prefs") + ".error"
    // IAB labels come from the generated translations, as on the web; the category UI keeps its own.
    val rejectAll = if (p.iab) p.iabCopy.commonRejectAll else "Reject all"
    val acceptAll = if (p.iab) p.iabCopy.commonAcceptAll else "Accept all"
    val save = if (p.iab) p.iabCopy.commonSaveSettings else "Save choices"
    // Only the pressed action shows progress; the rest are disabled with their labels intact.
    fun busy(action: ConsentPresenter.Action) = p.showProgress && p.pendingAction == action
    @Composable fun reload() = ConsentButton(p.iabCopy.appLoadCurrentSettings, "c15t.prefs.stale.reload", !p.pending, ButtonVariant.ACCENT) { p.loadDraft() }
    @Composable fun failure() { p.errorMessage?.let { FailureRow(it, errorId, !p.pending, p.iabCopy.appTryAgain, p::retry) } }
    /** Labels stay put while a commit runs: the pressed action shows progress beside its own label. */
    @Composable fun decision(label: String, action: ConsentPresenter.Action) {
        val suffix = when (action) { ConsentPresenter.Action.ACCEPT -> "accept-all"; ConsentPresenter.Action.REJECT -> "reject-all"; ConsentPresenter.Action.SAVE -> "save"; ConsentPresenter.Action.ACKNOWLEDGE -> "acknowledge" }
        val variant = if (action == ConsentPresenter.Action.SAVE) ButtonVariant.ACCENT else if (first) ButtonVariant.DECISION else ButtonVariant.QUIET
        ConsentButton(label, "$prefix.$suffix", !p.pending, variant, progress = busy(action)) { p.commit(action) }
    }
    @Composable fun decisions() {
        if (p.snapshot.policyPending) {
            decision(rejectAll, ConsentPresenter.Action.REJECT)
        } else if (p.listUnavailable) {
            Body(p.iabCopy.appListOutdated, Modifier.testTag(if (first) "c15t.first-layer.list-stale" else "c15t.iab.list-stale"))
            EqualDecisions {
                decision(rejectAll, ConsentPresenter.Action.REJECT)
                ConsentButton(p.iabCopy.appTryAgain, "$prefix.retry", !p.pending, ButtonVariant.QUIET) { p.refresh() }
            }
        } else {
            EqualDecisions {
                decision(rejectAll, ConsentPresenter.Action.REJECT)
                decision(acceptAll, ConsentPresenter.Action.ACCEPT)
            }
            if (first) {
                ConsentButton(if (p.iab) p.iabCopy.commonCustomize else "Customize", "c15t.first-layer.customize", !p.pending, ButtonVariant.QUIET) { p.customize() }
                if (theme.showsBranding) Branding()
            } else if (part == DecisionPart.ALL) decision(save, ConsentPresenter.Action.SAVE)
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
 * Pinned actions. Accept all and Reject all are twins; Save is the accent; nothing else is filled.
 * At accessibility sizes the first layer has no footer and preferences keep one compact action,
 * so the bar never needs a scroll of its own.
 */
@Composable private fun DecisionFooter(p: ConsentPresenter, first: Boolean) {
    val theme = LocalConsentTheme.current
    val page = actionsInPage()
    if (page && (first || !showsPinned(p))) return
    Surface(color = theme.colors.canvas.color()) {
        Column(Modifier.fillMaxWidth()) {
            Hairline()
            Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.TopCenter) {
                // The row's arrival eases the actions down to make room instead of jumping them under the thumb.
                // Edges follow the page: 24dp on the first layer, 16dp on preferences to meet the cards.
                DecisionGroup(p, first, if (page) DecisionPart.PINNED else DecisionPart.ALL,
                    Modifier.widthIn(max = ContentWidth).fillMaxWidth().navigationBarsPadding().testTag("c15t.footer").animateContentSize()
                        .padding(horizontal = if (first) theme.spacing.lg else theme.spacing.md, vertical = theme.spacing.sm + theme.spacing.xs))
            }
        }
    }
}

@Composable private fun Branding() { ProviderBranding() }

// MARK: First layer

/**
 * The first choice. A page of the app, not a panel over it: brand, headline, one sentence (in
 * IAB mode, the full IAB disclosure), then the two decisions at equal weight and the path to the details.
 */
@Composable private fun FirstLayerScreen(p: ConsentPresenter, policyUrl: String, partners: () -> Unit) {
    val theme = LocalConsentTheme.current
    val page = actionsInPage()
    Scaffold(containerColor = theme.colors.canvas.color(), bottomBar = { DecisionFooter(p, first = true) }) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).testTag("c15t.first-layer"), horizontalAlignment = Alignment.CenterHorizontally) {
            Column(Modifier.widthIn(max = ContentWidth).fillMaxWidth().padding(start = theme.spacing.lg, end = theme.spacing.lg, top = theme.spacing.xl, bottom = theme.spacing.md),
                verticalArrangement = Arrangement.spacedBy(theme.spacing.md + theme.spacing.xs)) {
                if (!theme.brand.hidden) IdentityHeader()
                when (p.snapshot.promptRequirement.reason?.wireName) {
                    "expired" -> InfoCallout(Modifier.testTag("c15t.first-layer.reason")) { Text("Your earlier choice has expired, so we're asking again.") }
                    "policy-changed" -> InfoCallout(Modifier.testTag("c15t.first-layer.reason")) { Text("How this app uses data has changed since your last choice, so we're asking again.") }
                }
                Heading(theme.copy.headline, "c15t.first-layer.title", headlineStyle(theme),
                    color = theme.slot(ConsentTheme.Slot.ConsentBannerTitle).color ?: theme.colors.text)
                Column(verticalArrangement = Arrangement.spacedBy(theme.spacing.sm + theme.spacing.xs)) {
                    val description = theme.slot(ConsentTheme.Slot.ConsentBannerDescription)
                    val body = MaterialTheme.typography.bodyLarge
                    Text(theme.copy.introduction, style = description.fontSize?.let { body.copy(fontSize = it, lineHeight = (body.lineHeight.value * it.value / body.fontSize.value).sp) } ?: body,
                        color = (description.color ?: theme.colors.text).color(), modifier = Modifier.testTag("c15t.first-layer.body"))
                    if (!p.iab) Body("You decide which uses to allow, and you can change your mind at any time in Privacy settings.")
                }
                if (p.iab) IabFirstLayer(p, partners)
                PolicyLink(policyUrl, p.iabCopy)
                // At accessibility sizes the decisions follow the text they decide on.
                if (page) DecisionGroup(p, first = true, DecisionPart.ALL, Modifier.padding(top = 4.dp))
            }
        }
    }
}

/** Display type breaks balanced, so a two-line headline never leaves one word on its last line. */
@Composable private fun headlineStyle(theme: ConsentTheme): TextStyle =
    theme.headlineStyle(MaterialTheme.typography.headlineLarge).copy(lineBreak = LineBreak.Heading)

/**
 * The IAB disclosure, as the web prompt gives it: what partners store, access and process with
 * the partner count as the way into the list, the purposes and stacks they use, then legitimate
 * interest, scope and withdrawal. Always shown in IAB mode, under any host copy.
 */
@Composable private fun IabFirstLayer(p: ConsentPresenter, partners: () -> Unit) {
    val theme = LocalConsentTheme.current
    val copy = p.iabCopy
    val text = p.disclosure?.let { IabFirstLayerText.resolve(copy, it.bannerSummary) }
    Column(Modifier.fillMaxWidth().testTag("c15t.first-layer.iab"), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        if (text != null) {
            val accent = theme.colors.primary.color()
            val description = remember(text, accent) {
                buildAnnotatedString {
                    append(text.description)
                    addStyle(SpanStyle(color = accent, fontWeight = FontWeight.SemiBold), text.partnersLink.first, text.partnersLink.last + 1)
                }
            }
            InlineActionText(description, text.partnersLink, text.partnersLabel, "c15t.first-layer.partner-count", !p.pending,
                theme.colors.textMuted.color(), MaterialTheme.typography.bodyMedium, Modifier.fillMaxWidth(),
                textModifier = Modifier.testTag("c15t.first-layer.description"), onClick = partners)
            // The purposes partners ask for, on a quieter surface so they inform without competing.
            Surface(color = theme.colors.surfaceMuted.color(), shape = RoundedCornerShape(theme.radius.md + 2.dp), modifier = Modifier.fillMaxWidth().testTag("c15t.first-layer.summary")) {
                Column(Modifier.padding(vertical = 6.dp)) {
                    val more = (p.disclosure?.bannerSummary?.remainingCount ?: 0) > 0
                    text.summary.forEachIndexed { index, name ->
                        val last = index == text.summary.lastIndex
                        Text(name, style = MaterialTheme.typography.bodyMedium,
                            color = if (more && last) theme.colors.textMuted.color() else theme.colors.text.color(),
                            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp)
                                .testTag(if (more && last) "c15t.first-layer.summary.more" else "c15t.first-layer.summary.item.$index"))
                        if (!last) Hairline(Modifier.padding(start = 16.dp))
                    }
                }
            }
        }
        Body(copy.bannerLegitimateInterestNotice, Modifier.testTag("c15t.first-layer.legitimate-interest"))
        Body(copy.appScopeServiceSpecific, Modifier.testTag("c15t.first-layer.scope"))
        Body(copy.appWithdraw, Modifier.testTag("c15t.first-layer.withdraw"))
    }
}

// MARK: Notice

@Composable private fun NoticeCard(presenter: ConsentPresenter, privacyPolicyUrl: String) {
    val theme = LocalConsentTheme.current
    val shape = RoundedCornerShape(theme.radius.resolvedLg)
    Surface(Modifier.padding(theme.spacing.sm + theme.spacing.xs).widthIn(max = ContentWidth).semantics { testTagsAsResourceId = true }.testTag("c15t.notice"),
        shape = shape, color = theme.colors.surface.color(), shadowElevation = 6.dp, border = BorderStroke(1.dp, theme.colors.text.color().copy(alpha = 0.1f))) {
        Column(Modifier.padding(theme.spacing.md + theme.spacing.xs), verticalArrangement = Arrangement.spacedBy(theme.spacing.sm + theme.spacing.xs)) {
            Heading("How this app uses your data", "c15t.notice.title", MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold))
            Body("You can review or change this at any time in Privacy settings.")
            EqualDecisions {
                ConsentButton("Got it", "c15t.notice.acknowledge", !presenter.pending,
                    progress = presenter.showProgress && presenter.pendingAction == ConsentPresenter.Action.ACKNOWLEDGE) { presenter.commit(ConsentPresenter.Action.ACKNOWLEDGE) }
                ConsentButton("Privacy settings", "c15t.notice.settings", !presenter.pending, ButtonVariant.QUIET) { presenter.presentPreferences() }
            }
            PolicyLink(privacyPolicyUrl, presenter.iabCopy)
            presenter.errorMessage?.let { FailureRow(it, "c15t.notice.error", !presenter.pending, presenter.iabCopy.appTryAgain, presenter::retry) }
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

@Composable private fun RowLabel(title: String, description: String? = null, note: String? = null, modifier: Modifier = Modifier) {
    val theme = LocalConsentTheme.current
    Column(modifier, verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(title, style = MaterialTheme.typography.titleMedium, color = theme.colors.text.color())
        if (!description.isNullOrEmpty()) Body(description)
        if (note != null) Text(note, style = MaterialTheme.typography.bodySmall, color = theme.colors.textMuted.color())
    }
}

@Composable private fun ChoiceRow(title: String, description: String, value: Boolean, id: String, enabled: Boolean = true, note: String? = null, onChange: (Boolean) -> Unit) {
    val large = LocalDensity.current.fontScale >= 1.5f
    val modifier = Modifier.fillMaxWidth().defaultMinSize(minHeight = 56.dp)
        .toggleable(value, enabled = enabled, role = Role.Switch, onValueChange = onChange).testTag(id).padding(horizontal = 16.dp, vertical = 12.dp)
    if (large) Column(modifier, verticalArrangement = Arrangement.spacedBy(8.dp)) { RowLabel(title, description, note); Switch(value, null, enabled = enabled) }
    else Row(modifier, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
        RowLabel(title, description, note, Modifier.weight(1f)); Switch(value, null, enabled = enabled)
    }
}

@Composable private fun StatusRow(title: String, description: String?, status: String, statusTag: String, note: String? = null, noteTag: String? = null) {
    val theme = LocalConsentTheme.current
    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 14.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.Top) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            RowLabel(title, description)
            if (note != null) Text(note, style = MaterialTheme.typography.bodySmall, color = theme.colors.textMuted.color(), modifier = if (noteTag != null) Modifier.testTag(noteTag) else Modifier)
        }
        Text(status, style = MaterialTheme.typography.bodyMedium, color = theme.colors.textMuted.color(), modifier = Modifier.testTag(statusTag))
    }
}

@Composable private fun Category(p: ConsentPresenter, c: ConsentCategory) {
    val title = if (c == ConsentCategory.NECESSARY) "Strictly necessary" else c.wireName.replaceFirstChar { it.titlecase() }
    val description = when (c) {
        ConsentCategory.NECESSARY -> "Required for the app to work."
        ConsentCategory.FUNCTIONALITY -> "Remember your settings and choices."
        ConsentCategory.EXPERIENCE -> "Adapt the app to how you use it."
        ConsentCategory.MEASUREMENT -> "Help us understand how the app is used."
        ConsentCategory.MARKETING -> "Show advertising relevant to you."
    }
    if (c.optional && !p.restricted(c)) ChoiceRow(title, description, p.categories[c] == true, "c15t.prefs.category.${c.wireName}.switch", !p.pending && !p.stale && !p.listUnavailable) { p.setCategory(c, it) }
    else StatusRow(title, description, if (c.optional) p.iabCopy.appOff else p.iabCopy.appAlwaysOn, "c15t.prefs.category.${c.wireName}.locked",
        note = if (c.optional) (if ("gpc" in p.snapshot.restrictions[c.wireName].orEmpty()) "Off because your device sends a Global Privacy Control signal." else "Not offered where you are.") else null,
        noteTag = if (c.optional) "c15t.prefs.category.${c.wireName}.restricted" else null)
}

// MARK: Preferences

/** Standing settings in the platform's own voice: grouped cards on the canvas. */
@Composable private fun Preferences(p: ConsentPresenter, policyUrl: String, partners: (Int?) -> Unit, providers: () -> Unit) {
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
    LazyColumn(Modifier.fillMaxSize().testTag(if (p.iab) "c15t.iab" else "c15t.prefs"), state = list, contentPadding = PaddingValues(horizontal = 8.dp, vertical = 8.dp)) {
        if (p.snapshot.policyPending) {
            item {
                GroupedRow(0, 1) {
                    Column(Modifier.padding(16.dp).testTag("c15t.status.unavailable"), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(p.iabCopy.appPreferencesUnavailable, color = theme.colors.text.color())
                        TextButton(onClick = p::refresh, modifier = Modifier.testTag("c15t.status.unavailable.retry")) { Text(p.iabCopy.appTryAgain) }
                    }
                }
            }
        } else {
            if (p.stale) item {
                InfoCallout(Modifier.padding(horizontal = 8.dp, vertical = 8.dp).testTag("c15t.prefs.stale")) {
                    Text(p.iabCopy.appSettingsChanged, fontWeight = FontWeight.SemiBold, modifier = Modifier.semantics { heading() }.testTag("c15t.prefs.stale.title"))
                    Text(p.iabCopy.appSettingsChangedDetail)
                }
            }
            item {
                Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    if (p.iab) {
                        Body(p.iabCopy.appPreferencesIntro)
                        TextButton(onClick = { partners(null) }, contentPadding = PaddingValues(horizontal = 4.dp), modifier = Modifier.testTag("c15t.iab.partner-count")) {
                            Text(p.iabCopy.format(p.iabCopy.appIabPartnerCount, mapOf("count" to "${p.disclosure?.vendors?.size ?: 0}")), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium, color = theme.colors.primary.color())
                        }
                    } else Body("Choose which kinds of data use you allow. Changes apply on this device as soon as you save.")
                }
            }
            if (page && showsShortcuts(p)) item { DecisionGroup(p, first = false, DecisionPart.SHORTCUTS, Modifier.padding(start = 8.dp, end = 8.dp, top = 8.dp)) }
            item { if (p.iab) SectionLabel(p.iabCopy.appThisApp) else Spacer(Modifier.height(12.dp)) }
            val categories = p.offeredCategories
            group(categories.size, key = { "category-${categories[it].wireName}" }) { Category(p, categories[it]) }
            p.disclosure?.let { d ->
                val copy = p.iabCopy
                // Only what this app's partners declare, as the web panel lists it.
                val declaredPurposes = d.declaredPurposeIds.toSet()
                val purposes = d.list.purposes.toSortedMap().entries.filter { it.key in declaredPurposes }
                item { SectionLabel(copy.preferenceCenterVendorListPurposes) }
                group(purposes.size, key = { "purpose-${purposes[it].key}" }) { Purpose(p, purposes[it].key, purposes[it].value) { partners(purposes[it].key) } }
                val declaredSpecials = d.declaredSpecialFeatureIds.toSet()
                val specials = d.list.specialFeatures.orEmpty().toSortedMap().entries.filter { it.key in declaredSpecials }
                if (specials.isNotEmpty()) {
                    item { SectionLabel(copy.preferenceCenterVendorListSpecialFeatures) }
                    group(specials.size, key = { "special-${specials[it].key}" }) { index ->
                        val (id, item) = specials[index]
                        ChoiceRow(item.name.orEmpty(), item.description.orEmpty(), id in p.choices.specialFeatureOptIns, "c15t.iab.special-feature.$id.switch",
                            !p.pending && !p.stale && !p.listUnavailable, note = copy.appSpecialFeatureOptIn) { on -> p.edit { it.copy(specialFeatureOptIns = it.specialFeatureOptIns.select(id, on)) } }
                        Examples(item.illustrations, "c15t.iab.special-feature.$id", copy)
                    }
                }
                val active = d.vendors.keys.mapNotNull { d.list.vendors[it] }
                val usedSpecialPurposes = active.flatMap { it.specialPurposes.orEmpty() }.map { it.toInt() }.toSet()
                val specialPurposes = d.list.specialPurposes.orEmpty().toSortedMap().entries.filter { it.key in usedSpecialPurposes }
                if (specialPurposes.isNotEmpty()) {
                    item { SectionLabel(copy.preferenceCenterVendorListSpecialPurposes) }
                    group(specialPurposes.size, key = { "sp-${specialPurposes[it].key}" }) { index -> val (id, item) = specialPurposes[index]; Definition(item, "c15t.iab.special-purpose.$id", copy) }
                    item { Footnote(d.list.standardTexts?.specialPurposes.orEmpty()) }
                }
                val usedFeatures = active.flatMap { it.features.orEmpty() }.map { it.toInt() }.toSet()
                val features = d.list.features.orEmpty().toSortedMap().entries.filter { it.key in usedFeatures }
                if (features.isNotEmpty()) {
                    item { SectionLabel(copy.preferenceCenterFeaturesTitle) }
                    group(features.size, key = { "feature-${features[it].key}" }) { index -> val (id, item) = features[index]; Definition(item, "c15t.iab.feature.$id", copy) }
                    item { Footnote(featuresExplanation(d.list, copy), Modifier.testTag("c15t.iab.features-standard-text")) }
                }
                item { SectionLabel(copy.appPartners) }
                val providerCount = d.adTechProviders.orEmpty().size
                val rows = if (providerCount > 0) 2 else 1
                group(rows, key = { "partners-$it" }) { index ->
                    if (index == 0) NavigationRow(copy.appIabPartners, "${d.vendors.size}", "c15t.iab.partners") { partners(null) }
                    else NavigationRow(p.iabCopy.preferenceCenterVendorListAdTechProvidersHeading, "$providerCount", "c15t.iab.other-partners", providers)
                }
                // Where the TC String lives and for how long, which IAB asks the second layer to say.
                d.consentStorageMaxDays?.let { days ->
                    item { Footnote(copy.format(copy.appConsentStorage, mapOf("days" to "$days")), Modifier.padding(top = 12.dp).testTag("c15t.iab.consent-storage")) }
                }
            }
            item {
                Spacer(Modifier.height(20.dp))
                GroupedRow(0, 1) {
                    Column(Modifier.padding(horizontal = 12.dp, vertical = 8.dp)) {
                        PolicyLink(policyUrl, p.iabCopy)
                        p.snapshot.explicitChoice?.let {
                            Text(p.lastChanged(it.actionAt), style = MaterialTheme.typography.bodySmall,
                                color = theme.colors.textMuted.color(), modifier = Modifier.padding(start = 4.dp, bottom = 8.dp).testTag("c15t.prefs.last-changed"))
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

@Composable private fun NavigationRow(title: String, value: String, id: String, onClick: () -> Unit) {
    val theme = LocalConsentTheme.current
    Row(Modifier.fillMaxWidth().defaultMinSize(minHeight = 52.dp).clickable(onClick = onClick, role = Role.Button).testTag(id).padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(title, style = MaterialTheme.typography.titleMedium, color = theme.colors.text.color(), modifier = Modifier.weight(1f))
        Text(value, style = MaterialTheme.typography.bodyMedium, color = theme.colors.textMuted.color())
        Icon(Icons.AutoMirrored.Outlined.KeyboardArrowRight, contentDescription = null, tint = theme.colors.textMuted.color(), modifier = Modifier.size(20.dp))
    }
}

@Composable private fun Definition(item: GvlLocalizedEntry, id: String, copy: IabCopy) {
    Column(Modifier.testTag(id)) {
        StatusRow(item.name.orEmpty(), item.description.orEmpty(), copy.appNoChoice, "$id.status")
        Examples(item.illustrations, id, copy)
    }
}

/**
 * The vendor list's standard Features text, or the translated standard text when the list has
 * none. TCF policy check 14 requires it wherever Features are shown.
 */
private fun featuresExplanation(list: GlobalVendorList, copy: IabCopy): String =
    list.standardTexts?.features?.takeIf { it.isNotEmpty() } ?: copy.preferenceCenterFeaturesDescription

/** The list's standard illustrations for one item, verbatim, behind an "Examples (N)" toggle. */
@Composable private fun Examples(illustrations: List<String>?, id: String, copy: IabCopy) {
    val label = copy.preferenceCenterPurposeItemExamples
    if (illustrations.isNullOrEmpty()) return
    val theme = LocalConsentTheme.current
    var expanded by rememberSaveable(id) { mutableStateOf(false) }
    TextButton(onClick = { expanded = !expanded }, modifier = Modifier.padding(start = 4.dp).testTag("$id.examples").semantics { stateDescription = if (expanded) copy.appExpanded else copy.appCollapsed }) {
        Text("$label (${illustrations.size})", style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium, color = theme.colors.primary.color())
        Icon(if (expanded) Icons.Outlined.KeyboardArrowUp else Icons.Outlined.KeyboardArrowDown, contentDescription = null, tint = theme.colors.primary.color(), modifier = Modifier.size(18.dp))
    }
    if (expanded) Illustrations(illustrations, "$id.illustrations", Modifier.padding(start = 16.dp, end = 16.dp, bottom = 8.dp))
}

@Composable private fun Illustrations(illustrations: List<String>, id: String, modifier: Modifier = Modifier) {
    if (illustrations.isEmpty()) return
    Column(modifier.testTag(id), verticalArrangement = Arrangement.spacedBy(8.dp)) { illustrations.forEach { Body("\u2022 $it") } }
}

/** The purposes Google needs consent to before an ad tech provider counts its consent. */
private val adTechProviderPurposeIds = setOf(1, 3, 4)


@Composable private fun Purpose(p: ConsentPresenter, id: Int, item: GvlLocalizedEntry, partners: () -> Unit) {
    var expanded by rememberSaveable { mutableStateOf(false) }
    val vendors = p.disclosure?.vendors?.values.orEmpty()
    // Google ad tech providers need consent to purposes 1, 3 and 4, as the web counts them.
    val providerCount = if (id in adTechProviderPurposeIds) p.disclosure?.adTechProviders.orEmpty().size else 0
    val consentCount = vendors.count { id in it.consentPurposes } + providerCount
    val liCount = vendors.count { id in it.legitimateInterestPurposes }
    val li = liCount > 0
    val theme = LocalConsentTheme.current
    // How many partners ask, on the row itself rather than only behind Details. Zero is
    // shown too, so an absent count never reads as an omitted one.
    // In the web's words, from the shared IAB copy.
    val copy = p.iabCopy
    fun partners(count: Int) = copy.format(copy.preferenceCenterPurposeItemPartners, mapOf("count" to "$count"))
    val note = "${copy.preferenceCenterPurposeItemWithYourPermission}: ${partners(consentCount)} \u00B7 ${copy.preferenceCenterPurposeItemLegitimateInterest}: ${partners(liCount)}"
    Column(Modifier.fillMaxWidth().testTag("c15t.iab.purpose.$id")) {
        ChoiceRow(item.name.orEmpty(), item.description.orEmpty(), id in p.choices.purposeConsents, "c15t.iab.purpose.$id.consent", !p.pending && !p.stale && !p.listUnavailable,
            note = note) { on -> p.edit { it.copy(purposeConsents = it.purposeConsents.select(id, on)) } }
        TextButton(onClick = { expanded = !expanded }, modifier = Modifier.padding(start = 4.dp).testTag("c15t.iab.purpose.$id.details").semantics { stateDescription = if (expanded) copy.appExpanded else copy.appCollapsed }) {
            Text(if (expanded) copy.appHideDetails else copy.appDetails, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium, color = theme.colors.primary.color())
            Icon(if (expanded) Icons.Outlined.KeyboardArrowUp else Icons.Outlined.KeyboardArrowDown, contentDescription = null, tint = theme.colors.primary.color(), modifier = Modifier.size(18.dp))
        }
        if (expanded) {
            Column(Modifier.padding(start = 16.dp, end = 16.dp, bottom = 8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Body(item.descriptionLegal.orEmpty())
                Illustrations(item.illustrations.orEmpty(), "c15t.iab.purpose.$id.illustrations")
                if (li) Body(p.iabCopy.appLegitimateInterestExplanation, Modifier.testTag("c15t.iab.purpose.$id.li-explanation"))
            }
            TextButton(onClick = partners, modifier = Modifier.padding(start = 4.dp).testTag("c15t.iab.purpose.$id.view-partners")) {
                Text(copy.appViewPartners, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium, color = theme.colors.primary.color())
            }
            if (li) ChoiceRow(copy.preferenceCenterPurposeItemLegitimateInterest, "", id in p.choices.purposeLegitimateInterests, "c15t.iab.purpose.$id.li", !p.pending && !p.stale && !p.listUnavailable,
                note = copy.preferenceCenterPurposeItemRightToObject + " " + copy.appTurnOffToObject) { on -> p.edit { it.copy(purposeLegitimateInterests = it.purposeLegitimateInterests.select(id, on), purposeObjections = it.purposeObjections.select(id, !on)) } }
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
            leadingIcon = { Icon(Icons.Outlined.Search, contentDescription = null, tint = theme.colors.textMuted.color()) },
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

@Composable private fun Vendors(p: ConsentPresenter, purpose: Int?, clear: () -> Unit, open: (Int) -> Unit, openProviders: () -> Unit) {
    var search by rememberSaveable { mutableStateOf("") }
    val collator = remember { Collator.getInstance() }
    val theme = LocalConsentTheme.current
    val vendors = p.disclosure?.list?.vendors.orEmpty().entries.filter { (id, v) ->
        id in p.disclosure!!.vendors && v.name.orEmpty().searchKey().contains(search.searchKey()) &&
            (purpose == null || purpose in p.disclosure!!.vendors[id]!!.consentPurposes || purpose in p.disclosure!!.vendors[id]!!.legitimateInterestPurposes)
    }.sortedWith { a, b -> collator.compare(a.value.name, b.value.name) }
    Column(Modifier.fillMaxSize().testTag("c15t.iab.vendors")) {
        SearchField(search, { search = it }, p.iabCopy.appSearchPartners, "c15t.iab.vendors.search")
        if (purpose != null) TextButton(onClick = clear, modifier = Modifier.padding(horizontal = 12.dp).testTag("c15t.iab.vendors.filter.purpose.clear")) {
            Text(p.iabCopy.format(p.iabCopy.appPurposeFilter, mapOf("purpose" to p.disclosure?.list?.purposes?.get(purpose)?.name.orEmpty())), style = MaterialTheme.typography.bodyMedium, color = theme.colors.primary.color())
            Icon(Icons.Outlined.Clear, contentDescription = p.iabCopy.commonClearSelection, tint = theme.colors.primary.color(), modifier = Modifier.padding(start = 4.dp).size(16.dp))
        }
        LazyColumn(contentPadding = PaddingValues(horizontal = 8.dp, vertical = 8.dp)) {
            if (vendors.isEmpty()) item { Body(p.iabCopy.format(p.iabCopy.appNoPartnersMatch, mapOf("search" to search)), Modifier.padding(16.dp).testTag("c15t.iab.vendors.empty")) }
            group(vendors.size, key = { vendors[it].key }) { index ->
                val (id, v) = vendors[index]
                val d = p.disclosure!!.vendors[id]!!
                Row(Modifier.fillMaxWidth().clickable(role = Role.Button) { open(id) }.testTag("c15t.iab.vendors.vendor.$id").padding(horizontal = 16.dp, vertical = 14.dp),
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(v.name.orEmpty(), style = MaterialTheme.typography.titleMedium, color = theme.colors.text.color())
                        Text(p.iabCopy.format(p.iabCopy.appVendorPurposeSummary, mapOf("purposes" to "${d.consentPurposes.size}", "legitimateInterest" to "${d.legitimateInterestPurposes.size}")), style = MaterialTheme.typography.bodySmall, color = theme.colors.textMuted.color())
                    }
                    StatusTag(p.partnerStatus(id), p.disclosure?.vendors?.get(id)?.selectionStatus(id, p.choices) != IabVendorSelectionStatus.PARTIAL && p.disclosure?.vendors?.get(id)?.selectionStatus(id, p.choices) != IabVendorSelectionStatus.ON, Modifier.testTag("c15t.iab.vendors.vendor.$id.status"))
                }
            }
            // The first layer's partner count includes these, so the list it opens leads to them,
            // on their own page apart from IAB partners.
            val providerCount = p.disclosure?.adTechProviders.orEmpty().size
            if ((purpose == null || purpose in adTechProviderPurposeIds) && search.isEmpty() && providerCount > 0) {
                item { Spacer(Modifier.height(16.dp)) }
                group(1, key = { "other-partners" }) {
                    NavigationRow(p.iabCopy.preferenceCenterVendorListAdTechProvidersHeading, "$providerCount", "c15t.iab.vendors.other-partners", openProviders)
                }
                item { Footnote(p.iabCopy.preferenceCenterVendorListAdTechProvidersNotice) }
            }
        }
    }
}

@Composable private fun Vendor(p: ConsentPresenter, id: Int) {
    val d = p.disclosure ?: return
    val v = d.list.vendors[id] ?: return
    val projection = d.vendors[id] ?: return
    val theme = LocalConsentTheme.current
    val copy = p.iabCopy
    fun names(ids: List<Int>) = ids.mapNotNull { d.list.purposes[it]?.name }.joinToString(", ")
    val locale = Locale.getDefault().language
    val urls = v.urls.orEmpty().firstOrNull { it.langId == locale } ?: v.urls.orEmpty().firstOrNull { it.langId == "en" } ?: v.urls?.firstOrNull()
    val enabled = !p.pending && !p.stale && !p.listUnavailable
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 8.dp, vertical = 8.dp).testTag("c15t.iab.vendor.$id")) {
        val links = listOfNotNull(urls?.privacy?.let { copy.preferenceCenterVendorListPrivacyPolicy to it }, urls?.legIntClaim?.let { copy.appLegitimateInterestStatement to it })
        links.forEachIndexed { index, (label, url) -> GroupedRow(index, links.size) { Box(Modifier.padding(horizontal = 12.dp)) { ExternalLink(label, url, if (index == 0 && label == copy.preferenceCenterVendorListPrivacyPolicy) "c15t.iab.vendor.$id.privacy-link" else "c15t.iab.vendor.$id.li-claim-link") } } }
        SectionLabel(copy.appYourChoices)
        val choiceRows = listOfNotNull(
            if (projection.consentPurposes.isNotEmpty()) "consent" else null,
            if (projection.legitimateInterestPurposes.isNotEmpty()) "li" else null,
            if (projection.notAllowedPurposes.isNotEmpty()) "not-allowed" else null)
        choiceRows.forEachIndexed { index, kind ->
            GroupedRow(index, choiceRows.size) {
                when (kind) {
                    "consent" -> ChoiceRow(copy.appConsent, names(projection.consentPurposes), id in p.choices.vendorConsents, "c15t.iab.vendor.$id.consent", enabled) { on -> p.edit { it.copy(vendorConsents = it.vendorConsents.select(id, on)) } }
                    "li" -> ChoiceRow(copy.preferenceCenterPurposeItemLegitimateInterest, names(projection.legitimateInterestPurposes), id in p.choices.vendorLegitimateInterests, "c15t.iab.vendor.$id.li", enabled,
                        note = copy.appTurnOffToObject) { on -> p.edit { it.copy(vendorLegitimateInterests = it.vendorLegitimateInterests.select(id, on), vendorObjections = it.vendorObjections.select(id, !on)) } }
                    else -> Body(copy.format(copy.appNotAllowedPurposes, mapOf("purposes" to names(projection.notAllowedPurposes))), Modifier.padding(16.dp).testTag("c15t.iab.vendor.$id.not-allowed"))
                }
            }
        }
        if (projection.legitimateInterestPurposes.isNotEmpty()) Footnote(p.iabCopy.appLegitimateInterestExplanation, Modifier.testTag("c15t.iab.vendor.$id.li-explanation"))
        @Composable fun plainGroup(title: String, values: List<String>, trailing: (Int) -> String? = { copy.appNoChoice }, tag: String? = null) {
            if (values.isEmpty()) return
            SectionLabel(title)
            Column(if (tag != null) Modifier.testTag(tag) else Modifier) {
                values.forEachIndexed { index, name ->
                    GroupedRow(index, values.size) {
                        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 14.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            Text(name, style = MaterialTheme.typography.bodyLarge, color = theme.colors.text.color(), modifier = Modifier.weight(1f))
                            trailing(index)?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = theme.colors.textMuted.color()) }
                        }
                    }
                }
            }
        }
        plainGroup(copy.preferenceCenterVendorListSpecialPurposes, v.specialPurposes.orEmpty().map { d.list.specialPurposes?.get(it.toInt())?.name.orEmpty() })
        // Features are read-only, with their standard texts and illustrations and the standard explanation.
        val features = v.features.orEmpty().mapNotNull { feature -> d.list.features?.get(feature.toInt())?.let { feature.toInt() to it } }
        if (features.isNotEmpty()) {
            SectionLabel(copy.preferenceCenterFeaturesTitle)
            features.forEachIndexed { index, (feature, item) ->
                GroupedRow(index, features.size) { Definition(item, "c15t.iab.vendor.$id.feature.$feature", p.iabCopy) }
            }
            Footnote(featuresExplanation(d.list, p.iabCopy), Modifier.testTag("c15t.iab.vendor.$id.features-standard-text"))
        }
        val specials = v.specialFeatures.orEmpty()
        plainGroup(copy.preferenceCenterVendorListSpecialFeatures, specials.map { d.list.specialFeatures?.get(it.toInt())?.name.orEmpty() }, trailing = { index -> if (specials[index].toInt() in p.choices.specialFeatureOptIns) copy.appOn else copy.appOff })
        if (specials.isNotEmpty()) Footnote(copy.appSpecialFeaturesElsewhere)
        plainGroup(copy.appDataCollected, v.dataCategories.orEmpty().map { d.list.dataCategories?.get(it.toInt())?.name.orEmpty() }, trailing = { null })
        val retention = v.dataRetention
        val retentionRows = if (retention == null) listOf(copy.appRetentionNotProvided to null)
            else retention.purposes.orEmpty().map { (purpose, days) -> names(listOf(purpose.toInt())) to dayCount(days.toLong(), copy) } +
                retention.specialPurposes.orEmpty().map { (purpose, days) -> (d.list.specialPurposes?.get(purpose.toIntOrNull() ?: -1)?.name ?: "$purpose") to dayCount(days.toLong(), copy) } +
                listOfNotNull(retention.stdRetention?.let { copy.appStandardRetention to dayCount(it.toLong(), copy) })
        plainGroup(copy.appRetentionTitle, retentionRows.map { it.first }, trailing = { retentionRows[it].second }, tag = "c15t.iab.vendor.$id.retention")
        val storageRows = if (v.usesCookies != true && v.usesNonCookieAccess != true) listOf(copy.appNoDeviceStorage to null)
            else listOfNotNull(v.cookieMaxAgeSeconds?.let { copy.appStoredForUpTo to storageDuration(it, copy) }, copy.appRefreshesStoredInformation to (if (v.cookieRefresh == true) copy.appYes else copy.appNo),
                copy.appOtherDeviceAccess to (if (v.usesNonCookieAccess == true) copy.appYes else copy.appNo))
        plainGroup(copy.appDeviceStorage, storageRows.map { it.first }, trailing = { storageRows[it].second }, tag = "c15t.iab.vendor.$id.storage")
        v.deviceStorageDisclosureUrl?.let { Box(Modifier.padding(horizontal = 12.dp)) { ExternalLink(copy.appDeviceStorageDetails, it, "c15t.iab.vendor.$id.storage-link") } }
        Spacer(Modifier.height(16.dp))
    }
}

@Composable private fun Providers(p: ConsentPresenter) {
    var search by rememberSaveable { mutableStateOf("") }
    val collator = remember { Collator.getInstance() }
    val providers = p.disclosure?.adTechProviders.orEmpty().filter { it.name.searchKey().contains(search.searchKey()) }.sortedWith { a, b -> collator.compare(a.name, b.name) }
    Column(Modifier.fillMaxSize().testTag("c15t.ac")) {
        SearchField(search, { search = it }, p.iabCopy.appSearchOtherPartners, "c15t.ac.search")
        LazyColumn(contentPadding = PaddingValues(horizontal = 8.dp, vertical = 8.dp)) {
            item { Body(providerIntro(p), Modifier.padding(horizontal = 16.dp, vertical = 8.dp).testTag("c15t.ac.intro")) }
            if (providers.isEmpty()) item { Body(p.iabCopy.format(p.iabCopy.appNoPartnersMatch, mapOf("search" to search)), Modifier.padding(16.dp).testTag("c15t.ac.empty")) }
            group(providers.size, key = { providers[it].id }) { index ->
                val provider = providers[index]
                ChoiceRow(provider.name, "", provider.id in p.choices.adTechProviderConsents.orEmpty(), "c15t.ac.provider.${provider.id}.switch", !p.pending && !p.stale && !p.listUnavailable) { on ->
                    p.edit { it.copy(adTechProviderConsents = it.adTechProviderConsents.orEmpty().select(provider.id, on)) }
                }
                Box(Modifier.padding(start = 12.dp, bottom = 4.dp)) { ExternalLink(p.iabCopy.preferenceCenterVendorListPrivacyPolicy, provider.policyUrl, "c15t.ac.provider.${provider.id}.privacy-link") }
            }
        }
    }
}

/** The web's notice, plus why the providers stay off while their purposes are. */
private fun providerIntro(p: ConsentPresenter): String {
    val notice = p.iabCopy.preferenceCenterVendorListAdTechProvidersNotice
    return if (p.providerPrerequisitesMet) notice else notice + " " + p.iabCopy.appProvidersOff
}
