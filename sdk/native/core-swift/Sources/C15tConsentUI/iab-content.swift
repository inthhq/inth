#if canImport(C15tCore)
import C15tCore
#endif
import Foundation

// What the IAB screens say, assembled without UIKit so `swift test` on macOS can check it.
// The views render these values and add nothing to the required sentences. A host theme
// changes only the headline and introduction above them, never these texts, the standard
// purpose and stack names, or the GVL illustrations, so `UseNonStandardTexts` stays 0.

/// The first layer's IAB disclosure, in reading order, as the web prompt shows it:
/// description with the partners link, the purpose summary, then the legitimate-interest,
/// scope and withdrawal sentences.
struct IABFirstLayerContent: Equatable, Sendable {
    /// Registered vendors plus Google ad tech providers, as on the web.
    let partnerCount: Int
    /// Text before the tappable partners link.
    let descriptionLead: String
    /// The link itself, such as "12 partners". It opens the partner list.
    let partnersLink: String
    /// Text after the link. Ends with "to:" before the summary list.
    let descriptionTail: String
    /// Purpose 1, stacks, uncovered declared purposes and used special features, by their
    /// standard names.
    let summaryItems: [String]
    /// "And N more..." when the summary was capped.
    let moreItems: String?
    let legitimateInterestNotice: String
    let scope: String
    let withdraw: String
    let labels: DecisionLabels

    /// The whole description with the link text in place.
    var description: String { descriptionLead + partnersLink + descriptionTail }

    /// Every IAB sentence and summary line the first layer shows, in order.
    var lines: [String] {
        [description] + summaryItems + (moreItems.map { [$0] } ?? []) + [legitimateInterestNotice, scope, withdraw]
    }

    init(summary: IABBannerSummary, copy: IABCopy) {
        let count = String(summary.vendorCount)
        partnerCount = summary.vendorCount
        let full = copy.format(copy.appDescription, ["partnerCount": count])
        let link = copy.format(copy.bannerPartnersLink, ["count": count])
        if let range = full.range(of: link) {
            descriptionLead = String(full[..<range.lowerBound])
            partnersLink = link
            descriptionTail = String(full[range.upperBound...])
        } else if let token = copy.appDescription.range(of: "{partnerCount}") {
            // A language whose description doesn't contain the link text verbatim still links the count.
            descriptionLead = String(copy.appDescription[..<token.lowerBound])
            partnersLink = count
            descriptionTail = String(copy.appDescription[token.upperBound...])
        } else {
            descriptionLead = full + " "
            partnersLink = link
            descriptionTail = ""
        }
        summaryItems = summary.displayItems
        moreItems = summary.remainingCount > 0
            ? copy.format(copy.bannerAndMore, ["count": String(summary.remainingCount)]) : nil
        legitimateInterestNotice = copy.bannerLegitimateInterestNotice
        scope = copy.appScopeServiceSpecific
        withdraw = copy.appWithdraw
        labels = DecisionLabels(copy: copy)
    }

    init(_ presentation: IABPresentation) {
        self.init(summary: presentation.bannerSummary, copy: IABCopy.forLanguage(presentation.language))
    }
}

/// One GVL purpose, special purpose, feature or special feature, with its standard texts.
struct IABDefinitionContent: Equatable, Sendable, Identifiable {
    enum Kind: Equatable, Sendable { case purpose, specialPurpose, feature, specialFeature }
    let kind: Kind
    let id: Int
    let name: String
    let description: String
    let descriptionLegal: String?
    /// The GVL's standard illustrations, unmodified.
    let illustrations: [String]

    init(_ kind: Kind, _ definition: GVLDefinition) {
        self.kind = kind
        id = definition.id
        name = definition.name
        description = definition.description
        descriptionLegal = definition.descriptionLegal
        illustrations = definition.illustrations
    }

    /// Whether a Details control has anything to reveal.
    var hasDetails: Bool { descriptionLegal?.isEmpty == false || !illustrations.isEmpty }
}

/// A purpose row in preferences: its definition and how many partners rely on each legal basis.
struct IABPurposeContent: Equatable, Sendable, Identifiable {
    let definition: IABDefinitionContent
    let consentPartnerCount: Int
    let legitimateInterestPartnerCount: Int
    /// Shown on the collapsed row, so the counts never hide behind Details. Built from the
    /// shared IAB copy, in the web's words.
    let partnerCounts: String
    var id: Int { definition.id }

