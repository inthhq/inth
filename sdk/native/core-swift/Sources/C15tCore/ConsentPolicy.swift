import CryptoKit
import Foundation

/// Actions a choice prompt offers. `accept` and `reject` are always offered.
public enum PolicyChoiceAction: String, Sendable, Codable, CaseIterable {
    case accept
    case reject
    case customize
}

/// A country and one of its regions, such as `CA` and `QC`.
public struct PolicyRegion: Sendable, Equatable {
    public var country: String
    public var region: String

    public init(country: String, region: String) {
        self.country = country
        self.region = region
    }
}

/// Where a rule applies, in the backend's `PolicyMatch` names.
///
/// Precedence follows the backend: region, then country, then `regionFallbacks` for a
/// country without a region, then the `fallback` rule for an unknown location, then the
/// `isDefault` rule.
public struct PolicyMatch: Sendable, Equatable {
    public var countries: [String]
    public var regions: [PolicyRegion]
    public var regionFallbacks: [String]
    public var fallback: Bool
    public var isDefault: Bool

    public init(
        countries: [String] = [], regions: [PolicyRegion] = [], regionFallbacks: [String] = [],
        fallback: Bool = false, isDefault: Bool = false
    ) {
        self.countries = countries
        self.regions = regions
        self.regionFallbacks = regionFallbacks
        self.fallback = fallback
        self.isDefault = isDefault
    }
}

/// How long a choice and a notice dismissal stay valid, in days. Defaults to 365.
///
/// Fractional days are allowed, as on the backend, and round to whole milliseconds.
public struct PolicyValidity: Sendable, Equatable {
    public var choiceDays: Double?
    public var noticeDays: Double?

    public init(choiceDays: Double? = nil, noticeDays: Double? = nil) {
        self.choiceDays = choiceDays
        self.noticeDays = noticeDays
    }
}

/// Categories an active Global Privacy Control signal denies.
public struct PolicyGpc: Sendable, Equatable {
    public var denyCategories: [OptionalConsentCategory]

    public init(denyCategories: [OptionalConsentCategory]) {
        self.denyCategories = denyCategories
    }
}

/// Privacy-signal handling, in the backend's `privacySignals` shape.
public struct PolicyPrivacySignals: Sendable, Equatable {
    public var gpc: PolicyGpc?

    public init(gpc: PolicyGpc? = nil) {
        self.gpc = gpc
    }
}

/// One rule of an in-code policy, in the backend's `PolicyRule` names.
///
/// `categories` `nil` means every optional category. `scopeMode` defaults to
/// `permissive`, as on the backend. The `iab` model is refused: IAB TCF needs a backend
/// to serve the Global Vendor List.
public struct PolicyRule: Sendable, Equatable {
    public var id: String
    public var match: PolicyMatch
    public var model: ConsentModel
    public var prompt: PolicyPrompt
    public var categories: [OptionalConsentCategory]?
    public var scopeMode: PolicyScopeMode?
    public var preselectedCategories: [OptionalConsentCategory]
    public var actions: [PolicyChoiceAction]?
    public var validity: PolicyValidity?
    public var privacySignals: PolicyPrivacySignals?
    public var copyRevision: String?

    public init(
        id: String, match: PolicyMatch, model: ConsentModel, prompt: PolicyPrompt,
        categories: [OptionalConsentCategory]? = nil, scopeMode: PolicyScopeMode? = nil,
        preselectedCategories: [OptionalConsentCategory] = [], actions: [PolicyChoiceAction]? = nil,
        validity: PolicyValidity? = nil, privacySignals: PolicyPrivacySignals? = nil,
        copyRevision: String? = nil
    ) {
        self.id = id
        self.match = match
        self.model = model
        self.prompt = prompt
        self.categories = categories
        self.scopeMode = scopeMode
        self.preselectedCategories = preselectedCategories
        self.actions = actions
        self.validity = validity
        self.privacySignals = privacySignals
        self.copyRevision = copyRevision
    }
}

