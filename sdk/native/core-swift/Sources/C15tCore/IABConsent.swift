import Foundation
import CryptoKit

/// A publisher restriction's TCF purpose, type, and vendor IDs. Types are 0 for
/// not allowed, 1 for require consent, and 2 for require legitimate interest.
public struct IABPublisherRestriction: Sendable, Codable, Equatable {
    public var purposeId: Int
    public var type: Int
    public var vendorIds: [Int]
    public init(purposeId: Int, type: Int, vendorIds: [Int]) {
        self.purposeId = purposeId
        self.type = type
        self.vendorIds = vendorIds
    }
}

/// Publisher and registered CMP configuration. No CMP ID is invented by the SDK.
/// Registration and app certification must be verified separately by the publisher.
public struct IABConfiguration: Sendable, Codable, Equatable {
    public var cmpId: Int
    public var cmpVersion: Int
    public var publisherCountryCode: String
    public var consentLanguage: String
    public var consentScreen: Int
    public var numCustomPurposes: Int
    public var publisherRestrictions: [IABPublisherRestriction]
    public init(
        cmpId: Int, cmpVersion: Int, publisherCountryCode: String,
        consentScreen: Int = 1, consentLanguage: String = "EN", numCustomPurposes: Int = 0,
        publisherRestrictions: [IABPublisherRestriction] = []
    ) {
        self.cmpId = cmpId
        self.cmpVersion = cmpVersion
        self.consentLanguage = consentLanguage
        self.publisherCountryCode = publisherCountryCode
        self.consentScreen = consentScreen
        self.numCustomPurposes = numCustomPurposes
        self.publisherRestrictions = publisherRestrictions
    }
}

/// A complete native draft. Omitted IDs are denied or have no LI signal.
/// Objections explicitly record withdrawn legitimate interests and cannot overlap LI.
public struct IABChoices: Sendable, Codable, Equatable {
    public var adTechProviderConsents: [Int]? = nil
    public var purposeConsents: [Int] = []
    public var purposeLegitimateInterests: [Int] = []
    public var purposeObjections: [Int] = []
    public var vendorConsents: [Int] = []
    public var vendorLegitimateInterests: [Int] = []
    public var vendorObjections: [Int] = []
    public var specialFeatureOptIns: [Int] = []
    public var publisherConsents: [Int] = []
    public var publisherLegitimateInterests: [Int] = []
    public var publisherCustomConsents: [Int] = []
    public var publisherCustomLegitimateInterests: [Int] = []
    public init() {}
}

/// One durable IAB decision. Native callers read this without crossing into JS.
public struct IABCommittedConsent: Sendable, Codable, Equatable {
    public let configuration: IABConfiguration
    public let choices: IABChoices
    public let subjectId: String
    public let externalId: String?
    public let fingerprint: String
    public let vendorListVersion: Int
    public let policyVersion: Int
    public let consentVersion: Int
    /// When the first decision in this chain was saved. Record only: the TC String's
    /// Created and LastUpdated both carry ``actionAt``'s UTC day.
    public let createdAt: Int64
    public let actionAt: Int64
    public let tcString: String
    public let disclosureID: String?
    public let addtlConsent: String?
    public let adTechProvidersID: String?
}

