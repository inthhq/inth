import Foundation

/// Read-only disclosure bound to the same revision as a native draft.
public struct IABPresentation: Sendable {
    /// Whether current policy and list authority permit editing and new grants.
    public let canEdit: Bool
    public let draft: IABDraft
    /// The served list, already narrowed to the publisher's vendor scope.
    public let list: GlobalVendorList
    /// Active (non-deleted) vendors in ``list``, keyed by id.
    public let vendors: [Int: IABVendorDisclosure]
    public let adTechProviders: [AdTechProvider]?
    /// Partners the publisher declares outside the Global Vendor List, in the order served.
    public let customVendors: [IABCustomVendor]
    /// The first layer's vendor count and purpose, stack and special-feature names.
    public let bannerSummary: IABBannerSummary
    /// Purposes some active or custom vendor declares for consent or legitimate interest, plus
    /// purposes 1, 3 and 4 when ad tech providers are listed. Ascending.
    public let declaredPurposeIds: [Int]
    /// Special features some active or custom vendor declares. Ascending.
    public let declaredSpecialFeatureIds: [Int]
    /// The longest a saved decision, and the TC String published from it, stays in use on
    /// this device, in whole days rounded up. It comes from the policy's choice validity.
    /// After it passes, the core stops publishing the string and asks again. `nil` only when
    /// no limit applies.
    public let consentStorageMaxDays: Int?
    /// The language of the list's names and descriptions, as a two-letter upper-case code.
    /// The served list is English today, so this is `"EN"`. Use it to pick the UI copy that
    /// surrounds the list's text.
    public let language: String

    init(
        canEdit: Bool, draft: IABDraft, list: GlobalVendorList, vendors: [Int: IABVendorDisclosure],
        adTechProviders: [AdTechProvider]?, customVendors: [IABCustomVendor] = [],
        consentStorageMaxDays: Int?, language: String
    ) {
        self.canEdit = canEdit
        self.draft = draft
        self.list = list
        self.vendors = vendors
        self.adTechProviders = adTechProviders
        self.customVendors = customVendors
        let providerCount = adTechProviders?.count ?? 0
        // The banner counts custom vendors but names only what registered vendors declare, as
        // `resolveIABBannerSummary` does. The preference centre lists every purpose some
        // partner declares, custom ones included, as `processPurposes` does.
        self.bannerSummary = IABBannerSummary.resolve(
            list: list, adTechProviderCount: providerCount, customVendorCount: customVendors.count)
        let customPurposes = Set(customVendors.flatMap { $0.purposes + $0.legIntPurposes })
        self.declaredPurposeIds = Array(Set(list.declaredPurposeIds(adTechProviderCount: providerCount))
            .union(customPurposes.filter { list.purposes[$0] != nil })).sorted()
        self.declaredSpecialFeatureIds = list.declaredSpecialFeatureIds(customVendors: customVendors)
        self.consentStorageMaxDays = consentStorageMaxDays
        self.language = language
    }

    /// Whole days, rounded up, for a validity in milliseconds. `nil` for no positive limit.
    static func days(ms: Int64?) -> Int? {
        guard let ms, ms > 0 else { return nil }
        let (days, rest) = ms.quotientAndRemainder(dividingBy: 86_400_000)
        return Int(clamping: days + (rest > 0 ? 1 : 0))
    }
}

/// The first layer's summary of what partners do. Same algorithm as the web's
/// `resolveIABBannerSummary` (`packages/core/src/libs/iab-banner-summary.ts`); the shared
/// fixtures `native/protocol/iab-banner-summary-*.json` hold both to it.
public struct IABBannerSummary: Sendable, Equatable {
    /// Active registered vendors, custom vendors and Google ad tech providers.
    public let vendorCount: Int
    /// Purpose 1, then stacks that cover two or more declared purposes, then declared
    /// purposes no chosen stack covers, then special features some vendor uses. Capped.
    public let displayItems: [String]
    /// How many items the cap left out, for an "and N more" line.
    public let remainingCount: Int