    init(definition: IABDefinitionContent, consentPartnerCount: Int, legitimateInterestPartnerCount: Int, copy: IABCopy) {
        self.definition = definition
        self.consentPartnerCount = consentPartnerCount
        self.legitimateInterestPartnerCount = legitimateInterestPartnerCount
        let partners = { (count: Int) in copy.format(copy.preferenceCenterPurposeItemPartners, ["count": String(count)]) }
        partnerCounts = "\(copy.preferenceCenterPurposeItemWithYourPermission): \(partners(consentPartnerCount))"
            + " · \(copy.preferenceCenterPurposeItemLegitimateInterest): \(partners(legitimateInterestPartnerCount))"
    }
    /// Some partner claims legitimate interest, so the row offers an objection switch.
    var offersObjection: Bool { legitimateInterestPartnerCount > 0 }
}


/// The vendor list's standard Features text, or the translated standard text when the list has
/// none. TCF policy check 14 requires it wherever Features are shown.
/// The purposes Google needs consent to before an ad tech provider counts its consent.
let adTechProviderPurposeIds: Set<Int> = [1, 3, 4]

private func featuresExplanation(_ list: GlobalVendorList, _ copy: IABCopy) -> String {
    if let text = list.standardTexts?.features, !text.isEmpty { return text }
    return copy.preferenceCenterFeaturesDescription
}

/// The second layer's IAB content. Purposes and special features are only those some
/// in-scope partner declares, as on the web.
struct IABPreferencesContent: Equatable, Sendable {
    let purposes: [IABPurposeContent]
    let specialFeatures: [IABDefinitionContent]
    let specialPurposes: [IABDefinitionContent]
    let features: [IABDefinitionContent]
    /// The standard explanation shown wherever Features are listed.
    let featuresStandardText: String
    /// What legitimate interest means here and how to object. `nil` when no partner claims it.
    let legitimateInterestExplanation: String?
    /// Shown beside each per-purpose objection switch.
    let rightToObject: String
    /// Where the TC String is kept and for how long. `nil` only when no limit applies.
    let consentStorage: String?
    let iabPartnerCount: Int
    /// Google ad tech providers. They have their own page, apart from IAB partners.
    let otherPartnerCount: Int
    /// Custom (non-IAB) partners. They have their own page too.
    let customPartnerCount: Int
    let labels: DecisionLabels

    init(_ presentation: IABPresentation) {
        let list = presentation.list
        let copy = IABCopy.forLanguage(presentation.language)
        let projections = presentation.vendors.values
        let custom = presentation.customVendors
        purposes = presentation.declaredPurposeIds.compactMap { id in
            list.purposes[id].map { definition in
                let counts = presentation.partnerCounts(purposeId: id)
                return IABPurposeContent(definition: IABDefinitionContent(.purpose, definition),
                    consentPartnerCount: counts.consent,
                    legitimateInterestPartnerCount: counts.legitimateInterest,
                    copy: copy)
            }
        }
        specialFeatures = presentation.declaredSpecialFeatureIds.compactMap { id in
            list.specialFeatures[id].map { IABDefinitionContent(.specialFeature, $0) }
        }
        let active = presentation.vendors.keys.compactMap { list.vendors[$0] }
        let usedSpecialPurposes = Set(active.flatMap(\.specialPurposes))
        let usedFeatures = Set(active.flatMap(\.features)).union(custom.flatMap(\.features))
        specialPurposes = list.specialPurposes.keys.sorted().filter(usedSpecialPurposes.contains).compactMap { id in
            list.specialPurposes[id].map { IABDefinitionContent(.specialPurpose, $0) }
        }
        features = list.features.keys.sorted().filter(usedFeatures.contains).compactMap { id in
            list.features[id].map { IABDefinitionContent(.feature, $0) }
        }
        featuresStandardText = featuresExplanation(list, copy)
        legitimateInterestExplanation = projections.contains { !$0.legitimateInterestPurposes.isEmpty }
            || custom.contains { !$0.legIntPurposes.isEmpty }
            ? copy.appLegitimateInterestExplanation : nil
        rightToObject = copy.preferenceCenterPurposeItemRightToObject
        consentStorage = presentation.consentStorageMaxDays.map { copy.format(copy.appConsentStorage, ["days": String($0)]) }
        iabPartnerCount = presentation.vendors.count
        otherPartnerCount = presentation.adTechProviders?.count ?? 0
        customPartnerCount = custom.count
        labels = DecisionLabels(copy: copy)
    }
}

/// Purposes TCF never lets anyone claim under legitimate interest.
let customNeverLI: Set<Int> = [1, 3, 4, 5, 6]

/// One custom (non-IAB) partner's page: what it is, its legal bases and everything it declares,
/// with the same rows a registered partner's page has. The names come from the served list.
struct IABCustomVendorContent: Equatable, Sendable {
    typealias Row = IABVendorContent.Row
    let id: String
    let name: String
    /// That this partner is not registered with IAB, in the web's words.
    let note: String
    let description: String?
    let privacyPolicy: URL?
    let consentPurposes: [String]
    let legitimateInterestPurposes: [String]
    let offersConsent: Bool
    let offersLegitimateInterest: Bool
    let features: [IABDefinitionContent]
    let featuresStandardText: String
    let specialFeatureIds: [Int]
    let specialFeatures: [String]
    let dataCategories: [String]
    let retention: [Row]
    let storage: [Row]
    let storesOnDevice: Bool

