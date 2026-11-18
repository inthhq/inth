package com.inth.consentui

import android.content.Context
import android.content.pm.PackageManager
import android.os.Bundle
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.math.max
import kotlin.math.min

/** One colour with a light and a dark value, each an sRGB `0xRRGGBB`. */
data class ConsentThemeColor(val light: Int, val dark: Int = light) {
    /** The value for the current appearance. */
    @Composable @ReadOnlyComposable
    fun color(): Color = Color(0xFF000000L or (if (isSystemInDarkTheme()) dark else light).toLong())

    /**
     * This colour moved [fraction] of the way toward [other] in each appearance, in sRGB.
     * `0f` keeps this colour and `1f` is [other]; values outside `0f..1f` are clamped.
     */
    fun blended(toward: ConsentThemeColor, fraction: Float): ConsentThemeColor =
        ConsentThemeColor(mix(light, toward.light, fraction), mix(dark, toward.dark, fraction))

    companion object {
        private fun mix(from: Int, to: Int, fraction: Float): Int {
            val amount = fraction.coerceIn(0f, 1f)
            fun channel(shift: Int): Int {
                val start = (from shr shift) and 255
                val end = (to shr shift) and 255
                return Math.round(start + (end - start) * amount) shl shift
            }
            return channel(16) or channel(8) or channel(0)
        }

        /** Parse `#RRGGBB`, `RRGGBB`, or `#RRGGBB,#RRGGBB` (light, dark); `null` for anything else. */
        fun parse(text: String): ConsentThemeColor? {
            val parts = text.split(",").map { part ->
                val hex = part.trim().removePrefix("#")
                if (hex.length == 6) hex.toIntOrNull(16) else null
            }
            if (parts.isEmpty() || parts.size > 2 || parts.any { it == null }) return null
            return ConsentThemeColor(parts[0]!!, parts.getOrNull(1) ?: parts[0]!!)
        }
    }
}

/**
 * Appearance of the native consent screens. Every value has a c15t default.
 *
 * Pass one to [InthConsent], set [current] once in `Application.onCreate`, or declare the
 * same values as `<meta-data>` under the [Meta] names. Manifest values override [current];
 * an explicit theme passed to [InthConsent] takes precedence over both.
 */
