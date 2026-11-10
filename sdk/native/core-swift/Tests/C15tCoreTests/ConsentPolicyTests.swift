import Foundation
import XCTest

@testable import C15tCore

final class ConsentPolicyTests: XCTestCase {
    private var fixture: JSONValue {
        get throws {
            let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
                .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
                .appendingPathComponent("protocol/local-policy/parity.json")
            return try XCTUnwrap(C15tJSON.parse(Data(contentsOf: url)))
        }
    }

    private func policy() throws -> ConsentPolicy {
        let rules = try XCTUnwrap(fixture["rules"])
        return try ConsentPolicy(json: XCTUnwrap(C15tJSON.encode(.object(["rules": rules]))))
    }

    private func boot(
        _ policy: ConsentPolicy, store: InMemoryStore = InMemoryStore(),
        overrides: ConsentOverrides = .default()
    ) async -> ConsentCore {
        let core = ConsentCore()
        await core.bootstrapAndSettle(CoreConfig(
            store: store, policy: policy, transport: OfflineTransport.offline(),
            consentCategories: ConsentCategory.allCases, overrides: overrides, initRetry: .disabled))
        return core
    }

    func testRulesNormalizeExactlyAsTheBackendNormalizerDoes() throws {
        let resolved = try XCTUnwrap(fixture["resolved"]?.objectValue)
        let policy = try policy()
        XCTAssertEqual(Set(resolved.keys), Set(policy.rules.map(\.id)))
        for rule in policy.rules {
            XCTAssertEqual(ConsentPolicy.normalize(rule), resolved[rule.id], rule.id)
        }
    }

    func testFingerprintsHashExactlyTheInputsTheBackendHashes() throws {
        let inputs = try XCTUnwrap(fixture["fingerprintInputs"]?.objectValue)
        for rule in try policy().rules {
            let actual = ConsentPolicy.fingerprintInputs(rule)
            for domain in ["choice", "notice", "policy"] {
                XCTAssertEqual(actual[domain], inputs[rule.id]?[domain], "\(rule.id) \(domain)")
            }
        }
    }

    func testEveryPolicyTheBackendOrNoBackendModeRefusesIsRefused() throws {
        for row in try XCTUnwrap(fixture["invalid"]?.arrayValue) {
            let name = row["name"]?.stringValue ?? "?"
            let data = try XCTUnwrap(C15tJSON.encode(.object(["rules": row["rules"] ?? .null])))
            XCTAssertThrowsError(try ConsentPolicy(json: data), name)
        }
    }

    func testChangingOneValidityKeepsTheOtherPromptsReceipt() async throws {
        let store = InMemoryStore()
        let policy = try policy()
        let first = await boot(policy, store: store)
        XCTAssertEqual(first.save(.all).status, .committed)
        await first.waitUntilIdle()
        func revised(_ validity: PolicyValidity) throws -> ConsentPolicy {
            try ConsentPolicy(rules: policy.rules.map { rule in
                var rule = rule
                if rule.id == "everywhere_else" { rule.validity = validity }
                return rule
            })
        }
        let noticeOnly = await boot(try revised(PolicyValidity(noticeDays: 30)), store: store)
        XCTAssertTrue(noticeOnly.isAllowed(.measurement))
        XCTAssertEqual(noticeOnly.snapshot().promptRequirement.kind, PromptRequirement.Kind.none)
        let choiceChanged = await boot(try revised(PolicyValidity(choiceDays: 30, noticeDays: 30)), store: store)
        XCTAssertFalse(choiceChanged.isAllowed(.measurement))
    }

    func testARefusedInCodePolicyIsReportedNotStartedAsAQuietDenyAll() async throws {
        let core = ConsentCore()
        let stream = core.eventStream
        core.bootstrap(CoreConfig(
            policyError: "Policy 'x': a partial category scope needs a scopeMode",
            transport: OfflineTransport.offline(), initRetry: .disabled))
        var reported: String?
        for await event in stream {
            if case let .error(info) = event { reported = info.code }
            if case .initialized = event { break }
        }
        XCTAssertEqual(reported, "policy-invalid")
        XCTAssertEqual(core.snapshot().error?.code, "policy-invalid")
        XCTAssertTrue(core.snapshot().policyPending)
        XCTAssertFalse(core.isAllowed(.measurement))
    }

    func testBootstrapAppliesTheInCodePolicyOnce() async throws {
        let core = ConsentCore()
        core.bootstrap(CoreConfig(
            policy: try policy(), transport: OfflineTransport.offline(),
            consentCategories: ConsentCategory.allCases, initRetry: .disabled))
        let revision = core.snapshot().revision
        await core.waitUntilIdle()
        XCTAssertEqual(core.snapshot().revision, revision)
    }