    /// `IAB_BANNER_MAX_DISPLAY_ITEMS` on the web.
    public static let maxDisplayItems = 5

    public init(vendorCount: Int, displayItems: [String], remainingCount: Int) {
        self.vendorCount = vendorCount
        self.displayItems = displayItems
        self.remainingCount = remainingCount
    }

    /// Summarize a list for the first layer.
    /// - Parameters:
    ///   - list: The narrowed list. Deleted vendors are left out here.
    ///   - adTechProviderCount: Google ad tech providers listed with the disclosure.
    ///   - customVendorCount: Non-IAB vendors the banner also discloses.
    ///   - maxItems: How many names to list before counting the rest.
    /// - Returns: The vendor count, the names to list, and how many were left out.
    public static func resolve(
        list: GlobalVendorList, adTechProviderCount: Int = 0, customVendorCount: Int = 0,
        maxItems: Int = maxDisplayItems
    ) -> IABBannerSummary {
        let active = list.activeVendors
        let purposeIds = list.declaredPurposeIds(adTechProviderCount: adTechProviderCount)
        let others = purposeIds.filter { $0 != 1 }
        let otherSet = Set(others)
        // Highest coverage first; equal scores keep the list's stack order, as the web's stable sort does.
        let scored = list.stacks.keys.sorted().compactMap { id -> (name: String, covered: [Int])? in
            guard let stack = list.stacks[id] else { return nil }
            let covered = stack.purposes.filter { otherSet.contains($0) }
            return covered.count >= 2 ? (stack.name, covered) : nil
        }
        let ranked = scored.enumerated().sorted {
            $0.element.covered.count != $1.element.covered.count
                ? $0.element.covered.count > $1.element.covered.count : $0.offset < $1.offset
        }.map(\.element)
        var stacks: [String] = []
        var assigned = Set<Int>()
        for stack in ranked {
            let unassigned = stack.covered.filter { !assigned.contains($0) }
            if unassigned.count >= 2 {
                stacks.append(stack.name)
                assigned.formUnion(unassigned)
            }
        }
        var items: [String] = []
        if purposeIds.contains(1), let name = list.purposes[1]?.name { items.append(name) }
        items += stacks
        items += others.filter { !assigned.contains($0) }.compactMap { list.purposes[$0]?.name }
        items += list.declaredSpecialFeatureIds().compactMap { list.specialFeatures[$0]?.name }
        let cap = max(0, maxItems)
        return IABBannerSummary(
            vendorCount: active.count + customVendorCount + adTechProviderCount,
            displayItems: Array(items.prefix(cap)), remainingCount: max(0, items.count - cap))
    }
}

extension GlobalVendorList {
    /// `AD_TECH_PROVIDER_PURPOSES` in `@c15t/schema`: Accept All grants these for providers.
    static let adTechProviderPurposeIds: Set<Int> = [1, 3, 4]

    var activeVendors: [GVLVendor] { vendors.values.filter { $0.deletedDate?.isEmpty != false } }

    /// Purposes some active vendor declares for consent or legitimate interest, plus the ad
    /// tech provider purposes when any provider is listed. Only purposes the list defines.
    func declaredPurposeIds(adTechProviderCount: Int) -> [Int] {
        let active = activeVendors
        return purposes.keys.sorted().filter { id in
            adTechProviderCount > 0 && Self.adTechProviderPurposeIds.contains(id)
                || active.contains { $0.purposes.contains(id) || $0.legIntPurposes.contains(id) }
        }
    }

    /// Special features some active vendor, or one of `customVendors`, declares. Only features
    /// the list defines.
    func declaredSpecialFeatureIds(customVendors: [IABCustomVendor] = []) -> [Int] {
        let active = activeVendors
        return specialFeatures.keys.sorted().filter { id in
            active.contains { $0.specialFeatures.contains(id) } || customVendors.contains { $0.specialFeatures.contains(id) }
        }
    }
}