    init?(_ presentation: IABPresentation, id: String) {
        guard let vendor = presentation.customVendors.first(where: { $0.id == id }) else { return nil }
        let copy = IABCopy.forLanguage(presentation.language)
        let list = presentation.list
        func names(_ ids: [Int], in table: [Int: GVLDefinition]) -> [String] { ids.compactMap { table[$0]?.name } }
        self.id = id
        name = vendor.name
        note = copy.commonCustomPartner
        description = vendor.description?.isEmpty == false ? vendor.description : nil
        privacyPolicy = URL(string: vendor.privacyPolicyUrl)
        consentPurposes = names(vendor.purposes, in: list.purposes)
        legitimateInterestPurposes = names(vendor.legIntPurposes.filter { !customNeverLI.contains($0) }, in: list.purposes)
        offersConsent = !vendor.purposes.isEmpty
        offersLegitimateInterest = !vendor.legIntPurposes.isEmpty
        features = vendor.features.compactMap { list.features[$0].map { IABDefinitionContent(.feature, $0) } }
        featuresStandardText = featuresExplanation(list, copy)
        specialFeatureIds = vendor.specialFeatures.filter { list.specialFeatures[$0] != nil }
        specialFeatures = names(vendor.specialFeatures, in: list.specialFeatures)
        dataCategories = vendor.dataCategories.compactMap { list.dataCategories?[$0]?.name }
        retention = vendor.dataRetentionDays.map {
            [Row(label: copy.appStandardRetention, value: IABVendorContent.days($0, copy))]
        } ?? []
        storesOnDevice = vendor.usesCookies || vendor.usesNonCookieAccess
        var storage: [Row] = []
        if storesOnDevice {
            if let seconds = vendor.cookieMaxAgeSeconds {
                storage.append(Row(label: copy.appStoredForUpTo, value: IABVendorContent.storageDuration(seconds: seconds, copy)))
            }
            storage.append(Row(label: copy.appOtherDeviceAccess, value: vendor.usesNonCookieAccess ? copy.appYes : copy.appNo))
        }
        self.storage = storage
    }
}

/// One partner's page: links, legal bases, everything it declares, retention and storage.
struct IABVendorContent: Equatable, Sendable {
    struct Row: Equatable, Sendable {
        let label: String
        let value: String
    }
    let id: Int
    let name: String
    let privacyPolicy: URL?
    /// The partner's statement of the legitimate interest at stake.
    let legitimateInterestClaim: URL?
    let consentPurposes: [String]
    let legitimateInterestPurposes: [String]
    let notAllowedPurposes: [String]
    let specialPurposes: [String]
    /// Read-only, with their texts and illustrations. They never get a control.
    let features: [IABDefinitionContent]
    let featuresStandardText: String
    let specialFeatureIds: [Int]
    let specialFeatures: [String]
    let dataCategories: [String]
    /// Per purpose, then per special purpose, then the standard period. Empty when the
    /// partner gives none.
    let retention: [Row]
    /// Device storage rows. Empty when the partner stores nothing on the device.
    let storage: [Row]
    let storesOnDevice: Bool
    let storageDisclosure: URL?

