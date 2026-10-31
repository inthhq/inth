import Foundation

/// Read-only disclosure bound to the same revision as a native draft.
public struct IABPresentation: Sendable {
    /// Whether current policy and list authority permit editing and new grants.
    public let canEdit: Bool
    public let draft: IABDraft
    public let list: GlobalVendorList
    public let vendors: [Int: IABVendorDisclosure]
    public let adTechProviders: [AdTechProvider]?
}

/// Summary of the draft's permitted consent and legitimate-interest selections.
public enum IABVendorSelectionStatus: Sendable, Equatable { case off, partial, on }

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
