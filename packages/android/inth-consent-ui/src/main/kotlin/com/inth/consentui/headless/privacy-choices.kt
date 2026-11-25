package com.inth.consentui.headless

import com.inth.core.model.ConsentModel
import com.inth.core.model.ConsentSnapshot
import com.inth.core.model.OptOutHolder
import com.inth.core.model.OptOutRight
import com.inth.core.policy.OptOutLock
import com.inth.core.policy.OptOutVia
import com.inth.core.policy.ResolvedOptOutState
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * Which statutory title the opt-out link shows. The host picks it, as `presentation.optOutLink`
 * does on the web.
 */
enum class OptOutLinkVariant(val wireName: String) {
    /** "Do Not Sell or Share My Personal Information", with no icon. The default. */
    DO_NOT_SELL("do-not-sell"),
    /** "Your Privacy Choices", with the CPPA opt-out icon. */
    PRIVACY_CHOICES("privacy-choices"),
    /** "Your California Privacy Choices", with the CPPA opt-out icon. */
    CALIFORNIA_PRIVACY_CHOICES("california-privacy-choices"),
}

/** What a "Your Privacy Choices" link does when tapped. */
enum class PrivacyChoicesLinkAction {
    /** Records the opt-out in one tap and shows its confirmation. */
    OPT_OUT,
    /** Opens privacy settings: the policy offers no opt-out right. */
    OPEN_PREFERENCES,
}

/**
 * What a Privacy Choices link shows.
 *
 * @property label The link text.
 * @property showsOptOutIcon Draw the CPPA opt-out icon beside [label]. It marks an opt-out right,
 *   so it shows only beside an opt-out link's Privacy Choices titles.
 * @property action What a tap does.
 * @property variant The opt-out title in use, or `null` for a link that only opens settings.
 */
data class PrivacyChoicesLinkState(
    val label: String,
    val showsOptOutIcon: Boolean,
    val action: PrivacyChoicesLinkAction,
    val variant: OptOutLinkVariant?,
)

/**
 * The Privacy Choices link for [snapshot], or `null` when it shows nothing.
 *
 * Port of `resolvePrivacyChoicesLink` in `packages/sdk/core`. Under an `opt-out` rule it is the
 * opt-out link with the host's [variant] title, and a tap records the opt-out. Under an `opt-in`
 * rule it reads "Your Privacy Choices" with no icon and opens settings, since no opt-out right is
 * offered. Nothing shows before a policy resolves, or under IAB or a `none` rule.
 */
fun resolvePrivacyChoicesLink(
    snapshot: ConsentSnapshot,
    optOutState: ResolvedOptOutState,
    variant: OptOutLinkVariant = OptOutLinkVariant.DO_NOT_SELL,
): PrivacyChoicesLinkState? {
    if (snapshot.policyPending || !snapshot.resolution.matched) return null
    val copy = resolveOptOutCopy(snapshot)
    if (optOutState.available) {
        return PrivacyChoicesLinkState(
            label = copy.linkLabel(variant),
            showsOptOutIcon = variant != OptOutLinkVariant.DO_NOT_SELL,
            action = PrivacyChoicesLinkAction.OPT_OUT,
            variant = variant,
        )
    }
    if (snapshot.model != ConsentModel.OPT_IN && snapshot.model != ConsentModel.OPT_OUT) return null
    return PrivacyChoicesLinkState(
        label = copy.privacyChoices,
        showsOptOutIcon = false,
        action = PrivacyChoicesLinkAction.OPEN_PREFERENCES,
        variant = null,
    )
}

/**
 * What an opt-out confirmation, or the sale-and-sharing block in settings, says about the held
 * opt-out. Port of the web receipt (`useOptOutState()` with `resolveOptOutReceiptSentence`).
 *
 * @property heading The block heading: the confirmed rights, or the opt-out link title.
 * @property status "Opt-out request honored", or the signal wording when GPC honored it.
 * @property sentence Where the opt-out holds ("on this device", "and your account") and which rights.
 * @property recordedAt When the opt-out was recorded, epoch milliseconds.
 * @property heldByAccount The visitor's account holds the opt-out as well as this device.
 * @property canOptBackIn An "Opt back in…" action may be offered: nothing but the visitor's own
 *   choice holds the opt-out. `false` while Global Privacy Control holds it.
 */
data class OptOutReceipt(
    val heading: String,
    val status: String,
    val sentence: String,
    val recordedAt: Long,
    val heldByAccount: Boolean,
    val canOptBackIn: Boolean,
)

