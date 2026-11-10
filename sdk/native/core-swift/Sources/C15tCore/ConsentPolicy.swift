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
public struct PolicyValidity: Sendable, Equatable {
    public var choiceDays: Int?
    public var noticeDays: Int?

    public init(choiceDays: Int? = nil, noticeDays: Int? = nil) {
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

    init(_ message: String) { self.message = message }
}

/// A policy kept in source control: the only policy source in no-backend mode.
///
/// Pass it as `CoreConfig.policy` with ``OfflineTransport`` or no transport. The device
/// has no geolocation without a backend, so the `fallback` rule applies unless the app
/// sets `overrides` country and region itself. Records stay on the device.
public struct ConsentPolicy: Sendable, Equatable {
    public let rules: [PolicyRule]
    private let packs: [JSONValue]

    /// - Throws: ``ConsentPolicyError`` when a rule is invalid, an id repeats, a rule
    ///   uses the `iab` model, or no rule covers an unknown location.
    public init(rules: [PolicyRule]) throws {
        guard !rules.isEmpty else { throw ConsentPolicyError("ConsentPolicy needs at least one rule") }
        let ids = rules.map { $0.id.trimmingCharacters(in: .whitespacesAndNewlines) }
        guard Set(ids).count == rules.count else { throw ConsentPolicyError("ConsentPolicy rule ids must be unique") }
        var packs: [JSONValue] = []
        for rule in rules {
            try Self.validate(rule)
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
        try self.init(rules: list.map(Self.readRule))
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

    /// The rule for a location, as an `/init` answer.
    func resolve(overrides: ConsentOverrides) -> InitResponse? {
        guard let selected = BundledPolicyResource.match(packs, country: overrides.country, region: overrides.region),
            var wire = packs[selected.0]["policyResolution"]?.objectValue
        else { return nil }
        wire["matchedBy"] = .string(selected.1)
        return InitResponse(
            policyResolution: .object(wire),
            location: LocationContext(countryCode: overrides.country, regionCode: overrides.region))
    }

    // MARK: - Reading the backend's JSON shape

    private static let ruleKeys: Set<String> = [
        "id", "match", "model", "prompt", "categories", "scopeMode", "preselectedCategories",
        "actions", "validity", "privacySignals", "copyRevision", "review",
    ]

    private static func readRule(_ value: JSONValue) throws -> PolicyRule {
        guard let object = value.objectValue, let id = object["id"]?.stringValue else {
            throw ConsentPolicyError("A policy rule needs an id")
        }
        if let unknown = Set(object.keys).subtracting(ruleKeys).sorted().first {
            throw ConsentPolicyError("Policy '\(id)': unsupported field '\(unknown)'")
        }
        func categories(_ element: JSONValue?) throws -> [OptionalConsentCategory]? {
            guard let element else { return nil }
            guard let items = element.arrayValue else { throw ConsentPolicyError("Policy '\(id)': categories must be a list") }
            return try items.compactMap { item in
                let name = (item.stringValue ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
                if name == "necessary" { return nil }
                guard let category = OptionalConsentCategory(rawValue: name) else {
                    throw ConsentPolicyError("Policy '\(id)': unknown category '\(name)'")
                }
                return category
            }
        }
        guard let match = object["match"]?.objectValue else { throw ConsentPolicyError("Policy '\(id)' needs a match") }
        func strings(_ key: String) -> [String] { match[key]?.arrayValue?.compactMap(\.stringValue) ?? [] }
        guard let model = object["model"]?.stringValue.flatMap(ConsentModel.init(rawValue:)) else {
            throw ConsentPolicyError("Policy '\(id)': unknown model")
        }
        guard let prompt = object["prompt"]?.stringValue.flatMap(PolicyPrompt.init(rawValue:)) else {
            throw ConsentPolicyError("Policy '\(id)': unknown prompt")
        }
        var scopeMode: PolicyScopeMode?
        if let raw = object["scopeMode"]?.stringValue {
            guard let mode = PolicyScopeMode(rawValue: raw) else { throw ConsentPolicyError("Policy '\(id)': unknown scopeMode '\(raw)'") }
            scopeMode = mode
        }
        let scopeValue = object["categories"]
        let wildcard = scopeValue?.stringValue == "*"
            || scopeValue?.arrayValue?.contains { $0.stringValue?.trimmingCharacters(in: .whitespacesAndNewlines) == "*" } == true
        let scope: [OptionalConsentCategory]? = try wildcard ? nil : categories(scopeValue)
        let preselected: [OptionalConsentCategory] = try categories(object["preselectedCategories"]) ?? []
        let actions: [PolicyChoiceAction]? = try object["actions"]?.arrayValue?.map { item in
            guard let action = item.stringValue.flatMap(PolicyChoiceAction.init(rawValue:)) else {
                throw ConsentPolicyError("Policy '\(id)': unknown action")
            }
            return action
        }
        let validity = object["validity"]?.objectValue.map {
            PolicyValidity(choiceDays: $0["choiceDays"]?.intValue.map { Int($0) }, noticeDays: $0["noticeDays"]?.intValue.map { Int($0) })
        }
        var privacySignals: PolicyPrivacySignals?
        if let signals = object["privacySignals"]?.objectValue {
            privacySignals = PolicyPrivacySignals(
                gpc: try signals["gpc"]?.objectValue.map { PolicyGpc(denyCategories: try categories($0["denyCategories"]) ?? []) })
        }
        return PolicyRule(
            id: id,
            match: PolicyMatch(
                countries: strings("countries"),
                regions: match["regions"]?.arrayValue?.compactMap { region in
                    guard let country = region["country"]?.stringValue, let code = region["region"]?.stringValue else { return nil }
                    return PolicyRegion(country: country, region: code)
                } ?? [],
                regionFallbacks: strings("regionFallbacks"),
                fallback: match["fallback"]?.boolValue == true,
                isDefault: match["isDefault"]?.boolValue == true),
            model: model,
            prompt: prompt,
            categories: scope,
            scopeMode: scopeMode,
            preselectedCategories: preselected,
            actions: actions,
            validity: validity,
            privacySignals: privacySignals,
            copyRevision: object["copyRevision"]?.stringValue)
    }

    // MARK: - Normalizing

    private static let dayMs: Int64 = 86_400_000
    private static let defaultValidityDays = 365

    /// The authoring invariants `@c15t/schema` checks before it normalizes a rule.
    private static func validate(_ rule: PolicyRule) throws {
        let label = "Policy '\(rule.id)'"
        guard !rule.id.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw ConsentPolicyError("ConsentPolicy rule ids must not be blank")
        }
        guard rule.model != .iab else {
            throw ConsentPolicyError("\(label): the iab model needs a backend to serve the Global Vendor List")
        }
        let prompts: [PolicyPrompt]
        switch rule.model {
        case .optIn, .iab: prompts = [.choice]
        case .optOut: prompts = [.choice, .notice, .none]
        case .none: prompts = [.none]
        }
        guard prompts.contains(rule.prompt) else {
            throw ConsentPolicyError("\(label): the \(rule.model.rawValue) model cannot use a \(rule.prompt.rawValue) prompt")
        }
        guard rule.actions == nil || rule.prompt == .choice else {
            throw ConsentPolicyError("\(label): actions belong to a choice prompt")
        }
        let days = [rule.validity?.choiceDays, rule.validity?.noticeDays].compactMap { $0 }
        guard days.allSatisfy({ $0 > 0 }) else { throw ConsentPolicyError("\(label): validity days must be greater than zero") }
        let scope = rule.categories.flatMap { $0.isEmpty ? nil : Set($0) }
        guard scope == nil || scope?.count == OptionalConsentCategory.allCases.count || rule.scopeMode != nil else {
            throw ConsentPolicyError("\(label): a partial category scope needs a scopeMode")
        }
        let inScope = scope ?? Set(OptionalConsentCategory.allCases)
        guard rule.preselectedCategories.allSatisfy(inScope.contains) else {
            throw ConsentPolicyError("\(label): preselectedCategories must be inside categories")
        }
        guard rule.preselectedCategories.isEmpty || rule.model != .none else {
            throw ConsentPolicyError("\(label): the none model preselects nothing")
        }
        guard (rule.privacySignals?.gpc?.denyCategories ?? []).allSatisfy(inScope.contains) else {
            throw ConsentPolicyError("\(label): privacySignals.gpc.denyCategories must be inside categories")
        }
    }

    private static func strings(_ values: [String]) -> JSONValue { .array(values.map(JSONValue.string)) }

    private static func sortedNames(_ values: [OptionalConsentCategory]) -> [String] {
        Array(Set(values.map(\.rawValue))).sorted()
    }

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
        let declared = rule.categories ?? []
        let scope = sortedNames(declared.isEmpty ? OptionalConsentCategory.ordered : declared)
        let preselected = rule.model == .none ? [] : sortedNames(rule.preselectedCategories)
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
                "gpc": .object(["denyCategories": strings(sortedNames(rule.privacySignals?.gpc?.denyCategories ?? []))]),
            ]),
            "prompt": .string(rule.prompt.rawValue),
            "proof": .object(["storeIp": .bool(false), "storeLanguage": .bool(false), "storeUserAgent": .bool(false)]),
            "rights": strings(rights),
            "scope": strings(scope),
            "scopeMode": .string((rule.scopeMode ?? .permissive).rawValue),
            "validity": .object([
                "choiceMs": .integer(Int64(rule.validity?.choiceDays ?? defaultValidityDays) * dayMs),
                "noticeMs": .integer(Int64(rule.validity?.noticeDays ?? defaultValidityDays) * dayMs),
            ]),
        ])
    }

    /// The rule as a matched wire. Fingerprints hash the canonical rule on the device:
    /// they never leave it in no-backend mode, and changing the rule changes them, which
    /// asks returning people again.
    private static func wire(_ rule: PolicyRule) -> JSONValue {
        let policy = normalize(rule)
        let fields = policy.objectValue ?? [:]
        func hash(_ domain: String, _ keys: [String]) -> String {
            var input: [String: JSONValue] = ["domain": .string(domain)]
            for key in keys { input[key] = fields[key] ?? .null }
            let data = C15tJSON.encode(.object(input)) ?? Data()
            return SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
        }
        let promptKeys = ["copyRevision", "model", "privacySignals", "prompt", "rights", "scope", "scopeMode", "validity"]
        let id = rule.id.trimmingCharacters(in: .whitespacesAndNewlines)
        return .object([
            "fingerprints": .object([
                "choice": .string(hash("choice", promptKeys)),
                "notice": .string(hash("notice", promptKeys)),
                "policy": .string(hash("policy", Array(fields.keys))),
            ]),
            "matchedBy": .string("default"),
            "policy": policy,
            "policyId": .string(id),
            "status": .string("matched"),
            "version": .integer(1),
        ])
    }
}
