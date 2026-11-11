// #region docs:android-brand-theme title="consent-theme.kt"
package com.c15t.demo

import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.c15t.consentui.ConsentTheme
import com.c15t.consentui.ConsentThemeColor

fun pantryConsentTheme(brandMark: Int): ConsentTheme = ConsentTheme.c15t.copy(
    colors = ConsentTheme.Colors.c15t.copy(
        primary = ConsentThemeColor(0x00796B, 0x4FD1C0),
        textOnPrimary = ConsentThemeColor(0xFFFFFF, 0x06302A),
    ),
    radius = ConsentTheme.Radius(md = 10.dp),
    spacing = ConsentTheme.Spacing(lg = 28.dp),
    typography = ConsentTheme.Typography(fontSize = ConsentTheme.FontSize(base = 18.sp)),
    slots = mapOf(ConsentTheme.Slot.ButtonSecondary to ConsentTheme.SlotStyle(borderRadius = 26.dp)),
    brand = ConsentTheme.Brand(name = "Pantry", markResId = brandMark),
    branding = ConsentTheme.Branding.Inth,
    copy = ConsentTheme.Copy(
        headline = "Before you shop.",
        introduction = "Choose how Pantry uses data beyond your shopping basket.",
    ),
)
// #endregion docs:android-brand-theme
