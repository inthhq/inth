#if canImport(C15tCore)
import C15tCore
#endif
import Foundation

// The IAB TCF side of the headless draft. Foundation only, so `swift test` on macOS checks it.
// The texts come from `iab-content.swift`, which the stock screens draw too.

/// One purpose with its consent switch and, when a partner relies on it, its
/// legitimate-interest switch.
public struct IABPurposeRow: Identifiable {
    /// The purpose as the vendor list words it. Show the texts unchanged.
    public let definition: IABDefinitionContent
    /// Partners asking consent for it, after publisher restrictions.
    public let consentPartnerCount: Int
    /// Partners relying on legitimate interest for it.
    public let legitimateInterestPartnerCount: Int
    /// Both counts as one translated line.
    public let partnersNote: String
    /// The sentence that tells the person they may object.
    public let rightToObject: String
    /// The staged consent.
    public let consent: Bool
    /// The legitimate-interest switch, or `nil` when no partner relies on it. `false` is an
    /// objection.
    public let legitimateInterest: Bool?
    /// Whether the switches take input now.
    public let isEnabled: Bool
    let changeConsent: @MainActor (Bool) -> Void
    let changeLegitimateInterest: @MainActor (Bool) -> Void

    public var id: Int { definition.id }
    public var name: String { definition.name }
    public var description: String { definition.description }

    /// Stage consent for this purpose.
    @MainActor public func setConsent(_ value: Bool) { changeConsent(value) }
    /// Stage legitimate interest for this purpose. `false` objects.
    @MainActor public func setLegitimateInterest(_ value: Bool) { changeLegitimateInterest(value) }
}

/// One special feature with its opt-in switch.
public struct IABSpecialFeatureRow: Identifiable {
    /// The special feature as the vendor list words it. Show the texts unchanged.
    public let definition: IABDefinitionContent
    /// The staged opt-in.
    public let optIn: Bool
    /// Whether the switch takes input now.
    public let isEnabled: Bool
    let changeOptIn: @MainActor (Bool) -> Void

    public var id: Int { definition.id }
    public var name: String { definition.name }
    public var description: String { definition.description }

    /// Stage the opt-in for this special feature.
    @MainActor public func setOptIn(_ value: Bool) { changeOptIn(value) }
}

/// One registered partner: its legal bases after publisher restrictions, its switches and what
/// it discloses.
public struct IABVendorRow: Identifiable {
    public let id: Int
    public let name: String
    /// The partner as the vendor list declares it.
    public let entry: GVLVendor
    /// The core's projection. `notAllowedPurposes` were restricted away; `consentRequiredPurposes`
    /// and `legitimateInterestRequiredPurposes` are purposes a publisher restriction moved from
    /// one basis to the other.
    public let disclosure: IABVendorDisclosure
    /// Off, partly on or on in the draft.
    public let status: IABVendorSelectionStatus
    /// ``status`` as a translated word.
    public let statusLabel: String
    /// The number of purposes on each basis, as one translated line.
    public let summary: String
    /// The consent switch, or `nil` when a restriction left the partner no consent purpose. The
    /// core refuses a save that turns it on then.
    public let consent: Bool?
    /// The legitimate-interest switch, or `nil` when the partner has no such purpose. `false` is
    /// an objection.
    public let legitimateInterest: Bool?
    /// Whether the switches take input now.
    public let isEnabled: Bool
    let changeConsent: @MainActor (Bool) -> Void
    let changeLegitimateInterest: @MainActor (Bool) -> Void
    let detail: @MainActor () -> IABVendorContent

    /// Everything the partner's own page must show: links, purposes on each basis, purposes not
    /// allowed, retention, data categories and device storage. Built when read.
    @MainActor public var details: IABVendorContent { detail() }

    /// Stage consent for this partner.
    @MainActor public func setConsent(_ value: Bool) { changeConsent(value) }
    /// Stage legitimate interest for this partner. `false` objects.
    @MainActor public func setLegitimateInterest(_ value: Bool) { changeLegitimateInterest(value) }
}

/// A partner the publisher declares outside the IAB vendor list. List these apart from IAB
/// partners with ``IABDraftHandle/customVendorsNotice``: they are not in the TC String.
public struct IABCustomVendorRow: Identifiable {
    public let vendor: IABCustomVendor
    /// Off, partly on or on in the draft.
    public let status: IABVendorSelectionStatus
    /// ``status`` as a translated word.
    public let statusLabel: String
    /// The number of purposes on each basis, as one translated line.
    public let summary: String
    /// The consent switch, or `nil` when the partner asks consent for nothing.
    public let consent: Bool?
    /// The legitimate-interest switch, or `nil` when the partner claims none.
    public let legitimateInterest: Bool?
    /// Whether the switches take input now.
    public let isEnabled: Bool
    /// Everything the partner's own page must show.
    public let details: IABCustomVendorContent
    let changeConsent: @MainActor (Bool) -> Void
    let changeLegitimateInterest: @MainActor (Bool) -> Void