    func testLocationsMatchTheRuleTheBackendMatcherPicks() throws {
        let policy = try policy()
        for row in try XCTUnwrap(fixture["cases"]?.arrayValue) {
            let country = row["inputs"]?["country"]?.stringValue
            let region = row["inputs"]?["region"]?.stringValue
            let matched = policy.match(country: country, region: region)
            XCTAssertEqual(matched?.0, row["expected"]?["policyId"]?.stringValue, "\(country ?? "-") \(region ?? "-")")
            XCTAssertEqual(matched?.1, row["expected"]?["matchedBy"]?.stringValue, "\(country ?? "-") \(region ?? "-")")
        }
    }

    func testNoBackendCorePromptsFromTheInCodePolicyAtBootstrap() async throws {
        let store = InMemoryStore()
        let policy = try policy()
        let core = ConsentCore()
        core.bootstrap(CoreConfig(
            store: store, policy: policy, transport: OfflineTransport.offline(),
            consentCategories: ConsentCategory.allCases, initRetry: .disabled))
        XCTAssertFalse(core.snapshot().policyPending)
        XCTAssertEqual(core.snapshot().resolution.policyId, "everywhere_else")
        XCTAssertEqual(core.snapshot().promptRequirement.kind, .choice)
        for category in OptionalConsentCategory.ordered {
            XCTAssertFalse(core.isAllowed(category.category))
        }
        XCTAssertEqual(core.save(.custom([.measurement: true])).status, .committed)
        await core.waitUntilIdle()
        XCTAssertTrue(core.isAllowed(.measurement))
        XCTAssertFalse(core.isAllowed(.marketing))
        let relaunched = await boot(policy, store: store)
        XCTAssertTrue(relaunched.isAllowed(.measurement))
        XCTAssertFalse(relaunched.isAllowed(.marketing))
    }

    func testAnAppSuppliedLocationPicksTheRegionalRule() async throws {
        let core = await boot(try policy(), overrides: ConsentOverrides(country: "US", region: "CA", language: "en"))
        XCTAssertEqual(core.snapshot().resolution.policyId, "california")
        XCTAssertEqual(core.snapshot().promptRequirement.kind, .notice)
        core.setOverrides(ConsentOverrides(country: "DE", region: nil, language: "en"))
        await core.waitUntilIdle()
        XCTAssertEqual(core.snapshot().resolution.policyId, "germany")
    }

    func testChangingTheCopyRevisionAsksAgainAfterAnUpdate() async throws {
        let store = InMemoryStore()
        let policy = try policy()
        let first = await boot(policy, store: store)
        XCTAssertEqual(first.save(.all).status, .committed)
        await first.waitUntilIdle()
        let same = await boot(policy, store: store)
        XCTAssertTrue(same.isAllowed(.measurement))
        let revised = try ConsentPolicy(rules: policy.rules.map { rule in
            var rule = rule
            if rule.id == "everywhere_else" { rule.copyRevision = "2027-01" }
            return rule
        })
        let updated = await boot(revised, store: store)
        XCTAssertEqual(updated.snapshot().promptRequirement.kind, .choice)
        XCTAssertFalse(updated.isAllowed(.measurement))
    }

    func testInvalidPoliciesAreRefused() throws {
        let fallback = PolicyRule(
            id: "default", match: PolicyMatch(fallback: true, isDefault: true), model: .optIn, prompt: .choice)
        func refused(_ rules: [PolicyRule], file: StaticString = #filePath, line: UInt = #line) {
            XCTAssertThrowsError(try ConsentPolicy(rules: rules), file: file, line: line)
        }
        refused([])
        refused([fallback, fallback])
        var iab = fallback
        iab.model = .iab
        refused([iab])
        var countryOnly = fallback
        countryOnly.match = PolicyMatch(countries: ["DE"])
        refused([countryOnly])
        var notice = fallback
        notice.prompt = .notice
        refused([notice])
        var partial = fallback
        partial.categories = [.measurement]
        refused([partial])
        var outside = partial
        outside.scopeMode = .strict
        outside.preselectedCategories = [.marketing]
        refused([outside])
        var zero = fallback
        zero.validity = PolicyValidity(choiceDays: 0)
        refused([zero])
        XCTAssertThrowsError(try ConsentPolicy(json: Data(
            #"{"rules":[{"id":"x","match":{"fallback":true},"model":"opt-in","prompt":"choice","rights":["opt-out"]}]}"#.utf8)))
        XCTAssertThrowsError(try ConsentPolicy(json: Data(
            #"{"rules":[{"id":"x","match":{"fallback":true},"model":"opt-in","prompt":"choice","categories":["ads"]}]}"#.utf8)))
    }
}
