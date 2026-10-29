package com.c15t.core.iab

import com.c15t.core.tc.GlobalVendorList
import com.c15t.core.tc.GvlVendorEntry

/** A read-only disclosure captured with the native draft's revision. */
data class IabPresentation(
    val draft: IabDraft,
    val list: GlobalVendorList,
    val vendors: Map<Int, IabVendorDisclosure>,
    val adTechProviders: List<AdTechProvider>?,
)

/** Declared bases after publisher restrictions, shared with the native gate. */
data class IabVendorDisclosure(
    val consentPurposes: List<Int>,
    val legitimateInterestPurposes: List<Int>,
    val notAllowedPurposes: List<Int>,
)

/** Project a disclosed vendor without evaluating the subject's choices. */
fun IabConfiguration.disclosure(id: Int, vendor: GvlVendorEntry): IabVendorDisclosure {
    val purposes = (vendor.purposes.orEmpty() + vendor.legIntPurposes.orEmpty() + vendor.flexiblePurposes.orEmpty()).map { it.toInt() }.toSet()
    return IabVendorDisclosure(
        purposes.filter { discloses(id, vendor, it, IabLegalBasis.CONSENT) }.sorted(),
        purposes.filter { discloses(id, vendor, it, IabLegalBasis.LEGITIMATE_INTEREST) }.sorted(),
        purposes.filter { p -> publisherRestrictions.any { it.purposeId == p && id in it.vendorIds && it.type == 0 } }.sorted(),
    )
}

/** Shared by disclosure rendering and disk-free gates, without allocating a projection. */
internal fun IabConfiguration.discloses(id: Int, vendor: GvlVendorEntry, purpose: Int, basis: IabLegalBasis): Boolean {
    val rule = publisherRestrictions.firstOrNull { it.purposeId == purpose && id in it.vendorIds }?.type
    return when (basis) {
        IabLegalBasis.CONSENT -> rule != 0 && rule != 2 && (purpose.toLong() in vendor.purposes.orEmpty() || rule == 1 && purpose.toLong() in vendor.flexiblePurposes.orEmpty())
        IabLegalBasis.LEGITIMATE_INTEREST -> purpose !in IabAuthority.neverLI && rule != 0 && rule != 1 && (purpose.toLong() in vendor.legIntPurposes.orEmpty() || rule == 2 && purpose.toLong() in vendor.flexiblePurposes.orEmpty())
    }
}