    public var id: String { vendor.id }
    public var name: String { vendor.name }

    /// Stage consent for this partner.
    @MainActor public func setConsent(_ value: Bool) { changeConsent(value) }
    /// Stage legitimate interest for this partner. Turning it off is the objection.
    @MainActor public func setLegitimateInterest(_ value: Bool) { changeLegitimateInterest(value) }
}

/// A Google Additional Consent provider. List these in their own section, apart from IAB partners.
public struct IABAdTechProviderRow: Identifiable {
    public let provider: AdTechProvider
    /// The staged consent.
    public let consent: Bool
    /// Whether the switch takes input now.
    public let isEnabled: Bool
    let changeConsent: @MainActor (Bool) -> Void

    public var id: Int { provider.id }
    public var name: String { provider.name }
    /// The provider's privacy policy.
    public var policyURL: URL? { URL(string: provider.policyUrl) }

    /// Stage consent for this provider.
    @MainActor public func setConsent(_ value: Bool) { changeConsent(value) }
}

extension IABCopy {
    /// Off, partly on or on, as a translated word.
    func statusLabel(_ status: IABVendorSelectionStatus) -> String {
        switch status {
        case .off: return appOff
        case .partial: return appPartlyOn
        case .on: return appOn
        }
    }
}

/// The IAB TCF side of a ``ConsentDraft``: the staged purpose, vendor and legal-basis selection
/// with the commands `@c15t/react`'s `useIAB()` exposes, and the disclosure as rows to place.
///
/// The core validates and encodes the selection on save exactly as it does for the stock
/// screens, so the same choices write the same TC String. Gate vendors on the committed
/// decision, not on these staged values.
@MainActor
public final class IABDraftHandle {
    /// The draft this selection belongs to. Its `iabCopy` holds every IAB label.
    public let draft: ConsentDraft
    /// The core's disclosure the rows are built from.
    public let disclosure: IABPresentation
    /// The second layer's texts, shared with the stock preferences screen.
    private(set) lazy var preferences = IABPreferencesContent(disclosure)

    init(draft: ConsentDraft, disclosure: IABPresentation) {
        self.draft = draft
        self.disclosure = disclosure
    }

    private var copy: IABCopy { draft.iabCopy }
    private var enabled: Bool { draft.isEditable }

    /// The staged selection.
    public var choices: IABChoices { draft.choices }
    /// The committed TC String, or `nil` before a current decision is saved.
    public var tcString: String? { draft.core.iabConsent()?.tcString }
    /// Whether the selection differs from the saved decision.
    public var isDirty: Bool { draft.isDirty }
    /// Another screen recorded a decision under this draft.
    public var isStale: Bool { draft.isStale }
    /// `false` while the vendor list is stale or offline. Show the saved decision and call
    /// ``ConsentDraft/refresh()``.
    public var editable: Bool { disclosure.canEdit && !draft.listUnavailable }
    /// The publisher's restrictions, as the policy declares them. ``IABVendorRow/disclosure``
    /// already applies them.
    public var publisherRestrictions: [IABPublisherRestriction] { draft.core.iabPublisherRestrictions }

    /// Stage consent for a purpose.
    public func setPurposeConsent(_ purposeId: Int, _ value: Bool) {
        draft.select(\.purposeConsents, id: purposeId, enabled: value)
    }

    /// Stage legitimate interest for a purpose. `false` objects. Purposes 1 and 3 to 6 never
    /// allow legitimate interest, so `true` is ignored for them.
    public func setPurposeLegitimateInterest(_ purposeId: Int, _ value: Bool) {
        draft.setLegitimateInterest(purpose: true, id: purposeId, enabled: value)
    }

    /// Stage consent for a registered partner.
    public func setVendorConsent(_ vendorId: Int, _ value: Bool) {
        draft.select(\.vendorConsents, id: vendorId, enabled: value)
    }

    /// Stage consent for a custom partner, by the `id` in ``customVendors``.
    public func setVendorConsent(_ vendorId: String, _ value: Bool) {
        draft.select(\.customVendorConsents, id: vendorId, enabled: value)
    }

    /// Stage legitimate interest for a registered partner. `false` objects.
    public func setVendorLegitimateInterest(_ vendorId: Int, _ value: Bool) {
        draft.setLegitimateInterest(purpose: false, id: vendorId, enabled: value)
    }

