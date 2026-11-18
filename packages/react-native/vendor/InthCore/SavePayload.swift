import Foundation

/// The action a save records.
public enum ConsentAction: String, Sendable, Codable, Equatable {
    case all
    case necessary
    case custom
}

/// What the subject did, before it becomes a receipt.
public enum CommitIntent: Sendable, Equatable {
    /// Accept everything the policy puts in scope.
    case all
    /// Reject everything optional, keeping `necessary`.
    case necessary
    /// An explicit map from a preference form. Categories absent from the map are
    /// left exactly as they were: a partial save must not renew or clear a
    /// category the subject did not touch.
    case custom([OptionalConsentCategory: Bool])
    /// Complete native IAB draft and the categories confirmed by this action.
    case iab(IABChoices, categories: [OptionalConsentCategory: Bool])
}

/// The local outcome of ``ConsentCore/save(_:)``.
///
/// A commit is acknowledged locally and delivered asynchronously. That is what
/// lets a consent action complete inside the 50 ms budget with no network: the
/// receipts are durable before this returns, and the backend is told afterwards.
public struct CommitResult: Sendable, Equatable {
    /// What ``ConsentCore.save(_:)`` promises, and what it does not.
    ///
    /// `committed` is a statement about this device, not about the backend. It
    /// asserts all three of: the receipts are applied to the snapshot, the snapshot
    /// is written to protected storage, and the queue holds the exact bytes that
    /// owe delivery. It deliberately does not assert that the backend has them,
    /// which no synchronous call can know: delivery is reported afterwards by the
    /// ``CoreEvent/saveDelivered`` and ``CoreEvent/error`` pair, and the queue depth
    /// stays readable through ``ConsentCore/pendingSaveCount()``.
    ///
    /// The rule that keeps the first assertion honest is that no branch returns
    /// `committed` without a durable queue entry behind it. A queue that could not
    /// be written, or does not exist yet, answers ``rejected`` with the reason and
    /// leaves the snapshot alone, because a decision nothing remembers having to
    /// deliver is worse than a refusal the caller can act on.
    public enum Status: String, Sendable, Equatable {
        /// Receipts applied locally and durably queued for delivery. Under `dryRun`
        /// they are applied and stored, and ``CommitResult/queued`` is false.
        case committed
        /// Nothing changed, so nothing was recorded or sent.
        case noop
        /// Refused. The snapshot is untouched and still deny-all where it was.
        case rejected
    }

    public let status: Status
    public let revision: Int
    public let permissions: ConsentState
    public let consentAction: ConsentAction
    /// Categories this action confirmed, for the UI to report back.
    public let confirmed: [OptionalConsentCategory: Bool]
    /// Set when `status == .rejected`.
    public let error: CoreErrorInfo?
    /// Whether a record is queued for delivery. True for every committed save, except
    /// under `dryRun`, which stores the decision and drops the record.
    public let queued: Bool

    public init(
        status: Status,
        revision: Int,
        permissions: ConsentState,
        consentAction: ConsentAction,
        confirmed: [OptionalConsentCategory: Bool] = [:],
        error: CoreErrorInfo? = nil,
        queued: Bool? = nil
    ) {
        self.status = status
        self.revision = revision
        self.permissions = permissions
        self.consentAction = consentAction
        self.confirmed = confirmed
        self.error = error
        self.queued = queued ?? (status == .committed)
    }

    /// The same result for a save whose record was dropped.
    func withoutRecord() -> CommitResult {
        CommitResult(
            status: status, revision: revision, permissions: permissions,
            consentAction: consentAction, confirmed: confirmed, error: error, queued: false)
    }
}

/// The single time one action was confirmed.
public struct ConfirmedCoverage: Sendable, Codable, Equatable {
    public let categories: [OptionalConsentCategory: Bool]
    /// Epoch milliseconds, captured once before any yield or network call, and
    /// reused verbatim by every replay so the backend derives the same consent id.
    public let actionAt: Int64

    public init(categories: [OptionalConsentCategory: Bool], actionAt: Int64) {
        self.categories = categories
        self.actionAt = actionAt
    }
}

/// Overrides as the backend expects them. The snapshot carries the same context
/// under `test`; the wire name is `gpc`, and the payload follows the wire.
public struct KernelOverridesWire: Sendable, Codable, Equatable {
    public let country: String?
    public let region: String?
    public let language: String?
    public let gpc: Bool?