// Shared selection rules precede the existing codecs. A draft cannot invent IDs,
// claim a forbidden LI basis, or overwrite a different list's disclosure.
enum IABAuthority {
    static func disclosureID(_ gvl: GlobalVendorList) throws -> String {
        // Older unprefixed hashes bound only the typed projection, which may have lost disclosure fields.
        "gvl-v2:" + SHA256.hash(data: try C15tJSON.encode(gvl)).map { String(format: "%02x", $0) }.joined()
    }
    static let neverLI: Set<Int> = [1, 3, 4, 5, 6]
    static func build(
        configuration c: IABConfiguration, choices requested: IABChoices,
        gvl: GlobalVendorList, subjectId: String, externalId: String?,
        fingerprint: String, actionAt: Int64,
        previous: IABCommittedConsent?, additionalConsentList: AdditionalConsentList? = nil
    ) throws -> IABCommittedConsent {
        func require(_ condition: Bool) throws {
            if !condition {
                throw CoreErrorInfo(
                    code: "invalid-iab-choices",
                    message: "IAB configuration or choices do not match the disclosed list.")
            }
        }
        func ids(_ values: [Int], within allowed: Set<Int>) throws {
            try require(values.count == Set(values).count && Set(values).isSubset(of: allowed))
        }
        let providers = additionalConsentList?.providers ?? []
        let providerIDs = providers.map(\.id)
        try ids(requested.adTechProviderConsents ?? [], within: Set(providerIDs))
        let addtlConsent = providers.isEmpty ? nil : try AdditionalConsent.encode(
            consented: requested.adTechProviderConsents ?? [], disclosed: providerIDs,
            purposeConsents: requested.purposeConsents)
        let purposes = Set(gvl.purposes.keys.filter { (1...24).contains($0) })
        let vendors = Set(gvl.vendors.values.filter { $0.deletedDate?.isEmpty != false }.map(\.id))
        let features = Set(gvl.specialFeatures.keys.filter { (1...12).contains($0) })
        try require(
            (2...4095).contains(c.cmpId) && (0...4095).contains(c.cmpVersion)
                && (0...63).contains(c.consentScreen) && (0...63).contains(c.numCustomPurposes)
                && c.consentLanguage.count == 2
                && c.consentLanguage.utf8.allSatisfy { (65...90).contains($0) }
                && c.publisherCountryCode.count == 2
                && c.publisherCountryCode.utf8.allSatisfy { (65...90).contains($0) }
                && (1...65535).contains(gvl.vendorListVersion) && (2...63).contains(gvl.tcfPolicyVersion)
                && actionAt >= 0)
        try ids(requested.purposeConsents, within: purposes)
        try ids(requested.purposeLegitimateInterests, within: purposes.subtracting(neverLI))
        try ids(requested.purposeObjections, within: purposes.subtracting(neverLI))
        try ids(requested.vendorConsents, within: vendors)
        try ids(requested.vendorLegitimateInterests, within: vendors)
        try ids(requested.vendorObjections, within: vendors)
        try ids(requested.specialFeatureOptIns, within: features)
        try ids(requested.publisherConsents, within: purposes)
        try ids(requested.publisherLegitimateInterests, within: purposes.subtracting(neverLI))
        let custom = Set((0..<c.numCustomPurposes).map { $0 + 1 })
        try ids(requested.publisherCustomConsents, within: custom)
        try ids(requested.publisherCustomLegitimateInterests, within: custom)
        try require(
            Set(requested.purposeObjections).isDisjoint(with: requested.purposeLegitimateInterests)
                && Set(requested.vendorObjections).isDisjoint(with: requested.vendorLegitimateInterests))
        var restricted = Set<String>()
        for r in c.publisherRestrictions {
            try require(purposes.contains(r.purposeId) && (0...2).contains(r.type) && !r.vendorIds.isEmpty)
            try ids(r.vendorIds, within: vendors)
            for id in r.vendorIds {
                try require(restricted.insert("\(r.purposeId):\(id)").inserted)
                guard let vendor = gvl.vendor(id) else {
                    try require(false)
                    continue
                }
                if r.type == 0 {
                    try require(
                        vendor.purposes.contains(r.purposeId) || vendor.legIntPurposes.contains(r.purposeId))
                } else {
                    try require(vendor.flexiblePurposes.contains(r.purposeId))
                    try require(
                        r.type == 1
                            ? vendor.legIntPurposes.contains(r.purposeId)
                            : !neverLI.contains(r.purposeId) && vendor.purposes.contains(r.purposeId))
                }
            }
        }
        if let previous { try require(previous.consentVersion > 0 && previous.consentVersion < Int.max) }
        // `createdAt` keeps the first decision's time for the record. It never reaches the
        // string: TCF requires Created and LastUpdated to hold the same day, and the web build
        // sets both to the confirmation day (`packages/iab/src/tcf/tc-string.ts`).
        let createdAt = previous?.createdAt ?? actionAt
        try require(createdAt >= 0 && actionAt >= createdAt)
        let actionDay = Date(timeIntervalSince1970: Double(actionAt / 86_400_000 * 86_400))
        var model = TcConsentModel(
            created: actionDay, lastUpdated: actionDay,
            cmpId: c.cmpId, cmpVersion: c.cmpVersion, consentScreen: c.consentScreen,
            consentLanguage: c.consentLanguage, publisherCountryCode: c.publisherCountryCode, isServiceSpecific: true)
        model.purposeConsents = Set(requested.purposeConsents)
        model.purposeLegitimateInterests = Set(requested.purposeLegitimateInterests)
        model.vendorConsents = Set(requested.vendorConsents)
        model.vendorLegitimateInterests = Set(requested.vendorLegitimateInterests)
        model.specialFeatureOptIns = Set(requested.specialFeatureOptIns)
        model.vendorsDisclosed = vendors
        model.publisherConsents = Set(requested.publisherConsents)
        model.publisherLegitimateInterests = Set(requested.publisherLegitimateInterests)
        model.numCustomPurposes = c.numCustomPurposes
        model.publisherCustomConsents = Set(requested.publisherCustomConsents)
        model.publisherCustomLegitimateInterests = Set(requested.publisherCustomLegitimateInterests)
        var groups: [IABPublisherRestriction] = []
        for restriction in c.publisherRestrictions {
            if let index = groups.firstIndex(where: {
                $0.purposeId == restriction.purposeId && $0.type == restriction.type
            }) {
                groups[index].vendorIds += restriction.vendorIds
            } else {
                groups.append(restriction)
            }
        }
        model.publisherRestrictions = groups.map { restriction in
            var runs: [TcIDRun] = []
            for id in restriction.vendorIds.sorted() {
                if let last = runs.last, id == last.end + 1 {
                    runs[runs.count - 1] = TcIDRun(start: last.start, end: id, isRange: true)
                } else {
                    runs.append(TcIDRun(start: id, end: id, isRange: false))
                }
            }
            return TcPublisherRestriction(
                purposeId: restriction.purposeId,
                restrictionType: TcRestrictionType(rawValue: restriction.type)!, entries: runs)
        }
        let list = TcVendorList(gvl: gvl)
        let shaped = try TcStringEncoder.shape(
            model,
            vendorList: TcVendorList(
                language: c.consentLanguage,
                vendorListVersion: list.vendorListVersion, tcfPolicyVersion: list.tcfPolicyVersion,
                vendors: list.vendors))
        var choices = requested
        if !Set([1, 3, 4]).isSubset(of: Set(choices.purposeConsents)), choices.adTechProviderConsents != nil {
            choices.adTechProviderConsents = []
        }
        choices.adTechProviderConsents = choices.adTechProviderConsents?.sorted()
        choices.vendorConsents = shaped.vendorConsents.ids.sorted()
        choices.vendorLegitimateInterests = shaped.vendorLegitimateInterests.ids.sorted()
        guard case .encoded(let tcString) = TcStringEncoder.encode(shaped) else {
            throw CoreErrorInfo(code: "invalid-iab-choices", message: "Native TC encoding refused the draft.")
        }
        return IABCommittedConsent(
            configuration: c, choices: choices, subjectId: subjectId,
            externalId: externalId, fingerprint: fingerprint, vendorListVersion: gvl.vendorListVersion,
            policyVersion: gvl.tcfPolicyVersion, consentVersion: (previous?.consentVersion ?? 0) + 1,
            createdAt: createdAt, actionAt: actionAt, tcString: tcString, disclosureID: try disclosureID(gvl), addtlConsent: addtlConsent,
            adTechProvidersID: providers.isEmpty ? nil : additionalConsentList?.disclosureID)
    }