/// Summary of the draft's permitted consent and legitimate-interest selections.
public enum IABVendorSelectionStatus: Sendable, Equatable { case off, partial, on }

extension IABCustomVendor {
    /// The same summary for a custom vendor. Legitimate interest on purposes 1, 3, 4, 5 and 6
    /// is never shown or signalled, as for registered vendors.
    public func selectionStatus(choices: IABChoices) -> IABVendorSelectionStatus {
        let consent = purposes.map { choices.customVendorConsents.contains(id) && choices.purposeConsents.contains($0) }
        let interest = legIntPurposes.filter { !IABAuthority.neverLI.contains($0) }.map {
            choices.customVendorLegitimateInterests.contains(id) && choices.purposeLegitimateInterests.contains($0)
                && !choices.purposeObjections.contains($0)
        }
        let enabled = consent + interest
        guard enabled.contains(true) else { return .off }
        return enabled.allSatisfy { $0 } ? .on : .partial
    }
}

/// Legal bases after publisher restrictions. Uses the same rule as native gates.
public struct IABVendorDisclosure: Sendable, Equatable {
    public let consentPurposes: [Int]
    public let legitimateInterestPurposes: [Int]
    public let notAllowedPurposes: [Int]

    /// Summarize selections using the projected legal bases. This does not grant authority.
    public func selectionStatus(vendorId: Int, choices: IABChoices) -> IABVendorSelectionStatus {
        let consent = consentPurposes.map { choices.vendorConsents.contains(vendorId) && choices.purposeConsents.contains($0) }
        let interest = legitimateInterestPurposes.map {
            choices.vendorLegitimateInterests.contains(vendorId) && choices.purposeLegitimateInterests.contains($0)
                && !choices.vendorObjections.contains(vendorId) && !choices.purposeObjections.contains($0)
        }
        let enabled = consent + interest
        guard enabled.contains(true) else { return .off }
        return enabled.allSatisfy { $0 } ? .on : .partial
    }
}

extension IABConfiguration {
    /// Project declared legal bases without evaluating a person's choices.
    /// - Parameters:
    ///   - vendor: A vendor in the scoped, disclosed list.
    /// - Returns: Permitted bases and explicitly prohibited purposes.
    public func disclosure(for vendor: GVLVendor) -> IABVendorDisclosure {
        let purposes = Set(vendor.purposes + vendor.legIntPurposes + vendor.flexiblePurposes)
        return IABVendorDisclosure(
            consentPurposes: purposes.filter { discloses(vendor, purposeId: $0, basis: .consent) }.sorted(),
            legitimateInterestPurposes: purposes.filter { discloses(vendor, purposeId: $0, basis: .legitimateInterest) }.sorted(),
            notAllowedPurposes: purposes.filter { id in
                publisherRestrictions.contains { $0.purposeId == id && $0.vendorIds.contains(vendor.id) && $0.type == 0 }
            }.sorted())
    }

    /// Shared by disclosure rendering and synchronous native gates. Does not allocate a projection.
    func discloses(_ vendor: GVLVendor, purposeId: Int, basis: IABLegalBasis) -> Bool {
        let rule = publisherRestrictions.first { $0.purposeId == purposeId && $0.vendorIds.contains(vendor.id) }?.type
        switch basis {
        case .consent:
            return rule != 0 && rule != 2 && (vendor.purposes.contains(purposeId) || rule == 1 && vendor.flexiblePurposes.contains(purposeId))
        case .legitimateInterest:
            return !IABAuthority.neverLI.contains(purposeId) && rule != 0 && rule != 1 && (vendor.legIntPurposes.contains(purposeId) || rule == 2 && vendor.flexiblePurposes.contains(purposeId))
        }
    }
}