/// Why a ``ConsentPolicy`` was refused.
public struct ConsentPolicyError: Error, Equatable, CustomStringConvertible {
    public let message: String
    public var description: String { message }

    public init(_ message: String) { self.message = message }
}

/// A policy kept in source control: the only policy source in no-backend mode.
///
/// Pass it as `CoreConfig.policy` with ``OfflineTransport`` or no transport. The device
/// has no geolocation without a backend, so the `fallback` rule applies unless the app
/// sets `overrides` country and region itself. Records stay on the device.
///
/// Rules are checked with the backend's authoring rules (`inspectPolicyRules` in
/// `@c15t/schema`), plus three no-backend limits: no `iab` model, a rule for an unknown
/// location, and a validity of at least one millisecond.
public struct ConsentPolicy: Sendable, Equatable {
    public let rules: [PolicyRule]
    private let packs: [JSONValue]

    /// - Throws: ``ConsentPolicyError`` when the policy breaks any of those rules.
    public init(rules: [PolicyRule]) throws {
        guard !rules.isEmpty else { throw ConsentPolicyError("ConsentPolicy needs at least one rule") }
        for rule in rules { try Self.validate(rule) }
        var seen = Set<String>()
        for id in rules.map({ $0.id.trimmingCharacters(in: .whitespacesAndNewlines) }) {
            guard seen.insert(id).inserted else {
                throw ConsentPolicyError("ConsentPolicy rule ids must be unique; '\(id)' repeats")
            }
        }
        guard rules.filter({ $0.match.isDefault }).count <= 1 else {
            throw ConsentPolicyError("ConsentPolicy allows only one isDefault rule")
        }
        guard rules.filter({ $0.match.fallback }).count <= 1 else {
            throw ConsentPolicyError("ConsentPolicy allows only one fallback rule")
        }
        var packs: [JSONValue] = []
        for rule in rules {
            let wire = Self.wire(rule)
            guard case .resolved = PolicyWireReader.read(wire) else {
                throw ConsentPolicyError("Policy '\(rule.id)' is invalid")
            }
            packs.append(.object(["match": Self.matchJSON(rule.match), "policyResolution": wire]))
        }
        guard BundledPolicyResource.match(packs, country: nil, region: nil) != nil else {
            throw ConsentPolicyError("ConsentPolicy needs a fallback or isDefault rule for an unknown location")
        }
        self.rules = rules
        self.packs = packs
    }

    /// Read rules written in the backend's JSON shape: `{"rules": [...]}` or a bare
    /// array. `review` is ignored, as the backend never hashes it.
    ///
    /// - Throws: ``ConsentPolicyError`` for anything the backend would refuse, and for
    ///   the fields no-backend mode does not support.
    public init(json: Data) throws {
        guard let root = C15tJSON.parse(json) else { throw ConsentPolicyError("The policy file is not JSON") }
        let list: [JSONValue]
        if let array = root.arrayValue {
            list = array
        } else if let object = root.objectValue, Set(object.keys) == ["rules"], let array = object["rules"]?.arrayValue {
            list = array
        } else {
            throw ConsentPolicyError("A policy file holds only \"rules\"")
        }
        try self.init(rules: list.enumerated().map { try JSONRuleReader(value: $0.element, index: $0.offset).read() })
    }

    public static func == (left: ConsentPolicy, right: ConsentPolicy) -> Bool {
        left.rules == right.rules
    }

    /// The id of the rule for a location and how it matched, as the backend reports it.
    func match(country: String?, region: String?) -> (String, String)? {
        BundledPolicyResource.match(packs, country: country, region: region).map {
            (rules[$0.0].id.trimmingCharacters(in: .whitespacesAndNewlines), $0.1)
        }
    }

