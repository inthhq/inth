import Foundation

/// MSPA mode for covered transactions: `GPPMspaMode` in `@c15t/iab/gpp`. Leave it unset
/// unless the publisher signed the IAB Multi-State Privacy Agreement.
public enum GPPMspaMode: String, Sendable, Codable, Equatable {
    /// The publisher offers the opt-outs itself.
    case optOutOption = "opt-out-option"
    /// The publisher neither sells nor shares personal data nor uses it for targeted
    /// advertising, so the opt-outs and their notices are reported as not applicable.
    case serviceProvider = "service-provider"
}

/// Turns GPP on, with the options web c15t's `gpp` option takes that apply on a device.
///
/// GPP is off while ``CoreConfig/gpp`` is `nil`, as it is on web until an app renders
/// `ConsentGPP` or sets `gpp: true`. The notice fields a US section reports are the app's
/// attestation that it shows those notices, so the SDK does not make that claim on its own.
public struct GPPOptions: Sendable, Equatable {
    /// MSPA mode. `nil` reports the transaction as not covered.
    public let mspaMode: GPPMspaMode?
    /// Categories whose refusal opts the visitor out of sale, sharing and targeted advertising.
    public let optOutCategories: [ConsentCategory]
    /// Include the TCF EU section, the committed TC String, under an `iab` rule.
    public let tcf: Bool

    public init(
        mspaMode: GPPMspaMode? = nil,
        optOutCategories: [ConsentCategory] = [.marketing],
        tcf: Bool = true
    ) {
        self.mspaMode = mspaMode
        self.optOutCategories = optOutCategories
        self.tcf = tcf
    }
}

/// The GPP sections that apply to a snapshot, and the string that carries them.
public struct GPPSignal: Sendable, Equatable {
    public let sections: [GPPSection]
    /// The full GPP string, header first.
    public let gppString: String
    /// Section IDs in force, ascending: `applicableSections` on web, `IABGPP_GppSID` in app.
    public var sectionIDs: [Int] { sections.map(\.id).sorted() }

    init?(sections: [GPPSection]) {
        guard let encoded = try? GPPEncoder.encodeGPPString(sections) else { return nil }
        self.sections = sections
        self.gppString = encoded
    }
}

/// Decides which GPP sections apply and fills them: `resolveUSSectionDefinition` and
/// `resolveUSSectionValues` in `packages/sdk/iab/src/gpp/us-section.ts`, restricted to the
/// sections a device encodes (US National and TCF EU). Mirrors `GppResolver.kt`.
///
/// The policy decides first. Nothing applies until a matched policy is resolved and the
/// snapshot is ready. An `iab` rule gets the TCF EU section once a TC String is committed.
/// Any other rule gets US National when it gives the visitor a way to opt out (the
/// `preferences` or `opt-out` right) and the visitor's country is `US`.
package enum GPPResolver {
    private static let generalNotices: Set<String> = ["SharingNotice"]
    private static let optOutNotices: Set<String> = [
        "SaleOptOutNotice", "SharingOptOutNotice", "TargetedAdvertisingOptOutNotice",
    ]
    private static let optOuts: Set<String> = ["SaleOptOut", "SharingOptOut", "TargetedAdvertisingOptOut"]

    /// The GPP signal for `snapshot`, or `nil` when GPP is off or no section applies.
    ///
    /// - Parameters:
    ///   - policy: The matched rule the snapshot was evaluated under.
    ///   - tcString: The committed TC String, only while it is valid.
    ///   - options: GPP options, `nil` when the app has not turned GPP on.
    package static func resolve(
        _ snapshot: ConsentSnapshot,
        policy: EvaluationPolicy?,
        tcString: String?,
        options: GPPOptions?
    ) -> GPPSignal? {
        guard let options, let policy, snapshot.ready, !snapshot.policyPending,
            snapshot.resolution.status == .matched
        else { return nil }
        var sections: [GPPSection] = []
        if policy.model == .iab {
            if options.tcf, let tcString, !tcString.isEmpty {
                sections.append(GPPSection(id: gppTCFEUSectionID, encoded: tcString))
            }
        } else if country(snapshot) == "US",
            policy.rights.contains(.preferences) || policy.rights.contains(.optOut) {
            guard let encoded = try? GPPEncoder.encodeUSNational(
                core: usNationalValues(snapshot, policy: policy, options: options),
                gpc: snapshot.privacySignals.gpc.active
            ) else { return nil }
            sections.append(GPPSection(id: GPPUSNational.id, encoded: encoded))
        }
        return sections.isEmpty ? nil : GPPSignal(sections: sections)
    }

    /// The visitor's country: the app's override, else the backend's location.
    static func country(_ snapshot: ConsentSnapshot) -> String? {
        (snapshot.overrides.country ?? snapshot.location?.countryCode)?.uppercased()
    }

    /// US National core values. Sensitive data, known-child and personal data consents
    /// are `0` (not applicable): no c15t category describes them.
    package static func usNationalValues(
        _ snapshot: ConsentSnapshot,
        policy: EvaluationPolicy,
        options: GPPOptions
    ) -> [String: [Int]] {
        let disclosed = policy.rights.contains(.disclosure)
        let optedOut = options.optOutCategories.contains { !snapshot.effectivePermissions.value(for: $0) }
        let covered = options.mspaMode != nil
        let serviceProvider = options.mspaMode == .serviceProvider
        func yesNo(_ value: Bool) -> Int { value ? 1 : 2 }
        var values: [String: [Int]] = [:]
        for field in GPPUSNational.core {
            let name = field.name
            if let count = field.count {
                values[name] = Array(repeating: 0, count: count)
            } else if name == "Version" {
                values[name] = [GPPUSNational.version]
            } else if generalNotices.contains(name) {
                values[name] = [yesNo(disclosed)]
            } else if optOutNotices.contains(name) {
                values[name] = [serviceProvider ? 0 : 1]
            } else if optOuts.contains(name) {
                values[name] = [serviceProvider ? 0 : yesNo(optedOut)]
            } else if name == "MspaCoveredTransaction" {
                values[name] = [yesNo(covered)]
            } else if name == "MspaOptOutOptionMode" {
                values[name] = [covered ? yesNo(options.mspaMode == .optOutOption) : 0]
            } else if name == "MspaServiceProviderMode" {
                values[name] = [covered ? yesNo(serviceProvider) : 0]
            } else {
                values[name] = [0]
            }
        }
        return values
    }
}