    init?(_ presentation: IABPresentation, id: Int, language: String) {
        let copy = IABCopy.forLanguage(presentation.language)
        let list = presentation.list
        guard let vendor = list.vendors[id], let projection = presentation.vendors[id] else { return nil }
        func names(_ ids: [Int], in table: [Int: GVLDefinition]) -> [String] { ids.compactMap { table[$0]?.name } }
        self.id = id
        name = vendor.name
        let urls = vendor.urls.first { $0.langId.lowercased() == language.lowercased() }
            ?? vendor.urls.first { $0.langId.lowercased() == "en" } ?? vendor.urls.first
        privacyPolicy = urls?.privacy.flatMap(URL.init(string:))
        legitimateInterestClaim = urls?.legIntClaim.flatMap(URL.init(string:))
        consentPurposes = names(projection.consentPurposes, in: list.purposes)
        legitimateInterestPurposes = names(projection.legitimateInterestPurposes, in: list.purposes)
        notAllowedPurposes = names(projection.notAllowedPurposes, in: list.purposes)
        specialPurposes = names(vendor.specialPurposes, in: list.specialPurposes)
        features = vendor.features.compactMap { list.features[$0].map { IABDefinitionContent(.feature, $0) } }
        // UI copy follows the served list's language; `language` only picks the policy URLs.
        featuresStandardText = featuresExplanation(list, copy)
        specialFeatureIds = vendor.specialFeatures.filter { list.specialFeatures[$0] != nil }
        specialFeatures = names(vendor.specialFeatures, in: list.specialFeatures)
        dataCategories = (vendor.dataCategories ?? []).compactMap { list.dataCategories?[$0]?.name }
        var retention: [Row] = []
        if let periods = vendor.dataRetention {
            for purpose in periods.purposes.keys.sorted() {
                if let name = list.purposes[purpose]?.name, let days = periods.purposes[purpose] {
                    retention.append(Row(label: name, value: Self.days(days, copy)))
                }
            }
            for purpose in periods.specialPurposes.keys.sorted() {
                if let name = list.specialPurposes[purpose]?.name, let days = periods.specialPurposes[purpose] {
                    retention.append(Row(label: name, value: Self.days(days, copy)))
                }
            }
            if let days = periods.stdRetention { retention.append(Row(label: copy.appStandardRetention, value: Self.days(days, copy))) }
        }
        self.retention = retention
        storesOnDevice = vendor.usesCookies || vendor.usesNonCookieAccess
        var storage: [Row] = []
        if storesOnDevice {
            if let seconds = vendor.cookieMaxAgeSeconds {
                storage.append(Row(label: copy.appStoredForUpTo, value: Self.storageDuration(seconds: seconds, copy)))
            }
            storage.append(Row(label: copy.appRefreshesStoredInformation, value: vendor.cookieRefresh ? copy.appYes : copy.appNo))
            storage.append(Row(label: copy.appOtherDeviceAccess, value: vendor.usesNonCookieAccess ? copy.appYes : copy.appNo))
        }
        self.storage = storage
        storageDisclosure = vendor.deviceStorageDisclosureUrl.flatMap(URL.init(string:))
    }

    static func days(_ count: Int, _ copy: IABCopy) -> String {
        count == 1 ? copy.appDayCountOne : copy.format(copy.appDayCount, ["count": String(count)])
    }

    /// A GVL `cookieMaxAgeSeconds` in whole days, rounded up, so a positive duration never
    /// reads as 0 days. Zero or less is session-only storage.
    static func storageDuration(seconds: Int, _ copy: IABCopy) -> String {
        guard seconds > 0 else { return copy.appSessionOnly }
        let (whole, rest) = seconds.quotientAndRemainder(dividingBy: 86_400)
        return days(whole + (rest > 0 ? 1 : 0), copy)
    }
}

/// Decision button labels, from the generated copy: IAB copy on IAB screens, category-mode copy
/// otherwise.
struct DecisionLabels: Equatable, Sendable {
    let acceptAll: String
    let rejectAll: String
    let customize: String
    let save: String

    init(acceptAll: String, rejectAll: String, customize: String, save: String) {
        self.acceptAll = acceptAll
        self.rejectAll = rejectAll
        self.customize = customize
        self.save = save
    }

    init(copy: IABCopy) {
        self.init(acceptAll: copy.commonAcceptAll, rejectAll: copy.commonRejectAll,
            customize: copy.commonCustomize, save: copy.commonSaveSettings)
    }

    init(copy: ConsentCopy) {
        self.init(acceptAll: copy.acceptAll, rejectAll: copy.rejectAll, customize: copy.customize, save: copy.save)
    }
}

/// How a decision button is drawn. Accept all and Reject all always share one style, so
/// their text treatment matches.
enum DecisionStyle: Equatable, Sendable { case decision, accent, quiet }

struct DecisionControl: Equatable, Sendable {
    enum Kind: Equatable, Sendable { case reject, accept, customize, save }
    let kind: Kind
    let label: String
    let style: DecisionStyle
}

/// The buttons on a page with a current list: one equal row for Reject all and Accept all,
/// then the path onward. Withdrawing is always beside granting, on the first layer and in
/// standing preferences alike.
enum DecisionPlan {
    static func rows(first: Bool, labels: DecisionLabels) -> (pair: [DecisionControl], next: DecisionControl) {
        let style: DecisionStyle = first ? .decision : .quiet
        let pair = [DecisionControl(kind: .reject, label: labels.rejectAll, style: style),
                    DecisionControl(kind: .accept, label: labels.acceptAll, style: style)]
        let next = first ? DecisionControl(kind: .customize, label: labels.customize, style: .quiet)
            : DecisionControl(kind: .save, label: labels.save, style: .accent)
        return (pair, next)
    }
}

/// How the presenter's screen is shown. The first layer, and preferences opened from it, cover
/// the whole screen and can't be swiped away; standing preferences are a sheet.
enum ConsentPresentationStyle: Equatable, Sendable { case fullScreen, sheet }
