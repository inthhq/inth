// #region docs:android-brand-theme title="consent-theme.kt"
package com.c15t.demo

import androidx.compose.ui.unit.dp
import com.c15t.consentui.ConsentTheme
import com.c15t.consentui.ConsentThemeColor

fun pantryConsentTheme(brandMark: Int): ConsentTheme = ConsentTheme.c15t.copy(
    colors = ConsentTheme.Colors.c15t.copy(
        accent = ConsentThemeColor(0x00796B, 0x4FD1C0),
        onAccent = ConsentThemeColor(0xFFFFFF, 0x06302A),
    ),
    cornerRadius = 10.dp,
    brand = ConsentTheme.Brand(name = "Pantry", markResId = brandMark),
    branding = ConsentTheme.Branding.Inth,
    copy = ConsentTheme.Copy(
        headline = "Before you shop.",
        introduction = "Choose how Pantry uses data beyond your shopping basket.",
    ),
)
// #endregion docs:android-brand-theme
