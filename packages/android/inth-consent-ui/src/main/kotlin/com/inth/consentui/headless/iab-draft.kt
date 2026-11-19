package com.inth.consentui.headless

import androidx.compose.runtime.Stable
import com.inth.core.iab.IabBannerSummary
import com.inth.consentui.dayCount
import com.inth.consentui.generated.IabCopy
import com.inth.consentui.storageDuration
import com.inth.core.iab.AdTechProvider
import com.inth.core.iab.IabChoices
import com.inth.core.iab.IabCustomVendor
import com.inth.core.iab.IabPresentation
import com.inth.core.iab.IabPublisherRestriction
import com.inth.core.iab.IabVendorDisclosure
import com.inth.core.iab.IabVendorSelectionStatus
import com.inth.core.iab.selectionStatus
import com.inth.core.tc.GvlLocalizedEntry
import com.inth.core.tc.GvlStack
import com.inth.core.tc.GvlVendorEntry
import java.util.Locale

/** Purposes TCF never lets anyone claim under legitimate interest. */
internal val neverLegitimateInterest = setOf(1, 3, 4, 5, 6)

/**
 * The IAB first layer's required text, from the generated translations and the core's
 * disclosure. Render all of it; see "What your IAB screens must show" in the headless guide.
 *
 * @property description What partners store, access and process, with the partner count.
 * @property partnersLink Where the partner count sits in [description]. Make it open your partner list.
 * @property partnersLabel The tappable words, such as "5 partners".
 * @property summary Purpose, stack and special-feature names, then "and N more" when the list was cut.
 * @property legitimateInterest That some partners rely on legitimate interest.
 * @property scope That the choice applies to this app only.
 * @property withdraw That consent can be withdrawn, and where.
 */
class IabFirstLayer internal constructor(
    val description: String,
    val partnersLink: IntRange,
    val partnersLabel: String,
    val partnerCount: Int,
    val summary: List<String>,
    val legitimateInterest: String,
    val scope: String,
    val withdraw: String,
)

/** The first layer's text for [banner], in [copy]'s language. */
internal fun iabFirstLayer(copy: IabCopy, banner: IabBannerSummary): IabFirstLayer {
    val count = banner.vendorCount.toString()
    val description = copy.format(copy.appDescription, mapOf("partnerCount" to count))
    // "5 partners" when the language's link text appears in its own sentence; the number alone
    // when it does not (a plural form, or a different word order).
    val label = copy.format(copy.bannerPartnersLink, mapOf("count" to count))
    val start = description.indexOf(label)
    val link = if (start >= 0) start until start + label.length else {
        val at = description.indexOf(count).coerceAtLeast(0)
        at until at + count.length
    }
    val more = if (banner.remainingCount > 0) listOf(copy.format(copy.bannerAndMore, mapOf("count" to banner.remainingCount.toString()))) else emptyList()
    return IabFirstLayer(description, link, description.substring(link), banner.vendorCount, banner.displayItems + more,
        copy.bannerLegitimateInterestNotice, copy.appScopeServiceSpecific, copy.appWithdraw)
}

/** A purpose, special purpose, feature or special feature as the vendor list words it. Show the texts unchanged. */
@Stable
open class IabDefinition internal constructor(entry: GvlLocalizedEntry, val id: Int) {
    val name: String = entry.name.orEmpty()
    val description: String = entry.description.orEmpty()
    val legalDescription: String = entry.descriptionLegal.orEmpty()
    /** The list's standard illustrations. Show them verbatim. */
    val illustrations: List<String> = entry.illustrations.orEmpty()
}

/**
 * One purpose with its consent switch and, when a partner relies on it, its legitimate-interest
 * switch.
 *
 * @property consentPartnerCount Partners asking consent for it, after publisher restrictions.
 * @property legitimateInterestPartnerCount Partners relying on legitimate interest for it.
 * @property partnersNote Both counts as one translated line.
 * @property legitimateInterest The legitimate-interest switch, or `null` when no partner relies
 *   on it. `false` is an objection.
 * @property rightToObject The sentence that tells the person they may object.
 */
