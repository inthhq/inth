package com.c15t.consentui

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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
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

/**
 * The host app's own name and icon, read from its package so the first layer belongs to the
 * app that shows it. Nothing here is fetched; an app whose icon cannot be drawn gets an initial.
 */
internal data class HostIdentity(val name: String, val icon: ImageBitmap?, val markResId: Int? = null) {
    companion object {
        /**
         * Explicit [ConsentTheme.Brand] fields win; `null` fields come from the package. A named
         * mark that is not a drawable shows the initial rather than a silently substituted icon.
         */
        fun resolve(context: Context, brand: ConsentTheme.Brand): HostIdentity {
            val application = context.applicationContext
            val info = application.applicationInfo
            val name = brand.name ?: runCatching { info.loadLabel(application.packageManager).toString().trim() }
                .getOrNull()?.takeIf { it.isNotEmpty() } ?: application.packageName
            if (brand.markResId != null) {
                val valid = runCatching { application.resources.getResourceTypeName(brand.markResId) in listOf("drawable", "mipmap") }.getOrDefault(false)
                return HostIdentity(name, null, brand.markResId.takeIf { valid })
            }
            val icon = runCatching { application.packageManager.getApplicationIcon(info) }.getOrNull()?.let { bitmap(it) }
            return HostIdentity(name, icon)
        }

        /** The letter a drawn fallback tile shows. */
        fun initial(name: String): String = name.trim().firstOrNull()?.uppercase() ?: ""

        private fun bitmap(drawable: Drawable): ImageBitmap? = runCatching {
            val size = 192
            val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
            drawable.setBounds(0, 0, size, size)
            drawable.draw(Canvas(bitmap))
            bitmap.asImageBitmap()
        }.getOrNull()
    }
}

/** The app's mark and name above the headline. The mark is decorative; the name is read once. */
@Composable internal fun IdentityHeader() {
    val theme = LocalConsentTheme.current
    val context = LocalContext.current
    val brand = theme.brand
    val identity = remember(brand) { HostIdentity.resolve(context, brand) }
    // Launcher icons are masked close to a 22% corner; a drawn tile follows the same shape.
    val shape = RoundedCornerShape(22)
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        val tile = Modifier.size(56.dp).clip(shape).clearAndSetSemantics {}
        when {
            identity.markResId != null -> Image(painterResource(identity.markResId), contentDescription = null, contentScale = ContentScale.Crop,
                modifier = tile.border(1.dp, Color.Black.copy(alpha = 0.08f), shape))
            identity.icon != null -> Image(identity.icon, contentDescription = null, contentScale = ContentScale.Crop,
                modifier = tile.border(1.dp, Color.Black.copy(alpha = 0.08f), shape))
            else -> Box(tile.background(theme.colors.accent.color().copy(alpha = 0.12f)), contentAlignment = Alignment.Center) {
                Text(HostIdentity.initial(identity.name), fontFamily = theme.headlineFont.family, fontWeight = FontWeight.SemiBold,
                    fontSize = 28.sp, color = theme.colors.accent.color())
            }
        }
        Text(identity.name.uppercase(), style = MaterialTheme.typography.labelLarge, letterSpacing = 1.4.sp,
            color = theme.colors.accent.color(),
            modifier = Modifier.semantics { contentDescription = identity.name }.testTag("c15t.first-layer.brand"))
    }
}