    public init(country: String?, region: String?, language: String?, gpc: Bool?) {
        self.country = country
        self.region = region
        self.language = language
        self.gpc = gpc
    }
}

/// The identified user attached to a record. External id only, no PII beyond what
/// the consumer opts into.
public struct KernelUser: Sendable, Codable, Equatable {
    public let externalId: String
    public let externalIdType: String?
    public let identityProvider: String?
    public let properties: [String: String]?

    public init(
        externalId: String,
        externalIdType: String? = nil,
        identityProvider: String? = nil,
        properties: [String: String]? = nil
    ) {
        self.externalId = externalId
        self.externalIdType = externalIdType
        self.identityProvider = identityProvider
        self.properties = properties
    }
}

/// The subject identifiers a record is keyed by.
public struct ConsentSubject: Sendable, Codable, Equatable {
    public let subjectId: String?
    public let externalId: String?
    public let identityProvider: String?

    public init(subjectId: String?, externalId: String?, identityProvider: String?) {
        self.subjectId = subjectId
        self.externalId = externalId
        self.identityProvider = identityProvider
    }
}

/// Resolved policy inputs captured with an action, so the backend can recompute
/// the same decision. A retry keeps the original inputs even after a later init
/// serves a different policy.
public struct DecisionInputs: Sendable, Codable, Equatable {
    public let policyId: String?
    public let fingerprint: String?
    public let country: String?
    public let region: String?
    public let language: String
    public let gpc: Bool

    public init(
        policyId: String?,
        fingerprint: String?,
        country: String?,
        region: String?,
        language: String,
        gpc: Bool
    ) {
        self.policyId = policyId
        self.fingerprint = fingerprint
        self.country = country
        self.region = region
        self.language = language
        self.gpc = gpc
    }
}

/// The payload one explicit action produces.
///
/// Built once, then handed to the transport as serialized bytes. That ordering is
/// the whole durability story: the persisted form *is* the transmitted form, so a
/// replay cannot drift from what the subject chose, and a policy that changes in
/// the meantime has nothing to rewrite.
public struct SavePayload: Sendable, Codable, Equatable {
    /// A lowercase UUID made once for this action. It is frozen into the body, so
    /// every replay sends the same key and the backend records the action once.
    public let idempotencyKey: String
    public let subjectId: String
    public let subject: ConsentSubject
    public let choice: ExplicitChoice
    public let confirmed: ConfirmedCoverage
    public let consents: ConsentState
    public let overrides: KernelOverridesWire
    public let user: KernelUser?
    public let model: ConsentModel
    public let uiSource: ActiveUI
    public let consentAction: ConsentAction
    public let policySnapshotToken: String?
    public let decisionInputs: DecisionInputs?
    /// Equals `confirmed.actionAt`, for backends that read one time.
    public let givenAt: Int64
    public let tcString: String?
    public let addtlConsent: String?

    public init(
        idempotencyKey: String,
        subjectId: String,
        subject: ConsentSubject,
        choice: ExplicitChoice,
        confirmed: ConfirmedCoverage,
        consents: ConsentState,
        overrides: KernelOverridesWire,
        user: KernelUser?,
        model: ConsentModel,
        uiSource: ActiveUI,
        consentAction: ConsentAction,
        policySnapshotToken: String?,
        decisionInputs: DecisionInputs?,
        givenAt: Int64,
        tcString: String? = nil, addtlConsent: String? = nil
    ) {
        self.idempotencyKey = idempotencyKey
        self.subjectId = subjectId
        self.subject = subject
        self.choice = choice
        self.confirmed = confirmed
        self.consents = consents
        self.overrides = overrides
        self.user = user
        self.model = model
        self.uiSource = uiSource
        self.consentAction = consentAction
        self.policySnapshotToken = policySnapshotToken
        self.decisionInputs = decisionInputs
        self.givenAt = givenAt
        self.tcString = tcString
        self.addtlConsent = addtlConsent
    }
}

/// Builds the `POST /v1/consent/records` body, field for field as the save-body
/// fixtures in `packages/native-protocol` pin it.
///
/// `answer` is the subject's complete answer after the act: every receipt the payload's
/// choice holds, each with the time and policy basis the kernel already captured.
/// `confirmed` names the categories this act confirmed. The effective permissions are
/// neither: a GPC mask can deny a category the subject granted, and sending the masked
/// value would rewrite what they chose.
///
/// The body never carries an identity token. Queued bytes are written to disk and may
/// be replayed long after a token expires.
enum ConsentRecordBodyBuilder {
    /// Serialize a payload into request bytes. The result is deterministic, so the
    /// bytes queued before a request are comparable to the bytes sent after it.
    static func body(for payload: SavePayload, property: String) throws -> Data {
        try InthJSON.encode(wire(for: payload, property: property))
    }