/** The receipt for the opt-out [snapshot] holds, or `null` when none is held. */
fun resolveOptOutReceipt(
    snapshot: ConsentSnapshot,
    optOutState: ResolvedOptOutState,
    variant: OptOutLinkVariant = OptOutLinkVariant.DO_NOT_SELL,
): OptOutReceipt? {
    val record = snapshot.optOut ?: return null
    if (!optOutState.honored) return null
    val copy = resolveOptOutCopy(snapshot)
    val account = record.heldBy == OptOutHolder.PERSON || record.heldBy == OptOutHolder.BOTH
    return OptOutReceipt(
        heading = copy.heading(record.rights) ?: copy.linkLabel(variant),
        status = if (optOutState.via == OptOutVia.SIGNAL) copy.statusSignal else copy.statusRequest,
        sentence = copy.receiptSentence(record.rights, account),
        recordedAt = record.recordedAt,
        heldByAccount = account,
        canOptBackIn = optOutState.lock != OptOutLock.GPC_ACTIVE,
    )
}

/**
 * Opt-out and Privacy Choices copy in the served language: the `optOut.*` and `rights.*` keys of
 * `@inth/sdk-translations`, each falling back to its English string. Read it from
 * [ConsentDraft.optOutCopy] for an app-owned opt-out screen; the sentences that name rights come
 * from [resolveOptOutReceipt] and [optInSentence].
 */
class OptOutCopy internal constructor(
    val statusRequest: String,
    val statusSignal: String,
    val lockedByGpc: String,
    val lockedByAccount: String,
    val action: String,
    val done: String,
    val notOptedOut: String,
    val optInCancel: String,
    val optInConfirm: String,
    val optInDescription: String,
    val optInDescriptionWithRights: String,
    val optInLink: String,
    val optInTitle: String,
    val receiptAccount: String,
    val receiptAccountWithRights: String,
    val receiptBrowser: String,
    val receiptBrowserWithRights: String,
    val recordedLabel: String,
    val headingAll: String,
    val headingSaleAndShare: String,
    val headingSaleAndTargetedAds: String,
    val rightsAll: String,
    val rightsSaleAndShare: String,
    val rightsSaleAndTargetedAds: String,
    val doNotSell: String,
    val privacyChoices: String,
    val californiaPrivacyChoices: String,
    val preferences: String,
) {
    /** The opt-out link title for [variant]. */
    fun linkLabel(variant: OptOutLinkVariant): String = when (variant) {
        OptOutLinkVariant.DO_NOT_SELL -> doNotSell
        OptOutLinkVariant.PRIVACY_CHOICES -> privacyChoices
        OptOutLinkVariant.CALIFORNIA_PRIVACY_CHOICES -> californiaPrivacyChoices
    }

    /** The block heading for the three standard rights bundles, or `null` for any other set. */
    internal fun heading(rights: List<OptOutRight>): String? = when (bundle(rights)) {
        Bundle.ALL -> headingAll
        Bundle.SALE_SHARE -> headingSaleAndShare
        Bundle.SALE_ADS -> headingSaleAndTargetedAds
        null -> null
    }

    internal fun rightsPhrase(rights: List<OptOutRight>): String? = when (bundle(rights)) {
        Bundle.ALL -> rightsAll
        Bundle.SALE_SHARE -> rightsSaleAndShare
        Bundle.SALE_ADS -> rightsSaleAndTargetedAds
        null -> null
    }

    internal fun receiptSentence(rights: List<OptOutRight>, account: Boolean): String {
        val phrase = rightsPhrase(rights)
        return when {
            phrase != null && account -> receiptAccountWithRights.replace("{rights}", phrase)
            phrase != null -> receiptBrowserWithRights.replace("{rights}", phrase)
            account -> receiptAccount
            else -> receiptBrowser
        }
    }

    /** What the "Opt back in?" step says: [optInDescriptionWithRights] when [rights] is a standard bundle. */
    fun optInSentence(rights: List<OptOutRight>): String =
        rightsPhrase(rights)?.let { optInDescriptionWithRights.replace("{rights}", it) } ?: optInDescription

    private enum class Bundle { ALL, SALE_SHARE, SALE_ADS }

    private fun bundle(rights: List<OptOutRight>): Bundle? {
        val set = rights.toSet()
        return when (set) {
            setOf(OptOutRight.SALE, OptOutRight.SHARE, OptOutRight.TARGETED_ADS) -> Bundle.ALL
            setOf(OptOutRight.SALE, OptOutRight.SHARE) -> Bundle.SALE_SHARE
            setOf(OptOutRight.SALE, OptOutRight.TARGETED_ADS) -> Bundle.SALE_ADS
            else -> null
        }
    }
}