    /// Accept All, as `applyBlanket` in `packages/iab/src/index.ts`: a signal is positive only
    /// for what some vendor declares on that legal basis once publisher restrictions apply
    /// (TCF Policies 5(3), 5(6) and 5(8)). Listed ad tech providers add purposes 1, 3 and 4.
    /// Publisher purposes are never shown, so they stay unset, as on the web.
    static func accepting(
        _ gvl: GlobalVendorList, configuration: IABConfiguration, adTechProviders: [Int]? = nil
    ) -> IABChoices {
        let disclosures = gvl.activeVendors.sorted { $0.id < $1.id }
            .map { (id: $0.id, bases: configuration.disclosure(for: $0)) }
        let consent = Set(disclosures.flatMap(\.bases.consentPurposes))
            .union(adTechProviders?.isEmpty == false ? GlobalVendorList.adTechProviderPurposeIds : [])
        let interest = Set(disclosures.flatMap(\.bases.legitimateInterestPurposes))
        let purposeIds = gvl.purposes.keys.filter { (1...24).contains($0) }.sorted()
        var c = IABChoices()
        c.adTechProviderConsents = adTechProviders
        c.purposeConsents = purposeIds.filter(consent.contains)
        c.purposeLegitimateInterests = purposeIds.filter(interest.contains)
        c.vendorConsents = disclosures.filter { !$0.bases.consentPurposes.isEmpty }.map(\.id)
        c.vendorLegitimateInterests = disclosures.filter { !$0.bases.legitimateInterestPurposes.isEmpty }.map(\.id)
        c.specialFeatureOptIns = gvl.declaredSpecialFeatureIds()
        return c
    }
}