    /// The backend's outcome for a location.
    func outcome(country: String?, region: String?) -> BundledPolicyResource.MatchOutcome {
        BundledPolicyResource.matchOutcome(packs, country: country, region: region)
    }

    /// The rule for a location, as an `/init` answer. A location no rule covers gets the
    /// backend's `no-match` or `insufficient-inputs` outcome, never silence, so the core
    /// does not keep an earlier rule in force by default.
    func resolve(overrides: ConsentOverrides) -> InitResponse {
        let selected = self.outcome(country: overrides.country, region: overrides.region)
        var policyResolution = BundledPolicyResource.unmatchedWire(selected)
        if case let .matched(index, matchedBy) = selected, var wire = packs[index]["policyResolution"]?.objectValue {
            wire["matchedBy"] = .string(matchedBy)
            policyResolution = .object(wire)
        }
        return InitResponse(
            policyResolution: policyResolution,
            location: LocationContext(countryCode: overrides.country, regionCode: overrides.region))
    }

    // MARK: - Validating

    private static let dayMs: Double = 86_400_000
    private static let defaultValidityDays: Double = 365
    /// `Number.MAX_SAFE_INTEGER`, the backend's ceiling for a validity in milliseconds.
    private static let maxSafeMs: Double = 9_007_199_254_740_991

    private static func millis(_ days: Double?) -> Int64 {
        Int64(((days ?? defaultValidityDays) * dayMs).rounded(.toNearestOrAwayFromZero))
    }

    private static func optionalNames(_ values: [OptionalConsentCategory]) -> [String] {
        Array(Set(values.map(\.rawValue))).sorted()
    }

    private static func scope(of rule: PolicyRule) -> [String] {
        let declared = optionalNames(rule.categories ?? [])
        return declared.isEmpty ? optionalNames(OptionalConsentCategory.ordered) : declared
    }

