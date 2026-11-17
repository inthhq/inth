package com.inth.consentui

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.Drawable
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** The stock header uses the selected provider's bundled mark until the host supplies its own. */
internal data class HeaderIdentity(
    val name: String,
    val markResId: Int? = null,
    val provider: ConsentTheme.Branding? = null,
    /** The app's launcher icon, where the header stands for the app. */
    val icon: Drawable? = null,
) {
    companion object {
        /**
         * [placeholder] stands in for a brand with no name, in the screen's language.
         *
         * @param appIdentity The system page and the sheet present as part of the app, so the
         *   app's label stands in for a missing brand name and its launcher icon for a missing mark, each on
         *   its own. A named brand with no mark gets the app icon, not the provider's mark beside its name.
         */
        fun resolve(context: Context, brand: ConsentTheme.Brand, provider: ConsentTheme.Branding, placeholder: String, appIdentity: Boolean = false): HeaderIdentity {
            val name = brand.name ?: (if (appIdentity) appName(context) else null) ?: placeholder
            fun drawable(id: Int?): Int? = id?.takeIf {
                runCatching { context.resources.getResourceTypeName(it) in listOf("drawable", "mipmap") }.getOrDefault(false)
            }
            if (brand.markResId != null) return HeaderIdentity(name, markResId = drawable(brand.markResId))
            if (appIdentity) appIcon(context)?.let { return HeaderIdentity(name, icon = it) }
            return when (provider) {
                ConsentTheme.Branding.C15t, ConsentTheme.Branding.Inth -> HeaderIdentity(name, provider = provider)
                is ConsentTheme.Branding.Custom -> HeaderIdentity(name, markResId = drawable(provider.markResId))
            }
        }

        /** The label the app declares. An app with none is not named after its package. */
        fun appName(context: Context): String? {
            val info = context.applicationInfo
            if (info.labelRes == 0 && info.nonLocalizedLabel == null) return null
            return runCatching { info.loadLabel(context.packageManager).toString().trim() }.getOrNull()?.takeIf { it.isNotEmpty() }
        }

        /** The launcher icon the app declares; the system's stand-in for an app with none is not used. */
        fun appIcon(context: Context): Drawable? {
            val info = context.applicationInfo
            if (info.icon == 0) return null
            return runCatching { context.packageManager.getApplicationIcon(info) }.getOrNull()
        }

        fun initial(name: String): String = name.trim().firstOrNull()?.uppercase() ?: ""
    }
}

/**
 * The mark is decorative; the replaceable brand label is read once. The stock page stacks the
 * mark over the name. The system page shows the mark alone, larger and centred, and the sheet
 * one row: a small mark beside the name.
 */
@Composable internal fun IdentityHeader(placeholder: String, chrome: FirstLayerChrome = FirstLayerChrome.Standard) {
    val theme = LocalConsentTheme.current
    val context = LocalContext.current
    val appIdentity = chrome != FirstLayerChrome.Standard
    val identity = remember(theme.brand, theme.branding, placeholder, appIdentity) { HeaderIdentity.resolve(context, theme.brand, theme.branding, placeholder, appIdentity) }
    // 36dp in the sheet's row and 76dp centred, against 56dp at the start edge.
    val scale = when (chrome) { FirstLayerChrome.Sheet -> 36f / 56f; FirstLayerChrome.System -> 76f / 56f; else -> 1f }
    val tile: @Composable () -> Unit = { IdentityTile(identity, scale) }
    when (chrome) {
        FirstLayerChrome.Sheet -> Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
            tile()
            Text(identity.name, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold,
                color = theme.colors.textMuted.color(), modifier = Modifier.testTag("inth.first-layer.brand"))
        }
        FirstLayerChrome.System -> Box(Modifier.semantics { contentDescription = identity.name }.testTag("inth.first-layer.brand")) { tile() }
        else -> Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
            tile()
            Text(identity.name.uppercase(), style = MaterialTheme.typography.labelLarge, letterSpacing = 1.4.sp,
                color = theme.colors.primary.color(),
                modifier = Modifier.semantics { contentDescription = identity.name }.testTag("inth.first-layer.brand"))
        }
    }
}

@Composable private fun IdentityTile(identity: HeaderIdentity, scale: Float) {
    val theme = LocalConsentTheme.current
    val shape = RoundedCornerShape(22)
    val tile = Modifier.size(56.dp * scale).clip(shape)
    when {
        identity.markResId != null -> Image(painterResource(identity.markResId), contentDescription = null, contentScale = ContentScale.Crop,
            modifier = tile.border(1.dp, Color.Black.copy(alpha = 0.08f), shape).testTag("inth.first-layer.brand-logo.custom"))
        identity.icon != null -> {
            // Launcher icons are adaptive or bitmap drawables; either draws into a square at the largest launcher density.
            val bitmap = remember(identity.icon) {
                val drawable = identity.icon.constantState?.newDrawable()?.mutate() ?: identity.icon
                Bitmap.createBitmap(192, 192, Bitmap.Config.ARGB_8888).also { drawable.setBounds(0, 0, 192, 192); drawable.draw(Canvas(it)) }.asImageBitmap()
            }
            Image(bitmap, contentDescription = null, contentScale = ContentScale.Crop, modifier = tile.testTag("inth.first-layer.brand-logo.app"))
        }
        // A bundled provider mark has no tile, so it starts at the text edge like the headline.
        identity.provider != null -> {
            val isInth = identity.provider == ConsentTheme.Branding.Inth
            Icon(if (isInth) ProviderMarks.inth else ProviderMarks.c15t, contentDescription = null, tint = theme.colors.text.color(),
                modifier = Modifier.size(40.dp * scale).testTag("inth.first-layer.brand-logo.${if (isInth) "inth" else "c15t"}"))
        }
        else -> Box(tile.background(theme.colors.primary.color().copy(alpha = 0.12f)).testTag("inth.first-layer.brand-logo.initial"), contentAlignment = Alignment.Center) {
            Text(HeaderIdentity.initial(identity.name), fontFamily = theme.typography.headlineFont.family, fontWeight = FontWeight.SemiBold,
                fontSize = 28.sp * scale, color = theme.colors.primary.color(), modifier = Modifier.clearAndSetSemantics {})
        }
    }
}
