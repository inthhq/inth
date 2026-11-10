import Foundation

/// Native types from the IAB CMP API in-app storage table.
public enum TcBusValue: Sendable, Equatable {
    case number(Int)
    case text(String)
}

/// IAB CMP API v2, "What is the CMP in-app internal structure for the defined API?".
/// Numbered publisher restrictions and Google's Additional Consent extension are included.
public enum TcStorageBusKeys {
    public static let cmpSdkID = "IABTCF_CmpSdkID"
    public static let cmpSdkVersion = "IABTCF_CmpSdkVersion"
    public static let policyVersion = "IABTCF_PolicyVersion"
    public static let gdprApplies = "IABTCF_gdprApplies"
    public static let publisherCC = "IABTCF_PublisherCC"
    public static let purposeOneTreatment = "IABTCF_PurposeOneTreatment"
    public static let useNonStandardTexts = "IABTCF_UseNonStandardTexts"
    public static let tcString = "IABTCF_TCString"
    public static let vendorConsents = "IABTCF_VendorConsents"
    public static let vendorLegitimateInterests = "IABTCF_VendorLegitimateInterests"
    public static let disclosedVendors = "IABTCF_DisclosedVendors"
    public static let purposeConsents = "IABTCF_PurposeConsents"
    public static let purposeLegitimateInterests = "IABTCF_PurposeLegitimateInterests"
    public static let specialFeaturesOptIns = "IABTCF_SpecialFeaturesOptIns"
    public static let publisherRestrictions = "IABTCF_PublisherRestrictions"
    public static let publisherConsent = "IABTCF_PublisherConsent"
    public static let publisherLegitimateInterests = "IABTCF_PublisherLegitimateInterests"
    public static let publisherCustomPurposesConsents = "IABTCF_PublisherCustomPurposesConsents"
    public static let publisherCustomPurposesLegitimateInterests = "IABTCF_PublisherCustomPurposesLegitimateInterests"
    public static let addtlConsent = "IABTCF_AddtlConsent"

    /// All owned keys, including every possible numbered purpose and the obsolete bare prefix.
    public static let allNames: [String] = [
        cmpSdkID,
        cmpSdkVersion,
        policyVersion,
        gdprApplies,
        publisherCC,
        purposeOneTreatment,
        useNonStandardTexts,
        tcString,
        vendorConsents,
        vendorLegitimateInterests,
        disclosedVendors,
        purposeConsents,
        purposeLegitimateInterests,
        specialFeaturesOptIns,
        publisherRestrictions,
        publisherConsent,
        publisherLegitimateInterests,
        publisherCustomPurposesConsents,
        publisherCustomPurposesLegitimateInterests,
        addtlConsent,
    ] + (1...63).map { publisherRestrictions + String($0) }
}

/// Egress only. Callers supply authority that the core has validated at the current time.
enum TcStorageBus {
    static func detection(_ configuration: IABConfiguration?) -> [String: TcBusValue] {
        guard let c = configuration, (2...4095).contains(c.cmpId), (0...4095).contains(c.cmpVersion) else { return [:] }
        return [TcStorageBusKeys.cmpSdkID: .number(c.cmpId),
                TcStorageBusKeys.cmpSdkVersion: .number(c.cmpVersion)]
    }

    static func values(for envelope: StoredEnvelope, configuration: IABConfiguration? = nil) -> [String: TcBusValue] {
        var values = detection(configuration)
        if let gvl = envelope.snapshot.iab?.gvl {
            values[TcStorageBusKeys.policyVersion] = .number(gvl.tcfPolicyVersion)
        }
        guard !envelope.snapshot.policyPending, envelope.snapshot.resolution.status == .matched else { return values }
        let isIAB: Bool
        if case let .resolved(resolved) = PolicyWireReader.read(envelope.policyResolution) {
            isIAB = resolved.policy.model == .iab
        } else { isIAB = false }
        values[TcStorageBusKeys.gdprApplies] = .number(isIAB ? 1 : 0)
        if isIAB, let saved = envelope.iabConsent {
            values.merge(decisionValues(saved)) { _, new in new }
        }
        return values
    }