    /// The authoring rules `inspectPolicyRules` in `@c15t/schema` checks, plus the no-backend limits.
    private static func validate(_ rule: PolicyRule) throws {
        let label = "Policy '\(rule.id)'"
        func require(_ condition: Bool, _ message: @autoclosure () -> String) throws {
            if !condition { throw ConsentPolicyError(message()) }
        }
        try require(!rule.id.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, "ConsentPolicy rule ids must not be blank")
        try require(rule.model != .iab, "\(label): the iab model needs a backend to serve the Global Vendor List")
        let prompts: [PolicyPrompt]
        switch rule.model {
        case .optIn, .iab: prompts = [.choice]
        case .optOut: prompts = [.choice, .notice, .none]
        case .none: prompts = [.none]
        }
        try require(prompts.contains(rule.prompt),
            "\(label): the \(rule.model.rawValue) model cannot use a \(rule.prompt.rawValue) prompt")
        if let actions = rule.actions {
            try require(rule.prompt == .choice, "\(label): actions belong to a choice prompt")
            try require(actions.contains(.accept) && actions.contains(.reject), "\(label): actions must include accept and reject")
        }
        let match = rule.match
        try require(match.isDefault || match.fallback || !match.countries.isEmpty || !match.regions.isEmpty
            || !match.regionFallbacks.isEmpty,
            "\(label) has no matcher. Add countries or regions, or set fallback or isDefault")
        let blank = { (value: String) in value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        try require(!(match.countries + match.regionFallbacks).contains(where: blank)
            && !match.regions.contains { blank($0.country) || blank($0.region) },
            "\(label): match countries and regions must be non-empty codes")
        for days in [rule.validity?.choiceDays, rule.validity?.noticeDays].compactMap({ $0 }) {
            try require(days.isFinite && days > 0 && days * dayMs <= maxSafeMs,
                "\(label): validity must be a finite number of days greater than zero")
            try require((days * dayMs).rounded(.toNearestOrAwayFromZero) >= 1,
                "\(label): validity must be at least one millisecond")
        }
        let partial = optionalNames(rule.categories ?? [])
        try require(partial.isEmpty || partial.count == OptionalConsentCategory.allCases.count || rule.scopeMode != nil,
            "\(label): a partial category scope needs a scopeMode")
        let inScope = Set(scope(of: rule))
        let preselected = optionalNames(rule.preselectedCategories)
        try require(preselected.isEmpty || rule.model != .none, "\(label): the none model preselects nothing")
        try require(preselected.allSatisfy(inScope.contains), "\(label): preselectedCategories must be inside categories")
        let deny = rule.privacySignals?.gpc?.denyCategories ?? []
        try require(Set(deny).count == deny.count, "\(label): privacySignals.gpc.denyCategories repeats a category")
        try require(optionalNames(deny).allSatisfy(inScope.contains),
            "\(label): privacySignals.gpc.denyCategories must be inside categories")
    }

    // MARK: - Normalizing

    private static func strings(_ values: [String]) -> JSONValue { .array(values.map(JSONValue.string)) }

    private static func matchJSON(_ match: PolicyMatch) -> JSONValue {
        var fields: [String: JSONValue] = [:]
        if !match.countries.isEmpty { fields["countries"] = strings(match.countries) }
        if !match.regions.isEmpty {
            fields["regions"] = .array(match.regions.map {
                .object(["country": .string($0.country), "region": .string($0.region)])
            })
        }
        if !match.regionFallbacks.isEmpty { fields["regionFallbacks"] = strings(match.regionFallbacks) }
        if match.fallback { fields["fallback"] = .bool(true) }
        if match.isDefault { fields["isDefault"] = .bool(true) }
        return .object(fields)
    }

    /// The canonical rule `normalizePolicyRule` in `@c15t/schema` produces.
    static func normalize(_ rule: PolicyRule) -> JSONValue {
        let allowed: [String]
        let equivalent: [[String]]
        let required: [String]
        switch rule.prompt {
        case .choice:
            let configured = rule.actions?.map(\.rawValue) ?? ["accept", "reject", "customize"]
            allowed = Array(Set(configured + ["accept", "reject"])).sorted()
            equivalent = [["accept", "reject"]]
            required = ["accept", "reject"]
        case .notice:
            allowed = ["dismiss"]
            equivalent = []
            required = ["dismiss"]
        case .none:
            allowed = []
            equivalent = []
            required = []
        }
        let rights: [String]
        switch rule.model {
        case .none: rights = []
        case .optOut: rights = ["disclosure", "opt-out", "preferences"]
        case .optIn, .iab: rights = ["disclosure", "preferences"]
        }
        let preselected = rule.model == .none ? [] : optionalNames(rule.preselectedCategories)
        let copyRevision = rule.copyRevision?.trimmingCharacters(in: .whitespacesAndNewlines)
        return .object([
            "actions": .object([
                "allowed": strings(allowed),
                "equivalent": .array(equivalent.map(strings)),
                "required": strings(required),
            ]),
            "copyRevision": copyRevision.flatMap { $0.isEmpty ? nil : JSONValue.string($0) } ?? .null,
            "id": .string(rule.id.trimmingCharacters(in: .whitespacesAndNewlines)),
            "model": .string(rule.model.rawValue),
            "preselectedCategories": strings(preselected),
            "privacySignals": .object([
                "gpc": .object(["denyCategories": strings(optionalNames(rule.privacySignals?.gpc?.denyCategories ?? []))]),
            ]),
            "prompt": .string(rule.prompt.rawValue),
            "proof": .object(["storeIp": .bool(false), "storeLanguage": .bool(false), "storeUserAgent": .bool(false)]),
            "rights": strings(rights),
            "scope": strings(scope(of: rule)),
            "scopeMode": .string((rule.scopeMode ?? .permissive).rawValue),
            "validity": .object([
                "choiceMs": .integer(millis(rule.validity?.choiceDays)),
                "noticeMs": .integer(millis(rule.validity?.noticeDays)),
            ]),
        ])
    }

    /// The inputs `policyFingerprintInput`, `choicePromptFingerprintInput` and
    /// `noticePromptFingerprintInput` in `@c15t/schema` hash. The choice prompt hashes
    /// only the choice validity and the notice prompt only the notice validity, so a
    /// change to one never asks again for the other.
    static func fingerprintInputs(_ rule: PolicyRule) -> [String: JSONValue] {
        let policy = normalize(rule).objectValue ?? [:]
        let validity = policy["validity"]?.objectValue ?? [:]
        func field(_ key: String) -> JSONValue { policy[key] ?? .null }
        func prompt(_ domain: String, _ validityMs: JSONValue?) -> JSONValue {
            .object([
                "copyRevision": field("copyRevision"),
                "domain": .string(domain),
                "model": field("model"),
                "privacySignals": field("privacySignals"),
                "prompt": field("prompt"),
                "requiredActions": field("actions")["required"] ?? .array([]),
                "rights": field("rights"),
                "scope": field("scope"),
                "scopeMode": field("scopeMode"),
                "validityMs": validityMs ?? .null,
                "version": .integer(1),
            ])
        }
        return [
            "choice": prompt("choice", validity["choiceMs"]),
            "notice": prompt("notice", validity["noticeMs"]),
            "policy": .object([
                "actions": field("actions"),
                "copyRevision": field("copyRevision"),
                "domain": .string("policy"),
                "model": field("model"),
                "preselectedCategories": field("preselectedCategories"),
                "privacySignals": field("privacySignals"),
                "prompt": field("prompt"),
                "proof": field("proof"),
                "rights": field("rights"),
                "scope": field("scope"),
                "scopeMode": field("scopeMode"),
                "validity": field("validity"),
                "version": .integer(1),
            ]),
        ]
    }

    /// The rule as a matched wire. Fingerprints hash the backend's fingerprint inputs on
    /// the device: they never leave it in no-backend mode, so the encoding stays local.
    private static func wire(_ rule: PolicyRule) -> JSONValue {
        let inputs = fingerprintInputs(rule)
        func hash(_ domain: String) -> String {
            let data = inputs[domain].flatMap { C15tJSON.encode($0) } ?? Data()
            return SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
        }
        return .object([
            "fingerprints": .object([
                "choice": .string(hash("choice")),
                "notice": .string(hash("notice")),
                "policy": .string(hash("policy")),
            ]),
            "matchedBy": .string("default"),
            "policy": normalize(rule),
            "policyId": .string(rule.id.trimmingCharacters(in: .whitespacesAndNewlines)),
            "status": .string("matched"),
            "version": .integer(1),
        ])
    }
}

/// Reads one rule in the backend's JSON shape, refusing every field and value
/// `inspectPolicyRules` in `@c15t/schema` refuses rather than guessing.
private struct JSONRuleReader {
    private static let ruleKeys: Set<String> = [
        "id", "match", "model", "prompt", "categories", "scopeMode", "preselectedCategories",
        "actions", "validity", "privacySignals", "copyRevision", "review",
    ]
    private static let matchKeys: Set<String> = ["countries", "regions", "regionFallbacks", "fallback", "isDefault"]
    private static let reviewKeys: Set<String> = ["status", "reviewedOn", "reviewBy", "sources", "assumptions"]