private val DEFAULT_OPT_OUT_COPY = OptOutCopy(
    statusRequest = "Opt-out request honored",
    statusSignal = "Opt-out preference signal honored",
    lockedByGpc = "Your browser's Global Privacy Control signal is on, so this stays off.",
    lockedByAccount = "Your account has opted out, and you can change this after signing in.",
    action = "Opt out",
    done = "Done",
    notOptedOut = "You haven't opted out on this browser.",
    optInCancel = "Stay opted out",
    optInConfirm = "Opt back in",
    optInDescription = "Confirming ends your opt-out on this browser.",
    optInDescriptionWithRights = "Confirming ends your opt-out of {rights} on this browser.",
    optInLink = "Opt back in…",
    optInTitle = "Opt back in?",
    receiptAccount = "You're opted out on this browser and your account.",
    receiptAccountWithRights = "You're opted out of {rights} on this browser and your account.",
    receiptBrowser = "You're opted out on this browser.",
    receiptBrowserWithRights = "You're opted out of {rights} on this browser.",
    recordedLabel = "Recorded",
    headingAll = "Sale and sharing of your personal information and targeted advertising",
    headingSaleAndShare = "Sale and sharing of your personal information",
    headingSaleAndTargetedAds = "Sale of your personal information and targeted advertising",
    rightsAll = "sale, sharing and targeted advertising",
    rightsSaleAndShare = "sale and sharing",
    rightsSaleAndTargetedAds = "sale and targeted advertising",
    doNotSell = "Do Not Sell or Share My Personal Information",
    privacyChoices = "Your Privacy Choices",
    californiaPrivacyChoices = "Your California Privacy Choices",
    preferences = "Manage preferences",
)

/**
 * Reads `optOut.*` and `rights.*` copy from the served translation bundle when present, falling
 * back to the same English strings as `@inth/sdk-translations`.
 */
internal fun resolveOptOutCopy(snapshot: ConsentSnapshot): OptOutCopy {
    val optOut = snapshot.translations?.get("optOut") as? JsonObject
    val rights = snapshot.translations?.get("rights") as? JsonObject
    if (optOut == null && rights == null) return DEFAULT_OPT_OUT_COPY
    fun JsonObject?.string(key: String, fallback: String): String =
        (this?.get(key) as? JsonPrimitive)
            ?.takeIf { it.isString }
            ?.content
            ?.takeIf { it.isNotBlank() }
            ?: fallback
    val d = DEFAULT_OPT_OUT_COPY
    return OptOutCopy(
        statusRequest = optOut.string("statusRequest", d.statusRequest),
        statusSignal = optOut.string("statusSignal", d.statusSignal),
        lockedByGpc = optOut.string("lockedByGpc", d.lockedByGpc),
        lockedByAccount = optOut.string("lockedByAccount", d.lockedByAccount),
        action = optOut.string("action", d.action),
        done = optOut.string("done", d.done),
        notOptedOut = optOut.string("notOptedOut", d.notOptedOut),
        optInCancel = optOut.string("optInCancel", d.optInCancel),
        optInConfirm = optOut.string("optInConfirm", d.optInConfirm),
        optInDescription = optOut.string("optInDescription", d.optInDescription),
        optInDescriptionWithRights = optOut.string("optInDescriptionWithRights", d.optInDescriptionWithRights),
        optInLink = optOut.string("optInLink", d.optInLink),
        optInTitle = optOut.string("optInTitle", d.optInTitle),
        receiptAccount = optOut.string("receiptAccount", d.receiptAccount),
        receiptAccountWithRights = optOut.string("receiptAccountWithRights", d.receiptAccountWithRights),
        receiptBrowser = optOut.string("receiptBrowser", d.receiptBrowser),
        receiptBrowserWithRights = optOut.string("receiptBrowserWithRights", d.receiptBrowserWithRights),
        recordedLabel = optOut.string("recordedLabel", d.recordedLabel),
        headingAll = optOut.string("headingAll", d.headingAll),
        headingSaleAndShare = optOut.string("headingSaleAndShare", d.headingSaleAndShare),
        headingSaleAndTargetedAds = optOut.string("headingSaleAndTargetedAds", d.headingSaleAndTargetedAds),
        rightsAll = optOut.string("rightsAll", d.rightsAll),
        rightsSaleAndShare = optOut.string("rightsSaleAndShare", d.rightsSaleAndShare),
        rightsSaleAndTargetedAds = optOut.string("rightsSaleAndTargetedAds", d.rightsSaleAndTargetedAds),
        doNotSell = rights.string("optOut", d.doNotSell),
        privacyChoices = rights.string("privacyChoices", d.privacyChoices),
        californiaPrivacyChoices = rights.string("californiaPrivacyChoices", d.californiaPrivacyChoices),
        preferences = rights.string("preferences", d.preferences),
    )
}