@Stable
class IabPurposeRow internal constructor(
    entry: GvlLocalizedEntry, id: Int,
    val consentPartnerCount: Int,
    val legitimateInterestPartnerCount: Int,
    val partnersNote: String,
    val rightToObject: String,
    val consent: Boolean,
    val legitimateInterest: Boolean?,
    val enabled: Boolean,
    val onConsentChange: (Boolean) -> Unit,
    val onLegitimateInterestChange: (Boolean) -> Unit,
) : IabDefinition(entry, id)

/** One special feature with its opt-in switch. */
@Stable
class IabSpecialFeatureRow internal constructor(
    entry: GvlLocalizedEntry, id: Int,
    val optIn: Boolean,
    val enabled: Boolean,
    val onOptInChange: (Boolean) -> Unit,
) : IabDefinition(entry, id)

/** A label and its value, such as a purpose and how long its data is kept. */
class IabFact(val label: String, val value: String?)

/**
 * One registered partner: its legal bases after publisher restrictions, its switches and what it
 * discloses.
 *
 * @property disclosure The core's projection. `notAllowedPurposes` were restricted away;
 *   `consentRequiredPurposes` and `legitimateInterestRequiredPurposes` are purposes a publisher
 *   restriction moved from one basis to the other.
 * @property consent The consent switch, or `null` when a restriction left the partner no consent
 *   purpose. The core refuses a save that turns it on then.
 * @property legitimateInterest The legitimate-interest switch, or `null` when the partner has no
 *   such purpose. `false` is an objection.
 * @property summary The number of purposes on each basis, as one translated line.
 */
@Stable
class IabVendorRow internal constructor(
    val id: Int,
    val name: String,
    val entry: GvlVendorEntry,
    val disclosure: IabVendorDisclosure,
    val status: IabVendorSelectionStatus,
    val statusLabel: String,
    val summary: String,
    val consent: Boolean?,
    val legitimateInterest: Boolean?,
    val enabled: Boolean,
    val onConsentChange: (Boolean) -> Unit,
    val onLegitimateInterestChange: (Boolean) -> Unit,
    private val detail: () -> IabVendorDetail,
) {
    /** Everything the partner's own page must show. Built when read. */
    val details: IabVendorDetail get() = detail()
}

/**
 * What one partner's page must show beside its switches.
 *
 * @property privacyPolicyUrl The partner's privacy policy in the device language, or English.
 * @property legitimateInterestClaimUrl Where the partner explains its legitimate interest.
 * @property notAllowedPurposes Purposes a publisher restriction does not allow this partner.
 * @property retention How long data is kept, per purpose. A single fact says none was given.
 * @property storage Device storage: how long, whether it refreshes, other access.
 */
class IabVendorDetail(
    val privacyPolicyUrl: String?,
    val legitimateInterestClaimUrl: String?,
    val consentPurposes: List<String>,
    val legitimateInterestPurposes: List<String>,
    val notAllowedPurposes: List<String>,
    val specialPurposes: List<String>,
    val features: List<IabDefinition>,
    val specialFeatures: List<IabFact>,
    val dataCategories: List<String>,
    val retention: List<IabFact>,
    val storage: List<IabFact>,
    val deviceStorageDisclosureUrl: String?,
)

/**
 * A partner the publisher declares outside the IAB vendor list. List these apart from IAB
 * partners with [IabDraftHandle.customVendorsNotice]: they are not in the TC String.
 */
@Stable
class IabCustomVendorRow internal constructor(
    val vendor: IabCustomVendor,
    val status: IabVendorSelectionStatus,
    val statusLabel: String,
    val summary: String,
    val consent: Boolean?,
    val legitimateInterest: Boolean?,
    val enabled: Boolean,
    val details: IabVendorDetail,
    val onConsentChange: (Boolean) -> Unit,
    val onLegitimateInterestChange: (Boolean) -> Unit,
) {
    val id: String get() = vendor.id
    val name: String get() = vendor.name
}

/** A Google Additional Consent provider. List these in their own section, apart from IAB partners. */
@Stable
class IabAdTechProviderRow internal constructor(
    val provider: AdTechProvider,
    val consent: Boolean,
    val enabled: Boolean,
    val onConsentChange: (Boolean) -> Unit,
) {
    val id: Long get() = provider.id
    val name: String get() = provider.name
    val policyUrl: String get() = provider.policyUrl
}