/// The legal basis a native vendor asks permission to use.
public enum IABLegalBasis: Sendable { case consent, legitimateInterest }

extension IABCommittedConsent {
    /// Evaluate the stored vectors and publisher restrictions against the disclosed vendor.
    /// Call through `ConsentCore.isIABAllowed` to include expiry and policy validity.
    func allows(vendorId: Int, purposeId: Int, basis: IABLegalBasis, gvl: GlobalVendorList) -> Bool {
        guard let vendor = gvl.vendor(vendorId), vendor.deletedDate?.isEmpty != false else { return false }
        switch basis {
        case .consent:
            return configuration.discloses(vendor, purposeId: purposeId, basis: .consent)
                && choices.purposeConsents.contains(purposeId) && choices.vendorConsents.contains(vendorId)
        case .legitimateInterest:
            return configuration.discloses(vendor, purposeId: purposeId, basis: .legitimateInterest)
                && choices.purposeLegitimateInterests.contains(purposeId) && choices.vendorLegitimateInterests.contains(vendorId)
                && !choices.purposeObjections.contains(purposeId) && !choices.vendorObjections.contains(vendorId)
        }
    }
}

extension IABCommittedConsent {
    func isCurrent(now: Int64, maxAge: Int64) -> Bool {
        now >= 0 && actionAt >= 0 && actionAt - now <= 600_000 && max(0, now - actionAt) < maxAge
    }
}

/// Compact list availability for native presenters. A cached list is usable only within its age limit.
public enum IABListAvailability: String, Sendable { case unavailable, missing, fresh, cached, offline, stale }

/// A small read that does not serialize or transfer the GVL.
public struct IABLifecycleStatus: Sendable {
    public let availability: IABListAvailability
    public let requiresConsent: Bool
    public let revision: Int
    public let vendorListVersion: Int?
    public let policyVersion: Int?
}

/// A native preferences session bound to the disclosure revision it opened on.
public struct IABDraft: Sendable {
    public let revision: Int
    public var choices: IABChoices
}
