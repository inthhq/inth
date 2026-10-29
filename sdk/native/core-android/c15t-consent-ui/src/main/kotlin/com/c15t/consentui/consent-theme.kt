package com.c15t.consentui

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
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/** One colour with a light and a dark value, each an sRGB `0xRRGGBB`. */
data class ConsentThemeColor(val light: Int, val dark: Int = light) {
    /** The value for the current appearance. */
    @Composable @ReadOnlyComposable
    fun color(): Color = Color(0xFF000000L or (if (isSystemInDarkTheme()) dark else light).toLong())

    companion object {
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
 * Pass one to [C15tConsent], set [current] once in `Application.onCreate`, or declare the
 * same values as `<meta-data>` under the [Meta] names. Manifest values override [current];
 * an explicit theme passed to [C15tConsent] takes precedence over both.
 */
data class ConsentTheme(
    val colors: Colors = Colors.c15t,
    /** Corner radius of buttons and cards. */
    val cornerRadius: Dp = 14.dp,
    /** The platform system sans by default; hosts may supply another face. */
    val headlineFont: HeadlineFont = HeadlineFont.SansSerif,
    val brand: Brand = Brand(),
    val copy: Copy = Copy.c15t,
    /** Whether the small "Secured by c15t" line appears under the first-layer actions. */
    val showsBranding: Boolean = true,
    /** Provider identity in the attribution tag, independent of the app [brand]. */
    val branding: Branding = Branding.C15t,
) {
    internal val calloutRadius: Dp get() = (cornerRadius - 2.dp).coerceAtLeast(0.dp)

    /** Semantic colours. Components never use a raw value outside this set. */
    data class Colors(
        /** Page background behind every consent screen. */
        val canvas: ConsentThemeColor,
        /** Cards and list rows that sit on the canvas. */
        val surface: ConsentThemeColor,
        /** A quieter surface for subordinate content such as the partner purposes list. */
        val surfaceMuted: ConsentThemeColor,
        /** Primary text. */
        val text: ConsentThemeColor,
        /** Supporting text and section labels. */
        val textSecondary: ConsentThemeColor,
        /** Links, switches, the Save button, and the brand eyebrow. */
        val accent: ConsentThemeColor,
        /** Text on [accent]. */
        val onAccent: ConsentThemeColor,
        /** Fill of the two decision buttons. Accept all and Reject all always share it. */
        val decision: ConsentThemeColor,
        /** Text on [decision]. */
        val onDecision: ConsentThemeColor,
    ) {
        companion object {
            /** Warm paper, ink decisions, and the c15t blue for links and switches. */
            val c15t = Colors(
                canvas = ConsentThemeColor(0xF8F4EE, 0x171411),
                surface = ConsentThemeColor(0xFFFFFF, 0x211D18),
                surfaceMuted = ConsentThemeColor(0xEFE9DF, 0x2B2620),
                text = ConsentThemeColor(0x1E1B17, 0xF3EEE6),
                textSecondary = ConsentThemeColor(0x6B655D, 0xA49D93),
                accent = ConsentThemeColor(0x335CFF, 0x8CA2FF),
                onAccent = ConsentThemeColor(0xFFFFFF, 0x0A1033),
                decision = ConsentThemeColor(0x1E1B17, 0xF3EEE6),
                onDecision = ConsentThemeColor(0xF8F4EE, 0x171411),
            )
        }
    }

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
     * provider logo and "Your brand here" until the host supplies its own name or mark.
     */
    data class Brand(
        /** Short name shown as an eyebrow. `null` uses "Your brand here". */
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

    /** Provider identity displayed after "Secured by". Built-in marks are bundled vectors. */
    sealed interface Branding {
        val name: String
        data object C15t : Branding { override val name = "c15t" }
        data object Inth : Branding { override val name = "Inth" }
        /** An app-bundled logo. A missing logo renders the provider name alone. */
        data class Custom(override val name: String, val markResId: Int? = null) : Branding
    }

    /** First-layer copy a host may replace. Decision labels are not here on purpose. */
    data class Copy(
        /** The headline. Keep it short: it is set in display type. */
        val headline: String,
        /** The sentence under the headline. Partner and category details stay native. */
        val introduction: String,
    ) {
        companion object {
            val c15t = Copy(
                headline = "Your privacy, your choice.",
                introduction = "We use data to improve your experience, measure how the app is used and show relevant advertising.",
            )
        }
    }

    /** `<meta-data>` names. Each colour is `#RRGGBB` or `#RRGGBB,#RRGGBB` (light, dark), or a colour resource. */
    object Meta {
        const val META_ACCENT = "com.c15t.consent.ACCENT"
        const val META_ON_ACCENT = "com.c15t.consent.ON_ACCENT"
        const val META_CANVAS = "com.c15t.consent.CANVAS"
        const val META_SURFACE = "com.c15t.consent.SURFACE"
        const val META_SURFACE_MUTED = "com.c15t.consent.SURFACE_MUTED"
        const val META_TEXT = "com.c15t.consent.TEXT"
        const val META_TEXT_SECONDARY = "com.c15t.consent.TEXT_SECONDARY"
        const val META_DECISION = "com.c15t.consent.DECISION"
        const val META_ON_DECISION = "com.c15t.consent.ON_DECISION"
        /** A number of dp. */
        const val META_CORNER_RADIUS = "com.c15t.consent.CORNER_RADIUS"
        /** `serif`, `sans`, or a font resource. */
        const val META_HEADLINE_FONT = "com.c15t.consent.HEADLINE_FONT"
        /** A Boolean. `false` hides the app mark and name above the headline. */
        const val META_BRAND = "com.c15t.consent.BRAND"
        const val META_BRAND_NAME = "com.c15t.consent.BRAND_NAME"
        /** A drawable resource. */
        const val META_BRAND_MARK = "com.c15t.consent.BRAND_MARK"
        const val META_HEADLINE = "com.c15t.consent.HEADLINE"
        const val META_INTRODUCTION = "com.c15t.consent.INTRODUCTION"
        /** A Boolean. `false` hides the "Secured by c15t" line. */
        const val META_BRANDING = "com.c15t.consent.BRANDING"
        /** `c15t`, `inth`, or the legacy `consent` spelling for Inth. */
        const val META_BRANDING_PROVIDER = "com.c15t.consent.BRANDING_PROVIDER"
        const val META_BRANDING_NAME = "com.c15t.consent.BRANDING_NAME"
        /** Drawable resource for a custom provider logo. */
        const val META_BRANDING_MARK = "com.c15t.consent.BRANDING_MARK"
    }

    /**
     * Apply any [Meta] values in [bundle] over this theme. Unreadable values keep the existing
     * value; a theme never half-applies. Resources are resolved against [context].
     */
    fun applying(bundle: Bundle?, context: Context): ConsentTheme {
        if (bundle == null) return this
        @Suppress("DEPRECATION") fun raw(key: String): Any? = bundle.get(key)
        fun text(key: String): String? = raw(key)?.toString()?.trim()?.takeIf { it.isNotEmpty() }
        fun color(key: String, current: ConsentThemeColor): ConsentThemeColor = when (val value = raw(key)) {
            // AAPT stores a literal #RRGGBB as an opaque ARGB integer, not a string.
            is Int -> if (value ushr 24 == 0xFF) ConsentThemeColor(value and 0xFFFFFF)
                else runCatching { ConsentThemeColor(context.getColor(value) and 0xFFFFFF) }.getOrDefault(current)
            is String -> ConsentThemeColor.parse(value) ?: current
            else -> current
        }
        fun resource(key: String, type: String): Int? = when (val value = raw(key)) {
            is Int -> value.takeIf { it != 0 }
            is String -> context.resources.getIdentifier(value.trim().removePrefix("@$type/"), type, context.packageName).takeIf { it != 0 }
            else -> null
        }
        val c = colors
        val radius = when (val value = raw(Meta.META_CORNER_RADIUS)) {
            is Number -> value.toFloat().takeIf { it.isFinite() && it >= 0 }?.dp
            is String -> value.trim().toFloatOrNull()?.takeIf { it.isFinite() && it >= 0 }?.dp
            else -> null
        }
        val font = when (val name = text(Meta.META_HEADLINE_FONT)?.lowercase()) {
            null -> headlineFont
            "serif" -> HeadlineFont.Serif
            "sans", "sans-serif", "sansserif", "system", "rounded" -> HeadlineFont.SansSerif
            else -> resource(Meta.META_HEADLINE_FONT, "font")?.let { HeadlineFont.Custom(FontFamily(Font(it))) } ?: headlineFont
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
                textSecondary = color(Meta.META_TEXT_SECONDARY, c.textSecondary), accent = color(Meta.META_ACCENT, c.accent),
                onAccent = color(Meta.META_ON_ACCENT, c.onAccent), decision = color(Meta.META_DECISION, c.decision),
                onDecision = color(Meta.META_ON_DECISION, c.onDecision),
            ),
            cornerRadius = radius ?: cornerRadius,
            headlineFont = font,
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
            primary = colors.accent.color(), onPrimary = colors.onAccent.color(),
            background = colors.canvas.color(), onBackground = colors.text.color(),
            surface = colors.canvas.color(), onSurface = colors.text.color(),
            surfaceContainer = colors.surface.color(), surfaceContainerLow = colors.surface.color(),
            surfaceContainerHigh = colors.surface.color(), surfaceContainerHighest = colors.surfaceMuted.color(),
            surfaceVariant = colors.surfaceMuted.color(), onSurfaceVariant = colors.textSecondary.color(),
            outline = colors.textSecondary.color(), outlineVariant = colors.text.color().copy(alpha = 0.1f),
            error = Color(if (dark) 0xFFFF9C8F else 0xFFB42318), errorContainer = Color(if (dark) 0xFF3A1D1A else 0xFFFBEAE7),
            onErrorContainer = Color(if (dark) 0xFFFF9C8F else 0xFFB42318),
        )
    }

    companion object {
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

/** The theme in scope. Set by [C15tConsent]; defaults to the stock appearance. */
val LocalConsentTheme = staticCompositionLocalOf { ConsentTheme.c15t }