    let object: [String: JSONValue]
    let id: String
    var label: String { "Policy '\(id)'" }

    init(value: JSONValue, index: Int) throws {
        guard let object = value.objectValue else { throw ConsentPolicyError("Policy at index \(index) must be an object") }
        guard let id = object["id"]?.stringValue else {
            throw ConsentPolicyError("Policy at index \(index) is missing a non-empty id")
        }
        self.object = object
        self.id = id
    }

    private func keys(_ value: [String: JSONValue], _ allowed: Set<String>, _ place: String) throws {
        if let unknown = Set(value.keys).subtracting(allowed).sorted().first {
            throw ConsentPolicyError("\(label): \(place) has unsupported field '\(unknown)'")
        }
    }

    private func string(_ value: JSONValue?, _ place: String) throws -> String {
        guard let text = value?.stringValue else { throw ConsentPolicyError("\(label): \(place) must be a string") }
        return text
    }

    private func strings(_ value: JSONValue?, _ place: String) throws -> [String] {
        guard let items = value?.arrayValue else { throw ConsentPolicyError("\(label): \(place) must be a list of strings") }
        return try items.map { try string($0, place) }
    }

    private func fields(_ value: JSONValue?, _ place: String) throws -> [String: JSONValue] {
        guard let fields = value?.objectValue else { throw ConsentPolicyError("\(label): \(place) must be an object") }
        return fields
    }