/**
 * The IAB TCF side of a [ConsentDraft]: the staged purpose, vendor and legal-basis selection
 * with the commands `@inth/react`'s `useIAB()` exposes, and the disclosure as rows to place.
 *
 * The core validates and encodes the selection on save exactly as it does for the stock
 * screens, so the same choices write the same TC String. Gate vendors on the committed
 * decision, not on these staged values.
 */
@Stable
class IabDraftHandle internal constructor(
    /** The draft this selection belongs to. Its `iabCopy` holds every IAB label. */
    val draft: ConsentDraft,
    val disclosure: IabPresentation,
) {
    private val copy: IabCopy get() = draft.iabCopy
    private val list get() = disclosure.list
    private val enabled get() = draft.isEditable

    /** The staged selection. */
    val choices: IabChoices get() = draft.choices
    /** The committed TC String, or `null` before a current decision is saved. */
    val tcString: String? get() = draft.core.iabConsent?.tcString
    val isDirty: Boolean get() = draft.isDirty
    val isStale: Boolean get() = draft.isStale
    /** `false` while the vendor list is stale or offline. Show the saved decision and call [ConsentDraft.refresh]. */
    val editable: Boolean get() = disclosure.canEdit && !draft.listUnavailable
    /** The publisher's restrictions, as the policy declares them. [IabVendorRow.disclosure] already applies them. */
    val publisherRestrictions: List<IabPublisherRestriction> get() = draft.core.iabPublisherRestrictions

    fun setPurposeConsent(purposeId: Int, value: Boolean) = draft.edit { it.copy(purposeConsents = it.purposeConsents.select(purposeId, value)) }

    /** `false` objects. Purposes 1 and 3 to 6 never allow legitimate interest, so `true` is ignored for them. */
    fun setPurposeLegitimateInterest(purposeId: Int, value: Boolean) {
        if (value && purposeId in neverLegitimateInterest) return
        draft.edit { it.copy(purposeLegitimateInterests = it.purposeLegitimateInterests.select(purposeId, value), purposeObjections = it.purposeObjections.select(purposeId, !value)) }
    }

    fun setVendorConsent(vendorId: Int, value: Boolean) = draft.edit { it.copy(vendorConsents = it.vendorConsents.select(vendorId, value)) }

    /** A custom partner, by the `id` in [customVendors]. */
    fun setVendorConsent(vendorId: String, value: Boolean) = draft.edit { it.copy(customVendorConsents = it.customVendorConsents.select(vendorId, value)) }

    /** `false` objects to the vendor's legitimate interest. */
    fun setVendorLegitimateInterest(vendorId: Int, value: Boolean) =
        draft.edit { it.copy(vendorLegitimateInterests = it.vendorLegitimateInterests.select(vendorId, value), vendorObjections = it.vendorObjections.select(vendorId, !value)) }

    /** A custom partner. Turning it off is the objection; custom partners have no separate objection list. */
    fun setVendorLegitimateInterest(vendorId: String, value: Boolean) =
        draft.edit { it.copy(customVendorLegitimateInterests = it.customVendorLegitimateInterests.select(vendorId, value)) }

    fun setSpecialFeatureOptIn(featureId: Int, value: Boolean) = draft.edit { it.copy(specialFeatureOptIns = it.specialFeatureOptIns.select(featureId, value)) }

    /** Google Additional Consent provider. The core records every provider as off unless purposes 1, 3 and 4 all have consent. */
    fun setAdTechProviderConsent(providerId: Long, value: Boolean) =
        draft.edit { it.copy(adTechProviderConsents = it.adTechProviderConsents.orEmpty().select(providerId, value)) }

    /** See [ConsentDraft.acceptAll]. */
    fun acceptAll() = draft.acceptAll()
    /** See [ConsentDraft.rejectAll]. */
    fun rejectAll() = draft.rejectAll()
    /** See [ConsentDraft.save]. */
    fun save(onResult: (Boolean) -> Unit = {}) = draft.save(ConsentWriteAction.SAVE, onResult)
    /** See [ConsentDraft.reset]. */
    fun reset() = draft.reset()

    /** The first layer's text. */
    val firstLayer: IabFirstLayer get() = iabFirstLayer(copy, disclosure.bannerSummary)

    /** The purposes this app's partners declare, ascending. */
    val purposes: List<IabPurposeRow> get() = enabled.let { enabled -> disclosure.declaredPurposeIds.mapNotNull { id ->
        val entry = list.purposes[id] ?: return@mapNotNull null
        val counts = disclosure.partnerCounts(id)
        fun partners(count: Int) = copy.format(copy.preferenceCenterPurposeItemPartners, mapOf("count" to "$count"))
        IabPurposeRow(entry, id, counts.consent, counts.legitimateInterest,
            partnersNote = "${copy.preferenceCenterPurposeItemWithYourPermission}: ${partners(counts.consent)} · ${copy.preferenceCenterPurposeItemLegitimateInterest}: ${partners(counts.legitimateInterest)}",
            rightToObject = copy.preferenceCenterPurposeItemRightToObject + " " + copy.appTurnOffToObject,
            consent = id in choices.purposeConsents,
            legitimateInterest = if (counts.legitimateInterest > 0) id in choices.purposeLegitimateInterests else null,
            enabled = enabled,
            onConsentChange = { setPurposeConsent(id, it) },
            onLegitimateInterestChange = { setPurposeLegitimateInterest(id, it) })
    } }

    /** The special features some partner declares, each with an opt-in. */
    val specialFeatures: List<IabSpecialFeatureRow> get() = enabled.let { enabled -> disclosure.declaredSpecialFeatureIds.mapNotNull { id ->
        val entry = list.specialFeatures?.get(id) ?: return@mapNotNull null
        IabSpecialFeatureRow(entry, id, id in choices.specialFeatureOptIns, enabled) { setSpecialFeatureOptIn(id, it) }
    } }

    /** The special purposes some partner uses. They take no choice. */
    val specialPurposes: List<IabDefinition> get() {
        val used = activeVendors().flatMap { it.specialPurposes.orEmpty() }.map { it.toInt() }.toSet()
        return list.specialPurposes.orEmpty().toSortedMap().filterKeys { it in used }.map { IabDefinition(it.value, it.key) }
    }

    /** The vendor list's standard text for special purposes. Empty when the list has none. */
    val specialPurposesExplanation: String get() = list.standardTexts?.specialPurposes.orEmpty()

    /** The features some partner uses. They take no choice; show [featuresExplanation] with them. */
    val features: List<IabDefinition> get() {
        val used = activeVendors().flatMap { it.features.orEmpty() }.map { it.toInt() }.toSet() + disclosure.customVendors.flatMap { it.features }
        return list.features.orEmpty().toSortedMap().filterKeys { it in used }.map { IabDefinition(it.value, it.key) }
    }

    /** The vendor list's standard Features text, or the translated standard text when the list has none. */
    val featuresExplanation: String get() = list.standardTexts?.features?.takeIf { it.isNotEmpty() } ?: copy.preferenceCenterFeaturesDescription

    /** Every stack the vendor list defines, ascending: one name for several purposes and special features. [firstLayer] names the ones that summarize this app's purposes. */
    val stacks: List<GvlStack> get() = list.stacks.orEmpty().toSortedMap().values.toList()

    /** Registered partners, in the vendor list's order. Sort them for display. Pass [purposeId] to keep those that use that purpose on either basis. */
    fun vendors(purposeId: Int? = null): List<IabVendorRow> = enabled.let { enabled -> list.vendors.mapNotNull { (id, entry) ->
        val projection = disclosure.vendors[id] ?: return@mapNotNull null
        if (purposeId != null && purposeId !in projection.consentPurposes && purposeId !in projection.legitimateInterestPurposes) return@mapNotNull null
        vendorRow(id, entry, projection, enabled)
    } }

    private fun vendorRow(id: Int, entry: GvlVendorEntry, projection: IabVendorDisclosure, enabled: Boolean): IabVendorRow {
        val status = projection.selectionStatus(id, choices)
        return IabVendorRow(id, entry.name.orEmpty(), entry, projection, status, statusLabel(status),
            summary = copy.format(copy.appVendorPurposeSummary, mapOf("purposes" to "${projection.consentPurposes.size}", "legitimateInterest" to "${projection.legitimateInterestPurposes.size}")),
            consent = if (projection.consentPurposes.isNotEmpty()) id in choices.vendorConsents else null,
            legitimateInterest = if (projection.legitimateInterestPurposes.isNotEmpty()) id in choices.vendorLegitimateInterests else null,
            enabled = enabled,
            onConsentChange = { setVendorConsent(id, it) },
            onLegitimateInterestChange = { setVendorLegitimateInterest(id, it) },
            detail = { vendorDetail(entry, projection) })
    }

    /** Registered partners. */
    val vendors: List<IabVendorRow> get() = vendors(null)

    /** One registered partner, or `null` when it is not in the disclosure. */
    fun vendor(id: Int): IabVendorRow? {
        return vendorRow(id, list.vendors[id] ?: return null, disclosure.vendors[id] ?: return null, enabled)
    }

    /** Partners the publisher declares outside the vendor list. */
    val customVendors: List<IabCustomVendorRow> get() = enabled.let { enabled -> disclosure.customVendors.map { vendor ->
        val status = vendor.selectionStatus(choices)
        val interest = vendor.legIntPurposes.filter { it !in neverLegitimateInterest }
        IabCustomVendorRow(vendor, status, statusLabel(status),
            summary = copy.format(copy.appVendorPurposeSummary, mapOf("purposes" to "${vendor.purposes.size}", "legitimateInterest" to "${interest.size}")),
            consent = if (vendor.purposes.isNotEmpty()) vendor.id in choices.customVendorConsents else null,
            legitimateInterest = if (vendor.legIntPurposes.isNotEmpty()) vendor.id in choices.customVendorLegitimateInterests else null,
            enabled = enabled,
            details = customDetail(vendor, interest),
            onConsentChange = { setVendorConsent(vendor.id, it) },
            onLegitimateInterestChange = { setVendorLegitimateInterest(vendor.id, it) })
    } }

    /** The heading and notice that set custom partners apart from IAB partners. */
    val customVendorsHeading: String get() = copy.preferenceCenterVendorListCustomVendorsHeading
    val customVendorsNotice: String get() = copy.preferenceCenterVendorListCustomVendorsNotice

    /** Google Additional Consent providers. Empty when none are configured. */
    val adTechProviders: List<IabAdTechProviderRow> get() {
        val enabled = enabled
        val selected = choices.adTechProviderConsents.orEmpty().toSet()
        return disclosure.adTechProviders.orEmpty().map { provider ->
            IabAdTechProviderRow(provider, provider.id in selected, enabled) { setAdTechProviderConsent(provider.id, it) }
        }
    }

    val adTechProvidersHeading: String get() = copy.preferenceCenterVendorListAdTechProvidersHeading
    /** The notice for the provider section. It also says why providers stay off while purposes 1, 3 and 4 lack consent. */
    val adTechProvidersNotice: String get() {
        val notice = copy.preferenceCenterVendorListAdTechProvidersNotice
        return if (providerPrerequisitesMet) notice else notice + " " + copy.appProvidersOff
    }
    /** Purposes 1, 3 and 4 all have consent in the draft, so a provider's consent can count. */
    val providerPrerequisitesMet: Boolean get() = choices.purposeConsents.containsAll(disclosure.adTechProviderPurposeIds)

    /** What legitimate interest means and that the person may object. Show it wherever a legitimate-interest switch appears. */
    val legitimateInterestExplanation: String get() = copy.appLegitimateInterestExplanation
    /** How long the TC String stays on the device, or `null` when no limit applies. */
    val consentStorage: String? get() = disclosure.consentStorageMaxDays?.let { copy.format(copy.appConsentStorage, mapOf("days" to "$it")) }

    private fun statusLabel(status: IabVendorSelectionStatus) = when (status) {
        IabVendorSelectionStatus.OFF -> copy.appOff
        IabVendorSelectionStatus.PARTIAL -> copy.appPartlyOn
        IabVendorSelectionStatus.ON -> copy.appOn
    }
    private fun activeVendors() = disclosure.vendors.keys.mapNotNull { list.vendors[it] }
    private fun purposeNames(ids: List<Int>) = ids.mapNotNull { list.purposes[it]?.name }
    private fun onOff(id: Int) = if (id in choices.specialFeatureOptIns) copy.appOn else copy.appOff

    private fun vendorDetail(v: GvlVendorEntry, projection: IabVendorDisclosure): IabVendorDetail {
        val locale = Locale.getDefault().language
        val urls = v.urls.orEmpty().firstOrNull { it.langId == locale } ?: v.urls.orEmpty().firstOrNull { it.langId == "en" } ?: v.urls?.firstOrNull()
        val retention = v.dataRetention
        return IabVendorDetail(
            privacyPolicyUrl = urls?.privacy,
            legitimateInterestClaimUrl = urls?.legIntClaim,
            consentPurposes = purposeNames(projection.consentPurposes),
            legitimateInterestPurposes = purposeNames(projection.legitimateInterestPurposes),
            notAllowedPurposes = purposeNames(projection.notAllowedPurposes),
            specialPurposes = v.specialPurposes.orEmpty().map { list.specialPurposes?.get(it.toInt())?.name.orEmpty() },
            features = v.features.orEmpty().mapNotNull { id -> list.features?.get(id.toInt())?.let { IabDefinition(it, id.toInt()) } },
            specialFeatures = v.specialFeatures.orEmpty().map { IabFact(list.specialFeatures?.get(it.toInt())?.name.orEmpty(), onOff(it.toInt())) },
            dataCategories = v.dataCategories.orEmpty().map { list.dataCategories?.get(it.toInt())?.name.orEmpty() },
            retention = if (retention == null) listOf(IabFact(copy.appRetentionNotProvided, null))
                else retention.purposes.orEmpty().map { (purpose, days) -> IabFact(list.purposes[purpose.toIntOrNull() ?: -1]?.name.orEmpty(), dayCount(days, copy)) } +
                    retention.specialPurposes.orEmpty().map { (purpose, days) -> IabFact(list.specialPurposes?.get(purpose.toIntOrNull() ?: -1)?.name ?: purpose, dayCount(days, copy)) } +
                    listOfNotNull(retention.stdRetention?.let { IabFact(copy.appStandardRetention, dayCount(it, copy)) }),
            storage = if (v.usesCookies != true && v.usesNonCookieAccess != true) listOf(IabFact(copy.appNoDeviceStorage, null))
                else listOfNotNull(v.cookieMaxAgeSeconds?.let { IabFact(copy.appStoredForUpTo, storageDuration(it, copy)) },
                    IabFact(copy.appRefreshesStoredInformation, if (v.cookieRefresh == true) copy.appYes else copy.appNo),
                    IabFact(copy.appOtherDeviceAccess, if (v.usesNonCookieAccess == true) copy.appYes else copy.appNo)),
            deviceStorageDisclosureUrl = v.deviceStorageDisclosureUrl,
        )
    }

    private fun customDetail(v: IabCustomVendor, interest: List<Int>) = IabVendorDetail(
        privacyPolicyUrl = v.privacyPolicyUrl,
        legitimateInterestClaimUrl = null,
        consentPurposes = purposeNames(v.purposes),
        legitimateInterestPurposes = purposeNames(interest),
        notAllowedPurposes = emptyList(),
        specialPurposes = emptyList(),
        features = v.features.mapNotNull { id -> list.features?.get(id)?.let { IabDefinition(it, id) } },
        specialFeatures = v.specialFeatures.filter { list.specialFeatures?.get(it) != null }.map { IabFact(list.specialFeatures?.get(it)?.name.orEmpty(), onOff(it)) },
        dataCategories = v.dataCategories.mapNotNull { list.dataCategories?.get(it)?.name },
        retention = listOf(v.dataRetentionDays?.let { IabFact(copy.appStandardRetention, dayCount(it.toLong(), copy)) } ?: IabFact(copy.appRetentionNotProvided, null)),
        storage = if (!v.usesCookies && !v.usesNonCookieAccess) listOf(IabFact(copy.appNoDeviceStorage, null))
            else listOfNotNull(v.cookieMaxAgeSeconds?.let { IabFact(copy.appStoredForUpTo, storageDuration(it.toLong(), copy)) },
                IabFact(copy.appOtherDeviceAccess, if (v.usesNonCookieAccess) copy.appYes else copy.appNo)),
        deviceStorageDisclosureUrl = null,
    )
}

/** The IAB side of the draft. `null` unless the policy is IAB TCF and a vendor list was served. */
val ConsentDraft.iab: IabDraftHandle? get() = if (isIab) disclosure?.let { IabDraftHandle(this, it) } else null
