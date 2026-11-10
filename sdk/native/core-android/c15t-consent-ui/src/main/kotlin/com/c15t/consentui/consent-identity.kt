package com.c15t.consentui

import android.content.Context
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
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
) {
    companion object {
        fun resolve(context: Context, brand: ConsentTheme.Brand, provider: ConsentTheme.Branding): HeaderIdentity {
            val name = brand.name ?: "Your brand here"
            fun drawable(id: Int?): Int? = id?.takeIf {
                runCatching { context.resources.getResourceTypeName(it) in listOf("drawable", "mipmap") }.getOrDefault(false)
            }
            if (brand.markResId != null) return HeaderIdentity(name, markResId = drawable(brand.markResId))
            return when (provider) {
                ConsentTheme.Branding.C15t, ConsentTheme.Branding.Inth -> HeaderIdentity(name, provider = provider)
                is ConsentTheme.Branding.Custom -> HeaderIdentity(name, markResId = drawable(provider.markResId))
            }
        }

        fun initial(name: String): String = name.trim().firstOrNull()?.uppercase() ?: ""
    }
}

/** The mark is decorative; the replaceable brand label is read once. */
@Composable internal fun IdentityHeader() {
    val theme = LocalConsentTheme.current
    val context = LocalContext.current
    val identity = remember(theme.brand, theme.branding) { HeaderIdentity.resolve(context, theme.brand, theme.branding) }
    val shape = RoundedCornerShape(22)
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        val tile = Modifier.size(56.dp).clip(shape)
        when {
            identity.markResId != null -> Image(painterResource(identity.markResId), contentDescription = null, contentScale = ContentScale.Crop,
                modifier = tile.border(1.dp, Color.Black.copy(alpha = 0.08f), shape).testTag("c15t.first-layer.brand-logo.custom"))
            // A bundled provider mark has no tile, so it starts at the text edge like the headline.
            identity.provider != null -> {
                val isInth = identity.provider == ConsentTheme.Branding.Inth
                Icon(if (isInth) ProviderMarks.inth else ProviderMarks.c15t, contentDescription = null, tint = theme.colors.text.color(),
                    modifier = Modifier.size(40.dp).testTag("c15t.first-layer.brand-logo.${if (isInth) "inth" else "c15t"}"))
            }
            else -> Box(tile.background(theme.colors.primary.color().copy(alpha = 0.12f)).testTag("c15t.first-layer.brand-logo.initial"), contentAlignment = Alignment.Center) {
                Text(HeaderIdentity.initial(identity.name), fontFamily = theme.typography.headlineFont.family, fontWeight = FontWeight.SemiBold,
                    fontSize = 28.sp, color = theme.colors.primary.color(), modifier = Modifier.clearAndSetSemantics {})
            }
        }
        Text(identity.name.uppercase(), style = MaterialTheme.typography.labelLarge, letterSpacing = 1.4.sp,
            color = theme.colors.primary.color(),
            modifier = Modifier.semantics { contentDescription = identity.name }.testTag("c15t.first-layer.brand"))
    }
}