    /// Derive every consent row from the exact TC bytes, including shaped vendor vectors.
    static func decisionValues(_ saved: IABCommittedConsent) -> [String: TcBusValue] {
        guard case let .decoded(tc) = TcStringWireReader.read(saved.tcString) else { return [:] }
        func bits(_ ids: Set<Int>, _ width: Int) -> TcBusValue {
            .text((0..<width).map { ids.contains($0 + 1) ? "1" : "0" }.joined())
        }
        func vector(_ v: TcIDVector) -> TcBusValue { bits(v.ids, v.declaredMaxId) }
        var values: [String: TcBusValue] = [
            TcStorageBusKeys.cmpSdkID: .number(tc.cmpId),
            TcStorageBusKeys.cmpSdkVersion: .number(tc.cmpVersion),
            TcStorageBusKeys.policyVersion: .number(tc.tcfPolicyVersion),
            TcStorageBusKeys.publisherCC: .text(tc.publisherCountryCode),
            TcStorageBusKeys.purposeOneTreatment: .number(tc.purposeOneTreatment ? 1 : 0),
            TcStorageBusKeys.useNonStandardTexts: .number(tc.useNonStandardTexts ? 1 : 0),
            TcStorageBusKeys.tcString: .text(saved.tcString),
            TcStorageBusKeys.vendorConsents: vector(tc.vendorConsents),
            TcStorageBusKeys.vendorLegitimateInterests: vector(tc.vendorLegitimateInterests),
            TcStorageBusKeys.purposeConsents: vector(tc.purposeConsents),
            TcStorageBusKeys.purposeLegitimateInterests: vector(tc.purposeLegitimateInterests),
            TcStorageBusKeys.specialFeaturesOptIns: vector(tc.specialFeatureOptIns),
        ]
        if let disclosed = tc.vendorsDisclosed { values[TcStorageBusKeys.disclosedVendors] = vector(disclosed) }
        if let publisher = tc.publisherSection {
            values[TcStorageBusKeys.publisherConsent] = vector(publisher.publisherConsents)
            values[TcStorageBusKeys.publisherLegitimateInterests] = vector(publisher.publisherLegitimateInterests)
            values[TcStorageBusKeys.publisherCustomPurposesConsents] = vector(publisher.publisherCustomConsents)
            values[TcStorageBusKeys.publisherCustomPurposesLegitimateInterests] = vector(publisher.publisherCustomLegitimateInterests)
        }
        // The IAB reference InAppTCData uses '_' for an unrestricted vendor.
        let width = tc.publisherRestrictions.flatMap { $0.vendorIds }.max() ?? 0
        for purpose in Set(tc.publisherRestrictions.map(\.purposeId)) {
            var row = Array(repeating: "_", count: width)
            for restriction in tc.publisherRestrictions where restriction.purposeId == purpose {
                for id in restriction.vendorIds { row[id - 1] = String(restriction.restrictionType.rawValue) }
            }
            values[TcStorageBusKeys.publisherRestrictions + String(purpose)] = .text(row.joined())
        }
        if let ac = saved.addtlConsent { values[TcStorageBusKeys.addtlConsent] = .text(ac) }
        return values
    }
}

/// Replace the entire owned table. Implementations serialize publications and never read
/// vendor values as consent. A failed mirror cannot undo an authoritative commit.
public protocol TcStorageBusWriting: Sendable {
    func write(_ values: [String: TcBusValue])
    func clear()
}

/// Standard UserDefaults is the vendor-readable bus. Tests use isolated suites.
/// TCString is removed first and published last, after associated values pass readback.
/// UserDefaults provides no multi-key reader transaction; consumers must observe TCString
/// changes and reread the associated values. This does not prove power-loss durability.
public final class UserDefaultsStorageBus: TcStorageBusWriting, @unchecked Sendable {
    private let defaults: UserDefaults
    private let lock = NSRecursiveLock()
    private let onWriteFailure: @Sendable () -> Void

    public init(defaults: UserDefaults? = nil, onWriteFailure: @escaping @Sendable () -> Void = {}) {
        self.defaults = defaults ?? .standard
        self.onWriteFailure = onWriteFailure
    }

    public func write(_ values: [String: TcBusValue]) {
        lock.lock()
        defer { lock.unlock() }
        // The GPP string is a marker too: a reader that sees it must find the rows it names.
        let markers = [TcStorageBusKeys.tcString, TcStorageBusKeys.addtlConsent, GPPStorageBusKeys.hdrGppString]
        for key in markers { defaults.removeObject(forKey: key) }
        guard markers.allSatisfy({ defaults.object(forKey: $0) == nil }) else {
            refusePublication(); return
        }
        for key in Self.ownedNames where !markers.contains(key) { set(values[key], key: key) }
        guard Self.ownedNames.filter({ !markers.contains($0) }).allSatisfy({ matches(values[$0], key: $0) }) else {
            refusePublication(); return
        }
        // AC can authorize providers independently, so it is also withheld until all rows agree.
        for key in markers.reversed() {
            set(values[key], key: key)
            guard matches(values[key], key: key) else { refusePublication(); return }
        }
    }

    private func set(_ value: TcBusValue?, key: String) {
        switch value {
        case .number(let n): defaults.set(n, forKey: key)
        case .text(let s): defaults.set(s, forKey: key)
        case nil: defaults.removeObject(forKey: key)
        }
    }
    private func matches(_ value: TcBusValue?, key: String) -> Bool {
        let actual = defaults.object(forKey: key)
        switch value {
        case .number(let n): return !(actual is String) && (actual as? NSNumber)?.intValue == n
        case .text(let s): return (actual as? String) == s
        case nil: return actual == nil
        }
    }
    /// The `IABTCF_*` table and the `IABGPP_*` table, replaced together.
    static let ownedNames = TcStorageBusKeys.allNames + GPPStorageBusKeys.allNames

    private func refusePublication() {
        for key in Self.ownedNames { defaults.removeObject(forKey: key) }
        onWriteFailure()
    }
    public func clear() { write([:]) }
}