    private func boolean(_ value: JSONValue?, _ place: String) throws -> Bool {
        guard let value else { return false }
        guard let flag = value.boolValue else { throw ConsentPolicyError("\(label): \(place) must be true or false") }
        return flag
    }

    /// Category names, with `necessary` kept so the validator can refuse it where the backend does.
    private func categories(_ value: JSONValue?, _ place: String) throws -> (optional: [OptionalConsentCategory], necessary: Bool) {
        var optional: [OptionalConsentCategory] = []
        var necessary = false
        for raw in try strings(value, place) {
            let name = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            if name == "necessary" {
                necessary = true
            } else if let category = OptionalConsentCategory(rawValue: name) {
                optional.append(category)
            } else {
                throw ConsentPolicyError("\(label): \(place) has unknown category '\(name)'")
            }
        }
        return (optional, necessary)
    }

    /// `gpc.denyCategories` takes exact names: the backend neither trims nor allows a wildcard there.
    private func exactCategories(_ value: JSONValue?, _ place: String) throws -> [OptionalConsentCategory] {
        try strings(value, place).map { name in
            if name == "necessary" { throw ConsentPolicyError("\(label): privacySignals.gpc cannot deny necessary") }
            guard let category = OptionalConsentCategory(rawValue: name) else {
                throw ConsentPolicyError("\(label): \(place) has unknown category '\(name)'")
            }
            return category
        }
    }

    /// `review` is documentation only, but the backend checks its shape, so this does too.
    private func review(_ value: JSONValue) throws {
        let review = try fields(value, "review")
        try keys(review, Self.reviewKeys, "review")
        let status = review["status"]?.stringValue
        guard status == "pending" || status == "reviewed" else {
            throw ConsentPolicyError("\(label): review.status must be pending or reviewed")
        }
        if let value = review["reviewedOn"] { _ = try string(value, "review.reviewedOn") }
        if let value = review["reviewBy"] { _ = try string(value, "review.reviewBy") }
        if let value = review["sources"] { _ = try strings(value, "review.sources") }
        if let value = review["assumptions"] { _ = try strings(value, "review.assumptions") }
    }

    private func days(_ value: JSONValue?, _ place: String) throws -> Double? {
        switch value {
        case nil: return nil
        case let .integer(whole)?: return Double(whole)
        case let .number(fraction)?: return fraction
        default: throw ConsentPolicyError("\(label): \(place) must be a number of days")
        }
    }