    /// Stage legitimate interest for a custom partner. Turning it off is the objection; custom
    /// partners have no separate objection list.
    public func setVendorLegitimateInterest(_ vendorId: String, _ value: Bool) {
        draft.select(\.customVendorLegitimateInterests, id: vendorId, enabled: value)
    }

    /// Stage the opt-in for a special feature.
    public func setSpecialFeatureOptIn(_ featureId: Int, _ value: Bool) {
        draft.select(\.specialFeatureOptIns, id: featureId, enabled: value)
    }

    /// Stage consent for a Google Additional Consent provider. The core records every provider
    /// as off unless purposes 1, 3 and 4 all have consent.
    public func setAdTechProviderConsent(_ providerId: Int, _ value: Bool) {
        draft.selectProvider(id: providerId, enabled: value)
    }

    /// See ``ConsentDraft/acceptAll()``.
    public func acceptAll() { draft.acceptAll() }
    /// See ``ConsentDraft/rejectAll()``.
    public func rejectAll() { draft.rejectAll() }
    /// Record the selection. See ``ConsentDraft/save(_:onResult:)``.
    public func save(onResult: @escaping (Bool) -> Void = { _ in }) { draft.save(.save, onResult: onResult) }
    /// See ``ConsentDraft/reset()``.
    public func reset() { draft.reset() }

    /// The first layer's required text. Render all of it.
    public var firstLayer: IABFirstLayerContent { IABFirstLayerContent(disclosure) }

    /// The purposes this app's partners declare, ascending.
    public var purposes: [IABPurposeRow] {
        let choices = choices
        let enabled = enabled
        let rightToObject = preferences.rightToObject + " " + copy.appTurnOffToObject
        return preferences.purposes.map { purpose in
            let id = purpose.id
            return IABPurposeRow(
                definition: purpose.definition,
                consentPartnerCount: purpose.consentPartnerCount,
                legitimateInterestPartnerCount: purpose.legitimateInterestPartnerCount,
                partnersNote: purpose.partnerCounts,
                rightToObject: rightToObject,
                consent: choices.purposeConsents.contains(id),
                legitimateInterest: purpose.offersObjection ? choices.purposeLegitimateInterests.contains(id) : nil,
                isEnabled: enabled,
                changeConsent: { [self] in setPurposeConsent(id, $0) },
                changeLegitimateInterest: { [self] in setPurposeLegitimateInterest(id, $0) })
        }
    }

    /// The special features some partner declares, each with an opt-in.
    public var specialFeatures: [IABSpecialFeatureRow] {
        let choices = choices
        let enabled = enabled
        return preferences.specialFeatures.map { item in
            IABSpecialFeatureRow(definition: item, optIn: choices.specialFeatureOptIns.contains(item.id), isEnabled: enabled,
                changeOptIn: { [self] in setSpecialFeatureOptIn(item.id, $0) })
        }
    }

    /// The special purposes some partner uses. They take no choice.
    public var specialPurposes: [IABDefinitionContent] { preferences.specialPurposes }
    /// The vendor list's standard Special Purposes text, when it has one.
    public var specialPurposesExplanation: String? { disclosure.list.standardTexts?.specialPurposes }

    /// The features some partner uses. They take no choice; show ``featuresExplanation`` with them.
    public var features: [IABDefinitionContent] { preferences.features }
    /// The vendor list's standard Features text, or the translated standard text when the list
    /// has none.
    public var featuresExplanation: String { preferences.featuresStandardText }

    /// Every stack the vendor list defines, ascending. ``firstLayer`` names the ones that
    /// summarize this app's purposes.
    public var stacks: [GVLStack] {
        let stacks = disclosure.list.stacks
        return stacks.keys.sorted().compactMap { stacks[$0] }
    }