data class ConsentTheme(
    val colors: Colors = Colors.c15t,
    val radius: Radius = Radius(),
    val spacing: Spacing = Spacing(),
    val typography: Typography = Typography(),
    /** Per-part overrides on top of the tokens. */
    val slots: Map<Slot, SlotStyle> = emptyMap(),
    val brand: Brand = Brand(),
    val copy: Copy = Copy.c15t,
    /** Whether the small "Secured by c15t" line appears under the first-layer actions. */
    val showsBranding: Boolean = true,
    /** Provider identity in the attribution tag, independent of the app [brand]. */
    val branding: Branding = Branding.C15t,
) {
    /** The overrides for [slot], or an empty style. */
    fun slot(slot: Slot): SlotStyle = slots[slot] ?: SlotStyle()

    /**
     * Semantic colours. Components never use a raw value outside this set. A name that has a web
     * token is that token's name: [primary] is `--c15t-primary`, [textMuted] is `--c15t-text-muted`.
     */
    data class Colors(
        /** Page background behind every consent screen. No web token. */
        val canvas: ConsentThemeColor,
        /** Cards and list rows that sit on the canvas. Web: `--c15t-surface`. */
        val surface: ConsentThemeColor,
        /** A quieter surface for subordinate content such as the partner purposes list. No web token. */
        val surfaceMuted: ConsentThemeColor,
        /** Primary text. Web: `--c15t-text`. */
        val text: ConsentThemeColor,
        /** Supporting text and section labels. Web: `--c15t-text-muted`. */
        val textMuted: ConsentThemeColor,
        /** Links, switches, the Save button, and the brand eyebrow. Web: `--c15t-primary`. */
        val primary: ConsentThemeColor,
        /** Text on [primary]. Web: `--c15t-text-on-primary`. */
        val textOnPrimary: ConsentThemeColor,
        /**
         * Fill of the two decision buttons. Accept all and Reject all always share it. In an
         * appearance where it and [textOnDecision] are below 5:1 contrast, the stock pair is used.
         * No web token.
         */
        val decision: ConsentThemeColor,
        /** Text on [decision]. Needs at least 5:1 contrast with it; see [decision]. No web token. */
        val textOnDecision: ConsentThemeColor,
    ) {
        /**
         * Text of an On or Partly on status tag. The tag sits on a 14% tint of [primary], and the
         * primary alone does not reach 4.5:1 on its own tint at label size, so the label is the
         * primary pulled toward [text]. Derived, so a host theme gets the same floor for free.
         */
        internal val statusTagText: ConsentThemeColor get() = primary.blended(toward = text, fraction = 0.3f)

        companion object {
            /** Warm paper, ink decisions, and the c15t blue for links and switches. */
            val c15t = Colors(
                canvas = ConsentThemeColor(0xF8F4EE, 0x171411),
                surface = ConsentThemeColor(0xFFFFFF, 0x211D18),
                surfaceMuted = ConsentThemeColor(0xEFE9DF, 0x2B2620),
                text = ConsentThemeColor(0x1E1B17, 0xF3EEE6),
                textMuted = ConsentThemeColor(0x6B655D, 0xA49D93),
                primary = ConsentThemeColor(0x335CFF, 0x8CA2FF),
                textOnPrimary = ConsentThemeColor(0xFFFFFF, 0x0A1033),
                decision = ConsentThemeColor(0x1E1B17, 0xF3EEE6),
                textOnDecision = ConsentThemeColor(0xF8F4EE, 0x171411),
            )
        }
    }

    /** Corner radii, named after `--c15t-radius-*`. */
    data class Radius(
        /** Status callouts. `null` follows [md] minus 2dp. */
        val sm: Dp? = null,
        /** Buttons and cards. Web: `--c15t-radius-md`. */
        val md: Dp = 14.dp,
        /** The notice card and the dialogs. `null` follows [md] plus 6dp. */
        val lg: Dp? = null,
    ) {
        internal val resolvedSm: Dp get() = sm ?: (md - 2.dp).coerceAtLeast(0.dp)
        internal val resolvedLg: Dp get() = lg ?: (md + 6.dp)
    }

    /**
     * Spacing scale, named after `--c15t-space-*`. Page gutters, stack gaps and section padding
     * read it; a control's own inset stays fixed so its tap target keeps its size.
     */
    data class Spacing(
        val xs: Dp = 4.dp,
        val sm: Dp = 8.dp,
        val md: Dp = 16.dp,
        val lg: Dp = 24.dp,
        val xl: Dp = 32.dp,
    )

    /** Type settings, named after the web `typography` tokens. */
    data class Typography(
        /** Face for every text role except the headline. `null` is the platform face. Web: `--c15t-font-family`. */
        val fontFamily: FontFamily? = null,
        /** Typeface of the first-layer headline. No web token. */
        val headlineFont: HeadlineFont = HeadlineFont.SansSerif,
        val fontSize: FontSize = FontSize(),
    )

    /**
     * Sizes in sp, named after `--c15t-font-size-*`. `null` keeps the Material size. Every text
     * role in a group scales with its token, so the hierarchy inside the group holds, and the
     * system font scale still applies on top.
     */
    data class FontSize(
        /** Supporting text, footnotes and captions. The Material default is 14sp (bodyMedium). */
        val sm: TextUnit? = null,
        /** Body text, row titles and buttons. The Material default is 16sp (bodyLarge). */
        val base: TextUnit? = null,
        /** The first-layer headline and screen titles. The stock headline is 34sp. */
        val lg: TextUnit? = null,
    )

    /** Parts a theme can restyle one at a time, named after the web `slots`. */
    enum class Slot(
        /** Name in the web theme and in `Info.plist`. */
        val key: String,
        internal val meta: String,
    ) {
        /** The first-layer headline. */
        ConsentBannerTitle("consentBannerTitle", "CONSENT_BANNER_TITLE"),
        /** The sentence under the first-layer headline. */
        ConsentBannerDescription("consentBannerDescription", "CONSENT_BANNER_DESCRIPTION"),
        /** Accept all and Reject all, and the other filled decisions. Both always share it. */
        ButtonPrimary("buttonPrimary", "BUTTON_PRIMARY"),
        /** Outlined actions such as Customize and Privacy settings. */
        ButtonSecondary("buttonSecondary", "BUTTON_SECONDARY"),
    }

    /**
     * One part's overrides. Each field names the CSS property a web slot's `style` would set, and
     * `null` keeps the theme value. A field the part does not draw is ignored.
     */
    data class SlotStyle(
        val color: ConsentThemeColor? = null,
        /** Fill of a button. */
        val backgroundColor: ConsentThemeColor? = null,
        /** Corner radius of a button. */
        val borderRadius: Dp? = null,
        val fontSize: TextUnit? = null,
    )

    /** Typeface of the first-layer headline. Body text always uses the system face. */
    sealed interface HeadlineFont {
        /** The device serif, Noto Serif on stock Android. */
        data object Serif : HeadlineFont
        /** The platform default face. Android has no rounded system face, so `rounded` resolves here too. */
        data object SansSerif : HeadlineFont
        /** A font the app bundles. */
        data class Custom(val fontFamily: FontFamily) : HeadlineFont

        val family: FontFamily get() = when (this) {
            Serif -> FontFamily.Serif
            SansSerif -> FontFamily.Default
            is Custom -> fontFamily
        }
    }

    /**
     * The replaceable app identity above the headline. The stock header uses the selected
     * provider logo and a placeholder name until the host supplies its own name or mark.
     */
    data class Brand(
        /** Short name shown as an eyebrow. `null` shows a placeholder in the policy's language. */
        val name: String? = null,
        /** Drawable resource for the mark. `null` uses the selected provider logo. An unreadable
         * explicit mark gets the name's initial. Rendered in a 56dp square tile. */
        val markResId: Int? = null,
        /** `true` shows no identity at all: the headline starts the page. */
        val hidden: Boolean = false,
    ) {
        companion object {
            /** No app mark or name above the headline. */
            val Hidden = Brand(hidden = true)
        }
    }

    /** Provider identity displayed in the provider tag. Built-in marks are bundled vectors. */
    sealed interface Branding {
        val name: String
        data object C15t : Branding { override val name = "c15t" }
        data object Inth : Branding { override val name = "Inth" }
        /** An app-bundled logo. A missing logo renders the provider name alone. */
        data class Custom(override val name: String, val markResId: Int? = null) : Branding
    }

    /**
     * First-layer copy a host may replace. Decision labels are not here on purpose. A `null` field
     * shows the stock copy from `@c15t/translations` in the policy's language; a host string is
     * shown as given in every language.
     */
    data class Copy(
        /** The headline. Keep it short: it is set in display type. */
        val headline: String? = null,
        /** The sentence under the headline. Partner and category details stay native. */
        val introduction: String? = null,
    ) {
        companion object {
            /** The stock copy, translated. */
            val c15t = Copy()
        }
    }

    /**
     * `<meta-data>` names. Each colour is `#RRGGBB` or `#RRGGBB,#RRGGBB` (light, dark), or a colour
     * resource. Radii and spacing are numbers of dp; font sizes are numbers of sp.
     */
    object Meta {
        const val META_PRIMARY = "com.inth.consent.PRIMARY"
        const val META_TEXT_ON_PRIMARY = "com.inth.consent.TEXT_ON_PRIMARY"
        const val META_CANVAS = "com.inth.consent.CANVAS"
        const val META_SURFACE = "com.inth.consent.SURFACE"
        const val META_SURFACE_MUTED = "com.inth.consent.SURFACE_MUTED"
        const val META_TEXT = "com.inth.consent.TEXT"
        const val META_TEXT_MUTED = "com.inth.consent.TEXT_MUTED"
        const val META_DECISION = "com.inth.consent.DECISION"
        const val META_TEXT_ON_DECISION = "com.inth.consent.TEXT_ON_DECISION"
        const val META_RADIUS_SM = "com.inth.consent.RADIUS_SM"
        const val META_RADIUS_MD = "com.inth.consent.RADIUS_MD"
        const val META_RADIUS_LG = "com.inth.consent.RADIUS_LG"
        const val META_SPACE_XS = "com.inth.consent.SPACE_XS"
        const val META_SPACE_SM = "com.inth.consent.SPACE_SM"
        const val META_SPACE_MD = "com.inth.consent.SPACE_MD"
        const val META_SPACE_LG = "com.inth.consent.SPACE_LG"
        const val META_SPACE_XL = "com.inth.consent.SPACE_XL"
        /** A font resource. */
        const val META_FONT_FAMILY = "com.inth.consent.FONT_FAMILY"
        const val META_FONT_SIZE_SM = "com.inth.consent.FONT_SIZE_SM"
        const val META_FONT_SIZE_BASE = "com.inth.consent.FONT_SIZE_BASE"
        const val META_FONT_SIZE_LG = "com.inth.consent.FONT_SIZE_LG"
        /** `serif`, `sans`, or a font resource. */
        const val META_HEADLINE_FONT = "com.inth.consent.HEADLINE_FONT"
        /**
         * One slot field, such as `com.inth.consent.BUTTON_PRIMARY_BACKGROUND_COLOR`. [field] is
         * `COLOR`, `BACKGROUND_COLOR`, `BORDER_RADIUS` or `FONT_SIZE`.
         */
        fun slot(slot: Slot, field: String): String = "com.inth.consent.${slot.meta}_$field"
        /** A Boolean. `false` hides the app mark and name above the headline. */
        const val META_BRAND = "com.inth.consent.BRAND"
        const val META_BRAND_NAME = "com.inth.consent.BRAND_NAME"
        /** A drawable resource. */
        const val META_BRAND_MARK = "com.inth.consent.BRAND_MARK"
        const val META_HEADLINE = "com.inth.consent.HEADLINE"
        const val META_INTRODUCTION = "com.inth.consent.INTRODUCTION"
        /** A Boolean. `false` hides the "Secured by c15t" line. */
        const val META_BRANDING = "com.inth.consent.BRANDING"
        /** `c15t`, `inth`, or the legacy `consent` spelling for Inth. */
        const val META_BRANDING_PROVIDER = "com.inth.consent.BRANDING_PROVIDER"
        const val META_BRANDING_NAME = "com.inth.consent.BRANDING_NAME"
        /** Drawable resource for a custom provider logo. */
        const val META_BRANDING_MARK = "com.inth.consent.BRANDING_MARK"
    }

    /**
     * Apply any [Meta] values in [bundle] over this theme. Unreadable values keep the existing
     * value; a theme never half-applies. Resources are resolved against [context].
     */
    fun applying(bundle: Bundle?, context: Context): ConsentTheme {
        if (bundle == null) return this
        @Suppress("DEPRECATION") fun raw(key: String): Any? = bundle.get(key)
        fun text(key: String): String? = raw(key)?.toString()?.trim()?.takeIf { it.isNotEmpty() }
        fun readColor(key: String): ConsentThemeColor? = when (val value = raw(key)) {
            // AAPT stores a literal #RRGGBB as an opaque ARGB integer, not a string.
            is Int -> if (value ushr 24 == 0xFF) ConsentThemeColor(value and 0xFFFFFF)
                else runCatching { ConsentThemeColor(context.getColor(value) and 0xFFFFFF) }.getOrNull()
            is String -> ConsentThemeColor.parse(value)
            else -> null
        }
        fun color(key: String, current: ConsentThemeColor): ConsentThemeColor = readColor(key) ?: current
        fun resource(key: String, type: String): Int? = when (val value = raw(key)) {
            is Int -> value.takeIf { it != 0 }
            is String -> context.resources.getIdentifier(value.trim().removePrefix("@$type/"), type, context.packageName).takeIf { it != 0 }
            else -> null
        }
        val c = colors
        /** A finite number at least 0, or above 0 when [positive]; `null` when unreadable. */
        fun number(key: String, positive: Boolean = false): Float? = when (val value = raw(key)) {
            is Number -> value.toFloat()
            is String -> value.trim().toFloatOrNull()
            else -> null
        }?.takeIf { it.isFinite() && if (positive) it > 0 else it >= 0 }
        fun dp(key: String): Dp? = number(key)?.dp
        fun sp(key: String): TextUnit? = number(key, positive = true)?.sp
        val font = when (val name = text(Meta.META_HEADLINE_FONT)?.lowercase()) {
            null -> typography.headlineFont
            "serif" -> HeadlineFont.Serif
            "sans", "sans-serif", "sansserif", "system", "rounded" -> HeadlineFont.SansSerif
            else -> resource(Meta.META_HEADLINE_FONT, "font")?.let { HeadlineFont.Custom(FontFamily(Font(it))) } ?: typography.headlineFont
        }
        val family = resource(Meta.META_FONT_FAMILY, "font")?.let { FontFamily(Font(it)) } ?: typography.fontFamily
        val slotStyles = slots.toMutableMap()
        for (slot in Slot.entries) {
            val current = slot(slot)
            val next = current.copy(
                color = readColor(Meta.slot(slot, "COLOR")) ?: current.color,
                backgroundColor = readColor(Meta.slot(slot, "BACKGROUND_COLOR")) ?: current.backgroundColor,
                borderRadius = dp(Meta.slot(slot, "BORDER_RADIUS")) ?: current.borderRadius,
                fontSize = sp(Meta.slot(slot, "FONT_SIZE")) ?: current.fontSize,
            )
            if (next != SlotStyle()) slotStyles[slot] = next
        }
        fun flag(key: String): Boolean? = when (val value = raw(key)) {
            is Boolean -> value
            is Number -> value.toLong() != 0L
            is String -> when (value.trim().lowercase()) { "true", "1", "yes" -> true; "false", "0", "no" -> false; else -> null }
            else -> null
        }
        val visible = flag(Meta.META_BRANDING) ?: showsBranding
        val identityHidden = flag(Meta.META_BRAND)?.let { !it } ?: brand.hidden
        var provider = when (text(Meta.META_BRANDING_PROVIDER)?.lowercase()) {
            "c15t" -> Branding.C15t
            "inth", "consent" -> Branding.Inth
            else -> branding
        }
        val providerName = (raw(Meta.META_BRANDING_NAME) as? String)?.trim()?.takeIf { it.isNotEmpty() }
        val providerMark = resource(Meta.META_BRANDING_MARK, "drawable")?.takeIf { id ->
            runCatching { context.resources.getResourceTypeName(id) in listOf("drawable", "mipmap") }.getOrDefault(false)
        }
        if (providerName != null) provider = Branding.Custom(providerName, providerMark)
        else if (providerMark != null && provider is Branding.Custom) provider = provider.copy(markResId = providerMark)
        return copy(
            colors = Colors(
                canvas = color(Meta.META_CANVAS, c.canvas), surface = color(Meta.META_SURFACE, c.surface),
                surfaceMuted = color(Meta.META_SURFACE_MUTED, c.surfaceMuted), text = color(Meta.META_TEXT, c.text),
                textMuted = color(Meta.META_TEXT_MUTED, c.textMuted), primary = color(Meta.META_PRIMARY, c.primary),
                textOnPrimary = color(Meta.META_TEXT_ON_PRIMARY, c.textOnPrimary), decision = color(Meta.META_DECISION, c.decision),
                textOnDecision = color(Meta.META_TEXT_ON_DECISION, c.textOnDecision),
            ),
            radius = Radius(
                sm = dp(Meta.META_RADIUS_SM) ?: radius.sm, md = dp(Meta.META_RADIUS_MD) ?: radius.md, lg = dp(Meta.META_RADIUS_LG) ?: radius.lg,
            ),
            spacing = Spacing(
                xs = dp(Meta.META_SPACE_XS) ?: spacing.xs, sm = dp(Meta.META_SPACE_SM) ?: spacing.sm, md = dp(Meta.META_SPACE_MD) ?: spacing.md,
                lg = dp(Meta.META_SPACE_LG) ?: spacing.lg, xl = dp(Meta.META_SPACE_XL) ?: spacing.xl,
            ),
            typography = Typography(
                fontFamily = family, headlineFont = font,
                fontSize = FontSize(
                    sm = sp(Meta.META_FONT_SIZE_SM) ?: typography.fontSize.sm, base = sp(Meta.META_FONT_SIZE_BASE) ?: typography.fontSize.base,
                    lg = sp(Meta.META_FONT_SIZE_LG) ?: typography.fontSize.lg,
                ),
            ),
            slots = slotStyles,
            brand = Brand(name = text(Meta.META_BRAND_NAME) ?: brand.name, markResId = resource(Meta.META_BRAND_MARK, "drawable") ?: brand.markResId, hidden = identityHidden),
            copy = Copy(headline = text(Meta.META_HEADLINE) ?: copy.headline, introduction = text(Meta.META_INTRODUCTION) ?: copy.introduction),
            showsBranding = visible,
            branding = provider,
        )
    }

    /** The Material scheme the screens are built on. Anything Material draws takes these. */
    @Composable @ReadOnlyComposable
    fun colorScheme(): ColorScheme {
        val dark = isSystemInDarkTheme()
        val base = if (dark) darkColorScheme() else lightColorScheme()
        return base.copy(
            primary = colors.primary.color(), onPrimary = colors.textOnPrimary.color(),
            background = colors.canvas.color(), onBackground = colors.text.color(),
            surface = colors.canvas.color(), onSurface = colors.text.color(),
            surfaceContainer = colors.surface.color(), surfaceContainerLow = colors.surface.color(),
            surfaceContainerHigh = colors.surface.color(), surfaceContainerHighest = colors.surfaceMuted.color(),
            surfaceVariant = colors.surfaceMuted.color(), onSurfaceVariant = colors.textMuted.color(),
            outline = colors.textMuted.color(), outlineVariant = colors.text.color().copy(alpha = 0.1f),
            error = Color(if (dark) 0xFFFF9C8F else 0xFFB42318), errorContainer = Color(if (dark) 0xFF3A1D1A else 0xFFFBEAE7),
            onErrorContainer = Color(if (dark) 0xFFFF9C8F else 0xFFB42318),
        )
    }

    /**
     * This theme with decision colours that keep Accept all and Reject all readable. IAB TCF
     * policy asks for at least 5:1 text contrast on the first layer's two primary actions, so an
     * appearance whose [Colors.decision] and [Colors.onDecision] fall below that gets the stock
     * pair for that appearance instead. The first fallback in a process is logged once.
     */
    internal fun withReadableDecisions(): ConsentTheme {
        val stock = Colors.c15t
        val fill = decisionFill
        val label = decisionLabel
        val light = contrastRatio(fill.light, label.light) >= DECISION_CONTRAST_FLOOR
        val dark = contrastRatio(fill.dark, label.dark) >= DECISION_CONTRAST_FLOOR
        if (light && dark) return this
        if (decisionContrastWarned.compareAndSet(false, true)) {
            android.util.Log.w(LOG_TAG, "Decision colours are below $DECISION_CONTRAST_FLOOR:1 contrast in " +
                listOfNotNull(if (light) null else "light", if (dark) null else "dark").joinToString(" and ") +
                " appearance; using the stock decision colours there.")
        }
        fun pick(host: ConsentThemeColor, fallback: ConsentThemeColor) =
            ConsentThemeColor(if (light) host.light else fallback.light, if (dark) host.dark else fallback.dark)
        val primarySlot = slots[Slot.ButtonPrimary]
        return copy(
            colors = colors.copy(decision = pick(fill, stock.decision), textOnDecision = pick(label, stock.textOnDecision)),
            slots = if (primarySlot == null) slots else slots + (Slot.ButtonPrimary to primarySlot.copy(color = null, backgroundColor = null)),
        )
    }

    /** The fill the decision buttons draw: the [Slot.ButtonPrimary] colour over [Colors.decision]. */
    internal val decisionFill: ConsentThemeColor get() = slot(Slot.ButtonPrimary).backgroundColor ?: colors.decision
    /** The label the decision buttons draw: the [Slot.ButtonPrimary] colour over [Colors.textOnDecision]. */
    internal val decisionLabel: ConsentThemeColor get() = slot(Slot.ButtonPrimary).color ?: colors.textOnDecision

    /**
     * The Material type scale the screens are built on, with [Typography.fontFamily] on every style
     * and each [FontSize] token scaling its group. A role keeps its ratio to the group's lead
     * size, so with `sm` at 15sp a 12sp bodySmall becomes 15 × 12 / 14.
     */
    internal fun materialTypography(): androidx.compose.material3.Typography {
        val base = androidx.compose.material3.Typography()
        val family = typography.fontFamily
        val size = typography.fontSize
        fun TextStyle.themed(token: TextUnit?, lead: Float): TextStyle {
            val styled = if (family != null) copy(fontFamily = family) else this
            if (token == null) return styled
            val ratio = token.value / lead
            return styled.copy(
                fontSize = (fontSize.value * ratio).sp,
                lineHeight = if (lineHeight.isSp) (lineHeight.value * ratio).sp else lineHeight,
            )
        }
        return base.copy(
            displayLarge = base.displayLarge.themed(size.lg, HEADLINE_SIZE), displayMedium = base.displayMedium.themed(size.lg, HEADLINE_SIZE),
            displaySmall = base.displaySmall.themed(size.lg, HEADLINE_SIZE), headlineLarge = base.headlineLarge.themed(size.lg, HEADLINE_SIZE),
            headlineMedium = base.headlineMedium.themed(size.lg, HEADLINE_SIZE), headlineSmall = base.headlineSmall.themed(size.lg, HEADLINE_SIZE),
            titleLarge = base.titleLarge.themed(size.lg, HEADLINE_SIZE),
            titleMedium = base.titleMedium.themed(size.base, BODY_SIZE), titleSmall = base.titleSmall.themed(size.base, BODY_SIZE),
            bodyLarge = base.bodyLarge.themed(size.base, BODY_SIZE), labelLarge = base.labelLarge.themed(size.base, BODY_SIZE),
            bodyMedium = base.bodyMedium.themed(size.sm, SUPPORTING_SIZE), bodySmall = base.bodySmall.themed(size.sm, SUPPORTING_SIZE),
            labelMedium = base.labelMedium.themed(size.sm, SUPPORTING_SIZE), labelSmall = base.labelSmall.themed(size.sm, SUPPORTING_SIZE),
        )
    }

    /** The first-layer headline: [Typography.headlineFont] at `lg`, or the [Slot.ConsentBannerTitle] size. */
    internal fun headlineStyle(material: TextStyle): TextStyle {
        val size = slot(Slot.ConsentBannerTitle).fontSize ?: typography.fontSize.lg ?: HEADLINE_SIZE.sp
        return material.copy(
            fontFamily = typography.headlineFont.family, fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold,
            fontSize = size, lineHeight = (size.value * HEADLINE_LINE_HEIGHT / HEADLINE_SIZE).sp, letterSpacing = (-0.25).sp,
        )
    }

    companion object {
        /** IAB TCF policy's minimum text contrast for the first layer's two primary actions. */
        internal const val DECISION_CONTRAST_FLOOR = 5.0
        /** Lead sizes of the three type groups, in sp: the stock headline, bodyLarge and bodyMedium. */
        internal const val HEADLINE_SIZE = 34f
        internal const val HEADLINE_LINE_HEIGHT = 40f
        internal const val BODY_SIZE = 16f
        internal const val SUPPORTING_SIZE = 14f
        internal const val LOG_TAG = "InthConsent"
        /** Set after the first decision-colour fallback is logged; tests reset it. */
        internal val decisionContrastWarned = java.util.concurrent.atomic.AtomicBoolean(false)

        /** WCAG 2 contrast ratio between two opaque sRGB `0xRRGGBB` colours, from 1 to 21. */
        internal fun contrastRatio(first: Int, second: Int): Double {
            fun luminance(rgb: Int): Double {
                fun channel(shift: Int): Double {
                    val value = ((rgb shr shift) and 255) / 255.0
                    return if (value <= 0.03928) value / 12.92 else Math.pow((value + 0.055) / 1.055, 2.4)
                }
                return 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0)
            }
            val a = luminance(first)
            val b = luminance(second)
            return (max(a, b) + 0.05) / (min(a, b) + 0.05)
        }

        /** The stock c15t appearance. */
        val c15t = ConsentTheme()

        /** The theme hosts that present without passing one get. Set it once at launch. */
        @Volatile var current: ConsentTheme? = null

        /** [current] with the application's manifest `<meta-data>` applied over it. */
        fun resolve(context: Context): ConsentTheme {
            val application = context.applicationContext
            val bundle = runCatching {
                application.packageManager.getApplicationInfo(application.packageName, PackageManager.GET_META_DATA).metaData
            }.getOrNull()
            return (current ?: c15t).applying(bundle, application)
        }
    }
}

/** The theme in scope. Set by [InthConsent]; defaults to the stock appearance. */
val LocalConsentTheme = staticCompositionLocalOf { ConsentTheme.c15t }
