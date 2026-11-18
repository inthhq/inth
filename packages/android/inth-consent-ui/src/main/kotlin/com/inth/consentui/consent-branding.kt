package com.inth.consentui

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathFillType
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

/** The same logo paths as the web branding tag in `packages/sdk/browser/src/ui/branding.ts`. */
internal object ProviderMarks {
    val c15t: ImageVector = ImageVector.Builder("c15t", 15.dp, 15.dp, 446f, 445f)
        .addPath(PathParser().parsePathString("M223.178.313c39.064 0 70.732 31.668 70.732 70.732-.001 39.064-31.668 70.731-70.732 70.731-12.181 0-23.642-3.079-33.649-8.502l-55.689 55.689a70.267 70.267 0 0 1 5.574 13.441h167.531c8.695-29.217 35.762-50.523 67.804-50.523 39.064 0 70.731 31.668 70.731 70.732s-31.668 70.732-70.731 70.732c-32.042 0-59.108-21.306-67.803-50.523H139.413a70.417 70.417 0 0 1-7.888 17.396l54.046 54.046c10.893-6.851 23.786-10.815 37.605-10.815 39.064 0 70.732 31.669 70.732 70.733 0 39.064-31.668 70.731-70.732 70.731s-70.732-31.667-70.732-70.731c0-10.518 2.296-20.499 6.414-29.471l-57.78-57.78c-8.972 4.117-18.952 6.414-29.47 6.414-39.063 0-70.731-31.668-70.732-70.732 0-39.064 31.669-70.732 70.733-70.732 12.18 0 23.642 3.079 33.649 8.502l55.688-55.688c-5.423-10.007-8.502-21.469-8.502-33.65 0-39.064 31.668-70.733 70.732-70.733Zm0 343.555c-16.742 0-30.314 13.572-30.314 30.314 0 16.741 13.572 30.313 30.314 30.313s30.314-13.572 30.314-30.313c0-16.742-13.572-30.314-30.314-30.314ZM71.611 192.299c-16.742 0-30.315 13.572-30.315 30.314s13.573 30.314 30.315 30.314c16.741 0 30.313-13.572 30.313-30.314 0-16.741-13.572-30.314-30.313-30.314Zm303.138 0c-16.729 0-30.294 13.551-30.315 30.275l.001.039-.001.038c.021 16.725 13.586 30.276 30.315 30.276 16.741 0 30.313-13.572 30.313-30.314 0-16.741-13.572-30.314-30.313-30.314ZM223.178 40.73c-16.742 0-30.314 13.573-30.314 30.315s13.573 30.313 30.314 30.313c16.742 0 30.313-13.572 30.314-30.313 0-16.742-13.572-30.314-30.314-30.315Z").toNodes(), fill = SolidColor(Color.Black)).build()
    val inth: ImageVector = ImageVector.Builder("Inth", 15.dp, 15.dp, 88f, 90f)
        .addPath(PathParser().parsePathString("M40.9164 0V8.26444H27.6933V26.7966H40.9164V35.0608H6.15594V26.7966H19.3788V8.26444H6.15594V0H40.9164Z").toNodes(), fill = SolidColor(Color.Black), pathFillType = PathFillType.EvenOdd)
        .addPath(PathParser().parsePathString("M72.1149 20.1264V0H80.0343V35.0608H74.2747L54.9798 14.8193V35.0608H47.0604V0H52.964L72.1149 20.1264Z").toNodes(), fill = SolidColor(Color.Black), pathFillType = PathFillType.EvenOdd)
        .addPath(PathParser().parsePathString("M71.36 41.6H88V89.6H0V41.6H61.12V31.04L71.36 41.6ZM6.15594 48.0891V56.4034H19.1784V83.2H27.4428V56.4034H40.5656V48.0891H6.15594ZM47.0603 48.1391V83.2H55.3247V70.2441H71.7531V83.2H80.0675V48.1391H71.7531V61.9797H55.3247V48.1391H47.0603Z").toNodes(), fill = SolidColor(Color.Black), pathFillType = PathFillType.EvenOdd)
        .build()
    /** The horizontal wordmark for the provider tag, from `inth-wordmark.svg`; the square mark stays for the identity above the headline. */
    val inthWordmark: ImageVector = ImageVector.Builder("Inth wordmark", 35.dp, 12.dp, 292f, 100f)
        .addPath(PathParser().parsePathString("M291.667 83.333H156.076L138.889 100V0h152.778zM149.576 11.266V25.7h22.609v46.522h14.348V25.7h22.782V11.266zM220.591 11.352v60.87h14.348V49.73h28.521v22.493h14.435v-60.87H263.46v24.03h-28.521v-24.03z").toNodes(), fill = SolidColor(Color.Black), pathFillType = PathFillType.EvenOdd)
        .addPath(PathParser().parsePathString("M60.348 11.111V25.46H37.391v32.174h22.957V71.98H0V57.633h22.956V25.459H0V11.111zM114.512 46.053V11.11h13.749v60.87h-9.999L84.764 36.839v35.142h-13.75V11.11h10.25z").toNodes(), fill = SolidColor(Color.Black))
        .build()
}

/**
 * The provider tag, centred under the actions: [securedBy], the lead-in in the screen's language,
 * then the provider. Inth's wordmark is its name, so no text follows it. The first layer and
 * Privacy Settings each tag their own with [id].
 */
@Composable internal fun ProviderBranding(securedBy: String, id: String = "inth.first-layer.branding", modifier: Modifier = Modifier.fillMaxWidth()) {
    val theme = LocalConsentTheme.current
    val provider = theme.branding
    val color = theme.colors.textMuted.color()
    Row(
        modifier = modifier.testTag(id)
            .semantics(mergeDescendants = true) { contentDescription = "$securedBy ${provider.name}" },
        horizontalArrangement = Arrangement.spacedBy(5.dp, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // The smallest caption size: the tag is a signature, not a line of the page.
        Text(securedBy, style = MaterialTheme.typography.labelSmall, color = color,
            modifier = Modifier.clearAndSetSemantics {})
        val logo = Modifier.size(15.dp).testTag("$id.logo")
        when (provider) {
            ConsentTheme.Branding.C15t -> Icon(ProviderMarks.c15t, null, modifier = logo, tint = color)
            ConsentTheme.Branding.Inth -> Icon(ProviderMarks.inthWordmark, null, tint = color,
                modifier = Modifier.size(35.dp, 12.dp).testTag("$id.logo"))
            is ConsentTheme.Branding.Custom -> provider.markResId?.let {
                Image(painterResource(it), null, modifier = logo)
            }
        }
        if (provider != ConsentTheme.Branding.Inth) Text(provider.name, style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.SemiBold, color = color, modifier = Modifier.clearAndSetSemantics {})
    }
}
