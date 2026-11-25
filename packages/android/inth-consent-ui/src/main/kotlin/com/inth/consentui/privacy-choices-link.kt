@file:OptIn(androidx.compose.ui.ExperimentalComposeUiApi::class)
package com.inth.consentui

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathFillType
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTagsAsResourceId
import androidx.compose.ui.unit.dp
import com.inth.consentui.headless.OptOutLinkVariant
import com.inth.consentui.headless.PrivacyChoicesLinkAction
import com.inth.core.ConsentCore
import com.inth.core.Inth

/**
 * The persistent "Do Not Sell or Share" / "Your Privacy Choices" link, for the app's settings or
 * account screen. Port of the web `PrivacyChoicesLink`.
 *
 * Under an `opt-out` rule (a US state opt-out region) it shows the [variant] title. One tap
 * records a durable opt-out of sale and sharing on this device, queues it for the backend, and
 * shows a confirmation with its receipt. A person already opted out sees the receipt again. The
 * Privacy Choices titles carry the CPPA opt-out icon; the statutory "Do Not Sell or Share My
 * Personal Information" title does not. Under an `opt-in` rule it reads "Your Privacy Choices",
 * with no icon, and opens privacy settings. It shows nothing before a policy resolves, or under
 * IAB or a `none` rule.
 *
 * The confirmation is drawn by the stock UI on the same prompt, so keep [InthConsent] on screen.
 *
 * ```kotlin
 * Column {
 *     SettingsRows()
 *     PrivacyChoicesLink(variant = OptOutLinkVariant.PRIVACY_CHOICES)
 * }
 * ```
 *
 * @param variant The opt-out title, as `presentation.optOutLink` on the web.
 * @param core The core to follow. Defaults to the one the app installed.
 */
@Composable
fun PrivacyChoicesLink(
    modifier: Modifier = Modifier,
    variant: OptOutLinkVariant = OptOutLinkVariant.DO_NOT_SELL,
    core: ConsentCore = requireNotNull(Inth.current) { "Install Inth before showing the Privacy Choices link" },
) = PrivacyChoicesLink(ConsentPrompt.of(core).presenter, modifier, variant)

/**
 * The Privacy Choices link for an app that holds its own [presenter]. Draw [InthConsent] with the
 * same presenter so the confirmation shows.
 */
@Composable
fun PrivacyChoicesLink(
    presenter: ConsentPresenter,
    modifier: Modifier = Modifier,
    variant: OptOutLinkVariant = OptOutLinkVariant.DO_NOT_SELL,
) {
    val link = presenter.privacyChoicesLink(variant) ?: return
    val busy = link.action == PrivacyChoicesLinkAction.OPT_OUT && (presenter.changingOptOut || presenter.pending)
    TextButton(
        onClick = { presenter.openPrivacyChoices(variant) },
        enabled = !busy,
        modifier = modifier.defaultMinSize(minHeight = 48.dp)
            .semantics { testTagsAsResourceId = true }
            .testTag("inth.privacy-choices-link"),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            // Decorative beside the visible title, so TalkBack reads the title alone.
            if (link.showsOptOutIcon) Image(CppaOptOutIcon, contentDescription = null,
                modifier = Modifier.size(width = 30.dp, height = 14.dp).testTag("inth.privacy-choices-link.icon"))
            Text(link.label)
        }
    }
}

/**
 * The California Privacy Protection Agency's opt-out icon, in its own colours, from the same
 * path data as the web SDKs (`packages/sdk/ui/src/utils/opt-out-icon.ts`).
 */
internal val CppaOptOutIcon: ImageVector by lazy {
    val white = SolidColor(Color(0xFFFFFFFF))
    val blue = SolidColor(Color(0xFF0066FF))
    ImageVector.Builder("cppa-opt-out", 30.dp, 14.dp, 30f, 14f)
        .addPath(addPathNodes("M7.4,12.8h6.8l3.1-11.6H7.4C4.2,1.2,1.6,3.8,1.6,7S4.2,12.8,7.4,12.8z"),
            fill = white, pathFillType = PathFillType.EvenOdd)
        .addPath(addPathNodes("M22.6,0H7.4c-3.9,0-7,3.1-7,7s3.1,7,7,7h15.2c3.9,0,7-3.1,7-7S26.4,0,22.6,0z M1.6,7c0-3.2,2.6-5.8,5.8-5.8 h9.9l-3.1,11.6H7.4C4.2,12.8,1.6,10.2,1.6,7z"),
            fill = blue, pathFillType = PathFillType.EvenOdd)
        .addPath(addPathNodes("M24.6,4c0.2,0.2,0.2,0.6,0,0.8l0,0L22.5,7l2.2,2.2c0.2,0.2,0.2,0.6,0,0.8c-0.2,0.2-0.6,0.2-0.8,0 l0,0l-2.2-2.2L19.5,10c-0.2,0.2-0.6,0.2-0.8,0c-0.2-0.2-0.2-0.6,0-0.8l0,0L20.8,7l-2.2-2.2c-0.2-0.2-0.2-0.6,0-0.8 c0.2-0.2,0.6-0.2,0.8,0l0,0l2.2,2.2L23.8,4C24,3.8,24.4,3.8,24.6,4z"),
            fill = white)
        .addPath(addPathNodes("M12.7,4.1c0.2,0.2,0.3,0.6,0.1,0.8l0,0L8.6,9.8C8.5,9.9,8.4,10,8.3,10c-0.2,0.1-0.5,0.1-0.7-0.1l0,0 L5.4,7.7c-0.2-0.2-0.2-0.6,0-0.8c0.2-0.2,0.6-0.2,0.8,0l0,0L8,8.6l3.8-4.5C12,3.9,12.4,3.9,12.7,4.1z"),
            fill = blue)
        .build()
}