    func read() throws -> PolicyRule {
        try keys(object, Self.ruleKeys, "the rule")
        if let value = object["review"] { try review(value) }
        let match = try fields(object["match"], "match")
        try keys(match, Self.matchKeys, "match")
        let model = try string(object["model"], "model")
        guard let parsedModel = ConsentModel(rawValue: model) else { throw ConsentPolicyError("\(label): unknown model") }
        // The backend refuses the field itself, even empty, under a model that preselects nothing.
        if parsedModel == .none, object["preselectedCategories"] != nil {
            throw ConsentPolicyError("\(label): the none model takes no preselectedCategories")
        }
        let prompt = try string(object["prompt"], "prompt")
        guard let parsedPrompt = PolicyPrompt(rawValue: prompt) else { throw ConsentPolicyError("\(label): unknown prompt") }
        var scope: [OptionalConsentCategory]?
        if let value = object["categories"] {
            let names = try strings(value, "categories")
            let isWildcard = { (name: String) in name.trimmingCharacters(in: .whitespacesAndNewlines) == "*" }
            // Every entry beside a wildcard is still checked, as on the backend.
            let named = try categories(.array(names.filter { !isWildcard($0) }.map(JSONValue.string)), "categories")
            if !names.contains(where: isWildcard) { scope = named.optional }
        }
        var scopeMode: PolicyScopeMode?
        if let value = object["scopeMode"] {
            guard let mode = PolicyScopeMode(rawValue: try string(value, "scopeMode")) else {
                throw ConsentPolicyError("\(label): unknown scopeMode")
            }
            scopeMode = mode
        }
        var actions: [PolicyChoiceAction]?
        if let value = object["actions"] {
            actions = try strings(value, "actions").map { name in
                guard let action = PolicyChoiceAction(rawValue: name) else {
                    throw ConsentPolicyError("\(label): unknown action '\(name)'")
                }
                return action
            }
        }
        var validity: PolicyValidity?
        if let value = object["validity"] {
            let validityFields = try fields(value, "validity")
            try keys(validityFields, ["choiceDays", "noticeDays"], "validity")
            validity = PolicyValidity(
                choiceDays: try days(validityFields["choiceDays"], "validity.choiceDays"),
                noticeDays: try days(validityFields["noticeDays"], "validity.noticeDays"))
        }
        var privacySignals: PolicyPrivacySignals?
        if let value = object["privacySignals"] {
            let signals = try fields(value, "privacySignals")
            try keys(signals, ["gpc"], "privacySignals")
            var gpc: PolicyGpc?
            if let gpcValue = signals["gpc"] {
                let gpcFields = try fields(gpcValue, "privacySignals.gpc")
                try keys(gpcFields, ["denyCategories"], "privacySignals.gpc")
                gpc = PolicyGpc(denyCategories: try exactCategories(
                    gpcFields["denyCategories"], "privacySignals.gpc.denyCategories"))
            }
            privacySignals = PolicyPrivacySignals(gpc: gpc)
        }
        var regions: [PolicyRegion] = []
        if let value = match["regions"] {
            guard let items = value.arrayValue else { throw ConsentPolicyError("\(label): match.regions must be a list") }
            regions = try items.map { item in
                let region = try fields(item, "match.regions[]")
                try keys(region, ["country", "region"], "match.regions[]")
                return PolicyRegion(
                    country: try string(region["country"], "match.regions[].country"),
                    region: try string(region["region"], "match.regions[].region"))
            }
        }
        var copyRevision: String?
        if let value = object["copyRevision"] { copyRevision = try string(value, "copyRevision") }
        let preselected = try object["preselectedCategories"].map { try categories($0, "preselectedCategories").optional } ?? []
        return PolicyRule(
            id: id,
            match: PolicyMatch(
                countries: try match["countries"].map { try strings($0, "match.countries") } ?? [],
                regions: regions,
                regionFallbacks: try match["regionFallbacks"].map { try strings($0, "match.regionFallbacks") } ?? [],
                fallback: try boolean(match["fallback"], "match.fallback"),
                isDefault: try boolean(match["isDefault"], "match.isDefault")),
            model: parsedModel,
            prompt: parsedPrompt,
            categories: scope,
            scopeMode: scopeMode,
            preselectedCategories: preselected,
            actions: actions,
            validity: validity,
            privacySignals: privacySignals,
            copyRevision: copyRevision)
    }
}