    /// Registered partners, by name.
    /// - Parameter purposeId: Keep only partners that use this purpose on either basis.
    public func vendors(purposeId: Int? = nil) -> [IABVendorRow] {
        let choices = choices
        let enabled = enabled
        let copy = copy
        let presentation = disclosure
        let language = Self.deviceLanguage
        return presentation.list.vendors.values.compactMap { entry -> IABVendorRow? in
            guard let projection = presentation.vendors[entry.id] else { return nil }
            if let purposeId, !projection.consentPurposes.contains(purposeId),
               !projection.legitimateInterestPurposes.contains(purposeId) { return nil }
            let id = entry.id
            let status = projection.selectionStatus(vendorId: id, choices: choices)
            return IABVendorRow(
                id: id, name: entry.name, entry: entry, disclosure: projection,
                status: status, statusLabel: copy.statusLabel(status),
                summary: copy.format(copy.appVendorPurposeSummary, [
                    "purposes": String(projection.consentPurposes.count),
                    "legitimateInterest": String(projection.legitimateInterestPurposes.count),
                ]),
                consent: projection.consentPurposes.isEmpty ? nil : choices.vendorConsents.contains(id),
                legitimateInterest: projection.legitimateInterestPurposes.isEmpty ? nil : choices.vendorLegitimateInterests.contains(id),
                isEnabled: enabled,
                changeConsent: { [self] in setVendorConsent(id, $0) },
                changeLegitimateInterest: { [self] in setVendorLegitimateInterest(id, $0) },
                detail: { IABVendorContent(presentation, vendor: entry, projection: projection, language: language) })
        }.sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }
    }

    /// Registered partners, by name.
    public var vendors: [IABVendorRow] { vendors(purposeId: nil) }

    /// One registered partner, or `nil` when it is not in the disclosure.
    public func vendor(_ id: Int) -> IABVendorRow? { vendors.first { $0.id == id } }

    /// One registered partner's page, or `nil` when it is not in the disclosure.
    func details(vendorId: Int) -> IABVendorContent? {
        IABVendorContent(disclosure, id: vendorId, language: Self.deviceLanguage)
    }

    /// The device language, which picks a partner's policy links. The copy follows the list.
    private static var deviceLanguage: String { String(Locale.preferredLanguages.first?.prefix(2) ?? "en") }

    /// Partners the publisher declares outside the vendor list, in the order served.
    public var customVendors: [IABCustomVendorRow] {
        let choices = choices
        let enabled = enabled
        let copy = copy
        return disclosure.customVendors.map { vendor in
            let id = vendor.id
            let status = vendor.selectionStatus(choices: choices)
            let interest = vendor.legIntPurposes.filter { !customNeverLI.contains($0) }
            return IABCustomVendorRow(
                vendor: vendor, status: status, statusLabel: copy.statusLabel(status),
                summary: copy.format(copy.appVendorPurposeSummary, [
                    "purposes": String(vendor.purposes.count), "legitimateInterest": String(interest.count),
                ]),
                consent: vendor.purposes.isEmpty ? nil : choices.customVendorConsents.contains(id),
                legitimateInterest: vendor.legIntPurposes.isEmpty ? nil : choices.customVendorLegitimateInterests.contains(id),
                isEnabled: enabled,
                details: IABCustomVendorContent(disclosure, vendor: vendor),
                changeConsent: { [self] in setVendorConsent(id, $0) },
                changeLegitimateInterest: { [self] in setVendorLegitimateInterest(id, $0) })
        }
    }

    /// The heading that sets custom partners apart from IAB partners.
    public var customVendorsHeading: String { copy.preferenceCenterVendorListCustomVendorsHeading }
    /// The notice that says custom partners are not registered with IAB.
    public var customVendorsNotice: String { copy.preferenceCenterVendorListCustomVendorsNotice }

    /// Google Additional Consent providers, by id. Empty when none are configured.
    public var adTechProviders: [IABAdTechProviderRow] {
        let selected = Set(choices.adTechProviderConsents ?? [])
        let enabled = enabled
        return (disclosure.adTechProviders ?? []).map { provider in
            IABAdTechProviderRow(provider: provider, consent: selected.contains(provider.id), isEnabled: enabled,
                changeConsent: { [self] in setAdTechProviderConsent(provider.id, $0) })
        }
    }

    /// The heading for the provider section.
    public var adTechProvidersHeading: String { copy.preferenceCenterVendorListAdTechProvidersHeading }
    /// The notice for the provider section. It also says why providers stay off while purposes
    /// 1, 3 and 4 lack consent.
    public var adTechProvidersNotice: String {
        let notice = copy.preferenceCenterVendorListAdTechProvidersNotice
        return providerPrerequisitesMet ? notice : notice + " " + copy.appProvidersOff
    }
    /// Purposes 1, 3 and 4 all have consent in the draft, so a provider's consent can count.
    public var providerPrerequisitesMet: Bool {
        Set(disclosure.adTechProviderPurposeIds).isSubset(of: Set(choices.purposeConsents))
    }

    /// What legitimate interest means and that the person may object. Show it wherever a
    /// legitimate-interest switch appears. `nil` when no partner claims legitimate interest.
    public var legitimateInterestExplanation: String? { preferences.legitimateInterestExplanation }
    /// How long the TC String stays on the device, or `nil` when no limit applies.
    public var consentStorage: String? { preferences.consentStorage }
}

extension ConsentDraft {
    /// The IAB side of the draft. `nil` unless the policy is IAB TCF and a vendor list was served.
    public var iab: IABDraftHandle? {
        guard isIAB, let disclosure else { return nil }
        return IABDraftHandle(draft: self, disclosure: disclosure)
    }
}
