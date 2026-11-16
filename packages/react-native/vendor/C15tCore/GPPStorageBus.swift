import Foundation

/// The `IABGPP_*` in-app keys, from the GPP CMP API specification ("In-App Key Names")
/// and the IAB Europe TCF section's key table. Mirrors `GppStorageBusKeys` in Kotlin.
///
/// The CMP API defines the header keys, `IABGPP_GppSID` and `IABGPP_[SectionID]_String`.
/// The TCF EU section maps each `IABTCF_*` key to an `IABGPP_TCFEU2_*` key, with the TC
/// String at `IABGPP_2_TCString`. The two documents name the TC String's key differently,
/// so both are written. No document defines per-field keys for US National, so none are
/// written; a vendor reads the section from `IABGPP_7_String` or the full string.
public enum GPPStorageBusKeys {
    public static let hdrVersion = "IABGPP_HDR_Version"
    public static let hdrSections = "IABGPP_HDR_Sections"
    public static let hdrGppString = "IABGPP_HDR_GppString"
    public static let gppSID = "IABGPP_GppSID"
    public static let tcfEUTCString = "IABGPP_2_TCString"

    /// `IABGPP_[SectionID]_String`.
    public static func sectionString(_ sectionID: Int) -> String { "IABGPP_\(sectionID)_String" }

    /// `IABTCF_*` key to `IABGPP_TCFEU2_*` key, as the TCF EU section's table lists them.
    public static let tcfEUKeys: [String: String] = {
        var keys: [String: String] = [
            TcStorageBusKeys.cmpSdkID: "CmpSdkID",
            TcStorageBusKeys.cmpSdkVersion: "CmpSdkVersion",
            TcStorageBusKeys.policyVersion: "PolicyVersion",
            TcStorageBusKeys.gdprApplies: "gdprApplies",
            TcStorageBusKeys.publisherCC: "PublisherCC",
            TcStorageBusKeys.purposeOneTreatment: "PurposeOneTreatment",
            // The table still uses TCF 2.0's name for what TCF 2.2 calls UseNonStandardTexts.
            TcStorageBusKeys.useNonStandardTexts: "UseNonStandardStacks",
            TcStorageBusKeys.vendorConsents: "VendorConsents",
            TcStorageBusKeys.vendorLegitimateInterests: "VendorLegitimateInterests",
            TcStorageBusKeys.purposeConsents: "PurposeConsents",
            TcStorageBusKeys.purposeLegitimateInterests: "PurposeLegitimateInterests",
            TcStorageBusKeys.specialFeaturesOptIns: "SpecialFeaturesOptIns",
            TcStorageBusKeys.publisherConsent: "PublisherConsent",
            TcStorageBusKeys.publisherLegitimateInterests: "PublisherLegitimateInterests",
            TcStorageBusKeys.publisherCustomPurposesConsents: "PublisherCustomPurposesConsents",
            TcStorageBusKeys.publisherCustomPurposesLegitimateInterests: "PublisherCustomPurposesLegitimateInterests",
        ]
        for purpose in 1...63 {
            keys[TcStorageBusKeys.publisherRestrictions + String(purpose)] = "PublisherRestrictions\(purpose)"
        }
        return keys.mapValues { "IABGPP_TCFEU2_" + $0 }
    }()

    /// Every key this core owns, so a publication can remove the ones that no longer apply.
    public static let allNames: [String] = [
        hdrVersion,
        hdrSections,
        hdrGppString,
        gppSID,
        tcfEUTCString,
        sectionString(gppTCFEUSectionID),
        sectionString(GPPUSNational.id),
    ] + tcfEUKeys.values.sorted()
}

/// Egress only: the in-app projection of a ``GPPSignal``. Never read back as consent.
enum GPPStorageBus {
    /// The `IABGPP_*` rows for `signal`.
    ///
    /// Lists of IDs use the CMP API's in-app form, joined with `_`. The `IABGPP_TCFEU2_*`
    /// rows repeat the `IABTCF_*` values decoded from the same TC String, as the TCF EU
    /// section's table asks, and are written only when that TC String is the section.
    static func values(_ signal: GPPSignal?, iabConsent: IABCommittedConsent?) -> [String: TcBusValue] {
        guard let signal else { return [:] }
        let ids = signal.sectionIDs.map(String.init).joined(separator: "_")
        var values: [String: TcBusValue] = [
            GPPStorageBusKeys.hdrVersion: .text(String(GPPEncoder.headerVersion)),
            GPPStorageBusKeys.hdrSections: .text(ids),
            GPPStorageBusKeys.hdrGppString: .text(signal.gppString),
            GPPStorageBusKeys.gppSID: .text(ids),
        ]
        for section in signal.sections {
            values[GPPStorageBusKeys.sectionString(section.id)] = .text(section.encoded)
        }
        if let tcf = signal.sections.first(where: { $0.id == gppTCFEUSectionID }),
            let iabConsent, iabConsent.tcString == tcf.encoded {
            values[GPPStorageBusKeys.tcfEUTCString] = .text(tcf.encoded)
            if let key = GPPStorageBusKeys.tcfEUKeys[TcStorageBusKeys.gdprApplies] { values[key] = .number(1) }
            for (key, value) in TcStorageBus.decisionValues(iabConsent) {
                if let mapped = GPPStorageBusKeys.tcfEUKeys[key] { values[mapped] = value }
            }
        }
        return values
    }
}