    static func wire(for payload: SavePayload, property: String) -> JSONValue {
        var fields: [String: JSONValue] = [
            "answer": .object(["categories": .object(receipts(payload.choice.categories))]),
            "confirmed": .array(confirmed(for: payload).map { .string($0) }),
            "consentAction": .string(payload.consentAction.rawValue),
            "givenAt": .integer(payload.confirmed.actionAt),
            "idempotencyKey": .string(payload.idempotencyKey),
            "model": .string(payload.model.rawValue),
            "property": .string(property),
            "subjectId": .string(payload.subjectId),
            "uiSource": .string(payload.uiSource.rawValue),
        ]

        // Omitted rather than null throughout: an absent key leaves the field alone.
        if let externalId = payload.user?.externalId {
            fields["externalId"] = .string(externalId)
        }
        if let identityProvider = payload.user?.identityProvider {
            fields["identityProvider"] = .string(identityProvider)
        }
        if let properties = payload.user?.properties, !properties.isEmpty {
            fields["metadata"] = .object([
                "userProperties": .object(properties.mapValues { .string($0) }),
            ])
        }
        if let token = payload.policySnapshotToken {
            fields["policySnapshotToken"] = .string(token)
        }
        if let tcString = payload.tcString {
            fields["tcString"] = .string(tcString)
            if let ac = payload.addtlConsent { fields["addtlConsent"] = .string(ac) }
        }
        if let assertion = decisionAssertion(for: payload) {
            for (field, value) in assertion { fields[field] = value }
        }

        return .object(fields)
    }

    /// The flat `policyId`/`fingerprint`/`country`/`region`/`language`/`gpc` claim a
    /// tokenless write carries, or `nil` when it must not be sent.
    ///
    /// Mirrors `buildDecisionAssertion`: a token already binds the write to a policy
    /// revision, so the claim adds nothing. A null `policyId` says "nothing matched",
    /// which is a complete claim by itself; a non-null one has to bring the
    /// fingerprint it vouches for.
    private static func decisionAssertion(
        for payload: SavePayload
    ) -> [String: JSONValue]? {
        guard payload.policySnapshotToken == nil, let inputs = payload.decisionInputs else {
            return nil
        }
        if let policyId = inputs.policyId,
           policyId.trimmingCharacters(in: .whitespaces).isEmpty || inputs.fingerprint == nil {
            return nil
        }
        return [
            "policyId": inputs.policyId.map(JSONValue.string) ?? .null,
            "fingerprint": inputs.fingerprint.map(JSONValue.string) ?? .null,
            "country": inputs.country.map(JSONValue.string) ?? .null,
            "region": inputs.region.map(JSONValue.string) ?? .null,
            "language": .string(inputs.language),
            "gpc": .bool(inputs.gpc),
        ]
    }

    /// The categories this act confirmed that hold a receipt, in the canonical order
    /// functionality, experience, measurement, marketing, so every entry is a key of
    /// `answer.categories`. An acknowledgement confirms none.
    private static func confirmed(for payload: SavePayload) -> [String] {
        OptionalConsentCategory.ordered
            .filter { payload.confirmed.categories[$0] != nil && payload.choice.categories[$0] != nil }
            .map(\.rawValue)
    }

    /// Receipts `{ value, confirmedAt, basis }`, keyed by category.
    private static func receipts(
        _ categories: [OptionalConsentCategory: CategoryDecision]
    ) -> [String: JSONValue] {
        var wire: [String: JSONValue] = [:]
        for (category, decision) in categories {
            let basis: JSONValue
            switch decision.basis {
            case let .choiceV1(fingerprint):
                basis = .object([
                    "fingerprint": .string(fingerprint),
                    "kind": .string("choice-v1"),
                ])
            case let .legacyV2(materialFingerprint):
                var legacy: [String: JSONValue] = ["kind": .string("legacy-v2")]
                if let materialFingerprint {
                    legacy["materialFingerprint"] = .string(materialFingerprint)
                }
                basis = .object(legacy)
            }
            wire[category.rawValue] = .object([
                "basis": basis,
                "confirmedAt": .integer(decision.confirmedAt),
                "value": .bool(decision.value),
            ])
        }
        return wire
    }
}
